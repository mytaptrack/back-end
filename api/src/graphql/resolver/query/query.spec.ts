import {
  getLicenseKey, getStudentPrimaryKey, LicenseDal, LookupDal, moment, MttIndexes, NotificationDal, ScheduleDal, StudentDal, TeamDal, UserDal
} from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { appSyncContext, member, quietConsole, stub, stubTables } from '../../../testing/unit-kit';

vi.hoisted(() => { process.env.PrimaryTable = 'primary-table'; process.env.DataTable = 'data-table'; });
const aws = vi.hoisted(() => ({ s3: vi.fn(), ssm: vi.fn() }));
vi.mock('@aws-appsync/utils', () => ({ util: {} }));
vi.mock('@aws-sdk/client-s3', async original => ({ ...(await original<any>()), S3Client: class { send = aws.s3; } }));
vi.mock('@aws-sdk/client-ssm', async original => ({ ...(await original<any>()), SSMClient: class { send = aws.ssm; } }));

import { handler as getData } from './getData/data';
import { handler as excel } from './getData/excel';
import { handler as getNotes, getNotesKey } from './getData/notes';
import * as serviceReport from './getGlobalServiceReport/data';
import * as licenseDetails from './getLicenseDetails/get-license-details';
import * as licenses from './getLicenses/data';
import * as licenseStats from './getLicenses/stats';
import * as manageStats from './getManageStats/get-manage-stats';
import * as manageStudents from './getManageStudents/get-manage-students';
import * as serverSettings from './getServerSettings/data';
import { handler as snapshotGet } from './getSnapshot/get';
import { getSnapshot, getSnapshotKey, getSnapshotSavedKey, handler as snapshotList } from './getSnapshot/list';
import * as dataSources from './getStudent/data-sources';
import * as studentData from './getStudent/data';
import * as findStudents from './getStudent/find-students';
import * as getStudents from './getStudent/get-students';
import * as subscriptions from './getStudent/subscriptions';
import * as studentTeam from './getStudentTeam/get-student-team';
import * as currentUser from './getUsers/current';
import * as manageUsers from './getUsers/manage';
import * as subscriptionNotes from '../subscriptions/report/notes';

quietConsole();
let db: ReturnType<typeof stubTables>;
const team = (access: object = {}, level?: AccessLevel) => stub(TeamDal, { getTeamMember: member(access, level) });

beforeEach(() => {
  db = stubTables();
  aws.s3.mockReset();
  aws.ssm.mockReset();
  process.env.dataBucket = 'bucket';
  delete process.env.USE_LOCAL;
  delete process.env.UserPoolId;
});

describe('getData/data', () => {
  const run = (selection: string[] = ['data', 'services', 'raters'], access: object = {}) => {
    team(access);
    return getData(appSyncContext({ studentId: 's1', startDate: '2026-03-04', endDate: '2026-03-05' }, { selection }));
  };
  const entry = (overrides: object = {}) => ({ behavior: 'b', dateEpoc: 1, source: { device: 'App', rater: 'a1' }, ...overrides });

  it('queries whole weeks around the range', async () => {
    await run();
    const { attributeValues } = db.data.query.mock.calls[0][0];
    expect(attributeValues[':pk']).toBe('S#s1#R');
    expect(attributeValues[':start']).toBe(`${moment('2026-03-04').startOf('week').valueOf()}#D`);
  });

  it('merges report lists', async () => {
    db.data.query.mockResolvedValue([
      { excludeDays: ['a'], includeDays: ['b'], excludedIntervals: ['c'], schedules: [{ date: 'd' }] },
      { excludeDays: ['e'] }
    ]);
    await expect(run([])).resolves.toMatchObject({ excludeDays: ['a', 'e'], includeDays: ['b'], excludedIntervals: ['c'], schedules: [{ date: 'd' }], data: [], services: [] });
  });

  it('only loads what was selected', async () => {
    db.data.query.mockResolvedValue([{ data: [entry()], services: [{ service: 'sv' }] }]);
    await expect(run(['services'])).resolves.toMatchObject({ data: [], services: [{ service: 'sv' }] });
    await expect(run(['data'])).resolves.toMatchObject({ data: [{ behavior: 'b' }], services: [] });
  });

  it('drops deleted and restricted items', async () => {
    db.data.query.mockResolvedValue([{
      data: [entry(), entry({ deleted: {} }), entry({ behavior: 'other' })],
      services: [{ service: 'sv' }, { service: 'sv', deleted: {} }, { service: 'other' }]
    }]);
    const result: any = await run(['data', 'services'], { behaviors: ['b'], services: ['sv'] });
    expect(result.data).toHaveLength(1);
    expect(result.services).toHaveLength(1);
  });

  it('hides services without service data access', async () => {
    db.data.query.mockResolvedValue([{ services: [{ service: 'sv' }] }]);
    await expect(run(['services'], { serviceData: AccessLevel.none })).resolves.toMatchObject({ services: [] });
  });

  it('names raters by device type', async () => {
    db.data.query.mockResolvedValue([{ data: [
      entry({ source: { device: 'App', rater: 'a' } }), entry({ source: { device: 'Track 2.0', rater: 't' } }),
      entry({ source: { device: 'Web', rater: 'w' } }), entry({ source: { device: 'x', rater: 'o' } }), entry({ source: { device: 'x', rater: 'o' } })
    ] }]);
    db.primary.get.mockResolvedValue(undefined);
    const result: any = await run();
    expect(result.raters).toEqual([
      { rater: 'a', name: 'Unknown App' }, { rater: 't', name: 'Unknown Track 2.0' }, { rater: 'w', name: 'Unknown User' }, { rater: 'o', name: 'Unknown Rater' }
    ]);
  });

  it('swaps abc short ids for their tags', async () => {
    db.data.query.mockResolvedValue([{ data: [entry({ abc: { a: 'A1', c: 'C1' } })] }]);
    stub(LookupDal, { getTagsFromShortIds: [{ shortId: 'A1', tag: 'Loud' }] });
    const result: any = await run(['data']);
    expect(result.data[0].abc).toEqual({ a: 'Loud', c: 'C1' });
  });

  // KNOWN BUG: raters are looked up for device 'Web' but stored as 'website', so people show as
  // 'Unknown Rater'. Goes red when fixed.
  it.fails('names a website rater', async () => {
    db.data.query.mockResolvedValue([{ data: [entry({ source: { device: 'website', rater: 'u' } })] }]);
    db.primary.get.mockResolvedValue({ details: { name: 'Tess' } });
    expect(((await run()) as any).raters[0].name).toBe('Tess');
  });

  // KNOWN BUG: legacy keys are sliced at 5,6 and 7,8 rather than 4,6 and 6,8, so dates come out
  // wrong. Goes red when fixed.
  it.fails('reads legacy object schedules', async () => {
    db.data.query.mockResolvedValue([{ schedules: { '20260301': 'A' } }]);
    expect(((await run([])) as any).schedules).toEqual([{ date: '2026-03-01', schedule: 'A' }]);
  });
});

