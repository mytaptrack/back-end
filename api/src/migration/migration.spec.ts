import { StudentDal } from '@mytaptrack/lib';
import { BehaviorCalculation } from '@mytaptrack/types';
import { quietConsole, stub, stubTables, transactItems } from '../testing/unit-kit';

vi.hoisted(() => { process.env.PrimaryTable = 'primary-table'; process.env.DataTable = 'data-table'; });
const aws = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), doc: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async original => ({ ...(await original<any>()), S3: class { listObjectsV2 = aws.list; getObject = aws.get; } }));
vi.mock('@aws-sdk/lib-dynamodb', async original => ({ ...(await original<any>()), DynamoDBDocumentClient: { from: () => ({ send: aws.doc }) } }));

import * as apps from './migrateApps';
import * as notes from './migrateNotes';
import * as reports from './migrateReports';
import * as sources from './migrateSources';
import * as team from './migrateTeam';

quietConsole();
let db: ReturnType<typeof stubTables>;
beforeEach(() => {
  db = stubTables();
  aws.list.mockReset();
  aws.get.mockReset();
  aws.doc.mockReset();
  process.env.dataBucket = 'bucket';
});

/** Pages of scan results; the Dal double has no scan by default. */
async function scan(...pages: object[][]) {
  const { Dal } = await import('@mytaptrack/lib');
  const spy = vi.spyOn(Dal.prototype, 'scan');
  pages.forEach((items, i) => spy.mockResolvedValueOnce({ items, token: i < pages.length - 1 ? 'next' : undefined } as never));
  return spy;
}

describe('migrateApps', () => {
  const item = (overrides: object = {}) => ({
    pk: 'S#s1', sk: 'AS#a1#P', deviceId: 'd1', license: 'lic-1', studentId: 's1',
    config: { auth: 'auth-1', textAlerts: true, behaviors: [{ id: 'b', abc: true, order: 1, extra: 1 }] }, ...overrides
  });

  beforeEach(() => {
    db.primary.get.mockImplementation(async (key: any) => key.pk.startsWith('S#') ? { studentName: 'Sam', groups: ['g'] } : { deviceName: 'Phone' });
  });

  it('skips non-config rows and deleted apps', async () => {
    await scan([item({ sk: 'AS#a1#X' }), item({ deleted: true })]);
    await expect(apps.onCreateHandler({})).resolves.toEqual({ physicalResourceId: 'migrate-team-data-complete' });
    expect(db.data.send).not.toHaveBeenCalled();
  });

  it('writes the new license-scoped records', async () => {
    await scan([item()]);
    await apps.onCreateHandler({});
    const [config, pii] = transactItems(db.data.send);
    expect(config.Put).toMatchObject({ TableName: 'data-table', Item: {
      pk: 'L#lic-1', sk: 'GD#d1', auth: ['auth-1'], timezone: '', studentIds: ['s1'],
      students: [{ studentId: 's1', behaviors: [{ id: 'b', abc: true, order: 1 }], services: [] }]
    } });
    expect(config.Put.Item.students[0].behaviors[0]).not.toHaveProperty('extra');
    expect(pii.Put).toMatchObject({ TableName: 'primary-table', Item: {
      deviceName: 'Phone', lpk: 'lic-1#APP', studentContextLookup: [{ id: 's1', name: 'Sam', groups: ['g'] }]
    } });
  });

  it('names an app with no global record', async () => {
    db.primary.get.mockImplementation(async (key: any) => key.pk.startsWith('S#') ? { studentName: 'Sam' } : undefined);
    await scan([item()]);
    await apps.onCreateHandler({});
    expect(transactItems(db.data.send)[1].Put.Item.deviceName).toBe('Unnamed');
  });

  it('merges a second student onto one device', async () => {
    await scan([item()], [item({ pk: 'S#s2', studentId: 's2', config: { auth: 'auth-2', behaviors: [] } })]);
    await apps.onCreateHandler({});
    const [config, pii] = transactItems(db.data.send, 1);
    expect(config.Put.Item.auth).toEqual(['auth-1', 'auth-2']);
    expect(config.Put.Item.studentIds).toEqual(['s1', 's2']);
    expect(pii.Put.Item.studentIds).toEqual(['s1', 's2']);
  });

  it('adds auth for a repeat of the same student', async () => {
    await scan([item(), item({ config: { auth: 'auth-2', behaviors: [] } })]);
    await apps.onCreateHandler({});
    const [config] = transactItems(db.data.send, 1);
    expect(config.Put.Item.auth).toEqual(['auth-1', 'auth-2']);
    expect(config.Put.Item.students).toHaveLength(1);
  });
});

