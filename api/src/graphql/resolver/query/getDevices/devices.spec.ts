import { DeviceDal, generateStudentTrackKey, getLicenseKey, getStudentPrimaryKey, moment, StudentDal } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { appSyncContext, quietConsole, restrictions, stub, stubTables, transactItems } from '../../../../testing/unit-kit';

vi.hoisted(() => {
  process.env.PrimaryTable = 'primary-table';
  process.env.DataTable = 'data-table';
  process.env.TOKEN_ENCRYPT_KEY = 'test-key';
  process.env.USE_LOCAL = 'true';
  process.env.appid = 'myapp';
});

import * as app from './app';
import * as appToken from './appToken';
import * as appsForDevice from './apps-for-device';
import * as appsForLicense from './apps-for-license';
import * as apps from './apps';
import * as devices from './devices';
import * as track from './track-for-dsn';
import { getTokenSegments } from '../../../../v2/student/devices/app/token-utils';

quietConsole();
let db: ReturnType<typeof stubTables>;
beforeEach(() => { db = stubTables(); });

const key = { pk: 'L#lic-1', sk: 'GD#d1' };

describe('getDevices/appToken', () => {
  const run = () => appToken.handleEvent(appSyncContext({ license: 'lic-1', deviceId: 'd1', expiration: 1 }));

  it('builds a url-safe deep link for the device', async () => {
    db.data.get.mockResolvedValue({ deviceId: 'd1', auth: ['a1'] });
    const result = await run();
    expect(db.data.get).toHaveBeenCalledWith(key);
    expect(result.deviceId).toBe('d1');
    const [prefix, token] = result.token.split('=');
    expect(prefix).toBe('myapp://student?token');
    expect(getTokenSegments(decodeURIComponent(result.token.slice(prefix.length + 1)), 'test-key')).toEqual({ id: 'd1', auth: 'a1' });
    expect(token).not.toContain('+');
  });

  it('generates auth for a device with none', async () => {
    db.data.get.mockResolvedValue({ deviceId: 'd1' });
    await expect(run()).resolves.toHaveProperty('token');
  });
});

