import { DataDal, EventDal, IoTClickType, moment, MttEventType, WebError } from '@mytaptrack/lib';
import { appSyncContext, quietConsole, stub, stubTables } from '../../../../testing/unit-kit';

vi.hoisted(() => { process.env.PrimaryTable = 'primary-table'; process.env.DataTable = 'data-table'; });
const aws = vi.hoisted(() => ({ s3: vi.fn(), getObject: vi.fn(), sendMessage: vi.fn(), processData: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async original => ({
  ...(await original<any>()), S3: class { getObject = aws.getObject; }, S3Client: class { send = aws.s3; }
}));
vi.mock('@aws-sdk/client-sqs', async original => ({ ...(await original<any>()), SQS: class { sendMessage = aws.sendMessage; } }));
vi.mock('./process', () => ({ processData: aws.processData }));

import * as data from './data';
import * as dateInclusion from './date-inclusion';
import * as notes from './notes';
import * as reprocess from './reprocess-events';
import * as schedule from './schedule';
import * as updateDaySchedule from './update-day-schedule';
import * as updateExclude from './update-exclude-date';
import * as updateReports from '../reports/update-reports-data';
import { handler as saveSnapshot } from '../snapshot/save';
import { TeamDal } from '@mytaptrack/lib';
import { member } from '../../../../testing/unit-kit';

quietConsole();
let db: ReturnType<typeof stubTables>;
beforeEach(() => {
  db = stubTables();
  for (const mock of Object.values(aws)) { mock.mockReset(); }
  process.env.dataBucket = 'bucket';
  process.env.DATA_QUEUE_URL = 'queue';
});

const weekSk = (date: string) => `${moment(date, 'yyyy-MM-DD').startOf('week').toDate().getTime()}#D`;

describe('report/data', () => {
  const run = (d: object) => data.handleEvent(appSyncContext({ studentId: 's1', data: d }));

  beforeEach(() => { stub(EventDal, { sendEvents: undefined }); });

  it('needs a behavior or service', async () => {
    await expect(run({})).rejects.toThrow('Cannot determine the type of item tracked');
  });

  it('rejects something the student does not track', async () => {
    db.data.get.mockResolvedValue({ behaviors: [] });
    await expect(run({ behavior: 'b' })).rejects.toThrow('Could not find behavior');
  });

  it('publishes a track event, defaulting the source to the user', async () => {
    db.data.get.mockResolvedValue({ behaviors: [{ id: 'b', isDuration: true }] });
    const d = { behavior: 'b', dateEpoc: 1700000000000, duration: 5, isManual: true, redoDurations: true, deleted: { by: 'x' } };
    await expect(run(d)).resolves.toBe(d);
    const [source, [event]] = vi.mocked(EventDal.sendEvents).mock.calls[0];
    expect(source).toBe('website');
    expect(event.type).toBe(MttEventType.trackEvent);
    expect(event.data).toMatchObject({
      studentId: 's1', behaviorId: 'b', isDuration: true, notStopped: true, clickType: IoTClickType.manual,
      remove: true, redoDurations: true, source: { device: 'website', rater: 'user-1' }, dateEpoc: 1700000000000
    });
  });

  it('accepts a response or service and defaults the date to now', async () => {
    db.data.get.mockResolvedValue({ responses: [{ id: 'r' }], services: [{ id: 'sv' }] });
    const before = Date.now();
    await run({ behavior: 'r' });
    await run({ service: 'sv' });
    expect(vi.mocked(EventDal.sendEvents).mock.calls[1][1][0].data.dateEpoc).toBeGreaterThanOrEqual(before);
  });
});

describe('report/date-inclusion', () => {
  const run = (input: object) => dateInclusion.handleEvent(appSyncContext({ studentId: 's1', input: { exclude: [], include: [], ...input } }));
  const start = moment('2026-03-01').valueOf();

  it('rejects a reversed range', async () => {
    await expect(run({ startDate: start + 1000, endDate: start })).rejects.toThrow('Start date is after end date');
  });

  it('creates missing reports and writes each week its own days', async () => {
    const dal = stub(DataDal, { checkDataExist: false, saveEmptyReport: undefined });
    await expect(run({
      startDate: start, endDate: moment('2026-03-15').valueOf(), exclude: ['', '03/02/2026'], include: ['03/10/2026']
    })).resolves.toBe(true);
    expect(dal.saveEmptyReport).toHaveBeenCalledTimes(2);
    expect(vi.mocked(dal.saveEmptyReport).mock.calls[0][0]).toBe('s1');
    expect(db.data.update.mock.calls[0][0]).toMatchObject({ key: { pk: 'S#s1#R' }, attributeValues: { ':excludeDays': ['03/02/2026'], ':includeDays': [] } });
    expect(db.data.update.mock.calls[1][0].attributeValues).toEqual({ ':excludeDays': [], ':includeDays': ['03/10/2026'] });
  });

  it('leaves existing reports in place', async () => {
    const dal = stub(DataDal, { checkDataExist: true, saveEmptyReport: undefined });
    await run({ startDate: start, endDate: moment('2026-03-08').valueOf() });
    expect(dal.saveEmptyReport).not.toHaveBeenCalled();
  });
});

describe('report/notes', () => {
  const input = (overrides: object = {}) => ({ studentId: 's1', noteDate: Date.UTC(2026, 2, 1, 12), dateEpoc: 1, note: 'hi', noteId: 'n1', product: 'behavior', ...overrides });
  const run = (i: object, identity = {}) => notes.handleEvent(appSyncContext({ input: i }, { identity }));

  beforeEach(() => {
    db.data.get.mockResolvedValue({ studentId: 's1', license: 'lic-1' });
  });

  it('attributes a new note to the user', async () => {
    db.primary.get.mockImplementation(async (key: any) => key.pk.startsWith('U#') ? { details: { name: 'Tess' } } : undefined);
    const result = await run(input());
    expect(result.source).toEqual({ id: 'user-1', name: 'Tess', type: 'user' });
    expect(result.noteDate).toBe(moment(input().noteDate).startOf('day').valueOf());
    const stored = db.primary.put.mock.calls[0][0];
    expect(stored.pk).toBe('S#s1#NB');
    expect(stored).toMatchObject({ lpk: 'lic-1', note: 'hi' });
  });

  it('uses the service partition and generates an id', async () => {
    db.primary.get.mockImplementation(async (key: any) => key.pk.startsWith('U#') ? { details: {} } : undefined);
    const result = await run(input({ product: 'service', noteId: undefined }));
    expect(result.noteId).toBeTruthy();
    expect(db.primary.put.mock.calls[0][0].pk).toBe('S#s1#NS');
  });

  it.each([
    ['track', { name: 'Clicker' }, 'Clicker'],
    ['app', { deviceName: 'Phone' }, 'Phone']
  ])('names a %s source', async (type, stored, name) => {
    db.primary.get.mockImplementation(async (key: any) => key.sk.includes('#N#') ? undefined : stored);
    const result = await run(input({ source: { id: 'd1', type } }));
    expect(result.source.name).toBe(name);
  });

  it('defaults an empty source id and type', async () => {
    db.primary.get.mockImplementation(async (key: any) => key.pk.startsWith('U#') ? { details: { name: 'T' } } : undefined);
    const result = await run(input({ source: { id: '' } }));
    expect(result.source).toMatchObject({ id: 'user-1', type: 'user' });
  });

  it('keeps the source of an edited note, refusing a different author', async () => {
    db.primary.get.mockResolvedValue({ source: { id: 'user-1', name: 'Tess', type: 'user' } });
    await expect(run(input())).resolves.toMatchObject({ source: { name: 'Tess' } });
    db.primary.get.mockResolvedValue({ source: { id: 'other' } });
    await expect(run(input())).rejects.toThrow('Note source does not match');
  });

  it('soft-deletes', async () => {
    await run(input({ remove: true }));
    expect(db.primary.update.mock.calls[0][0].updateExpression).toBe('SET #deleted = :deleted');
    expect(db.primary.update.mock.calls[0][0].attributeValues[':deleted'].type).toBe('user');
    expect(db.primary.put).not.toHaveBeenCalled();
  });

  it('attributes an IAM caller to the app', async () => {
    await run(input({ remove: true, source: { id: 'd1', type: 'app' } }), { userArn: 'arn:aws:x' });
    expect(db.primary.update.mock.calls[0][0].attributeValues[':deleted'].type).toBe('app');
  });

  // KNOWN BUG: deleted.id stores userId.startsWith('arn') (a boolean), losing who deleted the
  // note. Goes red when fixed.
  it.fails('records who deleted a note', async () => {
    await run(input({ remove: true }));
    expect(db.primary.update.mock.calls[0][0].attributeValues[':deleted'].id).toBe('user-1');
  });
});

describe('report/reprocess-events', () => {
  const body = (records: string[]) => aws.getObject.mockResolvedValue({
    Body: { transformToString: async () => JSON.stringify(records.map(event => ({ event }))) }
  });

  it('reads the named file and clears each student week once', async () => {
    const epoc = moment('2026-03-02').valueOf();
    body([`{ studentId: 's1', dateEpoc: ${epoc} }`, `{ studentId: 's1', dateEpoc: ${epoc + 1000} }`]);
    await reprocess.handleEvent({ key: 'file.json' });
    expect(aws.getObject).toHaveBeenCalledWith({ Bucket: 'bucket', Key: 'reprocess/file.json' });
    expect(db.data.update).toHaveBeenCalledTimes(1);
    expect(db.data.update.mock.calls[0][0].attributeValues).toEqual({ ':data': [] });
  });

  // KNOWN BUG: the SQS replay sits under if(!data.studentId), but every parsed record has one, so
  // reprocessing wipes the week and queues nothing back. Goes red when fixed.
  it.fails('requeues what it cleared', async () => {
    body([`{ studentId: 's1', dateEpoc: ${moment('2026-03-02').valueOf()} }`]);
    await reprocess.handleEvent({ key: 'file.json' });
    expect(aws.sendMessage).toHaveBeenCalled();
  });
});

describe('report/schedule', () => {
  const date = '2026-03-04';
  const key = { pk: 'S#s1#R', sk: weekSk(date) };
  const run = (d: object) => schedule.handleEvent(appSyncContext({ studentId: 's1', data: { date, ...d } }));

  it('rejects a bad date', async () => {
    await expect(run({ date: 'nonsense', schedule: 'x' })).rejects.toBeInstanceOf(WebError);
  });

  it('creates a report for a first schedule', async () => {
    db.data.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ license: 'lic-1' });
    await run({ schedule: 'A' });
    expect(db.data.put.mock.calls[0][0]).toMatchObject({ ...key, license: 'lic-1', schedules: [{ date, schedule: 'A' }], version: 2 });
  });

  it('removing from a missing report does nothing', async () => {
    db.data.get.mockResolvedValue(undefined);
    await expect(run({ schedule: '' })).resolves.toMatchObject({ date });
    expect(db.data.put).not.toHaveBeenCalled();
  });

  it('adds, replaces and removes a day', async () => {
    const saved = () => db.data.update.mock.lastCall![0].attributeValues[':schedules'];
    db.data.get.mockResolvedValue({});
    await run({ schedule: 'A' });
    expect(saved()).toEqual([{ date, schedule: 'A' }]);
    db.data.get.mockResolvedValue({ schedules: [{ date, schedule: 'A' }] });
    await run({ schedule: 'B' });
    expect(saved()).toEqual([{ date, schedule: 'B' }]);
    db.data.get.mockResolvedValue({ schedules: [{ date, schedule: 'B' }, { date: 'x', schedule: 'C' }] });
    await run({ schedule: '' });
    expect(saved()).toEqual([{ date: 'x', schedule: 'C' }]);
  });

  it('converts legacy object schedules with dashed keys', async () => {
    db.data.get.mockResolvedValue({ schedules: { '2026-03-01': 'Old' } });
    await run({ schedule: 'New' });
    expect(db.data.update.mock.calls[0][0].attributeValues[':schedules'][0]).toEqual({ date: '20260301', schedule: 'Old' });
  });

  // KNOWN BUG: moment parses lowercase yyyy greedily, so 'yyyyMMDD' swallows the whole key and every
  // undashed legacy date is rewritten as 'Invalid date'. Goes red when fixed.
  it.fails('converts legacy object schedules with compact keys', async () => {
    db.data.get.mockResolvedValue({ schedules: { '20260301': 'Old' } });
    await run({ schedule: 'New' });
    expect(db.data.update.mock.calls[0][0].attributeValues[':schedules'][0].date).toBe('20260301');
  });
});