describe('getData/excel', () => {
  // KNOWN BUG: copied from browser code; handleEvent reads this.user with no `this`, so the
  // resolver cannot run at all. Goes red when fixed.
  it.fails('produces a workbook', async () => {
    team();
    await expect(excel(appSyncContext({ studentId: 's1', startDate: '2026-03-01', endDate: '2026-03-02' }))).resolves.toBeDefined();
  });
});

describe('getData/notes', () => {
  const run = (product?: string) => {
    team();
    return getNotes(appSyncContext({ studentId: 's1', startDate: '2026-03-01', endDate: '2026-03-02', product }));
  };

  it('builds the storage key', () => {
    expect(getNotesKey('s1', moment('2026-03-01'), undefined as any)).toBe('student/s1/notes/2026/03/01.json');
  });

  it('reads the behavior partition by default, sorted, hiding deleted notes', async () => {
    db.primary.query.mockResolvedValue([{ dateEpoc: 2, note: 'b' }, { dateEpoc: 1, note: 'a', source: { id: 'x' } }]);
    const result: any = await run();
    expect(db.primary.query.mock.calls[0][0].attributeValues[':pk']).toBe('S#s1#NB');
    expect(db.primary.query.mock.calls[0][0].filterExpression).toBe('attribute_not_exists(#deleted)');
    expect(result.map((x: any) => x.note)).toEqual(['a', 'b']);
    expect(result[0]).toMatchObject({ studentId: 's1', product: 'behavior', date: '' });
  });

  it('reads the service partition', async () => {
    await run('service');
    expect(db.primary.query.mock.calls[0][0].attributeValues[':pk']).toBe('S#s1#NS');
  });
});

describe('getGlobalServiceReport/data', () => {
  const start = moment().startOf('week').subtract(4, 'weeks').valueOf() / 1000;
  const week = 7 * 24 * 3600;
  const run = () => serviceReport.handleEvent(appSyncContext({}));
  const service = (overrides: object = {}) => ({ id: 'sv', detailedTargets: [], weeklyServiceSummary: {}, startDate: moment().subtract(2, 'months').valueOf(), ...overrides });
  function setup(services: object[], extra: object = {}) {
    stub(TeamDal, { getStudentsForUser: [{ studentId: 's1', serviceTracking: true }, { studentId: 's2' }] });
    db.data.batchGet.mockResolvedValue([{ studentId: 's1', services, ...extra }]);
    db.primary.batchGet.mockResolvedValue([{ studentId: 's1', firstName: 'Sam', lastName: 'Lee', servicesLookup: [{ id: 'sv', name: 'Speech' }] }]);
  }

  it('reports a placeholder when no services exist', async () => {
    stub(TeamDal, { getStudentsForUser: [] });
    const result: any = await run();
    expect(result.services).toEqual([{ serviceId: 'No Service Id', serviceName: 'No Services Configured', serviceMinutes: [0, 0, 0, 0] }]);
  });

  it('only includes students with service tracking', async () => {
    setup([]);
    await run();
    expect(db.data.batchGet.mock.calls[0][0]).toEqual([getStudentPrimaryKey('s1')]);
  });

  it('charts weekly minutes', async () => {
    setup([service({ weeklyServiceSummary: { [start + week]: { minutes: 30, avgPercent: 50 } } })]);
    const result: any = await run();
    expect(result.services).toEqual([{ serviceId: 'sv', serviceName: 'Speech', serviceMinutes: [0, 30, 0, 0] }]);
    expect(result.students[0]).toMatchObject({ studentId: 's1', studentName: 'Sam Lee', services: [{ serviceId: 'sv', serviceName: 'Speech', percentGoal: 0, mitigations: [] }] });
  });

  it('flags out of compliance on year to date', async () => {
    setup([service({ detailedTargets: [{ type: 'Scheduled', date: moment().subtract(1, 'month').valueOf(), target: 60 }] })]);
    const result: any = await run();
    expect(result.outOfComp).toHaveLength(1);
    expect(result.outOfComp[0].services[0].yearToDate).toMatchObject({ provided: 0, projected: 60 });
    expect(result.students).toEqual([]);
  });

  it('flags at risk on the current week', async () => {
    setup([service({ detailedTargets: [{ type: 'Scheduled', date: moment().startOf('week').add(1, 'minute').valueOf(), target: 60 }] })]);
    expect(((await run()) as any).atRisk).toHaveLength(1);
  });

  it('removes scheduled time during absences', async () => {
    const date = moment().subtract(1, 'month').valueOf();
    setup([service({ detailedTargets: [{ type: 'Scheduled', date, target: 60 }] })], { absences: [{ start: date - 1, end: date + 1 }] });
    const result: any = await run();
    expect(result.outOfComp).toEqual([]);
    expect(result.students[0].services[0].yearToDate).toMatchObject({ projected: 0, removed: 60 });
  });

  // KNOWN BUG: the projection handles a service with no detailedTargets, but the mitigations line
  // right after dereferences it unguarded. Goes red when fixed.
  it.fails('projects from the target when there is no schedule', async () => {
    const from = moment().subtract(10, 'days').startOf('week').valueOf();
    setup([service({ detailedTargets: undefined, startDate: from, endDate: moment(from).add(100, 'days').valueOf(), target: 1000 })]);
    await expect(run()).resolves.toHaveProperty('services');
  });

  it('lists future makeups as mitigations', async () => {
    const future = { type: 'Makeup', date: Date.now() + 100000 };
    setup([service({ detailedTargets: [future, { type: 'Makeup', date: 1 }] })]);
    expect(((await run()) as any).students[0].services[0].mitigations).toEqual([future]);
  });

  it('skips a student with no pii', async () => {
    setup([service()]);
    db.primary.batchGet.mockResolvedValue([]);
    expect(((await run()) as any).students).toEqual([]);
  });

  // KNOWN BUG: the aggregation loops Object.keys(stats), not stats.data, so only the first student's
  // minutes reach a service. Goes red when fixed.
  it.fails('adds up minutes across students', async () => {
    stub(TeamDal, { getStudentsForUser: [{ studentId: 's1', serviceTracking: true }, { studentId: 's2', serviceTracking: true }] });
    const summary = { [start]: { minutes: 10 } };
    db.data.batchGet.mockResolvedValue(['s1', 's2'].map(studentId => ({ studentId, services: [service({ weeklyServiceSummary: summary })] })));
    db.primary.batchGet.mockResolvedValue(['s1', 's2'].map(studentId => ({ studentId, servicesLookup: [{ id: 'sv', name: 'Speech' }] })));
    expect(((await run()) as any).services[0].serviceMinutes[0]).toBe(20);
  });
});

