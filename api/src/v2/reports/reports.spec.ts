import { EventDal, LambdaAppsyncQueryClient, moment, v2 } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { callApi, member, quietConsole, stub, webUser } from '../../testing/unit-kit';

const s3 = vi.hoisted(() => ({ listObjects: vi.fn(), putObject: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async original => ({ ...(await original<any>()), S3: class { listObjects = s3.listObjects; putObject = s3.putObject; } }));
const schedule = vi.hoisted(() => ({ handleEvent: vi.fn() }));
vi.mock('../../graphql/resolver/mutations/report/schedule', () => schedule);
vi.hoisted(() => { process.env.appsyncUrl = 'https://appsync.example/graphql'; });

import * as dataDelete from './data/delete';
import * as dataGet from './data/get';
import * as intervalExclude from './data/intervalExclude';
import * as dataPut from './data/put';
import * as statusGet from './data/statusGet';
import * as datePut from './date/put';
import * as notesPost from './notes/post';
import * as notesPut from './notes/put';
import * as scheduleDelete from './schedule/delete';
import * as schedulePut from './schedule/put';
import * as settingsGet from './settings/get';
import * as settingsPut from './settings/put';
import * as snapshotGet from './snapshot/get';
import * as snapshotPost from './snapshot/post';
import * as snapshotPut from './snapshot/put';

quietConsole();
let query: ReturnType<typeof vi.fn>;
const team = (overrides = {}, level?: AccessLevel) => stub(v2.TeamDal, { getTeamMember: member(overrides, level) });

beforeEach(() => {
  query = vi.spyOn(LambdaAppsyncQueryClient.prototype, 'query').mockResolvedValue({}) as any;
  s3.listObjects.mockReset();
  s3.putObject.mockReset();
  schedule.handleEvent.mockReset();
  process.env.dataBucket = 'bucket';
  delete process.env.USE_LOCAL;
});

describe('reports/data/delete', () => {
  const date = '2026-03-02T10:00:00.000Z';
  const request = { studentId: 's1', date } as any;
  const epoc = new Date(date).getTime();

  it('requires data admin', async () => {
    team({ data: AccessLevel.read });
    await expect(dataDelete.handler(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('succeeds without a mutation when the event does not exist', async () => {
    team();
    stub(v2.DataDal, { getData: { data: [{ dateEpoc: 1 }] } });
    await expect(dataDelete.handler(request, webUser)).resolves.toEqual({ success: true });
    expect(query).not.toHaveBeenCalled();
  });

  it('marks the event deleted, attributing the user and redoing durations', async () => {
    team();
    stub(v2.DataDal, { getData: { data: [{ dateEpoc: epoc, behavior: 'b' }] } });
    await dataDelete.handler(request, webUser);
    expect(query.mock.calls[0][1]).toMatchObject({
      studentId: 's1',
      data: { dateEpoc: epoc, behavior: 'b', redoDurations: true, deleted: { by: 'user-1' } }
    });
  });

  // KNOWN BUG: the no-report branch returns { sucess: true }. Goes red when fixed.
  it.fails('reports success when there is no report', async () => {
    team();
    stub(v2.DataDal, { getData: undefined });
    await expect(dataDelete.handler(request, webUser)).resolves.toEqual({ success: true });
  });
});

describe('reports/data/get', () => {
  const request = { studentId: 's1', startDate: '2026-03-01', endDate: '2026-03-07' };

  it('validates its query', async () => {
    expect((await callApi(dataGet.handleEvent, { query: { studentId: 's1' } })).status).toBe('400');
  });

  it('sorts events and strips empty abc', async () => {
    team();
    stub(v2.DataDal, { getData: { data: [{ dateEpoc: 2, abc: {} }, { dateEpoc: 1, abc: { a: 'x' } }] } });
    const result = await dataGet.handler(request, webUser);
    expect(result.data).toEqual([{ dateEpoc: 1, abc: { a: 'x' } }, { dateEpoc: 2 }]);
  });

  it('lets a license admin read a student they are not teamed with', async () => {
    stub(v2.TeamDal, { getTeamMember: () => Promise.reject(new Error('nope')) });
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    stub(v2.DataDal, { getData: { data: [] } });
    await expect(dataGet.handler(request, webUser)).resolves.toEqual({ data: [] });
  });

  it('denies a stranger and a team member with no data access', async () => {
    stub(v2.TeamDal, { getTeamMember: () => Promise.reject(new Error('nope')) });
    stub(v2.StudentDal, { getStudentConfig: { license: 'other' } });
    await expect(dataGet.handler(request, webUser)).rejects.toThrow('Access Denied');
    team({ data: AccessLevel.none });
    await expect(dataGet.handler(request, webUser)).rejects.toThrow('Access Denied');
  });
});

describe('reports/data/intervalExclude', () => {
  it('requires data admin', async () => {
    team({ data: AccessLevel.read });
    await expect(intervalExclude.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('excludes using the student license', async () => {
    team();
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    const dal = stub(v2.DataDal, { excludeInterval: undefined });
    await intervalExclude.handler({ studentId: 's1', date: 'd', include: true } as any, webUser);
    expect(dal.excludeInterval).toHaveBeenCalledWith('s1', 'lic-1', 'd', true);
  });
});

describe('reports/data/put', () => {
  const old = '2020-01-01T00:00:00.000Z';
  const request = { studentId: 's1', behaviorId: 'b', eventDate: old, abc: { a: 'x' }, intensity: 2 } as any;

  it('requires data admin', async () => {
    team({ data: AccessLevel.read });
    await expect(dataPut.trackPut(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('uses AppSync in serverless mode, flagging old events as manual', async () => {
    team();
    query.mockResolvedValue({ isManual: true });
    const result = await dataPut.trackPut(request, webUser);
    expect(query.mock.calls[0][1].data).toMatchObject({
      behavior: 'b', isManual: true, redoDurations: true, source: { device: 'website', rater: 'user-1' }
    });
    expect(result).toMatchObject({ behavior: 'b', isManual: true, dateEpoc: new Date(old).getTime() });
  });

  it('treats an event within five minutes as live', async () => {
    team();
    await dataPut.trackPut({ ...request, eventDate: moment().toISOString() }, webUser);
    expect(query.mock.calls[0][1].data.isManual).toBe(false);
  });

  it('sends straight to the event bus in local mode', async () => {
    process.env.USE_LOCAL = 'true';
    team();
    const events = stub(EventDal, { sendEvents: undefined });
    const result = await dataPut.trackPut(request, webUser);
    expect(query).not.toHaveBeenCalled();
    const [source, [event]] = vi.mocked(events.sendEvents).mock.calls[0];
    expect(source).toBe('website');
    expect(event.data).toMatchObject({ studentId: 's1', behaviorId: 'b', isManual: true, redoDurations: true, source: { rater: 'user-1' } });
    expect(result).toMatchObject({ behavior: 'b', isManual: true });
  });
});

describe('reports/data/statusGet', () => {
  const request = { studentId: 's1' } as any;
  const student = { behaviors: [{ id: 'b1', isDuration: true }, { id: 'b2' }], responses: [{ id: 'r1', isDuration: true }] };
  const weekStart = moment('2020-01-01');

  it('denies a user without restrictions', async () => {
    stub(v2.StudentDal, { getStudentConfig: student });
    stub(v2.TeamDal, { getTeamMember: {} });
    await expect(statusGet.handler(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('returns nothing when no duration events are visible', async () => {
    stub(v2.StudentDal, { getStudentConfig: student });
    team({ behavior: AccessLevel.none });
    await expect(statusGet.handler(request, webUser)).resolves.toEqual({ behaviorStates: [] });
  });

  it('an odd number of events today means the duration is running', async () => {
    stub(v2.StudentDal, { getStudentConfig: student });
    team();
    const now = Date.now();
    vi.spyOn(v2.DataDal, 'getWeekStart').mockReturnValue(weekStart);
    stub(v2.DataDal, { getData: { data: [
      { behavior: 'b1', dateEpoc: now }, { behavior: 'r1', dateEpoc: now }, { behavior: 'r1', dateEpoc: now + 1 },
      { behavior: 'b1', dateEpoc: 0 }
    ] } });
    await expect(statusGet.handler(request, webUser)).resolves.toEqual({ behaviorStates: [
      { behaviorId: 'b1', started: true, startDate: now },
      { behaviorId: 'r1', started: false, startDate: now + 1 }
    ] });
  });

  it('includes a restricted list of behaviors, even non-duration ones', async () => {
    stub(v2.StudentDal, { getStudentConfig: { behaviors: student.behaviors } });
    team({ behavior: AccessLevel.none, behaviors: ['b2'] });
    vi.spyOn(v2.DataDal, 'getWeekStart').mockReturnValue(weekStart);
    stub(v2.DataDal, { getData: { data: [] } });
    await expect(statusGet.handler(request, webUser)).resolves.toEqual({
      behaviorStates: [{ behaviorId: 'b2', started: false, startDate: undefined }]
    });
  });
});

describe('reports/date/put', () => {
  const request = (action: string) => ({ studentId: 's1', date: '2026-03-02', action }) as any;
  const weekStart = moment('2026-03-01');

  function setup(report: object, exists = true) {
    team();
    return stub(v2.DataDal, {
      getWeekStart: () => weekStart, checkDataExist: exists, saveEmptyReport: undefined, getData: report,
      setExcludeDays: undefined, setIncludeDays: undefined
    });
  }

  it('requires data admin', async () => {
    team({ data: AccessLevel.read });
    await expect(datePut.handler(request('exclude'), webUser)).rejects.toThrow('Access Denied');
  });

  it('creates an empty report first when none exists', async () => {
    const dal = setup({ excludeDays: [], includeDays: [] }, false);
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    await datePut.handler(request('exclude'), webUser);
    expect(dal.saveEmptyReport).toHaveBeenCalledWith('s1', 'lic-1', weekStart, false);
  });

  it('adds an excluded and an included day', async () => {
    const dal = setup({ excludeDays: [], includeDays: [] });
    await datePut.handler(request('exclude'), webUser);
    expect(dal.setExcludeDays).toHaveBeenCalledWith('s1', weekStart, ['2026-03-02']);
    await datePut.handler(request('include'), webUser);
    expect(dal.setIncludeDays).toHaveBeenCalledWith('s1', weekStart, ['2026-03-02']);
  });

  it('does not rewrite a day already recorded', async () => {
    const dal = setup({ excludeDays: ['2026-03-02'], includeDays: ['2026-03-02'] });
    await datePut.handler(request('exclude'), webUser);
    await datePut.handler(request('include'), webUser);
    expect(dal.setExcludeDays).not.toHaveBeenCalled();
    expect(dal.setIncludeDays).not.toHaveBeenCalled();
  });

  it('undo removes the day from both lists', async () => {
    const dal = setup({ excludeDays: ['2026-03-02', 'x'], includeDays: ['2026-03-02'] });
    await expect(datePut.handler(request('undo'), webUser)).resolves.toEqual({ success: true });
    expect(dal.setExcludeDays).toHaveBeenCalledWith('s1', weekStart, ['x']);
    expect(dal.setIncludeDays).toHaveBeenCalledWith('s1', weekStart, []);
  });

  it('undo with nothing recorded writes nothing', async () => {
    const dal = setup({ excludeDays: [], includeDays: [] });
    await datePut.handler(request('undo'), webUser);
    expect(dal.setExcludeDays).not.toHaveBeenCalled();
    expect(dal.setIncludeDays).not.toHaveBeenCalled();
  });
});

describe('reports/notes/post', () => {
  const request = { studentId: 's1', date: 'd' } as any;
  const empty = { lastUpdate: '01/01/1970', notes: '' };

  it('validates its arguments', async () => {
    await expect(notesPost.notesPost({ studentId: 's1' } as any, webUser)).rejects.toThrow('The request parameters are invalid');
  });

  it('denies a member with no comment access', async () => {
    team({ comments: AccessLevel.none });
    await expect(notesPost.notesPost(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('returns stored notes', async () => {
    team();
    stub(v2.NotesDal, { getNotes: { notes: 'hi' } });
    await expect(notesPost.notesPost(request, webUser)).resolves.toEqual({ notes: 'hi' });
  });

  it('returns empty notes when none exist or the key is missing', async () => {
    team();
    stub(v2.NotesDal, { getNotes: undefined });
    await expect(notesPost.notesPost(request, webUser)).resolves.toEqual(empty);
    stub(v2.NotesDal, { getNotes: () => Promise.reject(Object.assign(new Error('x'), { code: 'NoSuchKey' })) });
    await expect(notesPost.notesPost(request, webUser)).resolves.toEqual(empty);
  });

  it('hides other storage errors', async () => {
    team();
    stub(v2.NotesDal, { getNotes: () => Promise.reject(new Error('secret')) });
    await expect(notesPost.notesPost(request, webUser)).rejects.toThrow('Internal Error');
  });
});

describe('reports/notes/put', () => {
  const request = { studentId: 's1', date: 'd', lastModifiedDate: 1, updateDate: 2, notes: 'hello world' } as any;
  const setup = (existing?: string) => stub(v2.NotesDal, {
    getNotes: existing === undefined ? undefined : { notes: existing },
    updateNotes: undefined,
    sendTaggingEvents: undefined
  });

  it('validates its arguments', async () => {
    await expect(notesPut.notesPut({ date: 'd' } as any, webUser)).rejects.toThrow('The request parameters are invalid');
  });

  it('requires comment admin', async () => {
    team({ comments: AccessLevel.read });
    await expect(notesPut.notesPut(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('saves, and tags only the text after the first change', async () => {
    team();
    const dal = setup('hello there');
    await expect(notesPut.notesPut(request, webUser)).resolves.toEqual({ success: true });
    expect(dal.updateNotes).toHaveBeenCalledWith('s1', 'd', 1, 2, 'hello world');
    expect(dal.sendTaggingEvents.mock.calls[0][0]).toBe('world');
  });

  it('tags only the appended text', async () => {
    team();
    const dal = setup('hello');
    await notesPut.notesPut(request, webUser);
    expect(dal.sendTaggingEvents.mock.calls[0][0]).toBe(' world');
  });

  it('tags everything for new notes', async () => {
    team();
    const dal = setup();
    await notesPut.notesPut(request, webUser);
    expect(dal.sendTaggingEvents.mock.calls[0]).toEqual(['hello world', 'website', { studentId: 's1', date: 'd', userId: 'user-1', email: '' }]);
  });

  it('surfaces the optimistic-lock conflict and rethrows anything else', async () => {
    team();
    stub(v2.NotesDal, { getNotes: undefined, updateNotes: () => Promise.reject(new Error('Notes have been added since these notes were retrieved')) });
    await expect(notesPut.notesPut(request, webUser)).rejects.toMatchObject({ isWebError: true });
    stub(v2.NotesDal, { updateNotes: () => Promise.reject(new Error('boom')) });
    await expect(notesPut.notesPut(request, webUser)).rejects.not.toHaveProperty('isWebError');
  });

  // KNOWN BUG: with no difference changeIndex stays -1 and slice(-1) sends the last character
  // to tagging. Goes red when fixed.
  it.fails('tags nothing when the notes did not change', async () => {
    team();
    const dal = setup('hello world');
    await notesPut.notesPut(request, webUser);
    expect(dal.sendTaggingEvents.mock.calls[0]?.[0] ?? '').toBe('');
  });
});

describe.each([
  ['delete', scheduleDelete, { studentId: 's1', date: 'd' }, ''],
  ['put', schedulePut, { studentId: 's1', date: 'd', scheduleName: 'Sched' }, 'Sched']
])('reports/schedule/%s', (_, module: any, request: any, schedule_) => {
  it('requires data admin and schedule access', async () => {
    team({ data: AccessLevel.read });
    await expect(module.handler(request, webUser)).rejects.toThrow('Access Denied');
    team({ schedules: AccessLevel.none });
    await expect(module.handler(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('calls AppSync in serverless mode', async () => {
    team();
    await expect(module.handler(request, webUser)).resolves.toEqual({ success: true });
    expect(query.mock.calls[0][1]).toEqual({ studentId: 's1', data: { date: 'd', schedule: schedule_ } });
    expect(schedule.handleEvent).not.toHaveBeenCalled();
  });

  it('calls the resolver directly in local mode', async () => {
    process.env.USE_LOCAL = 'true';
    vi.resetModules();
    const local = await import(/* @vite-ignore */ `./schedule/${_}.ts`);
    const { TeamDal } = await import('@mytaptrack/lib');
    stub(TeamDal, { getTeamMember: member() });
    await local.handler(request, webUser);
    expect(query).not.toHaveBeenCalled();
    expect(schedule.handleEvent.mock.calls[0][0]).toMatchObject({
      arguments: { studentId: 's1', data: { date: 'd', schedule: schedule_ } },
      identity: { username: 'user-1' }
    });
  });
});

describe('reports/settings/get', () => {
  it('denies a member with no data access', async () => {
    team({ data: AccessLevel.none });
    await expect(settingsGet.handler({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('returns the AppSync dashboard, dropping a null tracked event', async () => {
    team();
    query.mockResolvedValue({ dashboard: { velocity: { enabled: true, trackedEvent: null } } });
    await expect(settingsGet.handler({ studentId: 's1' }, webUser)).resolves.toEqual({ velocity: { enabled: true } });
    expect(query.mock.calls[0][1]).toEqual({ studentId: 's1' });
  });

  it('builds the dashboard from the student in local mode, nulling optional fields like GraphQL', async () => {
    process.env.USE_LOCAL = 'true';
    vi.resetModules();
    const local = await import('./settings/get');
    const lib = await import('@mytaptrack/lib');
    stub(lib.TeamDal, { getTeamMember: member() });
    stub(lib.v2.StudentDal, { getStudentConfig: { behaviors: [], responses: [], dashboard: {} } });
    const dashboard: any = await local.handler({ studentId: 's1' }, webUser);
    expect(query).not.toHaveBeenCalled();
    expect(dashboard).toMatchObject({ chartType: null, measurementUnit: null, showExcludedChartGaps: null });
  });
});

describe('reports/settings/put', () => {
  const settings = { behaviors: [{ id: 'b', frequency: true, duration: { avg: true, sum: false } }] };
  const request = (overrides = {}) => JSON.parse(JSON.stringify({ studentId: 's1', settings, ...overrides }));

  it('rejects a response object sent back as settings', async () => {
    await expect(settingsPut.handler(request({ success: true }), webUser)).rejects.toThrow('Invalid data model');
    await expect(settingsPut.handler(request({ settings: { success: true } }), webUser)).rejects.toThrow('Invalid data model');
  });

  it('requires data admin and schedule access', async () => {
    team({ schedules: AccessLevel.none });
    await expect(settingsPut.handler(request(), webUser)).rejects.toThrow('Access Denied');
  });

  it('replaces boolean colors, then saves for this user', async () => {
    team();
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' }, saveUserDashboard: undefined });
    await settingsPut.handler(request(), webUser);
    const saved: any = vi.mocked(v2.StudentDal.saveUserDashboard).mock.calls[0];
    expect(saved.slice(0, 3)).toEqual(['s1', 'lic-1', 'user-1']);
    expect(saved[3].behaviors[0].frequency).toMatch(/^#/);
    expect(saved[3].behaviors[0].duration).toEqual({ avg: expect.stringMatching(/^#/), sum: false });
  });

  it('overwriteStudent saves for the whole student', async () => {
    team();
    const dal = stub(v2.StudentDal, { saveStudentDashboard: undefined, saveUserDashboard: undefined });
    await settingsPut.handler(request({ overwriteStudent: true }), webUser);
    expect(dal.saveStudentDashboard).toHaveBeenCalled();
    expect(dal.saveUserDashboard).not.toHaveBeenCalled();
  });
});

describe('reports/snapshot/get', () => {
  it('denies a member with no report access', async () => {
    team({ reports: AccessLevel.none });
    await expect(snapshotGet.reportGet({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('turns S3 keys into dates, newest first', async () => {
    team();
    const prefix = 'student/s1/reports/Weekly/';
    s3.listObjects.mockResolvedValue({ Contents: [{ Key: `${prefix}2025/03-01.json` }, { Key: `${prefix}2026/01-02.json` }] });
    await expect(snapshotGet.reportGet({ studentId: 's1' }, webUser)).resolves.toEqual(['01/02/2026', '03/01/2025']);
    expect(s3.listObjects).toHaveBeenCalledWith({ Bucket: 'bucket', Prefix: prefix });
  });

  it('handles an empty listing', async () => {
    team();
    s3.listObjects.mockResolvedValue({});
    await expect(snapshotGet.reportGet({ studentId: 's1' }, webUser)).resolves.toEqual([]);
  });
});

describe('reports/snapshot/post', () => {
  const request = { studentId: 's1', date: 'd', timezone: 'UTC' } as any;

  it('denies a member with no report access', async () => {
    team({ reports: AccessLevel.none });
    await expect(snapshotPost.reportPost(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('parses the stored message', async () => {
    team();
    query.mockResolvedValue({ studentId: 's1', date: 'd', type: 'Weekly', behaviors: [], legend: [], message: '{"a":1}' });
    await expect(snapshotPost.reportPost(request, webUser)).resolves.toMatchObject({ message: { a: 1 }, type: 'Weekly', version: 1 });
    expect(query.mock.calls[0][1]).toEqual({ date: 'd', studentId: 's1', userId: 'user-1', timezone: 'UTC' });
  });

  it('defaults a missing message', async () => {
    team();
    query.mockResolvedValue({});
    await expect(snapshotPost.reportPost(request, webUser)).resolves.toMatchObject({ message: {} });
  });
});

describe('reports/snapshot/put', () => {
  const request = () => ({ studentId: 's1', date: '2026-03-04', type: 'Weekly' }) as any;

  it('requires report admin', async () => {
    team({ reports: AccessLevel.read });
    await expect(snapshotPut.reportPut(request(), webUser)).rejects.toThrow('Access Denied');
  });

  it('files the report under the start of its week, stamped with the editor', async () => {
    team();
    await snapshotPut.reportPut(request(), webUser);
    const call = s3.putObject.mock.calls[0][0];
    const sunday = moment('2026-03-04').startOf('week').format('MM-DD');
    expect(call.Key).toBe(`student/s1/reports/Weekly/2026/${sunday}.json`);
    expect(call).toMatchObject({ Bucket: 'bucket', ServerSideEncryption: 'aws:kms', StorageClass: 'STANDARD_IA' });
    expect(JSON.parse(call.Body).lastModified.userId).toBe('user-1');
  });
});