describe('getDevices/track-for-dsn', () => {
  const run = (auth = 'id') => track.handleEvent(appSyncContext({ dsn: 'M2', auth }));
  const pii = (overrides: object = {}) => ({ name: 'Clicker', identity: { current: 'id' }, validated: true, license: 'lic-1', currentStudentId: 's1', commands: [{ c: 1 }], ...overrides });
  const license = (expiration = '2099-01-01') => ({ details: { expiration, license: 'lic-1' } });
  const student = { studentId: 's1', license: 'lic-1', behaviors: [{ id: 'b', isDuration: true }, { id: 'c' }] };
  const config = (overrides: object = {}) => ({ timezone: 'UTC', config: { behaviors: [{ id: 'b', presses: 2 }, { id: 'c', presses: 1, order: 9 }, { id: null }] }, ...overrides });
  function setup({ c = config() as unknown, l = license() as unknown, s = student as unknown, r = undefined as unknown } = {}) {
    db.data.get.mockImplementation(async (k: any) => {
      if (k.pk === generateStudentTrackKey('s1', 'M2').pk && k.sk === generateStudentTrackKey('s1', 'M2').sk) { return c; }
      if (k.pk === getStudentPrimaryKey('s1').pk) { return s; }
      if (k.pk === getLicenseKey('lic-1').pk) { return l; }
      return r;
    });
  }

  it('helpers read the last state of a duration', () => {
    const data: any[] = [{ behavior: 'b', notStopped: false }, { behavior: 'b', notStopped: true, dateEpoc: 5 }, { behavior: 'x' }];
    expect(track.getLastTracked(data, 'b', true)).toMatchObject({ dateEpoc: 5 });
    expect(track.getLastTracked(data, 'b', false)).toBeUndefined();
    expect(track.processNotStopped(data, 'b', true)).toBe(true);
    expect(track.processNotStopped(data, 'none', true)).toBe(false);
    expect(track.processNotStopped([{ behavior: 'b' }] as any, 'b', true)).toBe(false);
    expect(track.processNotStoppedService([{ service: 's', notStopped: true }] as any, 's', true)).toBe(true);
    expect(track.processNotStoppedService([{ service: 's' }] as any, 's', true)).toBe(false);
    expect(track.processNotStoppedService([], 's', true)).toBe(false);
  });

  it('auto-registers an unknown device with the identity it presents', async () => {
    db.primary.get.mockResolvedValue(undefined);
    await expect(run('new-id')).resolves.toMatchObject({ dsn: 'M2', deviceName: 'M2', validated: true, events: [], license: '' });
    expect(db.primary.put.mock.calls[0][0].identity).toEqual({ current: 'new-id' });
  });

  it('rejects the wrong identity', async () => {
    db.primary.get.mockResolvedValue(pii());
    await expect(run('bad')).rejects.toThrow('No device found');
  });

  it('returns an unassigned device', async () => {
    db.primary.get.mockResolvedValue(pii({ currentStudentId: undefined, license: undefined }));
    await expect(run()).resolves.toMatchObject({ dsn: 'M2', license: '', events: [], commands: [{ c: 1 }] });
  });

  it('reports a missing config and an expired license', async () => {
    db.primary.get.mockResolvedValue(pii());
    setup({ c: null });
    await expect(run()).rejects.toThrow('Student config not found');
    setup({ l: license('2000-01-01') });
    await expect(run()).rejects.toThrow('License Expired');
  });

  it('builds events, marking a running duration', async () => {
    db.primary.get.mockResolvedValue(pii());
    setup({ r: { data: [{ behavior: 'b', notStopped: true, dateEpoc: 7 }] } });
    const result = await run();
    expect(result.events).toEqual([
      { eventId: 'b', order: 0, presses: 2, isDuration: true, notStopped: true, lastStart: 7 },
      { eventId: 'c', order: 9, presses: 1, isDuration: undefined, notStopped: false, lastStart: undefined }
    ]);
    expect(result).toMatchObject({ studentId: 's1', deviceName: 'Clicker', timezone: 'UTC', license: 'lic-1' });
  });

  it('skips reading the report without duration events', async () => {
    db.primary.get.mockResolvedValue(pii());
    setup({ c: config({ config: { behaviors: [{ id: 'c' }] } }) });
    await run();
    expect(db.data.get).toHaveBeenCalledTimes(3);
  });

  it('falls back to the student license', async () => {
    db.primary.get.mockResolvedValue(pii({ license: 'stale' }));
    db.data.get.mockImplementation(async (k: any) => {
      if (k.pk === generateStudentTrackKey('s1', 'M2').pk && k.sk === generateStudentTrackKey('s1', 'M2').sk) { return config(); }
      if (k.pk === getStudentPrimaryKey('s1').pk) { return student; }
      return JSON.stringify(k).includes('stale') ? undefined : JSON.stringify(k).includes('lic-1') ? license() : undefined;
    });
    await expect(run()).resolves.toMatchObject({ license: 'lic-1' });
  });
});