describe('REST adapters', () => {
  const event = { arguments: { license: 'lic-1' }, request: { headers: {} }, identity: { username: 'user-1' } } as any;

  // KNOWN BUG: both pass requestContext.identity where apiWrapperEx reads authorizer.claims, so the
  // handler returns 'Internal Error' and JSON.parse throws. Goes red when fixed.
  it.fails('getLicenseDetails returns the license', async () => {
    stub(LicenseDal, { get: { license: 'lic-1' } });
    await expect(licenseDetails.handler(event)).resolves.toMatchObject({ license: 'lic-1' });
  });

  it('getManageStats fails while the feature is disabled', async () => {
    await expect(manageStats.handler(event)).rejects.toThrow();
  });
});

describe('getLicenses/data', () => {
  const stored = (details: object = {}) => ({ license: 'lic-1', details: { customer: 'C', singleUsed: 2, features: { duration: false }, ...details } });
  const run = (args: object = {}, groups = ['licenses/lic-1']) => licenses.eventHandler(appSyncContext(args, { identity: { groups } }));

  it('returns nothing without license groups', async () => {
    await expect(run({}, [])).resolves.toEqual([]);
    expect(db.data.batchGet).not.toHaveBeenCalled();
  });

  it('reads the caller licenses, defaulting lists', async () => {
    db.data.batchGet.mockResolvedValue([stored()]);
    await expect(run()).resolves.toEqual([expect.objectContaining({ license: 'lic-1', customer: 'C', singleUsed: 2, mobileTemplates: [], studentTemplates: [], abcCollections: [], tags: {} })]);
    expect(db.data.batchGet.mock.calls[0][0]).toEqual([getLicenseKey('lic-1')]);
  });

  it('only admins can ask for other licenses', async () => {
    await run({ licenses: ['other'] });
    expect(db.data.batchGet.mock.calls[0][0]).toEqual([getLicenseKey('lic-1')]);
    await run({ licenses: ['other'] }, ['admins']);
    expect(db.data.batchGet.mock.calls[1][0]).toEqual([getLicenseKey('other')]);
  });

  it('normalises legacy data', async () => {
    db.data.batchGet.mockResolvedValue([stored({ singleUsed: ['a', 'b', 'c'], features: { intensity: true } }), { license: 'x' }]);
    const [result] = await run();
    expect(result.singleUsed).toBe(3);
    expect(result.features).toEqual({ duration: true });
  });

  // KNOWN BUG: singleUsed.length is read before the !singleUsed default, so a license with no count
  // throws. Goes red when fixed.
  it.fails('defaults a missing single count', async () => {
    db.data.batchGet.mockResolvedValue([stored({ singleUsed: undefined })]);
    await expect(run()).resolves.toMatchObject([{ singleUsed: 0 }]);
  });
});

describe('disabled and trivial queries', () => {
  it('getLicenses/stats reports timestream as disabled', async () => {
    await expect(licenseStats.eventHandler(appSyncContext({}))).rejects.toThrow('Timestream feature is not accessible');
  });

  it('the notes subscription resolves to null', async () => {
    await expect(subscriptionNotes.handleEvent(appSyncContext({}))).resolves.toBeNull();
  });
});

describe('getManageStudents', () => {
  const run = (license = 'lic-1') => manageStudents.handleEvent(appSyncContext({ license }));

  it('denies a license the caller lacks', async () => {
    await expect(run('other')).rejects.toThrow('Access Denied');
  });

  it('joins configs to pii', async () => {
    db.data.query.mockResolvedValue([{ pk: 'p', sk: 's', studentId: 's1' }]);
    db.primary.get.mockResolvedValue({ firstName: 'Sam', lastName: 'Lee', nickname: 'S' });
    await expect(run()).resolves.toEqual({ students: [{ studentId: 's1', license: 'lic-1', details: { firstName: 'Sam', lastName: 'Lee', nickname: 'S' } }] });
    expect(db.data.query.mock.calls[0][0]).toMatchObject({ indexName: MttIndexes.license, attributeValues: { ':lpk': 'L#lic-1', ':lsk': 'S#' } });
  });

  it('hides storage errors', async () => {
    db.data.query.mockRejectedValue(new Error('db down'));
    await expect(run()).rejects.toThrow('Failed to get students for license');
  });

  // KNOWN BUG: .filter runs on the promises, not the results, so a student without pii comes back
  // as undefined. Goes red when fixed.
  it.fails('leaves out a student with no pii', async () => {
    db.data.query.mockResolvedValue([{ pk: 'p', sk: 's', studentId: 's1' }]);
    db.primary.get.mockResolvedValue(undefined);
    await expect(run()).resolves.toEqual({ students: [] });
  });
});

