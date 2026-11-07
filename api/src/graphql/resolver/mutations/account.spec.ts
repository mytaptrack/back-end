import { getLicenseKey, getUserPrimaryKey, LicenseDal, StudentDal, UserDal } from '@mytaptrack/lib';
import { appSyncContext, quietConsole, stub, stubTables, transactItems } from '../../../testing/unit-kit';

vi.hoisted(() => { process.env.PrimaryTable = 'primary-table'; process.env.DataTable = 'data-table'; });
const cognito = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-cognito-identity-provider', async original => ({
  ...(await original<any>()), CognitoIdentityProviderClient: class { send = cognito; }
}));

import * as changeLicense from './license/change-license';
import * as freeLicense from './license/free-license';
import * as manageAbc from './manage/update-manage-abc';
import * as acceptTerms from './user/accept-terms';
import * as dashboard from './user/dashboard';
import * as deleteAccount from './user/delete-account';
import * as info from './user/info';
import * as invite from './user/invite';

quietConsole();
let db: ReturnType<typeof stubTables>;
beforeEach(() => { db = stubTables(); cognito.mockReset(); });

describe('license/change-license', () => {
  const run = (input: object) => changeLicense.handleEvent(appSyncContext({ input: { license: 'lic-1', ...input } }));

  it('returns the license untouched with nothing to change', async () => {
    stub(LicenseDal, { get: { license: 'lic-1' } });
    await expect(run({})).resolves.toEqual({ userId: 'user-1', license: 'lic-1' });
    expect(db.data.update).not.toHaveBeenCalled();
  });

  it('updates collections and features together', async () => {
    stub(LicenseDal, { get: { license: 'lic-1', features: { a: 1 } } });
    const result = await run({ abcCollections: ['x'], features: { b: 2 } });
    expect(db.data.update.mock.calls[0][0]).toMatchObject({
      key: getLicenseKey('lic-1'),
      updateExpression: 'SET #details.#abcCollections = :abcCollections, #details.#features = :features',
      attributeValues: { ':abcCollections': ['x'], ':features': { b: 2 } }
    });
    expect(result).toMatchObject({ abcCollections: ['x'], features: { a: 1, b: 2 } });
  });
});

describe('license/free-license', () => {
  const user = { userId: 'user-1', details: { email: ' Me@X.com ', state: ' WA ' } };

  it('rejects an unknown user', async () => {
    stub(UserDal, { getUser: undefined });
    await expect(freeLicense.handleEvent(appSyncContext({}))).rejects.toMatchObject({ message: 'User not found', statusCode: 403 });
  });

  it('returns an existing license', async () => {
    stub(UserDal, { getUser: { ...user, license: 'lic-1' } });
    stub(LicenseDal, { get: { license: 'lic-1' } });
    await expect(freeLicense.handleEvent(appSyncContext({}))).resolves.toEqual({ userId: 'user-1', license: 'lic-1' });
    expect(cognito).not.toHaveBeenCalled();
  });

  it('creates a personal license, its group and membership', async () => {
    stub(UserDal, { getUser: user });
    const save = stub(LicenseDal, { save: undefined }).save;
    cognito.mockResolvedValueOnce({ Group: { GroupName: 'licenses/new' } }).mockResolvedValueOnce({});
    const result = await freeLicense.handleEvent(appSyncContext({}));
    expect(result).toMatchObject({ userId: 'user-1', admins: ['me@x.com'], customer: 'PER-WA-user-1', singleCount: 2 });
    expect(db.data.update.mock.calls[0][0]).toMatchObject({ key: getUserPrimaryKey('user-1'), attributeValues: { ':license': result.license } });
    expect(cognito.mock.calls[0][0].input.GroupName).toBe(`licenses/${result.license}`);
    expect(cognito.mock.calls[1][0].input).toMatchObject({ Username: 'user-1', GroupName: 'licenses/new' });
    expect(save).toHaveBeenCalled();
  });
});

describe('manage/update-manage-abc', () => {
  // KNOWN BUG: passes requestContext.identity where apiWrapperEx needs authorizer.claims, and
  // compares the string statusCode to the number 200, so this can never report success.
  // Goes red when fixed.
  it.fails('reports success', async () => {
    stub(LicenseDal, { get: {}, save: undefined });
    await expect(manageAbc.handler({
      arguments: { abcCollections: [] }, request: { headers: {} }, identity: { username: 'user-1' }
    } as any)).resolves.toBe(true);
  });
});

describe('user/accept-terms', () => {
  it('stamps the terms date', async () => {
    await expect(acceptTerms.handleEvent(appSyncContext({}))).resolves.toBe(true);
    const call = db.data.update.mock.calls[0][0];
    expect(call.key).toEqual(getUserPrimaryKey('user-1'));
    expect(new Date(call.attributeValues[':terms']).getTime()).toBeGreaterThan(0);
  });
});