describe('report/update-day-schedule', () => {
  const date = '2026-03-04';
  const run = (remove?: boolean, d = date) => updateDaySchedule.handleEvent(appSyncContext({ studentId: 's1', date: d, remove }));

  it('rejects a bad date', async () => {
    await expect(run(true, 'nonsense')).rejects.toThrow('Invalid date');
  });

  it('removes the day', async () => {
    db.data.get.mockResolvedValue({ schedules: [{ date }, { date: 'other' }] });
    await expect(run(true)).resolves.toBe(true);
    expect(db.data.update.mock.calls[0][0]).toMatchObject({
      key: { pk: 'S#s1#R', sk: weekSk(date) }, attributeValues: { ':schedules': [{ date: 'other' }] }
    });
  });

  it('removing without a report is a no-op', async () => {
    db.data.get.mockResolvedValue(undefined);
    await expect(run(true)).resolves.toBe(true);
    expect(db.data.update).not.toHaveBeenCalled();
  });

  it('cannot add without schedule data', async () => {
    await expect(run(false)).resolves.toBe(false);
  });
});

describe('report/update-exclude-date', () => {
  const date = '2026-03-04';
  const run = (action: string, d = date) => updateExclude.handleEvent(appSyncContext({ studentId: 's1', date: d, action }));
  const written = () => db.data.update.mock.calls[0][0].attributeValues;

  it('rejects a bad date and an unknown action', async () => {
    await expect(run('exclude', 'nonsense')).rejects.toThrow('Invalid date');
    db.data.get.mockResolvedValue({});
    await expect(run('sideways')).rejects.toThrow('Invalid action');
  });

  it('excluding moves the day out of the include list', async () => {
    db.data.get.mockResolvedValue({ excludeDays: [], includeDays: [date, 'x'] });
    await run('exclude');
    expect(written()).toEqual({ ':excludeDays': [date], ':includeDays': ['x'] });
  });

  it('does not duplicate an excluded day', async () => {
    db.data.get.mockResolvedValue({ excludeDays: [date] });
    await run('exclude');
    expect(written()[':excludeDays']).toEqual([date]);
  });

  it('including clears the exclusion', async () => {
    db.data.get.mockResolvedValue({ excludeDays: [date] });
    await run('include');
    expect(written()[':excludeDays']).toEqual([]);
  });

  it('creates a report when none exists', async () => {
    db.data.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ license: 'lic-1' });
    await run('include');
    expect(db.data.put.mock.calls[0][0]).toMatchObject({ license: 'lic-1', includeDays: [date], excludeDays: [], version: 2 });
  });

  // KNOWN BUG: includeDays.push runs only if the day is already included, inverted, so 'include'
  // never records the day. Goes red when fixed.
  it.fails('including records the day', async () => {
    db.data.get.mockResolvedValue({ excludeDays: [], includeDays: [] });
    await run('include');
    expect(written()[':includeDays']).toEqual([date]);
  });
});