describe('getServerSettings', () => {
  it('builds the settings link, reading the secret once', async () => {
    Object.assign(process.env, { appid: 'app', apikey: 'key', graphql: 'gql', https_key: '/https' });
    aws.ssm.mockResolvedValue({ Parameter: { Value: 'url' } });
    await expect(serverSettings.eventHandler(appSyncContext({}))).resolves.toEqual({ token: 'app://settings?http=url&key=key&graphql=gql' });
    await serverSettings.eventHandler(appSyncContext({}));
    expect(aws.ssm).toHaveBeenCalledTimes(1);
  });
});

describe('getSnapshot', () => {
  const date = moment('2026-03-04');
  const noKey = Object.assign(new Error('missing'), { name: 'NoSuchKey' });
  const body = (value: object) => ({ Body: { transformToString: async () => JSON.stringify(value) } });
  const admin = { reports: AccessLevel.admin } as any;
  const reader = { reports: AccessLevel.read } as any;
  const pii = { behaviorLookup: [{ id: 'b', name: 'Run' }] };

  function setup(data: object[] = []) {
    stub(StudentDal, { getStudentFullPii: pii, getStudentConfig: { behaviors: [{ id: 'b', targets: ['t'] }] } });
    db.data.query.mockResolvedValue([{ data }]);
  }

  it('builds keys from the week start', () => {
    const sunday = date.clone().startOf('week').format('MM-DD');
    expect(getSnapshotKey('s1', 'Weekly', date)).toBe(`student/s1/reports/Weekly/2026/${sunday}.json`);
    expect(getSnapshotSavedKey('s1', 'Weekly', date)).toBe(`student/s1/reports-saved/Weekly/2026/${sunday}.json`);
  });

  it('a reader sees published data only', async () => {
    setup();
    aws.s3.mockResolvedValue(body({ studentId: 's1', behaviors: [], message: { a: 1 } }));
    const report = await getSnapshot('s1', date, 'UTC', 'Weekly', reader);
    expect(aws.s3).toHaveBeenCalledTimes(1);
    expect(aws.s3.mock.calls[0][0].input.Key).toContain('/reports/');
    expect(report).toMatchObject({ published: true, message: '{"a":1}', legend: [] });
  });

  it('an empty report is generated when nothing is stored', async () => {
    setup();
    aws.s3.mockRejectedValue(noKey);
    await expect(getSnapshot('s1', date, 'UTC', 'Weekly', admin)).resolves.toMatchObject({ studentId: 's1', type: 'Weekly', published: true });
  });

  it('denied storage gives an unpublished report', async () => {
    setup();
    aws.s3.mockRejectedValue(Object.assign(new Error('no'), { Code: 'AccessDenied' }));
    await expect(getSnapshot('s1', date, 'UTC', 'Weekly', reader)).resolves.toMatchObject({ studentId: 's1', published: false, behaviors: [expect.objectContaining({ behaviorId: 'b' })] });
  });

  it('rethrows other storage errors', async () => {
    setup();
    aws.s3.mockRejectedValue(new Error('s3 down'));
    await expect(getSnapshot('s1', date, 'UTC', 'Weekly', reader)).rejects.toThrow('s3 down');
  });

  it("refuses another student's report", async () => {
    setup();
    aws.s3.mockResolvedValue(body({ studentId: 'other', behaviors: [] }));
    await expect(getSnapshot('s1', date, 'UTC', 'Weekly', reader)).rejects.toThrow('Access Denied');
  });

  it('adds stats comparing to the previous day and week', async () => {
    const at = (d: string) => ({ behavior: 'b', dateEpoc: moment.tz(d, 'UTC').valueOf() });
    setup([at('2026-03-04T10:00:00'), at('2026-03-04T11:00:00'), at('2026-03-03T10:00:00'), at('2026-02-25T10:00:00')]);
    aws.s3.mockResolvedValue(body({ studentId: 's1', behaviors: [] }));
    const report = await getSnapshot('s1', date, 'UTC', 'Weekly', reader);
    expect(report.behaviors[0]).toMatchObject({
      behaviorId: 'b', displayText: 'Run', show: true, targets: ['t'],
      stats: { week: { count: 3, delta: 2, modifier: '+' }, day: { count: 2, delta: 1, modifier: '+' } }
    });
  });

  it('marks falling and flat stats', async () => {
    setup([{ behavior: 'b', dateEpoc: moment.tz('2026-02-25T10:00:00', 'UTC').valueOf() }]);
    aws.s3.mockResolvedValue(body({ studentId: 's1', behaviors: [{ behaviorId: 'b' }] }));
    const report = await getSnapshot('s1', date, 'UTC', 'Weekly', reader);
    expect(report.behaviors[0].stats).toMatchObject({ week: { modifier: '-' }, day: { modifier: '' } });
  });

  it('applies behavior restrictions to the report and legend', async () => {
    setup();
    aws.s3.mockResolvedValue(body({ studentId: 's1', behaviors: [{ behaviorId: 'hidden' }], legend: [{ behavior: 'hidden' }] }));
    const report = await getSnapshot('s1', date, 'UTC', 'Weekly', { ...reader, behaviors: ['b'] });
    expect(report.behaviors.map(x => x.behaviorId)).toEqual(['b']);
    expect(report.legend).toEqual([]);
  });

  // KNOWN BUG: a saved draft sets `body` but `report` is only parsed under if(!body), so any admin
  // with a draft crashes on report.studentId. Goes red when fixed.
  it.fails('an admin sees their saved draft', async () => {
    setup();
    aws.s3.mockResolvedValue(body({ studentId: 's1', behaviors: [] }));
    await expect(getSnapshot('s1', date, 'UTC', 'Weekly', admin)).resolves.toMatchObject({ published: false });
  });

  describe('get', () => {
    it('rejects an unknown report type', async () => {
      team();
      await expect(snapshotGet(appSyncContext({ studentId: 's1', date: '2026-03-04', reportType: 'Daily' }))).rejects.toThrow('Invalid report type');
    });

    it('loads the report', async () => {
      team({ reports: AccessLevel.read });
      setup();
      aws.s3.mockResolvedValue(body({ studentId: 's1', behaviors: [] }));
      await expect(snapshotGet(appSyncContext({ studentId: 's1', date: '2026-03-04', reportType: 'Range', timezone: 'UTC' }))).resolves.toMatchObject({ studentId: 's1' });
    });
  });

  describe('list', () => {
    const run = () => snapshotList(appSyncContext({ studentId: 's1', timezone: 'UTC' }));
    const prefix = 'student/s1/reports';

    it('returns dates newest first, with the latest report', async () => {
      team({ reports: AccessLevel.read });
      setup();
      aws.s3.mockImplementation(async (command: any) => command.constructor.name === 'ListObjectsV2Command'
        ? { Contents: [{ Key: `${prefix}/Weekly/2025/03-02.json` }, { Key: `${prefix}/Weekly/2026/03-01.json` }] }
        : body({ studentId: 's1', behaviors: [] }));
      const result: any = await run();
      expect(result.reports).toEqual([{ date: '03/01/2026', type: 'Weekly' }, { date: '03/02/2025', type: 'Weekly' }]);
      expect(result.latest).toMatchObject({ studentId: 's1' });
    });

    it('admins also see saved drafts', async () => {
      team();
      setup();
      aws.s3.mockImplementation(async (command: any) => {
        if (command.constructor.name !== 'ListObjectsV2Command') { throw noKey; }
        return command.input.Prefix.includes('saved') ? { Contents: [{ Key: `${prefix}-saved/Weekly/2026/03-01.json` }] } : {};
      });
      expect(((await run()) as any).reports).toEqual([{ date: '03/01/2026', type: 'Weekly' }]);
    });

    it('returns nothing when there are no reports', async () => {
      team({ reports: AccessLevel.read });
      aws.s3.mockResolvedValue({});
      await expect(run()).resolves.toEqual({ reports: [], latest: undefined });
    });

    it('reads dynamodb in local mode', async () => {
      process.env.USE_LOCAL = 'true';
      team({ reports: AccessLevel.read });
      setup();
      db.primary.query.mockResolvedValue([{ date: '2026-03-01', type: 'Weekly' }, { date: '2026-03-08', type: 'Weekly' }]);
      aws.s3.mockRejectedValue(noKey);
      const result: any = await run();
      expect(db.primary.query.mock.calls[0][0].attributeValues).toEqual({ ':pk': 'S#s1', ':sk': 'SS#' });
      expect(result.reports[0].date).toBe('2026-03-08');
    });
  });
});