describe('getDevices/app', () => {
  const run = () => app.handleEvent(appSyncContext({ license: 'lic-1', deviceId: 'd1' }));
  const pii = (overrides: object = {}) => ({ ...key, deviceName: 'Phone', tags: [{ tag: 't' }], studentContextLookup: [{ id: 's1', name: 'Sam', groups: ['g'] }], ...overrides });
  const config = (overrides: object = {}) => ({
    textAlerts: true, timezone: 'UTC', qrExpiration: 5,
    students: [{ studentId: 's1', behaviors: [{ id: 'b', order: 2, intensity: true }, { id: 'r', order: 1 }], services: [{ id: 'sv', order: 1 }] }],
    ...overrides
  });
  const studentPii = { studentId: 's1', nickname: 'Sammy', behaviorLookup: [{ id: 'b', name: 'Run' }], responseLookup: [{ id: 'r', name: 'Calm' }], servicesLookup: [{ id: 'sv', name: 'Speech', modifications: [{ name: 'm' }] }] };
  const studentConfig = {
    studentId: 's1', abc: { antecedents: ['a'], consequences: ['c'] },
    behaviors: [{ id: 'b', isDuration: true }, { id: 'old', isArchived: true }],
    responses: [{ id: 'r' }], services: [{ id: 'sv', goals: { trackGoalPercent: true, goalTargets: [{ name: 'g' }] } }]
  };
  function setup(team: unknown, p = pii() as unknown) {
    db.primary.get.mockResolvedValue(p);
    db.data.get.mockResolvedValue(config());
    db.primary.batchGet.mockResolvedValue([studentPii]);
    db.data.batchGet.mockImplementation(async (keys: any[], projection: string) => projection.includes('restrictions') ? team : [studentConfig]);
  }
  const team = (access: object = {}, level?: AccessLevel) => [{ studentId: 's1', restrictions: restrictions(access, level) }];

  it('returns nothing for an unknown device', async () => {
    await expect(run()).resolves.toBeUndefined();
  });

  it('builds the student config and summary', async () => {
    setup(team());
    const result = await run();
    expect(result).toMatchObject({ deviceId: 'd1', name: 'Phone', textAlerts: true, timezone: 'UTC', qrExpiration: 5, tags: [{ tag: 't' }] });
    const [config_] = result.studentConfigs;
    expect(config_).toMatchObject({ studentId: 's1', studentName: 'Sam', groups: ['g'] });
    expect(config_.behaviors).toEqual([{ id: 'b', track: true, abc: undefined, intensity: true, order: 2, name: 'Run' }]);
    expect(config_.responses).toEqual([{ id: 'r', track: true, abc: undefined, order: 1, name: 'Calm' }]);
    expect(config_.services).toEqual([{ id: 'sv', order: 1, name: 'Speech', percentage: true, trackedItems: ['g'], modifications: ['m'] }]);
    const [summary] = result.students;
    expect(summary).toMatchObject({ studentId: 's1', nickname: 'Sammy', abcAvailable: true });
    expect(summary.behaviors.map((x: any) => x.id)).toEqual(['b']);
    expect(summary.responses.map((x: any) => x.id)).toEqual(['r']);
    expect(summary.services).toEqual([{ id: 'sv', name: 'Speech', isDuration: true }]);
  });

  it('hides a student from someone not on the team', async () => {
    setup([]);
    const result = await run();
    expect(result.studentConfigs[0]).toMatchObject({ studentId: 'Restricted', studentName: 'Restricted', behaviors: [] });
    expect(result.students).toEqual([]);
  });

  it('hides a student from someone with no device access', async () => {
    setup(team({ devices: AccessLevel.none }));
    const result = await run();
    expect(result.studentConfigs[0].studentId).toBe('Restricted');
    expect(result.students).toEqual([]);
  });

  it('masks names outside the allowed behaviors', async () => {
    setup(team({ behaviors: ['other'], services: ['other'] }));
    const [config_] = (await run()).studentConfigs;
    expect(config_.behaviors[0].name).toBe('Restricted');
    expect(config_.responses[0].name).toBe('Restricted');
    expect(config_.services[0].name).toBe('Restricted');
  });

  it('empties lists with no behavior or service access', async () => {
    setup(team({ behavior: AccessLevel.none, service: AccessLevel.none }));
    const [summary] = (await run()).students;
    expect(summary).toMatchObject({ behaviors: [], responses: [], services: [] });
  });

  it('repairs pii missing its lookup', async () => {
    setup(team(), pii({ studentContextLookup: undefined }));
    db.primary.batchGet.mockResolvedValue([{ ...studentPii, firstName: 'Sam', lastName: 'Lee' }]);
    const result = await run();
    expect(db.primary.update.mock.calls[0][0].attributeValues[':studentContextLookup']).toEqual([{ id: 's1', name: 'Sam Lee', groups: [] }]);
    expect(result.studentConfigs[0].studentName).toBe('Sam Lee');
  });
});