describe('migrateNotes', () => {
  const keyFor = (studentId = 's-1') => `student/${studentId}/notes/2026/03/01.json`;
  const body = (value: unknown) => aws.get.mockResolvedValue({ Body: { transformToString: async () => value } });

  it('finishes on an empty listing', async () => {
    aws.list.mockResolvedValue({});
    await expect(notes.onCreateHandler({})).resolves.toEqual({ physicalResourceId: 'migrate-notes-complete' });
  });

  it('copies a note into the table', async () => {
    aws.list.mockResolvedValueOnce({ Contents: [{ Key: keyFor() }, { Key: 'student/s-1/other.json' }] }).mockResolvedValueOnce({});
    db.data.get.mockResolvedValue({ license: 'lic-1', studentId: 's-1' });
    body(JSON.stringify({ lastUpdate: '2026-03-01T10:00:00Z', notes: 'hello' }));
    await notes.onCreateHandler({});
    expect(aws.get).toHaveBeenCalledTimes(1);
    expect(db.primary.put.mock.calls[0][0]).toMatchObject({
      pk: 'S#s-1#NB', lpk: 'lic-1', note: 'hello', product: 'behavior', studentId: 's-1',
      dateEpoc: new Date('2026-03-01T10:00:00Z').getTime(), source: { type: 'unknown' }
    });
  });

  it('pages from the last key', async () => {
    aws.list.mockResolvedValueOnce({ Contents: [{ Key: 'x' }, { Key: 'last' }] }).mockResolvedValueOnce({});
    await notes.onCreateHandler({});
    expect(aws.list.mock.calls[1][0].StartAfter).toBe('last');
  });

  it('skips an unknown student and an empty file', async () => {
    aws.list.mockResolvedValueOnce({ Contents: [{ Key: keyFor() }] }).mockResolvedValueOnce({ Contents: [{ Key: keyFor('s-2') }] }).mockResolvedValueOnce({});
    db.data.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ license: 'lic-1' });
    body('');
    await notes.onCreateHandler({});
    expect(db.primary.put).not.toHaveBeenCalled();
  });

  it('keeps going after a failed write', async () => {
    aws.list.mockResolvedValueOnce({ Contents: [{ Key: keyFor() }] }).mockResolvedValueOnce({});
    db.data.get.mockResolvedValue({ license: 'lic-1' });
    body('{"notes":"x"}');
    db.primary.put.mockRejectedValue(new Error('throttled'));
    await expect(notes.onCreateHandler({})).resolves.toBeDefined();
  });
});