describe('getStudent/data-sources', () => {
  const run = (access: object = {}) => dataSources.eventHandler(appSyncContext({ studentId: 's1' }, { access }));

  it('lists team, apps and clickers', async () => {
    stub(TeamDal, { getTeam: [{ userId: 'u', details: { name: 'Tess' } }] });
    db.primary.query.mockResolvedValueOnce([{ deviceId: 'd', deviceName: 'Phone' }]).mockResolvedValueOnce([]);
    await expect(run()).resolves.toEqual({ team: [{ id: 'u', name: 'Tess' }], apps: [{ id: 'd', name: 'Phone' }], track2: [] });
    expect(db.primary.query.mock.calls[0][0].attributeValues[':pk']).toBe('AGD#lic-1');
    expect(db.primary.query.mock.calls[1][0].attributeValues[':pk']).toBe('TRACK2#lic-1');
  });

  it('respects team and device access', async () => {
    const dal = stub(TeamDal, { getTeam: [] });
    await expect(run({ team: AccessLevel.none, devices: AccessLevel.none })).resolves.toEqual({ team: [], apps: [], track2: [] });
    expect(dal.getTeam).not.toHaveBeenCalled();
    expect(db.primary.query).not.toHaveBeenCalled();
  });

  // KNOWN BUG: the query projects deviceId, but the mapping reads serialNumber, so clicker ids are
  // always undefined. Goes red when fixed.
  it.fails('returns clicker ids', async () => {
    stub(TeamDal, { getTeam: [] });
    db.primary.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ deviceId: 'M2', deviceName: 'C' }]);
    await expect(run()).resolves.toMatchObject({ track2: [{ id: 'M2', name: 'C' }] });
  });
});

describe('getStudent/find-students', () => {
  const run = () => findStudents.handleEvent(appSyncContext({ license: 'lic-1', firstName: 'A', lastName: 'B' }));

  it('returns nothing when no config matches', async () => {
    await expect(run()).resolves.toEqual([]);
    expect(db.primary.batchGet).not.toHaveBeenCalled();
  });

  it('joins and sorts, defaulting missing pii', async () => {
    db.data.query.mockResolvedValue([{ studentId: 's1', serviceTracking: true }, { studentId: 's2', behaviorTracking: false }, { studentId: 's1' }]);
    db.primary.batchGet.mockResolvedValue([{ studentId: 's1', nickname: 'Zed' }]);
    const result = await run();
    expect(db.primary.batchGet.mock.calls[0][0]).toHaveLength(2);
    expect(result[0]).toMatchObject({ studentId: 's2', details: { firstName: 'No first name' }, tracking: { service: false, behavior: false } });
    expect(result[1]).toMatchObject({ details: { nickname: 'Zed' }, tracking: { service: true, behavior: true } });
  });

  it('queries the license index for students, with its filter values', async () => {
    await run();
    expect(db.data.query.mock.calls[0][0]).toMatchObject({
      indexName: MttIndexes.license,
      attributeValues: { ':lpk': 'L#lic-1', ':lsk': 'S#', ':firstName': 'A', ':lastName': 'B' }
    });
  });
});