describe('getDevices/apps', () => {
  const run = (args: object = {}) => apps.handleEvent(appSyncContext({ license: 'lic-1', ...args }));
  const pii = (overrides: object = {}) => ({ ...key, deviceId: 'd1', deviceName: 'Phone', tags: [{ tag: 't' }], studentContextLookup: [{ id: 's1', name: 'Sam', groups: ['g'] }], ...overrides });

  it('lists a license, sorted by name', async () => {
    db.primary.query.mockResolvedValue([pii({ deviceId: 'b', deviceName: 'Zed' }), pii({ deviceId: 'a', deviceName: undefined })]);
    await expect(run()).resolves.toEqual([
      { deviceId: 'a', name: 'Unnamed', tags: ['t'] },
      { deviceId: 'b', name: 'Zed', tags: ['t'] }
    ]);
    expect(db.primary.query.mock.calls[0][0].filterExpression.trim()).toBe('attribute_not_exists(#deleted)');
  });

  it('skips deleted apps', async () => {
    db.primary.query.mockResolvedValue([pii({ deleted: {} })]);
    await expect(run()).resolves.toEqual([]);
  });

  it('builds a student view', async () => {
    db.primary.query.mockResolvedValue([pii()]);
    db.data.query.mockResolvedValue([{ deviceId: 'd1', students: [{ studentId: 's1', behaviors: [{ id: 'b', abc: true, intensity: true }, { id: 'x', abc: false, order: 5 }] }] }]);
    stub(StudentDal, { getStudentBasicPii: { behaviorLookup: [{ id: 'b', name: 'Run' }] } });
    const [result] = await run({ studentId: 's1' });
    expect(result).toMatchObject({ studentId: 's1', studentName: 'Sam', groups: ['g'], responses: [] });
    expect(result.behaviors).toEqual([
      { id: 'b', abc: true, intensity: true, order: 0, name: 'Run' },
      { id: 'x', abc: undefined, intensity: undefined, order: 5, name: 'Unnamed' }
    ]);
    expect(db.primary.query.mock.calls[0][0].attributeValues[':studentId']).toBe('s1');
  });

  it('skips a student marked deleted on the app or config', async () => {
    db.primary.query.mockResolvedValue([pii({ studentContextLookup: [{ id: 's1', deleted: {} }] })]);
    db.data.query.mockResolvedValue([]);
    await expect(run({ studentId: 's1' })).resolves.toEqual([]);
    db.primary.query.mockResolvedValue([pii()]);
    db.data.query.mockResolvedValue([{ deviceId: 'd1', students: [{ studentId: 's1', deleted: {} }] }]);
    await expect(run({ studentId: 's1' })).resolves.toEqual([]);
  });

  it('builds a missing lookup from student pii', async () => {
    db.primary.query.mockResolvedValue([pii({ studentContextLookup: undefined })]);
    db.data.get.mockResolvedValue({ studentIds: ['s1'] });
    db.primary.get.mockResolvedValue({ firstName: 'Sam', lastName: 'Lee' });
    await expect(run()).resolves.toHaveLength(1);
    expect(db.primary.get).toHaveBeenCalledWith({ pk: 'S#s1', sk: 'P' }, 'firstName, lastName');
  });
});

describe('getDevices/apps-for-license', () => {
  const run = () => appsForLicense.handleEvent(appSyncContext({ license: 'lic-1' }));

  it('joins pii, configs and student names', async () => {
    stub(StudentDal, { getStudentFullPii: { studentId: 's1', behaviorLookup: [{ id: 'b', name: 'Run' }] } });
    db.primary.query.mockResolvedValue([{ deviceId: 'd1', license: 'lic-1', studentIds: ['s1', 's1'], studentContextLookup: [{ id: 's1', name: 'Sam', groups: ['g'] }] }]);
    db.data.query.mockResolvedValue([{ deviceId: 'd1', students: [
      { studentId: 's1', behaviors: [{ id: 'b', abc: true }, { id: 'x', order: 7 }] }, { studentId: 's2', deleted: {} }, null
    ] }]);
    const [result] = await run();
    expect(result).toMatchObject({ deviceId: 'd1', name: 'Unnamed', timezone: 'America/Los_Angeles', textAlerts: false, tags: [] });
    expect(result.studentConfigs).toEqual([{
      studentId: 's1', studentName: 'Sam', groups: ['g'], services: [],
      behaviors: [{ id: 'b', name: 'Run', abc: true, intensity: undefined, order: 0 }, { id: 'x', name: 'Name not found', abc: undefined, intensity: undefined, order: 7 }]
    }]);
    expect(StudentDal.getStudentFullPii).toHaveBeenCalledTimes(1);
  });

  it('sorts by name and tolerates an app with no config', async () => {
    db.primary.query.mockResolvedValue([{ deviceId: 'b', deviceName: 'Z' }, { deviceId: 'a', deviceName: 'A' }]);
    const result = await run();
    expect(result.map(x => x.deviceId)).toEqual(['a', 'b']);
    expect(result[0].studentConfigs).toEqual([]);
  });

  it('leaves out deleted apps', async () => {
    db.primary.query.mockResolvedValue([{ deviceId: 'a', deviceName: 'A' }]);
    db.data.query.mockResolvedValue([{ deviceId: 'a', deleted: {} }]);
    await expect(run()).resolves.toEqual([undefined]);
  });
});

