import { LambdaAppsyncQueryClient, v2 } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { callApi, noLicenseUser, quietConsole, stub, webUser } from '../../testing/unit-kit';

const templates = vi.hoisted(() => ({ processStudentTemplates: vi.fn() }));
vi.mock('@mytaptrack/lib/dist/v2/utils/templates', () => templates);

import * as abcPut from './abc/put';
import * as appsGet from './app/appsGet';
import * as appDelete from './app/delete';
import * as appPut from './app/put';
import * as displayTagsPut from './license/displayTagsPut';
import * as licenseGet from './license/get';
import * as statsGet from './license/statsGet';
import * as studentDelete from './license/studentDelete';
import * as studentPut from './license/studentPut';
import * as bulkPut from './license/studentsBulkPut';
import * as studentsGet from './license/studentsGet';
import * as usersGet from './license/usersGet';
import * as efficacyPost from './reports/efficacyPost';
import * as trackingOverTime from './reports/trackingOverTime';
import * as templateDelete from './templates/delete';
import * as templateGet from './templates/get';
import * as templatePut from './templates/put';

quietConsole();
let query: ReturnType<typeof vi.fn>;
beforeEach(() => {
  templates.processStudentTemplates.mockReset().mockResolvedValue(undefined);
  query = vi.spyOn(LambdaAppsyncQueryClient.prototype, 'query') as any;
});

const denied = [['no licenses', noLicenseUser], ['another license', { ...webUser, licenses: ['other'] }]] as const;

describe('manage/abc/put', () => {
  it('denies a user with no license', async () => {
    await expect(abcPut.handler([], noLicenseUser)).rejects.toThrow('Access Denied');
  });

  it('replaces the abc collections on the first license', async () => {
    const dal = stub(v2.LicenseDal, { get: { license: 'lic-1' }, save: undefined });
    const collections = [{ name: 'c' }] as any;
    await abcPut.handler(collections, webUser);
    expect(dal.get).toHaveBeenCalledWith('lic-1');
    expect(dal.save).toHaveBeenCalledWith({ license: 'lic-1', abcCollections: collections });
  });
});

describe('manage/app/appsGet', () => {
  it('denies a user with no license', async () => {
    await expect(appsGet.handler(null, noLicenseUser)).rejects.toThrow('Access Denied');
  });

  it('maps apps to mobile devices, sorted by name', async () => {
    query.mockResolvedValue([
      { deviceId: 'b', name: 'Zed', timezone: 'UTC', tags: [{ tag: 't' }], studentConfigs: [{
        studentId: 's', studentName: 'Sam', behaviors: [{ id: 'x', abc: true, order: 2, name: 'Run' }]
      }] },
      { deviceId: 'a', name: 'Amy' }
    ]);
    const result = await appsGet.handler(null, webUser);
    expect(query.mock.calls[0][1]).toEqual({ license: 'lic-1' });
    expect(result.map(x => x.appId)).toEqual(['a', 'b']);
    expect(result[0]).toMatchObject({ assignments: [], tags: [] });
    expect(result[1]).toMatchObject({
      device: { id: 'b', name: 'Zed' },
      tags: ['t'],
      assignments: [{
        id: 's', studentId: 's', timezone: 'UTC', name: 'Sam', groups: [],
        behaviors: [{ id: 'x', abc: true, order: 2, title: 'Run', track: true }]
      }]
    });
  });
});