describe('getStudent/get-students', () => {
  const run = (params: object = { behavior: true }, selection: string[] = []) => getStudents.handleEvent(appSyncContext({ params }, { selection }));
  const conf = (overrides: object = {}) => ({ studentId: 's1', restrictions: { data: AccessLevel.admin }, ...overrides });

  it('returns nothing when the user has no students', async () => {
    await expect(run()).resolves.toEqual([]);
  });

  it('treats unset tracking as behavior', async () => {
    db.data.query.mockResolvedValue([conf()]);
    db.primary.batchGet.mockResolvedValue([{ studentId: 's1', firstName: 'Sam', lastName: 'Lee' }]);
    await expect(run()).resolves.toMatchObject([{ studentId: 's1', details: { nickname: 'Sam Lee' }, tracking: { behavior: true, service: false }, behaviors: [] }]);
  });

  it('filters by product and dedupes', async () => {
    db.data.query.mockResolvedValue([conf({ serviceTracking: true }), conf({ serviceTracking: true }), conf({ studentId: 's2', behaviorTracking: true })]);
    await expect(run({ service: true })).resolves.toHaveLength(1);
  });

  it('trackable excludes read-only students', async () => {
    db.data.query.mockResolvedValue([conf({ restrictions: { data: AccessLevel.read } })]);
    await expect(run({ behavior: true, trackable: true })).resolves.toEqual([]);
  });

  it('loads behaviors when selected, leaving out archived and restricted ones', async () => {
    db.data.query.mockResolvedValue([conf()]);
    db.primary.batchGet.mockResolvedValue([{ studentId: 's1', nickname: 'S', abc: { name: 'x' }, behaviorLookup: [{ id: 'b', name: 'Run', desc: 'D', tags: ['t'] }] }]);
    db.data.batchGet.mockResolvedValue([{ studentId: 's1', behaviors: [{ id: 'b', daytime: true }, { id: 'old', isArchived: true }] }]);
    const [student] = await run({ behavior: true }, ['behaviors', 'abc']);
    expect(db.primary.batchGet.mock.calls[0][1]).toContain('behaviorLookup');
    expect(db.primary.batchGet.mock.calls[0][1]).toContain(', abc');
    expect(student.abc).toEqual({ name: 'x' });
    expect(student.behaviors).toEqual([expect.objectContaining({ id: 'b', name: 'Run', desc: 'D', baseline: false, daytime: true, tags: ['t'] })]);
  });
});

describe('getStudent/subscriptions', () => {
  const stored = {
    name: 'Sub', behaviorIds: ['b', 'gone'], responseIds: ['r', 'gone'], userIds: ['u'], deviceIds: ['d'],
    notifyUntilResponse: true, emails: ['e'], mobiles: ['m'], messages: { default: 'x' }
  };
  const run = (selection: string[] = []) => subscriptions.handleEvent(appSyncContext({ studentId: 's1' }, { selection }));

  beforeEach(() => {
    stub(NotificationDal, { get: { notifications: [stored] } });
    stub(StudentDal, { getStudentsPii: [{ license: 'lic-1', behaviorLookup: [{ id: 'b', name: 'Run' }], responseLookup: [{ id: 'r', name: 'Calm' }] }] });
  });

  it('names behaviors and responses, dropping orphans', async () => {
    const [result] = await run();
    expect(result).toMatchObject({ name: 'Sub', behaviors: [{ id: 'b', name: 'Run' }], responses: [{ id: 'r', name: 'Calm' }], emails: ['e'], mobiles: ['m'], users: [], devices: [] });
    expect(db.primary.batchGet.mock.calls[0][0]).toEqual([]);
  });

  it('loads users and devices only when selected', async () => {
    db.primary.batchGet.mockResolvedValueOnce([{ userId: 'u', details: { name: 'Tess' } }]).mockResolvedValueOnce([{ deviceId: 'd', deviceName: 'Phone' }]);
    await expect(run(['users', 'devices'])).resolves.toMatchObject([{ users: [{ id: 'u', name: 'Tess' }], devices: [{ id: 'd', name: 'Phone' }] }]);
  });
});

describe('getStudentTeam', () => {
  it('requires device access', async () => {
    await expect(studentTeam.eventHandler(appSyncContext({ studentId: 's1' }, { access: { devices: AccessLevel.none } }))).rejects.toThrow('Access Denied');
  });

  it('returns active members', async () => {
    stub(TeamDal, { getTeam: [{ userId: 'u', details: { email: 'e', name: 'N' }, restrictions: {}, status: 'Verified' }, { deleted: true }] });
    await expect(studentTeam.eventHandler(appSyncContext({ studentId: 's1' }))).resolves.toEqual([{ userId: 'u', email: 'e', name: 'N', restrictions: {}, status: 'Verified' }]);
  });
});

describe('getUsers/current', () => {
  const run = (identity = {}) => currentUser.eventHandler(appSyncContext({ license: 'lic-1' }, { identity }));
  const pii = { details: { firstName: 'F', lastName: 'L', name: 'N', email: 'e@x', state: 'WA', zip: '1' } };

  it('falls back to a test user with no identity', async () => {
    const result = await currentUser.eventHandler({ identity: undefined, arguments: {}, stash: {} } as any);
    expect(result.id).toBe('local-test-user');
  });

  it('returns an empty profile for someone unknown', async () => {
    await expect(run({ username: 'a-at-x.com' })).resolves.toMatchObject({ id: 'a-at-x.com', email: 'a@x.com', majorFeatures: { tracking: false }, invites: [] });
  });

  it('looks the email up in cognito when deployed', async () => {
    process.env.UserPoolId = 'pool';
    const dal = stub(UserDal, { getEmailByUserId: 'cog@x' });
    await expect(run()).resolves.toMatchObject({ email: 'cog@x' });
    expect(dal.getEmailByUserId).toHaveBeenCalledWith('user-1');
  });

  it('uses a placeholder account keyed by email', async () => {
    db.primary.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce(pii);
    db.data.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ terms: 'T' });
    await expect(run()).resolves.toMatchObject({ firstName: 'F', terms: 'T' });
  });

  it('builds features from the license and students', async () => {
    db.primary.get.mockResolvedValue(pii);
    db.data.get.mockImplementation(async (key: any) => key.pk === getLicenseKey('lic-1').pk
      ? { license: 'lic-1', details: { features: { manage: true } } }
      : { license: 'lic-1', terms: 'T' });
    db.data.query.mockResolvedValueOnce([{ behaviorTracking: true, serviceTracking: true, status: 'Verified', studentId: 's1', restrictions: { data: AccessLevel.admin } }]).mockResolvedValueOnce([]);
    await expect(run()).resolves.toMatchObject({
      name: 'N', terms: 'T', invites: [],
      majorFeatures: { license: 'lic-1', behaviorTracking: true, serviceTracking: true, tracking: true, manage: true }
    });
  });

  it('a read-only member cannot track', async () => {
    db.primary.get.mockResolvedValue(pii);
    db.data.get.mockResolvedValue({});
    db.data.query.mockResolvedValueOnce([{ status: 'Verified', restrictions: { data: AccessLevel.read } }]).mockResolvedValueOnce([]);
    expect((await run()).majorFeatures.tracking).toBe(false);
  });

  it('lists pending invites, including those sent to the email', async () => {
    db.primary.get.mockImplementation(async (key: any) => key.pk === getStudentPrimaryKey('s2').pk ? { studentId: 's2', firstName: 'Pat', lastName: 'Fox' } : pii);
    db.data.get.mockResolvedValue({});
    db.data.query.mockResolvedValueOnce([{ studentId: 's1', status: 'pending approval' }]).mockResolvedValueOnce([{ studentId: 's2', status: 'pending approval' }]);
    await expect(run()).resolves.toMatchObject({ invites: [
      { studentId: 's1', name: 'Unknown', status: 'pending approval' },
      { studentId: 's2', name: 'Pat Fox', status: 'pending approval' }
    ] });
  });
});

