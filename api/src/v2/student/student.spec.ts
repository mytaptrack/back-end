import { LambdaAppsyncQueryClient, LicenseDal, MailClient, TeamDal as RootTeamDal, v2 } from '@mytaptrack/lib';
import { AccessLevel, UserSummaryStatus } from '@mytaptrack/types';
import { callApi, member, noLicenseUser, quietConsole, restrictions, stub, webUser } from '../../testing/unit-kit';

const aws = vi.hoisted(() => ({
  deleteObject: vi.fn(), sendMessage: vi.fn(), ssmSend: vi.fn(), getSignedUrl: vi.fn(),
  processStudentTemplates: vi.fn()
}));
vi.mock('@aws-sdk/client-s3', async original => ({ ...(await original<any>()), S3: class { deleteObject = aws.deleteObject; } }));
vi.mock('@aws-sdk/client-sqs', async original => ({ ...(await original<any>()), SQS: class { sendMessage = aws.sendMessage; } }));
vi.mock('@aws-sdk/client-ssm', async original => ({ ...(await original<any>()), SSMClient: class { send = aws.ssmSend; } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: aws.getSignedUrl }));
vi.mock('@mytaptrack/lib/dist/v2/utils/templates', () => ({ processStudentTemplates: aws.processStudentTemplates }));

import * as abcDelete from './abc/delete';
import * as abcPut from './abc/put';
import * as behaviorDelete from './behavior/delete';
import * as behaviorPut from './behavior/put';
import * as appDelete from './devices/app/delete';
import * as appGet from './devices/app/get';
import * as appPut from './devices/app/put';
import * as qrCodeGet from './devices/app/qrCodeGet';
import * as tokenUtils from './devices/app/token-utils';
import * as tokenGet from './devices/app/tokenGet';
import * as generalGet from './devices/general/get';
import * as trackDelete from './devices/track/delete';
import * as trackGet from './devices/track/get';
import * as trackPut from './devices/track/put';
import * as registerPut from './devices/track/registerPut';
import * as resyncPost from './devices/track/resyncPost';
import * as termGet from './devices/track/termGet';
import * as termPut from './devices/track/termPut';
import * as documentDelete from './documents/delete';
import * as documentGet from './documents/get';
import * as documentPut from './documents/put';
import * as infoGet from './info/get';
import * as infoPut from './info/put';
import * as deleteProcessing from './notification/delete-processing';
import * as notificationDelete from './notification/delete';
import * as notificationGet from './notification/get';
import * as responseDelete from './response/delete';
import * as responsePut from './response/put';
import * as scheduleDelete from './schedule/delete';
import * as scheduleGet from './schedule/get';
import * as schedulePut from './schedule/put';
import * as subscriptionsGet from './subscriptions/get';
import * as subscriptionsPut from './subscriptions/put';
import * as teamDelete from './team/delete';
import * as teamGet from './team/get';
import * as teamPost from './team/post';
import * as teamPut from './team/put';

quietConsole();
let query: ReturnType<typeof vi.fn>;
const team = (overrides = {}, level?: AccessLevel) => stub(v2.TeamDal, { getTeamMember: member(overrides, level) });
const noTeam = (message = 'Access Denied') => stub(v2.TeamDal, { getTeamMember: () => Promise.reject(new Error(message)) });

beforeEach(() => {
  for (const mock of Object.values(aws)) { mock.mockReset(); }
  query = vi.spyOn(LambdaAppsyncQueryClient.prototype, 'query') as any;
  process.env.dataBucket = 'bucket';
  process.env.NOTIFICATION_DELETE_QUEUE = 'queue';
  delete process.env.USE_LOCAL;
  delete process.env.SystemEmail;
});