describe('user/dashboard', () => {
  it('saves a dashboard for this user and student', async () => {
    const settings = { behaviors: [] } as any;
    await dashboard.handleEvent(appSyncContext({ studentId: 's1', dashboard: settings }));
    expect(db.data.put.mock.calls[0][0]).toMatchObject({
      pk: 'S#s1', sk: 'D#user-1#DA', userId: 'user-1', license: 'lic-1', lpk: 'lic-1#S', dashboard: settings
    });
  });

  it('removes the override when none is sent', async () => {
    await dashboard.handleEvent(appSyncContext({ studentId: 's1' }));
    expect(db.data.delete).toHaveBeenCalledWith({ pk: 'S#s1', sk: 'D#user-1#DA' });
  });

  // KNOWN BUG: put is not awaited, so a Lambda can freeze before it lands and a failure is an
  // unhandled rejection. Goes red when fixed.
  it.fails('reports a failed save', async () => {
    const failed = Promise.reject(new Error('db down'));
    failed.catch(() => undefined);
    db.data.put.mockReturnValue(failed);
    await expect(dashboard.handleEvent(appSyncContext({ studentId: 's1', dashboard: {} }))).rejects.toThrow('db down');
  });
});

describe('user/delete-account', () => {
  it('removes records from both tables, including notifications, then the user', async () => {
    const deleteUser = stub(UserDal, { deleteUser: undefined }).deleteUser;
    db.primary.query.mockResolvedValue([{ pk: 'a', sk: '1' }]);
    db.data.query.mockResolvedValueOnce([{ pk: 'b', sk: '2' }]).mockResolvedValueOnce([{ pk: 'c', sk: '3' }]);
    await expect(deleteAccount.handleEvent(appSyncContext({}))).resolves.toBe(true);
    expect(db.data.query.mock.calls[1][0].attributeValues).toEqual({ ':pk': 'USN#user-1' });
    expect(db.primary.delete.mock.calls).toEqual([[{ pk: 'a', sk: '1' }]]);
    expect(db.data.delete.mock.calls).toEqual([[{ pk: 'b', sk: '2' }], [{ pk: 'c', sk: '3' }]]);
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });

  it('flushes deletes in batches', async () => {
    stub(UserDal, { deleteUser: undefined });
    db.primary.query.mockResolvedValue(Array.from({ length: 45 }, (_, i) => ({ pk: 'p', sk: String(i) })));
    await deleteAccount.handleEvent(appSyncContext({}));
    expect(db.primary.delete).toHaveBeenCalledTimes(45);
  });
});