describe('getUsers/manage', () => {
  const run = (selection = ['users', 'students']) => manageUsers.eventHandler(appSyncContext({ license: 'lic-1' }, { selection }));
  const member_ = (overrides: object = {}) => ({ userId: 'u1', studentId: 's1', restrictions: { behavior: 'Admin', data: 'Read' }, ...overrides });
  const pii = (overrides: object = {}) => ({ userId: 'u1', details: { email: 'U1@X', firstName: 'F', lastName: 'L', name: 'N' }, ...overrides });

  it('queries the license team', async () => {
    await expect(run()).resolves.toEqual({ users: [], students: [] });
    expect(db.data.query.mock.calls[0][0]).toMatchObject({ indexName: MttIndexes.license, attributeValues: { ':license': 'lic-1#T' } });
  });

  it('skips lookups that were not selected', async () => {
    db.data.query.mockResolvedValue([member_()]);
    await expect(run([])).resolves.toEqual({ users: [], students: [] });
    expect(db.primary.batchGet).not.toHaveBeenCalled();
  });

  it('fills in restriction defaults', async () => {
    db.data.query.mockResolvedValue([member_()]);
    db.primary.batchGet.mockImplementation(async (keys: any, projection?: string) => projection ? [pii()] : []);
    const { users: [user] } = await run();
    expect(user).toMatchObject({ id: 'u1', email: 'u1@x', firstName: 'F' });
    expect(user.students[0]).toMatchObject({
      studentId: 's1', behaviors: true, services: false, teamStatus: 'pending approval',
      restrictions: { info: 'Admin', documents: 'Admin', abc: 'Admin', reports: 'Read', service: 'No Access', serviceData: 'No Access', serviceGoals: 'No Access', serviceSchedule: 'No Access' }
    });
  });

  it('drops team rows with no restrictions', async () => {
    db.data.query.mockResolvedValue([member_({ restrictions: undefined })]);
    db.primary.batchGet.mockImplementation(async (keys: any, projection?: string) => projection ? [pii()] : []);
    expect((await run()).users[0].students).toEqual([]);
  });

  it('merges accounts sharing an email, preferring the real id', async () => {
    db.data.query.mockResolvedValue([member_({ userId: 'u1@x' })]);
    db.primary.batchGet.mockImplementation(async (keys: any, projection?: string) => projection ? [pii({ userId: 'u1@x' }), pii({ userId: 'real' })] : []);
    const { users } = await run();
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe('real');
    expect(users[0].students).toHaveLength(1);
  });

  it('summarises students', async () => {
    db.data.query.mockResolvedValue([member_()]);
    db.primary.batchGet.mockImplementation(async (keys: any, projection?: string) => projection
      ? [pii()]
      : [{ studentId: 's1', firstName: 'Sam', lastName: 'Lee', schoolStudentId: '7', behaviorLookup: [{ id: 'b', name: 'Run', tags: [] }] }]);
    db.data.batchGet.mockResolvedValue([{ studentId: 's1', licenseDetails: { flexible: true } }]);
    const { students: [student] } = await run();
    expect(student).toEqual({
      id: 's1', name: 'Sam Lee', firstName: 'Sam', lastName: 'Lee', schoolId: '7',
      licenseDetails: { flexible: true }, behaviors: [{ id: 'b', name: 'Run' }], services: []
    });
  });
});

