const { send, getTeam, getStudent, removeStudentAll } = vi.hoisted(() => ({
    send: vi.fn(),
    getTeam: vi.fn(),
    getStudent: vi.fn(),
    removeStudentAll: vi.fn()
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: class { send = send; },
    ListObjectsCommand: class { list = true; constructor(public input: any) {} },
    DeleteObjectCommand: class { constructor(public input: any) {} }
}));

vi.mock('@mytaptrack/lib', () => ({
    WebUtils: {
        stepLambdaWrapper: (fn: any) => fn,
        logObjectDetails: vi.fn()
    },
    v2: {
        TeamDal: { getTeam },
        StudentDal: { getStudent, removeStudentAll }
    }
}));

import { handler } from './studentRemoveFinal';

// The key formats studentToS3, appToS3 and the notes DAL write; a leading slash never matches.
const PROFILE_PREFIX = 'students/plicense=lic-1/pstudent=123/';
const APP_PREFIX = 'apps/plicense=lic-1/pstudent=123/';
const DATA_PREFIX = 'student/123/';

/** Answers list calls by prefix, one page per call; S3 omits Contents from an empty page. */
function stubS3(pages: Record<string, any[]>) {
    send.mockImplementation(async (command: any) => {
        if (!command.list) {
            return {};
        }
        return pages[command.input.Prefix]?.shift() ?? { Contents: [] };
    });
}

const calls = () => send.mock.calls.map(([command]) => command);
const deletedKeys = () => calls().filter(command => !command.list).map(command => command.input.Key);
const listCalls = () => calls().filter(command => command.list).map(command => command.input);

describe('studentRemoveFinal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        process.env.dataBucket = 'data-bucket';
        getTeam.mockResolvedValue([]);
        getStudent.mockResolvedValue({ license: 'lic-1' });
        removeStudentAll.mockResolvedValue(undefined);
        stubS3({});
    });

    it('keeps everything while the student still has team members', async () => {
        getTeam.mockResolvedValue([{ userId: 'user' }]);

        await handler({ studentId: '123' } as any);

        expect(getTeam).toHaveBeenCalledWith('123');
        expect(getStudent).not.toHaveBeenCalled();
        expect(removeStudentAll).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it('removes the student and every S3 location once the team is empty', async () => {
        stubS3({
            [PROFILE_PREFIX]: [{ Contents: [{ Key: 'profile.json' }] }],
            [APP_PREFIX]: [{ Contents: [{ Key: 'app.json' }] }],
            [DATA_PREFIX]: [{ Contents: [{ Key: 'data.json' }] }]
        });

        await handler({ studentId: '123' } as any);

        expect(removeStudentAll).toHaveBeenCalledWith('123');
        expect(listCalls().map(input => input.Bucket)).toEqual(['data-bucket', 'data-bucket', 'data-bucket']);
        expect(deletedKeys()).toEqual(['profile.json', 'app.json', 'data.json']);
    });

    it('reads the student before removing it, because the license locates the S3 data', async () => {
        await handler({ studentId: '123' } as any);

        expect(getStudent.mock.invocationCallOrder[0]).toBeLessThan(removeStudentAll.mock.invocationCallOrder[0]);
    });

    it('keeps listing while S3 reports a truncated page', async () => {
        stubS3({
            [PROFILE_PREFIX]: [
                { Contents: [{ Key: 'p1' }], IsTruncated: true, NextMarker: 'p-next' },
                { Contents: [{ Key: 'p2' }], IsTruncated: false }
            ],
            // Without a delimiter S3 sends no NextMarker, so the last key is the marker.
            [DATA_PREFIX]: [
                { Contents: [{ Key: 'd1' }], IsTruncated: true },
                { Contents: [{ Key: 'd2' }], IsTruncated: false }
            ]
        });

        await handler({ studentId: '123' } as any);

        expect(deletedKeys()).toEqual(['p1', 'p2', 'd1', 'd2']);
        expect(listCalls().map(input => input.Marker)).toEqual([undefined, 'p-next', undefined, undefined, 'd1']);
    });

    it('completes when a location has no objects', async () => {
        stubS3({ [PROFILE_PREFIX]: [{}], [APP_PREFIX]: [{}], [DATA_PREFIX]: [{}] });

        await expect(handler({ studentId: '123' } as any)).resolves.toBeUndefined();
    });
});