describe('user/info', () => {
  const user = (overrides: object = {}) => ({
    id: 'user-1', firstName: 'F', lastName: 'L', name: 'N', email: 'e@x', state: 'WA', zip: '1', students: [] as any[], ...overrides
  });
  const pii = (overrides: object = {}) => ({ pk: 'U#user-1', sk: 'P', userId: 'user-1', details: { firstName: 'Old' }, ...overrides });
  const run = (u: object, options = {}) => info.handleEvent(appSyncContext({ user: u }, options));

  it('updates details for the signed-in user', async () => {
    db.primary.get.mockResolvedValue(pii());
    db.data.get.mockResolvedValue({ terms: 'T' });
    await expect(run(user())).resolves.toMatchObject({ id: 'user-1', terms: 'T', firstName: 'F' });
    const [item] = transactItems(db.data.send);
    expect(item.Update.ExpressionAttributeValues[':details']).toEqual({ firstName: 'F', lastName: 'L', name: 'N', email: 'e@x', state: 'WA', zip: '1' });
  });

  it('writes nothing when nothing changed', async () => {
    db.primary.get.mockResolvedValue(pii({ details: { firstName: 'F', lastName: 'L', name: 'N', state: 'WA', zip: '1' } }));
    db.data.get.mockResolvedValue({});
    await run(user());
    expect(db.data.send).not.toHaveBeenCalled();
  });

  it("will not edit another person's details", async () => {
    db.primary.get.mockResolvedValue(pii({ userId: 'other' }));
    db.data.get.mockResolvedValue({});
    await run(user({ id: 'other', students: [] }));
    expect(db.data.send).not.toHaveBeenCalled();
  });

  it('creates the signed-in user when unknown', async () => {
    stub(UserDal, { getUserIdsByEmail: [] });
    const result = await run(user());
    expect(result).toMatchObject({ id: 'user-1' });
    const [primaryPut, dataPut] = transactItems(db.data.send);
    expect(primaryPut.Put).toMatchObject({ TableName: 'primary-table', Item: { userId: 'user-1', details: { state: 'N/A' } } });
    expect(dataPut.Put.TableName).toBe('data-table');
  });

  it('finds an account by email', async () => {
    stub(UserDal, { getUserIdsByEmail: ['found'] });
    db.primary.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce(pii({ userId: 'found' }));
    db.data.get.mockResolvedValue({});
    await expect(run(user({ id: 'nobody' }))).resolves.toMatchObject({ id: 'found' });
  });

  it('creates a placeholder keyed by email for a new invitee', async () => {
    stub(UserDal, { getUserIdsByEmail: [] });
    db.primary.get.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValue(pii({ userId: 'e@x', details: {} }));
    db.data.get.mockResolvedValue({});
    await expect(run(user({ id: 'someone-else' }))).resolves.toMatchObject({ id: 'e@x' });
    expect(transactItems(db.data.send)[0].Put.Item.userId).toBe('e@x');
  });

  describe('student access', () => {
    const student = (overrides: object = {}) => ({ studentId: 's1', restrictions: { data: 'Admin' }, behaviors: true, services: false, ...overrides });
    const setup = (team: unknown, inviter?: unknown, license = 'lic-1') => {
      db.primary.get.mockResolvedValue(pii({ details: { firstName: 'F', lastName: 'L', name: 'N', state: 'WA', zip: '1' } }));
      db.data.get.mockImplementation(async (key: any) => {
        if (key.pk === 'S#s1') { return { license }; }
        if (key.pk?.startsWith('U#user-1') && key.sk !== 'P' && license !== 'lic-1') { return inviter; }
        if (key.sk === 'P') { return {}; }
        return team;
      });
    };

    it('denies a student that does not exist', async () => {
      db.primary.get.mockResolvedValue(pii());
      db.data.get.mockResolvedValue(undefined);
      await expect(run(user({ students: [student()] }))).rejects.toThrow();
    });

    it('denies an inviter without team admin outside the license', async () => {
      setup(undefined, { restrictions: { team: 'Read' } }, 'other');
      await expect(run(user({ students: [student()] }))).rejects.toThrow('Access Denied');
    });

    it('adds a new member as pending approval', async () => {
      setup(undefined);
      stub(StudentDal, { getStudentConfig: { license: 'lic-1' } });
      await run(user({ students: [student()] }));
      const [item] = transactItems(db.data.send);
      expect(item.Put.Item).toMatchObject({ userId: 'user-1', studentId: 's1', status: 'pending approval', requester: 'user-1', lpk: 'lic-1#T' });
    });

    it('updates an existing member', async () => {
      setup({ restrictions: {} });
      await run(user({ students: [student()] }));
      const [item] = transactItems(db.data.send);
      expect(item.Update.ExpressionAttributeValues).toEqual({ ':restrictions': { data: 'Admin' }, ':behaviorTracking': true, ':serviceTracking': false });
    });

    it('marks a removed member deleted', async () => {
      setup({ restrictions: {} });
      await run(user({ students: [student({ deleted: true })] }));
      expect(transactItems(db.data.send)[0].Update.ExpressionAttributeValues[':deleted']).toBe(true);
    });

    it('does nothing when removing someone not on the team', async () => {
      setup(undefined);
      await run(user({ students: [student({ deleted: true })] }));
      expect(db.data.send).not.toHaveBeenCalled();
    });
  });
});

describe('user/invite', () => {
  const pii = { firstName: 'Sam', lastName: 'Lee', nickname: 'S', schoolStudentId: '7' };
  const access = { restrictions: { service: 'No Access', behavior: 'Admin' } };
  const run = () => invite.handleEvent(appSyncContext({ studentId: 's1', status: 'Verified' }));
  const setup = (userInvite: unknown, emailInvite: unknown) => {
    db.primary.get.mockImplementation(async (key: any) => key.pk.startsWith('U#') ? { details: { email: 'e@x' } } : pii);
    db.data.get.mockImplementation(async (key: any) => key.pk.includes('e@x') ? emailInvite : userInvite);
  };

  it('fails with no invite', async () => {
    setup(undefined, undefined);
    await expect(run()).rejects.toThrow('Student invite not found');
  });

  it.each([['user', { status: 'removal pending' }, undefined], ['email', undefined, { status: 'removal pending' }]])('refuses a %s invite being removed', async (_, a, b) => {
    const { UserSummaryStatus } = await import('@mytaptrack/types');
    const pending = (x: any) => x && { status: UserSummaryStatus.RemovalPending };
    setup(pending(a), pending(b));
    await expect(run()).rejects.toThrow('Student invite not found');
  });

  it('updates an invite held by user id', async () => {
    setup(access, undefined);
    await expect(run()).resolves.toMatchObject({ studentId: 's1', details: { firstName: 'Sam', schoolId: '7' }, tracking: { service: false, behavior: true } });
    expect(db.data.update.mock.calls[0][0].attributeValues).toEqual({ ':status': 'Verified' });
  });

  it('moves an email invite onto the user', async () => {
    setup(undefined, access);
    await run();
    expect(db.data.put.mock.calls[0][0]).toMatchObject({ userId: 'user-1', status: 'Verified' });
    expect(db.data.delete).toHaveBeenCalled();
  });
});
