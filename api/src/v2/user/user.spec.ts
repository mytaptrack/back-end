import { v2 } from '@mytaptrack/lib';
import { callApi, noLicenseUser, quietConsole, stub, webUser } from '../../testing/unit-kit';
import * as alertStats from './alertStatsGet';
import * as get from './userGet';
import * as put from './userPut';

quietConsole();

describe('user/alertStatsGet', () => {
  it('summarises invites and alert counts', async () => {
    const dal = stub(v2.UserDal, {
      getUserTeamInvites: [{ id: 'i' }],
      getUserStudentStats: [{ studentId: 's', count: 2, awaitingResponse: true, extra: 1 }]
    });
    const res = await callApi(alertStats.get);
    expect(dal.getUserTeamInvites).toHaveBeenCalledWith('user-1', 'teacher@example.com');
    expect(res.body).toEqual({ invites: [{ id: 'i' }], stats: [{ studentId: 's', alertCount: 2, awaitingResponse: true }] });
  });

  it('returns no stats when none exist', async () => {
    stub(v2.UserDal, { getUserTeamInvites: [], getUserStudentStats: undefined });
    await expect(alertStats.userGet('', webUser)).resolves.toEqual({ invites: [], stats: [] });
  });
});

describe('user/userGet', () => {
  it('returns an existing user untouched', async () => {
    const user = { userId: 'user-1', licenseDetails: {} };
    const dal = stub(v2.UserDal, { getUser: user, saveUserPii: undefined });
    await expect(get.userGet('', webUser)).resolves.toBe(user);
    expect(dal.saveUserPii).not.toHaveBeenCalled();
  });

  it('creates a first-time user with their license', async () => {
    const dal = stub(v2.UserDal, { getUser: undefined, saveUserPii: undefined, saveUserConfig: undefined });
    stub(v2.LicenseDal, { get: { license: 'lic-1' } });
    const user = await get.userGet('', webUser);
    expect(user).toMatchObject({ userId: 'user-1', license: 'lic-1', licenseDetails: { license: 'lic-1' }, version: 1 });
    expect(dal.saveUserPii).toHaveBeenCalledWith('user-1', 'lic-1', user.details);
    expect(dal.saveUserConfig).toHaveBeenCalledWith('user-1', { tags: [], license: 'lic-1', licenseDetails: { license: 'lic-1' } });
  });

  it('creates a first-time user with no license', async () => {
    stub(v2.UserDal, { getUser: undefined, saveUserPii: undefined, saveUserConfig: undefined });
    const license = stub(v2.LicenseDal, { get: undefined });
    const user = await get.userGet('', { ...noLicenseUser, licenses: undefined });
    expect(user.license).toBeUndefined();
    expect(license.get).not.toHaveBeenCalled();
  });

  it('backfills license details onto an existing user', async () => {
    const dal = stub(v2.UserDal, { getUser: { details: {} }, saveUserPii: undefined, saveUserConfig: undefined });
    stub(v2.LicenseDal, { get: { license: 'lic-1' } });
    const user = await get.userGet('', webUser);
    expect(user.licenseDetails).toEqual({ license: 'lic-1' });
    expect(dal.saveUserConfig).toHaveBeenCalled();
  });
});

describe('user/userPut', () => {
  const request = { name: 'N', firstName: 'F', lastName: 'L', state: 'WA', zip: '98000' } as any;

  it('updates details, always using the signed-in email', async () => {
    const existing = { details: { email: 'stale@x' } };
    const dal = stub(v2.UserDal, { getUser: existing, saveUserPii: undefined });
    const user = await put.userPut(request, webUser);
    expect(user.details).toEqual({ name: 'N', firstName: 'F', lastName: 'L', state: 'WA', zip: '98000', email: webUser.email });
    expect(dal.saveUserPii).toHaveBeenCalledWith('user-1', '', user.details);
  });

  it('creates a user that does not exist yet', async () => {
    stub(v2.UserDal, { getUser: undefined, saveUserPii: undefined });
    await expect(put.userPut(request, webUser)).resolves.toMatchObject({ userId: 'user-1', version: 4, reports: [] });
  });

  it('records accepted terms and creates the missing config', async () => {
    const dal = stub(v2.UserDal, { getUser: { details: {} }, getUserConfig: undefined, saveUserConfig: undefined, saveUserPii: undefined });
    const user = await put.userPut({ ...request, acceptTerms: true }, webUser);
    expect(user.terms).toBeTruthy();
    expect(dal.saveUserConfig).toHaveBeenCalledWith('user-1', expect.objectContaining({ terms: user.terms }));
  });

  it('does not rewrite a config that already exists', async () => {
    const dal = stub(v2.UserDal, { getUser: { details: {} }, getUserConfig: { tags: [] }, saveUserConfig: undefined, saveUserPii: undefined });
    await put.userPut({ ...request, acceptTerms: true }, webUser);
    expect(dal.saveUserConfig).not.toHaveBeenCalled();
  });

  // KNOWN BUG: apiWrapperEx strips the 'licenses/' prefix, so startsWith('license/') never
  // matches and license admins are saved with manage: false. Goes red when fixed.
  it.fails('grants manage to a license holder', async () => {
    const dal = stub(v2.UserDal, { getUser: { details: {} }, getUserConfig: undefined, saveUserConfig: undefined, saveUserPii: undefined });
    await put.userPut({ ...request, acceptTerms: true }, webUser);
    expect(vi.mocked(dal.saveUserConfig).mock.calls[0][1].majorFeatures[0].manage).toBe(true);
  });
});