describe('getStudent/data', () => {
  const config = (overrides: object = {}) => ({
    studentId: 's1', license: 'lic-1', licenseDetails: {}, documents: ['doc'], lastTracked: 'lt', lastUpdatedDate: 'lu',
    behaviors: [{ id: 'b' }], responses: [{ id: 'r' }], services: [{ id: 'sv' }], ...overrides
  });
  const pii = (overrides: object = {}) => ({
    firstName: 'Sam', lastName: 'Lee', nickname: 'S', tags: [{ tag: 't' }], milestones: ['m'], abc: { name: 'a' },
    behaviorLookup: [{ id: 'b', name: 'Run' }], responseLookup: [{ id: 'r', name: 'Calm' }],
    servicesLookup: [{ id: 'sv', name: 'Speech', modifications: [{ name: 'm' }] }], ...overrides
  });
  const map = (access: object = {}, level?: AccessLevel) => {
    const { restrictions: build } = { restrictions: appSyncContext({}, { access, level }).stash.permissions.student };
    return studentData.mapConfigAndPiiToStudent(config() as any, pii() as any, build);
  };

  describe('mapConfigAndPiiToStudent', () => {
    it('joins everything for a full-access user', () => {
      const student = map();
      expect(student.behaviors[0]).toMatchObject({ id: 'b', name: 'Run' });
      expect(student.responses[0]).toMatchObject({ id: 'r', name: 'Calm' });
      expect(student.services[0]).toMatchObject({ id: 'sv', name: 'Speech', modifications: ['m'] });
      expect(student).toMatchObject({ documents: ['doc'], milestones: ['m'], abc: { name: 'a' }, tags: ['t'], lastTracked: 'lt', details: { firstName: 'Sam' } });
    });

    it('hides each section without access', () => {
      const student = map({}, AccessLevel.none);
      expect(student).toMatchObject({ behaviors: [], responses: [], services: [], documents: [], milestones: [], abc: undefined, lastTracked: 0, lastUpdateDate: 0, tags: [], scheduleCategories: [] });
      expect(student.details.firstName).toBe('No name');
    });

    it('applies id restrictions', () => {
      const student = map({ behaviors: ['other'], services: ['other'] });
      expect(student).toMatchObject({ behaviors: [], responses: [], services: [] });
    });

    it('drops orphaned trackables', () => {
      const student = studentData.mapConfigAndPiiToStudent(config() as any, pii({ behaviorLookup: [], responseLookup: [], servicesLookup: undefined }) as any, appSyncContext({}).stash.permissions.student);
      expect(student).toMatchObject({ behaviors: [], responses: [], services: [] });
    });

    it('keeps behavior notifications only', () => {
      const student = studentData.mapConfigAndPiiToStudent(config() as any, pii() as any, appSyncContext({}).stash.permissions.student, undefined, undefined, [
        { date: 1, details: { type: 'behavior', behaviorId: 'b' } }, { date: 2, details: { type: 'other' } }, { date: 3, details: { type: 'behavior' } }
      ] as any);
      expect(student.notifications).toEqual([{ epoch: 1, behaviorId: 'b' }]);
    });

    it('prefers the user dashboard', () => {
      const student = studentData.mapConfigAndPiiToStudent(config() as any, pii() as any, appSyncContext({}).stash.permissions.student, { dashboard: { velocity: { enabled: true } } } as any);
      expect(student.dashboard!.velocity!.enabled).toBe(true);
    });
  });

  describe('dashboard settings', () => {
    const { colors } = studentData;

    it('returns nothing without settings', () => {
      expect(studentData.updateDashboardSettings(undefined, {} as any)).toBeUndefined();
    });

    it('builds defaults', () => {
      const settings = studentData.getDashboardSettings({ behaviors: [{ id: 'a' }, { id: 'old', isArchived: true }], responses: [{ id: 'r' }] } as any);
      expect(settings.behaviors).toEqual([{ id: 'a', frequency: colors[0][0] }]);
      expect(settings.responses).toEqual([{ id: 'r', frequency: colors[1][0] }]);
      expect(settings).toMatchObject({ autoExcludeDays: [0, 6], summary: { averageDays: 5 }, velocity: { enabled: false } });
    });

    it('adds a missing summary', () => {
      expect(studentData.getDashboardSettings({ dashboard: {} } as any).summary).toMatchObject({ after45: 'Weeks' });
    });

    it('turns boolean settings into colors, or removes them', () => {
      const settings = studentData.updateDashboardSettings({
        behaviors: [{ id: 'a', frequency: true, duration: { sum: true, avg: false } }, { id: 'b', frequency: false }],
        responses: [{ id: 'r', frequency: true }]
      } as any, { behaviors: [{ id: 'a', isDuration: true, targets: [] }, { id: 'b' }], responses: [{ id: 'r' }] } as any)!;
      expect(settings.behaviors[0]).toEqual({ id: 'a', frequency: colors[0][0], duration: { sum: colors[0][0] } });
      expect(settings.behaviors[1]).toEqual({ id: 'b' });
      expect(settings.responses[0].frequency).toBe(colors[2][0]);
    });

    it('derives duration colors from targets', () => {
      const settings = studentData.updateDashboardSettings({} as any, { behaviors: [{ id: 'a', isDuration: true, targets: [{ measurement: 'Sum', target: 1 }, { measurement: 'Max', target: 2 }] }] } as any)!;
      expect(settings.behaviors[0].duration).toEqual({ sum: colors[0][1], avg: undefined, min: undefined, max: colors[0][4] });
    });

    it('gives a new duration without targets a default, and strips duration from an event', () => {
      const settings = studentData.updateDashboardSettings({ behaviors: [{ id: 'b', duration: { sum: 'x' } }] } as any, { behaviors: [{ id: 'a', isDuration: true }, { id: 'b' }] } as any)!;
      expect(settings.behaviors[0].duration).toEqual({ avg: colors[0][1] });
      expect(settings.behaviors[1].duration).toBeUndefined();
    });
  });

  describe('eventHandler', () => {
    const run = (options: object = {}, args: object = {}) => studentData.eventHandler(appSyncContext({ studentId: 's1', ...args }, options));

    beforeEach(() => {
      stub(ScheduleDal, { getSchedules: ['sched'] });
    });

    function setup(c: unknown = config(), features: unknown = { abc: true, displayTags: ['d'] }) {
      db.data.get.mockResolvedValueOnce(c).mockResolvedValueOnce(undefined);
      db.primary.get.mockResolvedValue(pii());
      stub(LicenseDal, { get: features ? { features } : undefined });
    }

    it('denies a missing student', async () => {
      db.data.get.mockResolvedValue(undefined);
      await expect(run()).rejects.toThrow('Access Denied');
    });

    it('fills features from the license', async () => {
      setup();
      const result = await run();
      expect(result!.features).toMatchObject({ abc: true, duration: true, snapshot: false, notifications: false, displayTags: ['d'] });
      expect(result!.scheduleCategories).toEqual(['sched']);
    });

    it('defaults everything off without a license', async () => {
      setup(config({ license: undefined }), null);
      const result = await run();
      expect(result!.features).toMatchObject({ abc: false, dashboard: false, duration: false, displayTags: [] });
      expect(result).toMatchObject({ license: '', licenseDetails: { services: false, transferable: false } });
    });

    it('defaults abc access to behavior access', async () => {
      setup();
      const result = await run({ access: { abc: undefined, behavior: AccessLevel.read } });
      expect(result!.restrictions.abc).toBe(AccessLevel.read);
    });

    it('loads notifications only when selected', async () => {
      setup();
      const dal = stub(UserDal, { getStudentBehaviorNotifications: [] });
      await run();
      expect(dal.getStudentBehaviorNotifications).not.toHaveBeenCalled();
      setup();
      await run({ selection: ['notifications'] });
      expect(dal.getStudentBehaviorNotifications).toHaveBeenCalledWith('user-1', 's1');
    });

    it('an IAM caller acts for the requested user', async () => {
      setup();
      const dal = stub(UserDal, { getStudentBehaviorNotifications: [] });
      await run({ identity: { accountId: '1', cognitoIdentityAuthProvider: null }, selection: ['notifications'] }, { userId: 'target' });
      expect(dal.getStudentBehaviorNotifications).toHaveBeenCalledWith('target', 's1');
    });
  });
});