describe('getDevices/devices', () => {
  const run = () => devices.handleEvent(appSyncContext({ studentId: 's1' }));
  const appConfig = (overrides: object = {}) => ({
    pk: 'L', sk: 'GD#d1', deviceId: 'd1', license: 'lic-1', textAlerts: true, timezone: 'UTC', studentIds: ['s1'],
    students: [{ studentId: 's1', behaviors: [{ id: 'b', order: 2 }, { id: 'c', order: 1 }], services: [{ id: 'sv', order: 1 }] }],
    ...overrides
  });

  beforeEach(() => {
    db.data.get.mockResolvedValue({ studentId: 's1', license: 'lic-1' });
    stub(DeviceDal, { getStudentDevices: [] });
  });

  it('maps apps with sorted, named trackables', async () => {
    db.data.query.mockResolvedValue([appConfig()]);
    db.primary.batchGet
      .mockResolvedValueOnce([{ sk: 'GD#d1', deviceName: 'Phone', tags: [], studentContextLookup: [{ id: 's1', name: 'Sam' }] }])
      .mockResolvedValueOnce([{ studentId: 's1', behaviorLookup: [{ id: 'b', name: 'Run' }], servicesLookup: [{ id: 'sv', name: 'Speech' }] }]);
    const { apps: [result] } = await run();
    expect(result).toMatchObject({ deviceId: 'd1', name: 'Phone', textAlerts: true });
    expect(result.studentConfigs[0].studentName).toBe('Sam');
    expect(result.studentConfigs[0].behaviors.map(x => [x.id, x.name])).toEqual([['c', ''], ['b', 'Run']]);
    expect(result.studentConfigs[0].services).toEqual([{ id: 'sv', name: 'Speech', order: 1 }]);
  });

  it('builds a missing name from student pii', async () => {
    db.data.query.mockResolvedValue([appConfig()]);
    db.primary.batchGet
      .mockResolvedValueOnce([{ sk: 'GD#d1', studentContextLookup: [] }])
      .mockResolvedValueOnce([{ studentId: 's1', firstName: 'Sam', lastName: 'Lee' }]);
    expect((await run()).apps[0].studentConfigs[0].studentName).toBe('Sam Lee');
  });

  it('skips an app missing pii or this student', async () => {
    db.data.query.mockResolvedValue([appConfig(), appConfig({ sk: 'GD#d2', students: [] })]);
    db.primary.batchGet.mockResolvedValueOnce([{ sk: 'GD#d2' }]).mockResolvedValueOnce([]);
    await expect(run()).resolves.toMatchObject({ apps: [] });
  });

  it('maps clickers', async () => {
    stub(DeviceDal, { getStudentDevices: [{ dsn: 'M2', deviceName: 'C', validated: true, events: [{ eventId: 'b', presses: 2 }], termSetup: true, commands: [], timezone: 'UTC' }] });
    await expect(run()).resolves.toMatchObject({ clickers: [{ dsn: 'M2', events: [{ behaviorId: 'b', presses: 2 }], termSetup: true }] });
  });
});

