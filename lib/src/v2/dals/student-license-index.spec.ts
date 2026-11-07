/**
 * Students are listed per license through the License index (lpk/lsk). Every reader and writer
 * must use the GraphQL format, L#<license> / S#<studentId>, or students written by one path are
 * invisible to the others.
 */
import { StudentDal } from './student-dal';
import { getStudentLicenseIndexKey, getStudentLicenseIndexQuery } from '../utils/key-mappings';
import { MttIndexes } from './dal-types';

const dal = StudentDal as any;

describe('student license index keys', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(dal.data, 'query').mockResolvedValue([]);
        vi.spyOn(dal.primary, 'query').mockResolvedValue([]);
        vi.spyOn(dal.data, 'update').mockResolvedValue(undefined);
        vi.spyOn(dal.primary, 'update').mockResolvedValue(undefined);
    });

    it('builds the GraphQL format', () => {
        expect(getStudentLicenseIndexKey('lic-1', 's1')).toEqual({ lpk: 'L#lic-1', lsk: 'S#s1' });
        expect(getStudentLicenseIndexQuery('lic-1')).toEqual({ ':lpk': 'L#lic-1', ':lsk': 'S#' });
    });

    it('lists a license\'s students from both tables with the GraphQL keys', async () => {
        await StudentDal.getStudentsByLicense('lic-1');

        for (const table of [dal.data, dal.primary]) {
            expect(table.query.mock.calls[0][0]).toMatchObject({
                indexName: MttIndexes.license,
                keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
                attributeValues: { ':lpk': 'L#lic-1', ':lsk': 'S#' }
            });
        }
    });

    it('counts dedicated students with the GraphQL keys', async () => {
        await StudentDal.getStudentDedicatedCountByLicense('lic-1');

        expect(dal.data.query.mock.calls[0][0].attributeValues).toEqual({ ':lpk': 'L#lic-1', ':lsk': 'S#' });
    });

    it('moves a student to a license under the GraphQL keys', async () => {
        await StudentDal.updateLicense('s1', 'lic-2', { fullYear: true } as any, false, []);

        const values = [...dal.data.update.mock.calls, ...dal.primary.update.mock.calls]
            .map(([input]: any[]) => input.attributeValues)
            .filter((v: any) => v && ':lpk' in v);
        expect(values.length).toBeGreaterThan(0);
        values.forEach((v: any) => expect(v).toMatchObject({ ':lpk': 'L#lic-2', ':lsk': 'S#s1' }));
    });
});