describe('migrateReports', () => {
  const report = (overrides: object = {}) => ({ pk: 'S#s1#R', sk: '1#D', license: 'lic-1', startMillis: 1000, schedules: [], data: [], ...overrides });
  const student = { behaviors: [{ id: 'd', isDuration: true }, { id: 'e' }] };
  const at = (time: string) => new Date(`2026-03-04T${time}:00`).getTime();
  const event = (minute: string, overrides: object = {}) => ({ behavior: 'd', dateEpoc: at(minute), source: { rater: 'r1', device: 'App' }, ...overrides });
  const saved = () => db.data.put.mock.calls[0][0];

  it('skips other rows and upgraded reports', async () => {
    await scan([{ pk: 'S#s1', sk: 'P' }, report({ version: 3 })]);
    await expect(reports.onCreateHandler({})).resolves.toEqual({ physicalResourceId: 'migrate-report-data-complete' });
    expect(db.data.put).not.toHaveBeenCalled();
  });

  it('skips a missing student', async () => {
    stub(StudentDal, { getStudentConfig: undefined });
    await scan([report()]);
    await reports.onCreateHandler({});
    expect(db.data.put).not.toHaveBeenCalled();
  });

  it('adds the index keys and converts object schedules', async () => {
    stub(StudentDal, { getStudentConfig: student });
    await scan([report({ schedules: { d1: 'A' } })]);
    await reports.onCreateHandler({});
    expect(saved()).toMatchObject({
      studentId: 's1', tsk: 'R#1000', lpk: 'lic-1#R', lsk: 'S#s1#R#1000', version: 2, services: [], schedules: [{ date: 'd1', schedule: 'A' }]
    });
  });

  it('pairs duration events into one, skipping the stop', async () => {
    stub(StudentDal, { getStudentConfig: student });
    await scan([report({ data: [event('10:00'), event('10:10')] })]);
    await reports.onCreateHandler({});
    expect(saved().data).toEqual([expect.objectContaining({ dateEpoc: at('10:00'), duration: 600000 })]);
  });

  it('marks an unmatched start', async () => {
    stub(StudentDal, { getStudentConfig: student });
    await scan([report({ data: [event('10:00')] })]);
    await reports.onCreateHandler({});
    expect(saved().data[0].duration).toBe(-1);
  });

  it('keeps independent raters separate', async () => {
    stub(StudentDal, { getStudentConfig: { ...student, dashboard: { devices: [{ id: 'r1', calculation: BehaviorCalculation.Independent }] } } });
    await scan([report({ data: [event('10:00'), event('10:10', { source: { rater: 'r2', device: 'App' } })] })]);
    await reports.onCreateHandler({});
    expect(saved().data[0].duration).toBe(-1);
  });

  it('passes plain events through, defaulting the source', async () => {
    stub(StudentDal, { getStudentConfig: student });
    await scan([report({ data: [event('10:00', { behavior: 'e', source: undefined })] })]);
    await reports.onCreateHandler({});
    expect(saved().data[0]).toMatchObject({ behavior: 'e', source: { rater: 'Unknown', device: 'Web' } });
  });

  it('flushes writes in batches', async () => {
    stub(StudentDal, { getStudentConfig: student });
    await scan(Array.from({ length: 25 }, (_, i) => report({ sk: `${i}#D` })));
    await reports.onCreateHandler({});
    expect(db.data.put).toHaveBeenCalledTimes(25);
  });
});

describe('migrateSources', () => {
  const app = (rater: string) => ({ source: { device: 'App', rater } });
  const report = (overrides: object = {}) => ({ pk: 'S#s1#R', sk: '1#D', data: [app('old')], ...overrides });

  it('skips other rows, upgraded reports, empty reports and reports with no app data', async () => {
    await scan([{ pk: 'S#s1', sk: 'P' }, report({ version: 4 }), report({ data: undefined }), report({ data: [{ source: { device: 'Web' } }] })]);
    await expect(sources.onCreateHandler({})).resolves.toEqual({ physicalResourceId: 'migrate-report-data-complete' });
    expect(db.data.batchGet).not.toHaveBeenCalled();
  });

  it('swaps app ids for device ids', async () => {
    await scan([report({ data: [app('old'), app('old'), app('other')] })]);
    db.data.batchGet.mockResolvedValue([{ appId: 'old', deviceId: 'new' }]);
    await sources.onCreateHandler({});
    expect(db.data.batchGet.mock.calls[0][0]).toEqual([{ pk: 'S#s1', sk: 'AS#old#P' }, { pk: 'S#s1', sk: 'AS#other#P' }]);
    const { attributeValues } = db.data.update.mock.calls[0][0];
    expect(attributeValues[':version']).toBe(4);
    expect(attributeValues[':data'].map((x: any) => x.source.rater)).toEqual(['new', 'new', 'other']);
  });

  it('writes nothing with no matches', async () => {
    await scan([report()]);
    await sources.onCreateHandler({});
    expect(db.data.update).not.toHaveBeenCalled();
  });

  // KNOWN BUG: the first pass guards dataItem.source but the update pass does not, so one sourceless
  // event aborts the migration. Goes red when fixed.
  it.fails('tolerates an event with no source', async () => {
    await scan([report({ data: [app('old'), {}] })]);
    db.data.batchGet.mockResolvedValue([{ appId: 'old', deviceId: 'new' }]);
    await expect(sources.onCreateHandler({})).resolves.toBeDefined();
  });
});