describe('manage/app/delete', () => {
  const app = {
    deviceId: 'd1', name: 'App', studentConfigs: [{ studentId: 's1', studentName: 'Sam', groups: [], behaviors: [], responses: [], services: [] }]
  };

  it('fails without a license', async () => {
    await expect(appDelete.handler({} as any, noLicenseUser)).rejects.toThrow('No licenses found');
  });

  it('removes only the named student from the app', async () => {
    query.mockResolvedValue(app);
    stub(v2.StudentDal, { getStudentConfig: { license: 'lic-9' } });
    await appDelete.handler({ dsn: 'd1', studentId: 's1' } as any, webUser);
    expect(query.mock.calls[0][1]).toEqual({ deviceId: 'd1' });
    const { appConfig } = query.mock.calls[1][1];
    expect(appConfig.license).toBe('lic-9');
    expect(appConfig.studentConfigs).toEqual([expect.objectContaining({ studentId: 's1', delete: true })]);
  });

  it('does nothing when the student is not on the app', async () => {
    query.mockResolvedValue(app);
    await appDelete.handler({ dsn: 'd1', studentId: 'nobody' } as any, webUser);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('deletes the whole device when it has no students', async () => {
    query.mockResolvedValue({ ...app, studentConfigs: [] });
    await appDelete.handler({ dsn: 'd1' } as any, webUser);
    expect(query.mock.calls[1][1].appConfig).toMatchObject({ deviceId: 'd1', license: 'lic-1', deleted: true, studentConfigs: [] });
  });
});

describe('manage/app/put', () => {
  const existing = { deviceId: 'd1', name: 'Old', textAlerts: true, timezone: 'UTC' };

  it('fails without a license', async () => {
    await expect(appPut.handler({} as any, noLicenseUser)).rejects.toThrow('No licenses found');
  });

  it('renames in place, keeping alert and timezone settings', async () => {
    query.mockResolvedValue(existing);
    const result = await appPut.handler({ deviceId: 'd1', name: 'New', tags: ['a'] } as any, webUser);
    expect(query.mock.calls[1][1].appConfig).toEqual({
      deviceId: 'd1', license: 'lic-1', name: 'New', textAlerts: true, timezone: 'UTC',
      studentConfigs: [], tags: [{ tag: 'a', type: 'user' }]
    });
    expect(result).toEqual({ device: { id: 'd1' } });
  });

  it('reassign registers a new MLC app and deletes the old one', async () => {
    query.mockResolvedValue(existing);
    const result: any = await appPut.handler({ deviceId: 'd1', license: 'lic-1', reassign: true } as any, webUser);
    expect(result.deviceId).toMatch(/^MLC-/);
    expect(query.mock.calls[1][1].appConfig).toMatchObject({ deviceId: result.deviceId, license: 'lic-1' });
    expect(query.mock.calls[2][1].appConfig).toMatchObject({ deviceId: 'd1', deleted: true });
  });
});

describe('manage/license/displayTagsPut', () => {
  it.each(denied)('rejects %s', async (_, user) => {
    await expect(displayTagsPut.put({ license: 'lic-1', displayTags: [] } as any, user)).rejects.toThrow('License not found');
  });

  it('stores the tags', async () => {
    const dal = stub(v2.LicenseDal, { putTags: undefined });
    await displayTagsPut.put({ license: 'lic-1', displayTags: [{ tagName: 'x' }] } as any, webUser);
    expect(dal.putTags).toHaveBeenCalledWith('lic-1', [{ tagName: 'x' }]);
  });
});

describe('manage/license/get', () => {
  it('rejects a query without a license', async () => {
    const res = await callApi(licenseGet.handleEvent, { query: {} });
    expect(res.status).toBe('400');
    expect(res.body).toMatch(/license/);
  });

  it.each(denied)('rejects %s', async (_, user) => {
    await expect(licenseGet.handler({ license: 'lic-1' }, user)).rejects.toThrow('Access Denied');
  });

  it('defaults abcCollections to an empty list', async () => {
    stub(v2.LicenseDal, { get: { license: 'lic-1' } });
    await expect(licenseGet.handler({ license: 'lic-1' }, webUser)).resolves.toEqual({ license: 'lic-1', abcCollections: [] });
  });
});

describe('disabled timestream reports', () => {
  it.each([
    ['statsGet', () => statsGet.post({ license: 'a' }, webUser)],
    ['efficacyPost', () => efficacyPost.handler({} as any, webUser)],
    ['trackingOverTime', () => trackingOverTime.handler({} as any, webUser)]
  ])('%s reports the feature as unavailable', async (_, call) => {
    await expect(call()).rejects.toThrow('Timestream feature is not accessible');
  });
});

describe('manage/license/studentDelete', () => {
  it('rejects a student on another license', async () => {
    stub(v2.StudentDal, { getStudentConfig: { license: 'other' } });
    await expect(studentDelete.put({ studentId: 's1' }, webUser)).rejects.toThrow('License not found');
  });

  it('removes active team members and clears the license', async () => {
    const students = stub(v2.StudentDal, { getStudentConfig: { license: 'lic-1' }, updateLicense: undefined });
    const team = stub(v2.TeamDal, {
      getTeam: [{ userId: 'u1' }, { userId: 'u2', deleted: true }],
      removeUserFromTeam: undefined
    });
    await studentDelete.put({ studentId: 's1' }, webUser);
    expect(team.removeUserFromTeam.mock.calls).toEqual([['u1', 's1']]);
    expect(students.updateLicense).toHaveBeenCalledWith('s1', null, null, true, undefined);
  });
});

describe('manage/license/studentPut', () => {
  const request = { license: 'lic-1', studentId: 's1', archive: false, licenseDetails: { fullYear: true, flexible: false } } as any;
  const baseLicense = { expiration: '2030-01-01', features: { a: true } };

  beforeEach(() => {
    stub(v2.StudentDal, { updateLicense: undefined });
    stub(v2.AppDal, { getAppsForStudent: [] });
  });

  it.each(denied)('rejects %s', async (_, user) => {
    await expect(studentPut.put(request, user)).rejects.toThrow('License not found');
  });

  it('applies the license and returns the summary', async () => {
    stub(v2.LicenseDal, { get: baseLicense });
    const result = await studentPut.put(request, webUser);
    expect(v2.StudentDal.updateLicense).toHaveBeenCalledWith('s1', 'lic-1',
      { expiration: '2030-01-01', fullYear: true, flexible: false, features: { a: true } }, false, undefined);
    expect(result).toEqual({ license: 'lic-1', licenseDetails: { fullYear: true, flexible: false, expiration: '2030-01-01', features: { a: true } } });
  });

  it('moves apps from another license', async () => {
    stub(v2.LicenseDal, { get: baseLicense });
    stub(v2.AppDal, {
      getAppsForStudent: [{ id: 'a1', studentId: 's1', license: 'old', deviceId: 'd1' }, { id: 'a2', license: 'lic-1' }],
      getGlobalConfig: { deviceName: 'Phone' },
      updateLicense: undefined,
      updateAppGlobalPii: undefined
    });
    await studentPut.put(request, webUser);
    expect(v2.AppDal.updateLicense).toHaveBeenCalledTimes(1);
    expect(v2.AppDal.updateLicense).toHaveBeenCalledWith('s1', 'a1', 'lic-1');
    expect(v2.AppDal.updateAppGlobalPii).toHaveBeenCalledWith('d1', 'lic-1', 'Phone', []);
  });

  it('skips an app with no global config', async () => {
    stub(v2.LicenseDal, { get: baseLicense });
    stub(v2.AppDal, { getAppsForStudent: [{ id: 'a1', license: 'old', deviceId: 'd1' }], getGlobalConfig: undefined, updateLicense: undefined });
    await studentPut.put(request, webUser);
    expect(v2.AppDal.updateLicense).not.toHaveBeenCalled();
  });

  it('applies license templates and returns the full student', async () => {
    const studentTemplates = [{ name: 't' }];
    stub(v2.LicenseDal, { get: { ...baseLicense, studentTemplates } });
    stub(v2.StudentDal, { getStudent: { studentId: 's1' } });
    const result = await studentPut.put({ ...request, archive: true }, webUser);
    expect(result).toEqual({ studentId: 's1', archived: true });
    expect(templates.processStudentTemplates).toHaveBeenCalledWith(result, 'lic-1', { student: studentTemplates });
  });
});

describe('manage/license/studentsBulkPut', () => {
  const license = { singleCount: 5, features: {}, expiration: 'x' };
  const entry = { firstName: 'Ann', lastName: 'Lee', licenseType: 'Single', tags: [], invites: [] as string[] };
  const existing = (details: object) => ({
    studentId: 'old', details: { firstName: 'Ann', lastName: 'Lee' }, tags: ['t'], licenseDetails: details
  });

  function setup(students: any[], lic: any = license) {
    stub(v2.StudentDal, { getStudentsByLicense: students, updateLicense: undefined, saveStudent: undefined });
    stub(v2.LicenseDal, { get: lic });
    stub(v2.TeamDal, { putTeamMember: undefined, getTeam: [] });
    stub(v2.UserDal, { getUserByEmail: undefined, saveUserInvite: undefined });
  }

  it('rejects a license the user does not hold', async () => {
    await expect(bulkPut.handler({ license: 'x', students: [] } as any, webUser)).rejects.toThrow('You do not have access to this license');
  });

  it('ignores rows without a license type', async () => {
    setup([]);
    await bulkPut.handler({ license: 'lic-1', students: [{ ...entry, licenseType: '' }] } as any, webUser);
    expect(v2.StudentDal.saveStudent).not.toHaveBeenCalled();
  });

  it('creates a student, makes the caller a verified admin and applies the license', async () => {
    setup([]);
    await bulkPut.handler({ license: 'lic-1', students: [entry] } as any, webUser);
    const student = vi.mocked(v2.StudentDal.saveStudent).mock.calls[0][0];
    expect(student).toMatchObject({ license: 'lic-1', details: { firstName: 'Ann', lastName: 'Lee' }, licenseDetails: { fullYear: true, flexible: false } });
    expect(v2.TeamDal.putTeamMember).toHaveBeenCalledWith(expect.objectContaining({
      studentId: student.studentId, userId: 'user-1', status: 'Verified', restrictions: expect.objectContaining({ data: AccessLevel.admin })
    }));
    expect(v2.StudentDal.updateLicense).toHaveBeenCalledWith(student.studentId, 'lic-1', student.licenseDetails, false, []);
  });

  it('stops a new single license past the limit', async () => {
    setup([], { ...license, singleCount: 0 });
    await expect(bulkPut.handler({ license: 'lic-1', students: [entry] } as any, webUser)).rejects.toThrow('License limit reached');
    expect(v2.StudentDal.saveStudent).not.toHaveBeenCalled();
  });

  it('updates an existing student whose license type changed', async () => {
    setup([existing({ flexible: true, fullYear: false })]);
    await bulkPut.handler({ license: 'lic-1', students: [entry] } as any, webUser);
    expect(v2.StudentDal.saveStudent).not.toHaveBeenCalled();
    expect(v2.StudentDal.updateLicense).toHaveBeenCalledWith('old', 'lic-1', { flexible: false, fullYear: true }, false, ['t']);
  });

  it('leaves an existing student with the same license type alone', async () => {
    setup([existing({ flexible: false, fullYear: true })]);
    await bulkPut.handler({ license: 'lic-1', students: [entry] } as any, webUser);
    expect(v2.StudentDal.updateLicense).not.toHaveBeenCalled();
  });

  it('stops an upgrade past the limit', async () => {
    setup([existing({ flexible: true, fullYear: false })], { ...license, singleCount: 0 });
    await expect(bulkPut.handler({ license: 'lic-1', students: [entry] } as any, webUser)).rejects.toThrow('License limit reached');
  });

  it('skips invitees already on the team, adds known users and emails the rest', async () => {
    setup([existing({ flexible: false, fullYear: true })]);
    stub(v2.TeamDal, { getTeam: [{ details: { email: 'on@team' } }] });
    stub(v2.UserDal, { getUserByEmail: async (email: string) => email === 'known@x' ? { userId: 'u9' } : undefined });
    await bulkPut.handler({ license: 'lic-1', students: [{ ...entry, invites: ['on@team', 'known@x', 'new@x'] }] } as any, webUser);
    expect(v2.TeamDal.putTeamMember).toHaveBeenCalledTimes(1);
    expect(v2.TeamDal.putTeamMember).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u9', status: 'pending approval' }));
    expect(v2.UserDal.saveUserInvite).toHaveBeenCalledTimes(1);
    expect(v2.UserDal.saveUserInvite).toHaveBeenCalledWith('new@x', 'old', expect.objectContaining({ requester: 'user-1', status: 'pending approval' }));
  });
});

describe('manage/license/studentsGet', () => {
  it.each(denied)('rejects %s', async (_, user) => {
    await expect(studentsGet.handler({ license: 'lic-1' }, user)).rejects.toThrow('License not found');
  });

  it('drops students without details', async () => {
    stub(v2.StudentDal, { getStudentsByLicense: [{ details: { firstName: 'A' } }, {}, null] });
    await expect(studentsGet.handler({ license: 'lic-1' }, webUser)).resolves.toEqual({ students: [{ details: { firstName: 'A' } }] });
  });

  // KNOWN BUG: checks request.license, then always reads licenses[0], so a user with two
  // licenses gets the wrong students. Goes red when fixed.
  it.fails('returns the students of the license requested', async () => {
    const dal = stub(v2.StudentDal, { getStudentsByLicense: [] });
    await studentsGet.handler({ license: 'lic-2' }, { ...webUser, licenses: ['lic-1', 'lic-2'] });
    expect(dal.getStudentsByLicense).toHaveBeenCalledWith('lic-2');
  });
});

describe('manage/license/usersGet', () => {
  it.each(denied)('rejects %s', async (_, user) => {
    await expect(usersGet.handler({ license: 'lic-1' }, user)).rejects.toThrow('License not found');
  });

  it('combines users and admins', async () => {
    stub(v2.UserDal, { getUsersForLicense: [{ userId: 'a' }], getAdminsForLicense: [{ userId: 'b' }] });
    await expect(usersGet.handler({ license: 'lic-1' }, webUser)).resolves.toEqual({ users: [{ userId: 'a' }, { userId: 'b' }] });
  });
});

describe('manage/templates/delete', () => {
  const request = { license: 'lic-1', name: 'gone' } as any;

  it('denies another license', async () => {
    await expect(templateDelete.handler({ ...request, license: 'x' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('reports an unknown license', async () => {
    stub(v2.LicenseDal, { get: undefined });
    await expect(templateDelete.handler(request, webUser)).rejects.toThrow('License Not Found');
  });

  it('removes the named template', async () => {
    const dal = stub(v2.LicenseDal, { get: { studentTemplates: [{ name: 'gone' }, { name: 'kept' }] }, save: undefined });
    await templateDelete.handler(request, webUser);
    expect(dal.save).toHaveBeenCalledWith({ studentTemplates: [{ name: 'kept' }] });
  });

  it('tolerates a license with no templates', async () => {
    const dal = stub(v2.LicenseDal, { get: {}, save: undefined });
    await templateDelete.handler(request, webUser);
    expect(dal.save).toHaveBeenCalledWith({ studentTemplates: [] });
  });
});

describe('manage/templates/get', () => {
  it('returns nothing for a user with no license', async () => {
    await expect(templateGet.handler({}, noLicenseUser)).resolves.toEqual({ apps: [], student: [] });
  });

  it('returns the templates of the first license', async () => {
    stub(v2.LicenseDal, { get: { mobileTemplates: ['m'], studentTemplates: ['s'] } });
    await expect(templateGet.handler({}, webUser)).resolves.toEqual({ apps: ['m'], student: ['s'] });
  });
});

describe('manage/templates/put', () => {
  const request = { license: 'lic-1', name: 'New', desc: 'd', tags: [], behaviors: [], responses: [], appTemplates: [] } as any;

  it('denies another license', async () => {
    await expect(templatePut.handler({ ...request, license: 'x' }, webUser)).rejects.toThrow('Access Denied');
  });

  it('reports an unknown license', async () => {
    stub(v2.LicenseDal, { get: undefined });
    await expect(templatePut.handler(request, webUser)).rejects.toThrow('License Not Found');
  });

  it('adds a template and reapplies it to every student', async () => {
    const license: any = { license: 'lic-1' };
    stub(v2.LicenseDal, { get: license, save: undefined });
    stub(v2.StudentDal, { getStudentsByLicense: [{ studentId: 's1' }, { studentId: 's2' }] });
    await templatePut.handler(request, webUser);
    expect(license.studentTemplates).toEqual([expect.objectContaining({ name: 'New', desc: 'd' })]);
    expect(templates.processStudentTemplates).toHaveBeenCalledTimes(2);
    expect(templates.processStudentTemplates).toHaveBeenCalledWith({ studentId: 's1' }, 'lic-1', { student: license.studentTemplates });
  });

  it('renames an existing template rather than duplicating it', async () => {
    const license: any = { license: 'lic-1', studentTemplates: [{ name: 'Old', desc: 'x' }] };
    stub(v2.LicenseDal, { get: license, save: undefined });
    stub(v2.StudentDal, { getStudentsByLicense: [] });
    await templatePut.handler({ ...request, originalName: 'Old' }, webUser);
    expect(license.studentTemplates).toEqual([expect.objectContaining({ name: 'New', desc: 'd' })]);
  });
});