describe('student/abc', () => {
  it('delete requires device admin', async () => {
    team({ devices: AccessLevel.read });
    await expect(abcDelete.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('delete falls back to the license collections', async () => {
    team();
    const dal = stub(v2.StudentDal, {
      getStudent: { license: 'lic-1', abc: { name: 'custom' } },
      evaluateAbcCollections: (student: any) => { student.abc = { name: 'license' }; },
      setStudentAbc: undefined
    });
    stub(v2.LicenseDal, { get: { license: 'lic-1' } });
    await expect(abcDelete.handler({ studentId: 's1' } as any, webUser)).resolves.toEqual({ abc: { name: 'license' } });
    expect(dal.setStudentAbc).toHaveBeenCalledWith('s1', 'lic-1', { name: 'license' });
  });

  it('put requires abc admin', async () => {
    team({ abc: AccessLevel.read });
    await expect(abcPut.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('put stores the abc without the student id', async () => {
    team();
    const dal = stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' }, setStudentAbc: undefined });
    const result = await abcPut.handler({ studentId: 's1', name: 'x' } as any, webUser);
    expect(result).toEqual({ name: 'x' });
    expect(dal.setStudentAbc).toHaveBeenCalledWith('s1', 'lic-1', { name: 'x' });
  });
});

describe.each([
  ['behavior', behaviorDelete, 'behaviors'],
  ['response', responseDelete, 'responses']
])('student/%s/delete', (_, module: any, list) => {
  const request = { studentId: 's1', behaviorId: 'b1' };

  it('requires behavior admin', async () => {
    team({ behavior: AccessLevel.read });
    await expect(module.handler(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('reports an unknown id', async () => {
    team();
    stub(v2.StudentDal, { getStudent: { [list]: [] } });
    await expect(module.handler(request, webUser)).rejects.toThrow('The specified behavior is not found');
  });

  it('removes the entry and saves', async () => {
    team();
    const dal = stub(v2.StudentDal, { getStudent: { [list]: [{ id: 'b1' }, { id: 'b2' }] }, saveStudent: undefined });
    await module.handler(request, webUser);
    expect(dal.saveStudent).toHaveBeenCalledWith({ [list]: [{ id: 'b2' }] });
  });
});

describe('student/behavior/put', () => {
  const put = (behavior: object) => behaviorPut.putBehavior({ studentId: 's1', behavior } as any, webUser);

  it('requires behavior admin', async () => {
    team({ behavior: AccessLevel.read });
    await expect(put({ name: 'x' })).rejects.toThrow('Access Denied');
  });

  it('rejects an unknown id and a duplicate name', async () => {
    team();
    stub(v2.StudentDal, { getStudent: { behaviors: [{ id: 'b1', name: 'Run ' }] } });
    await expect(put({ id: 'nope', name: 'x' })).rejects.toThrow('The specified behavior is not found');
    await expect(put({ name: ' run' })).rejects.toThrow('The specified behavior is already present');
  });

  it('adds a behavior, defaulting duration events to daytime', async () => {
    team();
    const student = { behaviors: [] as any[] };
    const dal = stub(v2.StudentDal, { getStudent: student, saveStudent: undefined });
    const result: any = await put({ name: 'Run', isDuration: true });
    expect(result).toMatchObject({ name: 'Run', isArchived: false, daytime: true, tags: [] });
    expect(result.id).toBeTruthy();
    expect(dal.saveStudent).toHaveBeenCalledWith({ behaviors: [result] });
  });

  it('updates in place, keeping fields the request leaves out', async () => {
    team();
    const existing = { id: 'b1', name: 'Run', isArchived: true, isDuration: true };
    stub(v2.StudentDal, { getStudent: { behaviors: [existing] }, saveStudent: undefined });
    const result = await put({ id: 'b1', desc: 'd', targets: [] });
    expect(result).toBe(existing);
    expect(result).toMatchObject({ name: 'Run', isArchived: true, isDuration: true, desc: 'd' });
  });
});

describe('student/response/put', () => {
  const put = (response: object) => responsePut.handler({ studentId: 's1', response } as any, webUser);

  it('requires behavior admin', async () => {
    team({ behavior: AccessLevel.read });
    await expect(put({ name: 'x' })).rejects.toThrow('Access Denied');
  });

  it('rejects an unknown id', async () => {
    team();
    stub(v2.StudentDal, { getStudent: { behaviors: [], responses: [] } });
    await expect(put({ id: 'nope', name: 'x' })).rejects.toThrow('The specified behavior is not found');
  });

  it('adds a response, defaulting to daytime', async () => {
    team();
    const dal = stub(v2.StudentDal, { getStudent: { behaviors: [], responses: [] }, saveStudent: undefined });
    const result: any = await put({ name: 'Calm' });
    expect(result).toMatchObject({ name: 'Calm', daytime: true, isArchived: false });
    expect(dal.saveStudent).toHaveBeenCalled();
  });

  it('updates in place', async () => {
    team();
    const existing = { id: 'r1', name: 'Calm', isArchived: true };
    stub(v2.StudentDal, { getStudent: { behaviors: [], responses: [existing] }, saveStudent: undefined });
    await expect(put({ id: 'r1', daytime: false })).resolves.toMatchObject({ id: 'r1', name: 'Calm', isArchived: true, daytime: false });
  });

  // KNOWN BUG: the duplicate check walks student.behaviors, not responses. Goes red when fixed.
  it.fails('rejects a duplicate response name', async () => {
    team();
    stub(v2.StudentDal, { getStudent: { behaviors: [], responses: [{ id: 'r1', name: 'Calm' }] }, saveStudent: undefined });
    await expect(put({ name: 'calm' })).rejects.toThrow('already present');
  });
});

const appConfig = {
  deviceId: 'd1', name: 'Phone', license: 'lic-1', textAlerts: true, timezone: 'UTC',
  studentConfigs: [{
    studentId: 's1', studentName: 'Sam', groups: ['g'],
    behaviors: [{ id: 'b', order: 2, abc: true }], responses: [{ id: 'r', order: 1 }], services: []
  }]
};

describe('student/devices/app', () => {
  it('delete denies a member who is neither device nor license admin', async () => {
    team({ devices: AccessLevel.read });
    await expect(appDelete.handler({ studentId: 's1', dsn: 'd1' } as any, noLicenseUser)).rejects.toThrow('Access Denied');
  });

  it('delete lets a license admin through and removes the student', async () => {
    team({ devices: AccessLevel.read });
    query.mockResolvedValue(appConfig);
    await appDelete.handler({ studentId: 's1', dsn: 'd1', isApp: 'true' } as any, webUser);
    expect(query.mock.calls[1][1].appConfig).toMatchObject({
      deviceId: 'd1', license: 'lic-1', studentConfigs: [expect.objectContaining({ studentId: 's1', delete: true })]
    });
  });

  it('delete does nothing when the student is not on the app', async () => {
    team();
    query.mockResolvedValue({ ...appConfig, studentConfigs: [] });
    await appDelete.handler({ studentId: 's1', dsn: 'd1' } as any, webUser);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('appToIoT merges events by order and flags unregistered apps', () => {
    const device = appGet.appToIoT(appConfig as any, 's1');
    expect(device.events.map(x => x.eventId)).toEqual(['r', 'b']);
    expect(device).toMatchObject({ dsn: 'd1', studentName: 'Sam', isApp: true, validated: true, multiStudent: true });
    expect(appGet.appToIoT({ ...appConfig, deviceId: 'MLC-1' } as any, 's1').validated).toBe(false);
  });

  it('get denies a member with no device access', async () => {
    team({ devices: AccessLevel.none });
    await expect(appGet.handler({ studentId: 's1', appId: 'a', deviceId: 'd' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('get resolves the device id from the app config', async () => {
    team();
    stub(v2.AppDal, { getAppConfig: { deviceId: 'd1', license: 'lic-1' } });
    query.mockResolvedValue(appConfig);
    await appGet.handler({ studentId: 's1', appId: 'a' }, webUser);
    expect(query.mock.calls[0][1]).toEqual({ deviceId: 'd1' });
  });

  it('get uses the device id supplied and the student license', async () => {
    team();
    const dal = stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    query.mockResolvedValue(appConfig);
    await expect(appGet.handler({ studentId: 's1', appId: 'a', deviceId: 'd1' }, webUser)).resolves.toMatchObject({ deviceId: 'd1' });
    expect(dal.getStudentConfig).toHaveBeenCalled();
  });

  const putRequest = () => ({
    studentId: 's1', dsn: 'd1', deviceName: 'Phone', studentName: 'Sam',
    events: [{ eventId: 'b', track: true, order: 1 }, { eventId: 'r', track: true, order: 2 }, { eventId: 'x', track: false }]
  }) as any;

  it('put denies without device or license admin', async () => {
    stub(v2.StudentDal, { getStudent: { license: 'other', restrictions: restrictions({ devices: AccessLevel.read }) } });
    stub(v2.AppDal, { getAppConfig: undefined });
    await expect(appPut.handler(putRequest(), webUser)).rejects.toThrow('Access Denied');
  });

  it('put splits tracked events into behaviors and responses', async () => {
    stub(v2.StudentDal, { getStudent: { license: 'lic-1', behaviors: [{ id: 'b' }], responses: [{ id: 'r' }] } });
    stub(v2.AppDal, { getAppConfig: { deviceId: 'real' } });
    query.mockResolvedValueOnce({ deviceId: 'real' }).mockResolvedValueOnce({ ...appConfig, deviceId: 'real' });
    const device = await appPut.handler(putRequest(), webUser);
    const student = query.mock.calls[0][1].appConfig.studentConfigs[0];
    expect(query.mock.calls[0][1].appConfig.deviceId).toBe('real');
    expect(student.behaviors.map((x: any) => x.id)).toEqual(['b']);
    expect(student.responses.map((x: any) => x.id)).toEqual(['r']);
    expect(query.mock.calls[1][1]).toEqual({ deviceId: 'real' });
    expect(device.deviceId).toBe('real');
  });

  it('put falls back to the dsn and first license for an unlicensed student', async () => {
    stub(v2.StudentDal, { getStudent: { restrictions: restrictions(), behaviors: [], responses: [] } });
    stub(v2.AppDal, { getAppConfig: undefined });
    query.mockResolvedValueOnce(undefined).mockResolvedValueOnce(appConfig);
    await appPut.handler(putRequest(), webUser);
    expect(query.mock.calls[0][1].appConfig).toMatchObject({ deviceId: 'd1', license: 'lic-1' });
  });
});

describe('student/devices/app tokens', () => {
  const request = { studentId: 's1', appId: 'a1' };

  it('requires both query values', async () => {
    expect((await callApi(qrCodeGet.handleEvent, { query: { studentId: 's1' } })).status).toBe('400');
    expect((await callApi(tokenGet.handleEvent, { query: { appId: 'a' } })).status).toBe('400');
  });

  it('issues a two-day token to a device admin', async () => {
    team();
    query.mockResolvedValue({ token: 'tok' });
    await expect(tokenGet.handler(request, webUser)).resolves.toEqual({ appId: 'a1', token: 'tok' });
    const variables = query.mock.calls[0][1];
    expect(variables).toMatchObject({ license: 'lic-1', deviceId: 'a1' });
    expect(variables.expiration).toBeGreaterThan(Date.now() + 47 * 3600 * 1000);
  });

  it('falls back to license admin when the member is not a device admin', async () => {
    team({ devices: AccessLevel.read });
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    query.mockResolvedValue({ token: 'tok' });
    await expect(qrCodeGet.handler(request, webUser)).resolves.toMatchObject({ token: 'tok' });
  });

  it('denies a stranger', async () => {
    noTeam();
    stub(v2.StudentDal, { getStudentConfig: { license: 'other' } });
    await expect(qrCodeGet.handler(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('does not hide unrelated errors', async () => {
    noTeam('db down');
    await expect(qrCodeGet.handler(request, webUser)).rejects.toThrow('db down');
  });

  it('round-trips a token', () => {
    const token = tokenUtils.generateToken('id-1', 'auth-1', 'secret');
    expect(tokenUtils.getTokenSegments(token, 'secret')).toEqual({ id: 'id-1', auth: 'auth-1' });
  });

  it('rejects a token encrypted without the prefix', async () => {
    const { AES } = await import('crypto-ts');
    expect(() => tokenUtils.getTokenSegments(AES.encrypt('nope', 'secret').toString(), 'secret')).toThrow('Invalid Token');
  });

  it('loads the key from SSM once, or env in local mode', async () => {
    vi.resetModules();
    const fresh = await import('./devices/app/token-utils');
    aws.ssmSend.mockResolvedValue({ Parameter: { Value: 'ssm-key' } });
    process.env.TokenEncryptKey = '/key';
    await expect(fresh.getTokenKey()).resolves.toBe('ssm-key');
    await fresh.getTokenKey();
    expect(aws.ssmSend).toHaveBeenCalledTimes(1);

    vi.resetModules();
    const local = await import('./devices/app/token-utils');
    process.env.USE_LOCAL = 'true';
    process.env.TOKEN_ENCRYPT_KEY = 'env-key';
    await expect(local.getTokenKey()).resolves.toBe('env-key');
  });

  it('fails when no key is configured', async () => {
    vi.resetModules();
    const fresh = await import('./devices/app/token-utils');
    aws.ssmSend.mockResolvedValue({ Parameter: {} });
    await expect(fresh.getTokenKey()).rejects.toThrow('No encryption key found');
  });
});

describe('student/devices/general/get', () => {
  it('denies a member with no device access', async () => {
    team({ devices: AccessLevel.none });
    await expect(generalGet.studentGet({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('returns nothing for an unlicensed student', async () => {
    stub(v2.TeamDal, { getTeamMember: { ...member(), license: undefined } });
    await expect(generalGet.studentGet({ studentId: 's1' }, webUser)).resolves.toEqual([]);
  });

  it('combines apps and Track 2.0 devices', async () => {
    team();
    query.mockResolvedValue([
      { deviceId: 'MLC-1', studentName: 'Sam', behaviors: [{ id: 'b', abc: true, order: 1 }] },
      { deviceId: 'real', name: 'Named' }
    ]);
    stub(v2.DeviceDal, { getStudentDevices: [{ dsn: 't1', license: 'lic-1', events: [], validated: true }] });
    const result: any[] = await generalGet.studentGet({ studentId: 's1' }, webUser);
    expect(result[0]).toMatchObject({ deviceName: 'Mytaptrack App', validated: false, isApp: true, events: [{ eventId: 'b', abc: true, track: true, order: 1 }] });
    expect(result[0].events[0]).not.toHaveProperty('presses');
    expect(result[1]).toMatchObject({ deviceName: 'Named', validated: true, events: [] });
    expect(result[2]).toMatchObject({ dsn: 't1', deviceName: 'Track 2.0', isApp: false });
  });
});

describe('student/devices/track', () => {
  const remove = { studentId: 's1', dsn: 'd1' } as any;

  it('delete denies a read-only member with no license', async () => {
    team({ devices: AccessLevel.read });
    stub(v2.DeviceDal, { getConfig: { license: 'lic-1' } });
    await expect(trackDelete.handler(remove, noLicenseUser)).rejects.toThrow('Access Denied');
  });

  it('delete removes an active device only', async () => {
    team();
    const dal = stub(v2.DeviceDal, { getConfig: { license: 'lic-1' }, deleteConfig: undefined });
    await trackDelete.handler(remove, webUser);
    expect(dal.deleteConfig).toHaveBeenCalledWith('d1', 's1');
    dal.deleteConfig.mockClear();
    stub(v2.DeviceDal, { getConfig: { deleted: true } });
    await trackDelete.handler(remove, webUser);
    expect(dal.deleteConfig).not.toHaveBeenCalled();
  });

  it('get denies a member with no device access and reports a missing device', async () => {
    team({ devices: AccessLevel.none });
    await expect(trackGet.handler(remove, webUser)).rejects.toThrow('Access Denied');
    team();
    stub(v2.DeviceDal, { get: undefined });
    await expect(trackGet.handler(remove, webUser)).rejects.toThrow('Device not found');
  });

  it('get returns an unassigned device', async () => {
    team();
    stub(v2.DeviceDal, { get: { dsn: 'd1' } });
    await expect(trackGet.handler(remove, webUser)).resolves.toEqual({ dsn: 'd1' });
  });

  it('get validates a multi-student device on the same license', async () => {
    team();
    stub(v2.DeviceDal, { get: { studentId: 'other', multiStudent: true, license: 'lic-1', commands: [] } });
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    await expect(trackGet.handler(remove, webUser)).resolves.toMatchObject({ validated: true });
  });

  it('get denies a multi-student device from another license', async () => {
    team();
    stub(v2.DeviceDal, { get: { studentId: 'other', multiStudent: true, license: 'other', commands: [] } });
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    await expect(trackGet.handler(remove, webUser)).rejects.toThrow('Access Denied');
  });

  it('get denies a device assigned to someone else', async () => {
    team();
    stub(v2.DeviceDal, { get: { studentId: 'other', commands: [] } });
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    await expect(trackGet.handler(remove, webUser)).rejects.toThrow('Access Denied');
  });

  it('get allows a device with a pending command for this student', async () => {
    team();
    const device = { studentId: 'other', commands: [{ studentId: 's1' }] };
    stub(v2.DeviceDal, { get: device });
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    await expect(trackGet.handler(remove, webUser)).resolves.toBe(device);
  });

  const put = { studentId: 's1', dsn: 'd1', deviceName: 'New', timezone: 'UTC', events: [{ eventId: 'e' }] } as any;

  it('put requires device admin and a matching license', async () => {
    stub(v2.StudentDal, { getStudent: { restrictions: restrictions({ devices: AccessLevel.read }) } });
    await expect(trackPut.handler({ ...put }, webUser)).rejects.toThrow('Access Denied');
    stub(v2.StudentDal, { getStudent: { license: 'lic-1', restrictions: restrictions() } });
    stub(v2.DeviceDal, { get: { license: 'other' } });
    await expect(trackPut.handler({ ...put }, webUser)).rejects.toThrow('License mismatch');
  });

  it('put saves the configuration, generating a dsn if absent', async () => {
    stub(v2.StudentDal, { getStudent: { license: 'lic-1', restrictions: restrictions() } });
    const dal = stub(v2.DeviceDal, { get: { license: 'lic-1' }, update: undefined });
    const request = { ...put, dsn: undefined };
    await expect(trackPut.handler(request, webUser)).resolves.toMatchObject({ deviceName: 'New', events: put.events });
    expect(request.dsn).toBeTruthy();
    expect(dal.update).toHaveBeenCalledWith(expect.objectContaining({ dsn: request.dsn, isApp: false, multiStudent: true, studentId: 's1' }));
  });

  it('register requires a held license', async () => {
    await expect(registerPut.handler({ studentId: 's1', dsn: 'd' } as any, { ...webUser, licenses: undefined })).rejects.toThrow('Access Denied');
    await expect(registerPut.handler({ studentId: 's1', dsn: 'd', license: 'x' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('register claims a new device on the first license', async () => {
    const dal = stub(v2.DeviceDal, { get: undefined, register: undefined });
    await registerPut.handler({ studentId: 's1', dsn: 'd' } as any, webUser);
    expect(dal.register).toHaveBeenCalledWith('d', 'lic-1');
  });

  it('register moves an owned device to the student', async () => {
    const dal = stub(v2.DeviceDal, { get: { dsn: 'd', license: 'lic-1' }, setCurrentStudent: undefined });
    await registerPut.handler({ studentId: 's1' } as any, webUser);
    expect(dal.setCurrentStudent).toHaveBeenCalledWith('d', 's1');
  });

  it('resync requires the user license to match the device', async () => {
    stub(v2.UserDal, { getUserConfig: {} });
    await expect(resyncPost.handler({ dsn: 'd' } as any, webUser)).rejects.toThrow('Access Denied');
    stub(v2.UserDal, { getUserConfig: { license: 'lic-1' } });
    stub(v2.DeviceDal, { get: { license: 'other' } });
    await expect(resyncPost.handler({ dsn: 'd' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('resync clears the device identity', async () => {
    stub(v2.UserDal, { getUserConfig: { license: 'lic-1' } });
    const dal = stub(v2.DeviceDal, { get: { license: 'lic-1' }, putIdentity: undefined });
    await resyncPost.handler({ dsn: 'd' } as any, webUser);
    expect(dal.putIdentity).toHaveBeenCalledWith({ dsn: 'd', identity: null });
  });

  it('term status requires device access', async () => {
    team({ devices: AccessLevel.none });
    await expect(termGet.handler(remove, webUser)).rejects.toThrow('Access Denied');
    team();
    stub(v2.DeviceDal, { getTermStatus: { setup: true } });
    await expect(termGet.handler(remove, webUser)).resolves.toEqual({ setup: true });
  });

  it('term setup requires device admin and a known device', async () => {
    stub(v2.StudentDal, { getStudent: {} });
    await expect(termPut.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
    stub(v2.StudentDal, { getStudent: { restrictions: restrictions() } });
    stub(v2.DeviceDal, { getConfig: undefined });
    await expect(termPut.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('term setup returns the updated term', async () => {
    stub(v2.StudentDal, { getStudent: { restrictions: restrictions() } });
    const dal = stub(v2.DeviceDal, { getConfig: {}, setTermSetup: { done: true } });
    await expect(termPut.handler({ studentId: 's1', dsn: 'd' } as any, webUser)).resolves.toEqual({ done: true });
    expect(dal.setTermSetup).toHaveBeenCalledWith('d', 's1');
  });
});

describe('student/documents', () => {
  const doc = { id: 'doc', name: 'iep.pdf', timerange: { start: 1700000000000 } };

  it('delete requires document admin', async () => {
    team({ documents: AccessLevel.read });
    await expect(documentDelete.handler({ studentId: 's1', id: 'doc' } as any, webUser)).rejects.toThrow('permission');
  });

  it('delete ignores an unknown document', async () => {
    team();
    const dal = stub(v2.StudentDal, { getDocuments: undefined, saveDocuments: undefined });
    await documentDelete.handler({ studentId: 's1', id: 'doc' } as any, webUser);
    expect(dal.saveDocuments).not.toHaveBeenCalled();
  });

  it('delete removes the object and the record', async () => {
    team();
    const dal = stub(v2.StudentDal, { getDocuments: [doc, { id: 'other' }], saveDocuments: undefined });
    await documentDelete.handler({ studentId: 's1', id: 'doc' } as any, webUser);
    expect(aws.deleteObject).toHaveBeenCalled();
    expect(dal.saveDocuments).toHaveBeenCalledWith('s1', [{ id: 'other' }]);
  });

  // KNOWN BUG: put uploads to .../<name>/<start>/<name>, delete removes .../<name>/<start>, so
  // the file stays in S3 after the record goes. Goes red when fixed.
  it.fails('delete targets the key the upload used', async () => {
    team();
    stub(v2.StudentDal, { getDocuments: [doc], saveDocuments: undefined });
    await documentDelete.handler({ studentId: 's1', id: 'doc' } as any, webUser);
    expect(aws.deleteObject.mock.calls[0][0].Key).toBe(`student/s1/documents/iep.pdf/${doc.timerange.start}/iep.pdf`);
  });

  it('get lists documents, tolerating none', async () => {
    team();
    stub(v2.StudentDal, { getDocuments: undefined });
    await expect(documentGet.handler({ studentId: 's1' } as any, webUser)).resolves.toEqual([]);
    stub(v2.StudentDal, { getDocuments: [doc] });
    await expect(documentGet.handler({ studentId: 's1' } as any, webUser)).resolves.toEqual([doc]);
  });

  it('get returns a signed url for one document, or blank if unknown', async () => {
    team();
    stub(v2.StudentDal, { getDocuments: [doc] });
    aws.getSignedUrl.mockResolvedValue('https://signed');
    await expect(documentGet.handler({ studentId: 's1', documentId: 'doc' }, webUser)).resolves.toBe('https://signed');
    await expect(documentGet.handler({ studentId: 's1', documentId: 'nope' }, webUser)).resolves.toBe('');
  });

  // KNOWN BUG: read access is gated on restrictions.devices instead of documents. Goes red when fixed.
  it.fails('get is gated on document access', async () => {
    team({ documents: AccessLevel.none });
    await expect(documentGet.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  const upload = { studentId: 's1', name: 'iep.pdf', timerange: { start: '2026-03-01' }, size: 9 } as any;

  it('put requires document admin', async () => {
    team({ documents: AccessLevel.read });
    await expect(documentPut.handler(upload, webUser)).rejects.toThrow('permission');
  });

  it('put returns an upload url until the upload completes', async () => {
    team();
    aws.getSignedUrl.mockResolvedValue('https://upload');
    await expect(documentPut.handler(upload, webUser)).resolves.toBe('https://upload');
    expect(aws.getSignedUrl.mock.calls[0][1].input).toMatchObject({ Key: 'student/s1/documents/iep.pdf/2026-03-01/iep.pdf', Bucket: 'bucket' });
    expect(aws.getSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 3600 });
  });

  it('put records a completed upload', async () => {
    team();
    const dal = stub(v2.StudentDal, { getStudentConfig: {}, saveDocuments: undefined });
    const result: any = await documentPut.handler({ ...upload, complete: true }, webUser);
    expect(result).toMatchObject({ name: 'iep.pdf', size: 9, complete: true });
    expect(dal.saveDocuments).toHaveBeenCalledWith('s1', [result]);
  });

  it('put updates a repeated upload in place', async () => {
    team();
    const start = new Date('2026-03-01T00:00:00').getTime();
    const existing = { id: 'x', name: 'iep.pdf', timerange: { start }, size: 1, complete: false };
    const dal = stub(v2.StudentDal, { getStudentConfig: { documents: [existing] }, saveDocuments: undefined });
    await expect(documentPut.handler({ ...upload, complete: true }, webUser)).resolves.toMatchObject({ id: 'x', size: 9, complete: true });
    expect(vi.mocked(dal.saveDocuments).mock.calls[0][1]).toHaveLength(1);
  });
});

describe('student/info/get', () => {
  const student = (overrides = {}) => ({
    license: 'lic-1', licenseDetails: { features: {} }, restrictions: restrictions(), dashboard: {},
    behaviors: [{ id: 'a' }, { id: 'b', isArchived: true }], ...overrides
  });

  it("returns nothing for the literal student 'null'", async () => {
    await expect(infoGet.studentGet({ studentId: 'null' }, webUser)).resolves.toBeUndefined();
  });

  it('rethrows errors other than access denied', async () => {
    noTeam('db down');
    await expect(infoGet.studentGet({ studentId: 's1' }, webUser)).rejects.toThrow('db down');
  });

  it('denies a stranger', async () => {
    noTeam();
    stub(v2.StudentDal, { getStudentConfig: { license: 'other' } });
    await expect(infoGet.studentGet({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('gives a license admin behavior access', async () => {
    noTeam();
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' }, getStudent: student({ restrictions: undefined }) });
    const result = await infoGet.studentGet({ studentId: 's1' }, webUser);
    expect(result!.restrictions).toEqual({ behavior: AccessLevel.admin });
  });

  it('filters to the allowed behaviors', async () => {
    team();
    stub(v2.StudentDal, { getStudent: student({ restrictions: restrictions({ behaviors: ['a'] }) }) });
    const result = await infoGet.studentGet({ studentId: 's1' }, webUser);
    expect(result!.behaviors).toEqual([{ id: 'a' }]);
  });

  it('hides behaviors from a member with no behavior access', async () => {
    team();
    stub(v2.StudentDal, { getStudent: student({ restrictions: restrictions({ behavior: AccessLevel.none }) }) });
    expect((await infoGet.studentGet({ studentId: 's1' }, webUser))!.behaviors).toEqual([]);
  });

  it('builds a default dashboard from active behaviors', async () => {
    team();
    stub(v2.StudentDal, { getStudent: student({ dashboard: undefined }) });
    const { dashboard } = (await infoGet.studentGet({ studentId: 's1' }, webUser))!;
    expect(dashboard!.behaviors).toEqual([{ id: 'a', frequency: infoGet.colors[0][0], duration: { sum: infoGet.colors[0][1] } }]);
    expect(dashboard!.autoExcludeDays).toEqual([0, 6]);
  });

  it('backfills license features', async () => {
    team();
    stub(v2.StudentDal, { getStudent: student({ licenseDetails: {} }) });
    stub(LicenseDal, { get: { features: { x: 1 } } });
    expect((await infoGet.studentGet({ studentId: 's1' }, webUser))!.licenseDetails.features).toEqual({ x: 1 });
  });
});

describe('student/info/put', () => {
  const update = { studentId: 's1', firstName: 'F', lastName: 'L', subtext: 'N', tags: ['t'], archived: true, milestones: [{ m: 1 }] } as any;
  const stored = (overrides = {}) => ({
    studentId: 's1', license: 'lic-1', licenseDetails: { features: {} }, details: {}, tags: ['t'], milestones: [], restrictions: restrictions(), ...overrides
  });

  it('ignores an update from someone without access', async () => {
    const dal = stub(v2.StudentDal, { getStudent: stored({ license: 'other', restrictions: restrictions({}, AccessLevel.read) }), saveStudent: undefined });
    await expect(infoPut.createStudent({ ...update }, webUser)).resolves.toBeUndefined();
    expect(dal.saveStudent).not.toHaveBeenCalled();
  });

  it('updates details and milestones and reapplies templates', async () => {
    const dal = stub(v2.StudentDal, { getStudent: stored(), saveStudent: undefined });
    stub(v2.LicenseDal, { get: { studentTemplates: ['tpl'] } });
    const result = await infoPut.createStudent({ ...update }, webUser);
    expect(result).toMatchObject({ details: { firstName: 'F', lastName: 'L', nickname: 'N' }, archived: true, milestones: [{ m: 1 }] });
    expect(aws.processStudentTemplates).toHaveBeenCalledWith(result, 'lic-1', { student: ['tpl'] });
    expect(dal.saveStudent).toHaveBeenCalled();
  });

  it('a schedules admin cannot change details', async () => {
    stub(v2.StudentDal, {
      getStudent: stored({ license: undefined, licenseDetails: {}, restrictions: restrictions({ data: AccessLevel.read, milestones: AccessLevel.read }) }),
      saveStudent: undefined
    });
    const result = await infoPut.createStudent({ ...update }, webUser);
    expect(result!.details).toEqual({});
    expect(result!.milestones).toEqual([]);
  });

  it('reevaluates abc collections when tags change', async () => {
    const dal = stub(v2.StudentDal, { getStudent: stored({ tags: ['old'] }), saveStudent: undefined, evaluateAbcCollections: undefined });
    stub(v2.LicenseDal, { get: {} });
    await infoPut.createStudent({ ...update }, webUser);
    expect(dal.evaluateAbcCollections).toHaveBeenCalled();
  });

  it('creates a student and adds the creator as a verified admin', async () => {
    const dal = stub(v2.StudentDal, { saveStudent: undefined });
    const teamDal = stub(v2.TeamDal, { putTeamMember: undefined });
    stub(LicenseDal, { get: { expiration: 'x', features: { f: 1 } } });
    const result = await infoPut.createStudent({ firstName: 'F', lastName: 'L', tags: [] } as any, webUser);
    expect(result).toMatchObject({ license: 'lic-1', details: { nickname: 'F L' }, licenseDetails: { features: { f: 1 } }, version: 2 });
    expect(dal.saveStudent).toHaveBeenCalledWith(result);
    expect(teamDal.putTeamMember).toHaveBeenCalledWith(expect.objectContaining({ studentId: result!.studentId, userId: 'user-1', status: 'Verified' }));
    expect(aws.processStudentTemplates).toHaveBeenCalledWith(result, 'lic-1', { student: [] });
  });
});

describe('student/notification', () => {
  it('delete queues the request, grouped by student', async () => {
    const message = { details: { type: 'all', studentId: 's1' } } as any;
    await notificationDelete.handler(message, webUser);
    const call = aws.sendMessage.mock.calls[0][0];
    expect(call).toMatchObject({ QueueUrl: 'queue', MessageGroupId: 's1' });
    expect(JSON.parse(call.MessageBody)).toEqual({ messageGroup: 's1', message, userDetails: webUser });
  });

  it('processes a queued behavior removal', async () => {
    const dal = stub(v2.UserDal, { deleteStudentBehaviorNotification: undefined });
    const message = { details: { type: 'behavior', studentId: 's1' } };
    await deleteProcessing.handler({ Records: [{ body: JSON.stringify({ message, userDetails: webUser }) }] } as any);
    expect(dal.deleteStudentBehaviorNotification).toHaveBeenCalledWith('user-1', 's1', message);
  });

  it('removing all clears each notification and zeroes the count', async () => {
    const dal = stub(v2.UserDal, {
      getStudentBehaviorNotifications: [{ date: 1 }, { date: 2 }],
      deleteStudentBehaviorNotification: undefined,
      getUserStudentStats: [{ studentId: 'x' }, { studentId: 's1', count: 4 }],
      updateUserEvent: undefined
    });
    await deleteProcessing.processRecord({ details: { type: 'all', studentId: 's1' } } as any, webUser);
    expect(dal.deleteStudentBehaviorNotification).toHaveBeenCalledTimes(2);
    expect(dal.updateUserEvent).toHaveBeenCalledWith('user-1', { studentId: 's1', count: 0 }, 1);
  });

  it('removing all skips the count when there is no stat', async () => {
    const dal = stub(v2.UserDal, { getStudentBehaviorNotifications: [], getUserStudentStats: [], updateUserEvent: undefined });
    await deleteProcessing.processRecord({ details: { type: 'all', studentId: 's1' } } as any, webUser);
    expect(dal.updateUserEvent).not.toHaveBeenCalled();
  });

  it('clears the pending flag', async () => {
    const dal = stub(v2.UserDal, { setStudentActiveNoResponse: undefined });
    await deleteProcessing.processRecord({ details: { type: 'pending', studentId: 's1' } } as any, webUser);
    expect(dal.setStudentActiveNoResponse).toHaveBeenCalledWith('user-1', 's1', false);
  });

  it('get returns nothing to a member with no data access', async () => {
    team({ data: AccessLevel.none });
    await expect(notificationGet.handler({ studentId: 's1' }, webUser)).resolves.toEqual([]);
  });

  it('get returns only behavior notifications, trimmed', async () => {
    team();
    stub(v2.UserDal, { getStudentBehaviorNotifications: [
      { date: 1, details: { type: 'behavior', behaviorId: 'b', studentId: 's1', extra: true } },
      { date: 2, details: { type: 'other' } }
    ] });
    await expect(notificationGet.handler({ studentId: 's1' }, webUser)).resolves.toEqual([
      { date: 1, details: { behaviorId: 'b', studentId: 's1', type: 'behavior' } }
    ]);
  });
});

describe('student/schedule', () => {
  it('delete requires device admin', async () => {
    team({ devices: AccessLevel.read });
    await expect(scheduleDelete.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('delete passes category and date through', async () => {
    team();
    const dal = stub(v2.ScheduleDal, { deleteSchedule: undefined });
    await scheduleDelete.handler({ studentId: 's1', category: 'c', date: 'd' } as any, webUser);
    expect(dal.deleteSchedule).toHaveBeenCalledWith('s1', 'c', 'd');
  });

  it('get lets a license admin read', async () => {
    noTeam();
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    stub(v2.ScheduleDal, { getSchedules: ['s'] });
    await expect(scheduleGet.handler({ studentId: 's1' }, webUser)).resolves.toEqual(['s']);
  });

  it('get denies strangers and members with no schedule access', async () => {
    noTeam();
    stub(v2.StudentDal, { getStudentConfig: { license: 'other' } });
    await expect(scheduleGet.handler({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
    team({ schedules: AccessLevel.none });
    await expect(scheduleGet.handler({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('put requires device admin', async () => {
    team({ devices: AccessLevel.read });
    await expect(schedulePut.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('put saves against the student license', async () => {
    team();
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    const dal = stub(v2.ScheduleDal, { saveSchedule: undefined });
    await expect(schedulePut.handler({ studentId: 's1', schedule: { a: 1 } } as any, webUser)).resolves.toEqual({ a: 1 });
    expect(dal.saveSchedule).toHaveBeenCalledWith('s1', 'lic-1', { a: 1 });
  });
});

describe('student/subscriptions', () => {
  it('get requires notification access', async () => {
    team({ notifications: AccessLevel.none });
    await expect(subscriptionsGet.handler({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
    team();
    stub(v2.NotificationDal, { get: { notifications: [] } });
    await expect(subscriptionsGet.handler({ studentId: 's1' }, webUser)).resolves.toEqual({ notifications: [] });
  });

  it('put requires notification admin', async () => {
    team({ notifications: AccessLevel.read });
    await expect(subscriptionsPut.handler({ studentId: 's1' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('put sets the license and dedupes every list', async () => {
    team();
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    const dal = stub(v2.NotificationDal, { put: undefined });
    const list = () => ['a', 'b', 'a'];
    await subscriptionsPut.handler({ studentId: 's1', notifications: [{
      behaviorIds: list(), responseIds: list(), userIds: list(), deviceIds: list(), emails: list(), mobiles: list()
    }] } as any, webUser);
    const saved = vi.mocked(dal.put).mock.calls[0][0];
    expect(saved.license).toBe('lic-1');
    for (const key of ['behaviorIds', 'responseIds', 'userIds', 'deviceIds', 'emails', 'mobiles']) {
      expect(saved.notifications[0][key]).toEqual(['b', 'a']);
    }
  });
});

describe('student/team/delete', () => {
  const request = { studentId: 's1', userId: 'u2' } as any;

  it('denies a read-only member outside the license', async () => {
    stub(v2.TeamDal, { getTeamMember: { license: 'other', restrictions: restrictions({ devices: AccessLevel.read }) } });
    await expect(teamDelete.handler(request, webUser)).rejects.toThrow('Access Denied');
  });

  it('removes the member and both invite keys, tolerating missing invites', async () => {
    const teamDal = stub(v2.TeamDal, { getTeamMember: member(), removeUserFromTeam: undefined });
    const users = stub(v2.UserDal, {
      getUserPii: { details: { email: 'u2@x' } },
      deleteUserTeamInvite: () => Promise.reject(new Error('missing'))
    });
    await teamDelete.handler(request, webUser);
    expect(teamDal.removeUserFromTeam).toHaveBeenCalledWith('u2', 's1');
    expect(users.deleteUserTeamInvite.mock.calls).toEqual([['u2', 's1'], ['u2@x', 's1']]);
  });
});

describe('student/team/get', () => {
  it('requires access and returns the team', async () => {
    team({ devices: AccessLevel.none });
    await expect(teamGet.handler({ studentId: 's1' }, webUser)).rejects.toThrow('Access Denied');
    team();
    stub(v2.TeamDal, { getTeam: [{ userId: 'u' }] });
    await expect(teamGet.handler({ studentId: 's1' }, webUser)).resolves.toEqual([{ userId: 'u' }]);
  });
});

describe('student/team/post', () => {
  const accept = { studentId: 's1', accepted: true } as any;

  function setup(invite: unknown, existing: unknown) {
    const reject = (value: unknown) => value instanceof Error ? () => Promise.reject(value) : value;
    const users = stub(v2.UserDal, { getUserTeamInvite: reject(invite), deleteUserTeamInvite: () => Promise.reject(new Error('none')) });
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' } });
    const teamDal = stub(v2.TeamDal, { getTeamMember: reject(existing), putTeamMember: undefined, removeUserFromTeam: () => Promise.reject(new Error('none')) });
    return { users, teamDal };
  }

  it('accepting needs a student', async () => {
    await expect(teamPost.handler({ accepted: true } as any, webUser)).rejects.toThrow('Student ID is required');
  });

  it('accepts an email invite and cleans both invite keys', async () => {
    const { users, teamDal } = setup({ restrictions: { data: 'Admin' } }, new Error('none'));
    await teamPost.handler(accept, webUser);
    expect(teamDal.putTeamMember).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', status: 'Verified', restrictions: { data: 'Admin' }, license: 'lic-1'
    }));
    expect(users.deleteUserTeamInvite.mock.calls).toEqual([[webUser.email, 's1'], ['user-1', 's1']]);
  });

  it('accepts a pending team member when there is no email invite', async () => {
    const { teamDal } = setup(new Error('none'), { status: 'pending approval', restrictions: { data: 'Read' } });
    await teamPost.handler(accept, webUser);
    expect(teamDal.putTeamMember).toHaveBeenCalledWith(expect.objectContaining({ restrictions: { data: 'Read' } }));
  });

  it('refuses without any invite', async () => {
    const { teamDal } = setup(undefined, { status: 'Verified', restrictions: {} });
    await expect(teamPost.handler(accept, webUser)).rejects.toThrow('No valid invitation found');
    expect(teamDal.putTeamMember).not.toHaveBeenCalled();
  });

  it('rejecting clears everything, tolerating missing records', async () => {
    const { users, teamDal } = setup(undefined, undefined);
    await teamPost.handler({ studentId: 's1', accepted: false } as any, webUser);
    expect(teamDal.removeUserFromTeam).toHaveBeenCalledWith('user-1', 's1');
    expect(users.deleteUserTeamInvite).toHaveBeenCalledTimes(2);
  });

  it('all applies the answer to every invite', async () => {
    const { users, teamDal } = setup(undefined, undefined);
    stub(v2.UserDal, { getUserTeamInvites: [{ details: { studentId: 'a' } }, { details: { studentId: 'b' } }] });
    await teamPost.handler({ all: true, accepted: false } as any, webUser);
    expect(teamDal.removeUserFromTeam.mock.calls).toEqual([['user-1', 'a'], ['user-1', 'b']]);
    expect(users.deleteUserTeamInvite).toHaveBeenCalledTimes(4);
  });
});

describe('student/team/put', () => {
  const request = (overrides = {}) => ({ studentId: 's1', restrictions: restrictions(), details: { email: ' "New@X.com" ' }, ...overrides }) as any;
  const student = (overrides = {}) => ({ license: 'lic-1', details: { firstName: 'Sam' }, restrictions: restrictions(), ...overrides });
  const absent = () => Promise.reject(new Error('none'));

  it('denies a non-admin outside the license', async () => {
    stub(v2.StudentDal, { getStudent: student({ license: 'other', restrictions: restrictions({ team: AccessLevel.read }) }) });
    await expect(teamPut.handler(request(), webUser)).rejects.toThrow('Access Denied');
  });

  it('invites an unknown email', async () => {
    stub(v2.StudentDal, { getStudent: student() });
    const users = stub(v2.UserDal, { getUserIdsByEmail: [], saveUserInvite: undefined });
    const result = await teamPut.handler(request(), webUser);
    expect(users.saveUserInvite).toHaveBeenCalledWith('new@x.com', 's1', expect.objectContaining({ requester: 'user-1' }));
    expect(result).toMatchObject({ userId: 'new@x.com', status: UserSummaryStatus.PendingVerification, details: { email: 'new@x.com' } });
  });

  it('adds a known user as pending approval', async () => {
    stub(v2.StudentDal, { getStudent: student() });
    stub(v2.UserDal, { getUserIdsByEmail: ['u2'], getUserPii: { details: { name: 'N', email: 'n@x' } } });
    const teamDal = stub(v2.TeamDal, { getTeamMember: absent, putTeamMember: undefined });
    const result = await teamPut.handler(request(), webUser);
    expect(result).toMatchObject({ userId: 'u2', license: 'lic-1', status: 'pending approval', details: { name: 'N', email: 'n@x' } });
    expect(teamDal.putTeamMember).toHaveBeenCalledWith(result);
  });

  it('updates an existing member, keeping their status', async () => {
    stub(v2.StudentDal, { getStudent: student() });
    const teamDal = stub(v2.TeamDal, { getTeamMember: { status: 'Verified' }, putTeamMember: { userId: 'u2' } });
    await expect(teamPut.handler(request({ userId: 'u2' }), webUser)).resolves.toEqual({ userId: 'u2' });
    expect(teamDal.putTeamMember).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', status: 'Verified', license: 'lic-1' }));
  });

  it('applies to each account sharing an email, skipping google federation', async () => {
    stub(v2.StudentDal, { getStudent: student() });
    stub(v2.UserDal, { getUserIdsByEmail: ['u1', 'accounts.google.com_1'], getUserPii: undefined });
    const teamDal = stub(v2.TeamDal, { getTeamMember: absent, putTeamMember: undefined });
    await teamPut.handler(request(), webUser);
    expect(teamDal.putTeamMember).toHaveBeenCalledTimes(1);
    expect(vi.mocked(teamDal.putTeamMember).mock.calls[0][0].userId).toBe('u1');
  });

  it('drops an empty behavior list for a non-license admin', async () => {
    stub(v2.StudentDal, { getStudent: student({ license: 'other' }) });
    stub(v2.UserDal, { getUserIdsByEmail: [], saveUserInvite: undefined });
    const body = request({ restrictions: restrictions({ behaviors: [] }) });
    await teamPut.handler(body, webUser);
    expect(body.restrictions).not.toHaveProperty('behaviors');
  });

  it('emails the invitee only when asked and configured', async () => {
    stub(v2.StudentDal, { getStudent: student() });
    stub(v2.UserDal, { getUserIdsByEmail: [], saveUserInvite: undefined });
    const mail = stub(MailClient, { sendTemplateEmail: undefined });
    await teamPut.handler(request({ sendEmail: true }), webUser);
    expect(mail.sendTemplateEmail).not.toHaveBeenCalled();
    process.env.SystemEmail = 'system@x';
    await teamPut.handler(request({ sendEmail: true }), webUser);
    expect(mail.sendTemplateEmail.mock.calls[0][1]).toBe("You've been invited to join Sam's team");
    expect(mail.sendTemplateEmail.mock.calls[0][5]).toEqual(['new@x.com']);
  });
});

it('the root and v2 DAL exports are the same singleton, so stubs reach both', () => {
  expect(RootTeamDal).toBe(v2.TeamDal);
});