describe('migrateTeam', () => {
  const item = (overrides: object = {}) => ({ pk: 'U#u1', sk: 'S#s1#S', userId: 'u1', studentId: 's1', ...overrides });
  const page = (items: object[], key?: object) => ({ Items: items, LastEvaluatedKey: key });

  function respond(pages: object[], license: string | null = 'lic-1') {
    const queue = [...pages];
    aws.doc.mockImplementation(async (command: any) => {
      switch (command.constructor.name) {
        case 'ScanCommand': return queue.shift();
        case 'GetCommand': return { Item: license ? { license } : undefined };
        default: return {};
      }
    });
  }
  const updates = () => aws.doc.mock.calls.map(c => c[0]).filter(c => c.constructor.name === 'UpdateCommand');

  it('fills in license and index keys', async () => {
    respond([page([item()])]);
    await expect(team.onCreateHandler({})).resolves.toEqual({ physicalResourceId: 'migrate-team-data-complete' });
    expect(updates()[0].input.ExpressionAttributeValues).toEqual({
      ':newVal': 'lic-1', ':behaviorTracking': true, ':serviceTracking': false, ':lpk': 'lic-1#T', ':lsk': 'U#u1#S#s1'
    });
  });

  it('skips rows already migrated', async () => {
    respond([page([item({ sk: 'S#s1#X', lpk: 'x' }), item({ lpk: 'x', license: 'l', behaviorTracking: true })])]);
    await team.onCreateHandler({});
    expect(updates()).toEqual([]);
  });

  it('skips a student with no license', async () => {
    respond([page([item({ studentId: 'unlicensed' })])], null);
    await team.onCreateHandler({});
    expect(updates()).toEqual([]);
  });

  it('caches the license and pages through the scan', async () => {
    respond([page([item({ studentId: 'cached' })], { pk: 'next' }), page([item({ studentId: 'cached', userId: 'u2' })])]);
    await team.onCreateHandler({});
    expect(aws.doc.mock.calls.filter(c => c[0].constructor.name === 'GetCommand')).toHaveLength(1);
    expect(updates()).toHaveLength(2);
  });

  it('resets tracking when both flags are off', async () => {
    respond([page([item({ studentId: 'flags', behaviorTracking: false, serviceTracking: false })])]);
    await team.onCreateHandler({});
    expect(updates()[0].input.ExpressionAttributeValues[':behaviorTracking']).toBe(true);
  });

  // KNOWN BUG: in-flight updates are never awaited at the end, so the custom resource can report
  // success and freeze before they finish. Goes red when fixed.
  it.fails('waits for its last updates', async () => {
    let finished = false;
    respond([page([item({ studentId: 'late' })])]);
    const base = aws.doc.getMockImplementation()!;
    aws.doc.mockImplementation(async (command: any) => {
      if (command.constructor.name !== 'UpdateCommand') { return base(command); }
      await new Promise(resolve => setTimeout(resolve, 20));
      finished = true;
      return {};
    });
    await team.onCreateHandler({});
    expect(finished).toBe(true);
  });
});