describe('reports/update-reports-data', () => {
  it('maps the input to a button request and echoes the fields', async () => {
    const d = { behavior: 'b', dateEpoc: 5, duration: 2, source: { device: 'website' }, abc: { a: 'x' }, intensity: 1, redoDurations: true, notStopped: true };
    const result = await updateReports.eventHandler(appSyncContext({ studentId: 's1', data: d }));
    expect(aws.processData.mock.calls[0]).toEqual([expect.objectContaining({
      studentId: 's1', behaviorId: 'b', dateEpoc: 5, isManual: false, remove: false, redoDurations: true, notStopped: true
    }), 's1']);
    expect(result).toMatchObject({ dateEpoc: 5, behavior: 'b', duration: 2, intensity: 1 });
  });
});

describe('snapshot/save', () => {
  const date = '2026-03-04';
  const sunday = moment(date).startOf('week');
  const published = `student/s1/reports/Weekly/${sunday.format('yyyy')}/${sunday.format('MM-DD')}.json`;
  const saved = published.replace('/reports/', '/reports-saved/');
  const run = (snapshot: object) => saveSnapshot(appSyncContext({ studentId: 's1', date, reportType: 'Weekly', snapshot }));

  beforeEach(() => { stub(TeamDal, { getTeamMember: member() }); });

  it('saves a draft to the working key', async () => {
    await run({ published: false });
    expect(aws.s3.mock.calls[0][0].input).toMatchObject({ Bucket: 'bucket', Key: saved });
    expect(aws.s3).toHaveBeenCalledTimes(1);
  });

  it('publishing writes the report and removes the draft', async () => {
    await expect(run({ published: true })).resolves.toEqual({ published: true });
    expect(aws.s3.mock.calls[0][0].input.Key).toBe(published);
    expect(aws.s3.mock.calls[1][0].input.Key).toBe(saved);
  });

  it('a failed draft cleanup does not fail publishing', async () => {
    aws.s3.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('gone'));
    await expect(run({ published: true })).resolves.toEqual({ published: true });
  });
});