describe('getDevices/apps-for-device', () => {
  const run = (args: object = {}, options: object = {}) => appsForDevice.handleEvent(appSyncContext({ deviceId: 'd1', auth: 'a1', apps: [], ...args }, options));
  const config = (overrides: object = {}) => ({
    ...key, deviceId: 'd1', license: 'lic-1', auth: ['a1'],
    students: [{ studentId: 's1', behaviors: [{ id: 'b', order: 2, abc: true, intensity: true }, { id: 'r', order: 1 }], services: [{ id: 'sv', order: 1 }] }],
    ...overrides
  });
  const pii = () => ({ ...key, deviceName: 'Phone', studentContextLookup: [{ id: 's1', name: 'Sam', groups: ['g'] }] });
  const studentPii = {
    studentId: 's1', abc: { name: 'abc' }, behaviorLookup: [{ id: 'b', name: 'Run' }], responseLookup: [{ id: 'r', name: 'Calm' }],
    servicesLookup: [{ id: 'sv', name: 'Speech', modifications: [{ name: 'm' }] }]
  };
  const studentConf = {
    studentId: 's1', license: 'lic-1', behaviors: [{ id: 'b', isDuration: true, intensity: 5 }], responses: [{ id: 'r', isDuration: true }],
    services: [{ id: 'sv', isDuration: true, goals: { trackGoalPercent: true, goalTargets: [{ name: 'g' }] } }]
  };
  function setup(configs: object[], report: unknown = undefined) {
    db.data.query.mockResolvedValue(configs);
    db.primary.get.mockResolvedValue(pii());
    db.primary.batchGet.mockImplementation(async (keys: any, projection: string) => projection.includes('deviceName') ? [pii()] : [studentPii]);
    db.data.batchGet.mockResolvedValue([studentConf]);
    db.data.get.mockResolvedValue(report);
  }

  it('returns an empty device when nothing matches', async () => {
    await expect(run()).resolves.toMatchObject({ deviceId: 'd1', studentConfigs: [] });
    await expect(run({ apps: [{ id: 'x', auth: 'y' }] })).resolves.toMatchObject({ deviceId: 'd1', identity: '', license: '', studentConfigs: [] });
  });

  it('rejects the wrong auth, but trusts IAM callers', async () => {
    setup([config()]);
    await expect(run({ auth: 'bad' })).rejects.toThrow('Access Denied');
    await expect(run({ auth: 'bad' }, { identity: { accountId: '1', cognitoIdentityAuthProvider: null } })).resolves.toHaveProperty('deviceId');
  });

  it('builds the full student config, sorted', async () => {
    setup([config()], {
      data: [{ behavior: 'b', notStopped: true, dateEpoc: 7 }, { behavior: 'r', notStopped: true, dateEpoc: 8 }],
      services: [{ service: 'sv', notStopped: true }]
    });
    const result = await run();
    expect(result).toMatchObject({ deviceId: 'd1', name: 'Phone', identity: 'a1' });
    const [student] = result.studentConfigs;
    expect(student).toMatchObject({ studentId: 's1', studentName: 'Sam', groups: ['g'], license: 'lic-1', abc: { name: 'abc' } });
    expect(student.behaviors).toEqual([{ id: 'b', isDuration: true, abc: true, order: 2, name: 'Run', lastStart: 7, notStopped: true, intensity: true, maxIntensity: 5 }]);
    expect(student.responses).toEqual([{ id: 'r', isDuration: true, abc: false, order: 1, name: 'Calm', lastStart: 8, notStopped: true }]);
    expect(student.services).toEqual([{ id: 'sv', order: 1, name: 'Speech', percentage: true, trackedItems: ['g'], modifications: ['m'], notStopped: true }]);
  });

  it('skips deleted students and those with missing data', async () => {
    setup([config({ students: [{ studentId: 's1', deleted: {}, behaviors: [], services: [] }] })]);
    await expect(run()).resolves.toMatchObject({ studentConfigs: [] });
    setup([config()]);
    db.data.batchGet.mockResolvedValue([]);
    await expect(run()).resolves.toMatchObject({ studentConfigs: [] });
  });

  it('falls back to the student name when the app has no lookup', async () => {
    setup([config()]);
    db.primary.batchGet.mockImplementation(async (keys: any, projection: string) => projection.includes('deviceName') ? [{}] : [{ ...studentPii, firstName: 'Sam', lastName: 'Lee' }]);
    expect((await run()).studentConfigs[0].studentName).toBe('Sam Lee');
  });

  it('claims an unclaimed app for this device', async () => {
    const claim = config({ pk: 'L#lic-1', sk: 'GD#MLC-1', deviceId: 'MLC-1', auth: ['qr'] });
    setup([]);
    db.data.query.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([claim]);
    db.primary.get.mockResolvedValue({ ...pii(), sk: 'GD#MLC-1' });
    const appsArg = [{ id: 'MLC-1', auth: 'qr' }];
    await run({ auth: '', apps: appsArg });
    const items = transactItems(db.data.send);
    expect(items.slice(0, 2).map((x: any) => x.Delete.Key)).toEqual([{ pk: 'L#lic-1', sk: 'GD#MLC-1' }, { pk: 'L#lic-1', sk: 'GD#MLC-1' }]);
    expect(items[2].Put.Item).toMatchObject({ sk: 'GD#d1', deviceId: 'd1' });
    expect(items[3].Put.Item).toMatchObject({ sk: 'GD#d1', deviceId: 'd1' });
    expect(appsArg).toEqual([]);
  });

  it('refuses a claim with the wrong auth', async () => {
    db.data.query.mockResolvedValueOnce([]).mockResolvedValueOnce([config({ auth: ['qr'] })]);
    await expect(run({ apps: [{ id: 'MLC-1', auth: 'bad' }] })).resolves.toMatchObject({ studentConfigs: [] });
    expect(db.data.send).not.toHaveBeenCalled();
  });

  describe('merging further claims', () => {
    const extra = (overrides: object = {}) => config({ pk: 'L#lic-1', sk: 'GD#MLC-2', deviceId: 'MLC-2', auth: ['qr'], students: [], ...overrides });

    it('ignores expired codes and unknown ids', async () => {
      setup([config()]);
      db.data.query.mockResolvedValueOnce([config()]).mockResolvedValueOnce([extra({ qrExpiration: 1 })]).mockResolvedValueOnce([]);
      await run({ apps: [{ id: 'MLC-2', auth: 'qr' }, { id: 'MLC-3', auth: 'qr' }] });
      expect(db.data.send).not.toHaveBeenCalled();
    });

    it('merges a new student from the same license', async () => {
      setup([config()]);
      const incoming = { studentId: 's2', behaviors: [], services: [] };
      db.data.query.mockResolvedValueOnce([config()]).mockResolvedValueOnce([extra({ students: [incoming] })]);
      db.primary.get.mockResolvedValue({ ...pii(), studentContextLookup: [{ id: 's1' }, { id: 's2', name: 'Pat' }] });
      db.primary.batchGet.mockImplementation(async (keys: any, projection: string) => projection.includes('deviceName') ? [pii()] : [studentPii, { ...studentPii, studentId: 's2' }]);
      await run({ apps: [{ id: 'MLC-2', auth: 'qr' }] });
      const items = transactItems(db.data.send);
      expect(items.filter((x: any) => x.Delete)).toHaveLength(2);
      const update = items.find((x: any) => x.Update?.TableName === 'data-table').Update;
      expect(update.ExpressionAttributeValues[':studentIds']).toEqual(['s1', 's2']);
    });

    it('adds trackables to a student already on the device', async () => {
      setup([config()]);
      const incoming = { studentId: 's1', behaviors: [{ id: 'new' }], services: [{ id: 'svNew' }] };
      db.data.query.mockResolvedValueOnce([config()]).mockResolvedValueOnce([extra({ students: [incoming] })]);
      await run({ apps: [{ id: 'MLC-2', auth: 'qr' }] });
      const update = transactItems(db.data.send).find((x: any) => x.Update?.TableName === 'data-table').Update;
      const [student] = update.ExpressionAttributeValues[':students'];
      expect(student.behaviors.map((x: any) => x.id)).toContain('new');
      expect(student.services.map((x: any) => x.id)).toContain('svNew');
    });

    it('moves a claim from another license onto this device id', async () => {
      setup([config()]);
      db.data.query.mockResolvedValueOnce([config()]).mockResolvedValueOnce([extra({ pk: 'L#lic-2', license: 'lic-2' })]);
      db.primary.get.mockResolvedValue({ deviceName: 'Other' });
      await run({ apps: [{ id: 'MLC-2', auth: 'qr' }] });
      const puts = transactItems(db.data.send).filter((x: any) => x.Put);
      expect(puts.map((x: any) => x.Put.Item.sk)).toEqual(['GD#d1', 'GD#d1']);
      expect(puts[0].Put.Item).toMatchObject({ pk: 'L#lic-2', deviceId: 'd1' });
    });
  });

  // KNOWN BUG: student.studentId is read before the !student guard, so one student with missing
  // pii fails the whole device rather than being skipped. Goes red when fixed.
  it.fails('skips a student with no pii', async () => {
    setup([config()]);
    db.primary.batchGet.mockImplementation(async (keys: any, projection: string) => projection.includes('deviceName') ? [{}] : []);
    await expect(run()).resolves.toMatchObject({ studentConfigs: [] });
  });

  // KNOWN BUG: `const unsetAuths` inside the block shadows the outer list, so the persist step at
  // the end never runs and a device without auth is reissued a new one each call. Goes red when fixed.
  it.fails('persists the auth it generates', async () => {
    setup([config({ auth: [] })]);
    await run({ auth: '' });
    expect(db.data.update).toHaveBeenCalled();
  });

  // KNOWN BUG (security): the auth check is skipped when auth is empty, and the device's real
  // identity is returned, so any caller can read it. Goes red when fixed.
  it.fails('does not reveal a device identity without auth', async () => {
    setup([config()]);
    const result = await run({ auth: '' }).catch(() => ({ identity: '' }));
    expect(result.identity).not.toBe('a1');
  });
});

it('moment is available to date helpers', () => {
  expect(moment.isMoment(moment())).toBe(true);
});
