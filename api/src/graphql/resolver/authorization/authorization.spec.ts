import { TeamDal, WebUtils } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { appSyncContext, member, quietConsole, stub } from '../../../testing/unit-kit';

vi.mock('@aws-appsync/utils', () => ({
  util: {
    dynamodb: { toMapValues: (x: unknown) => x },
    error: (message: string, type: string) => { throw Object.assign(new Error(message), { type }); },
    unauthorized: () => { throw new Error('Unauthorized'); }
  }
}));

import { request, response } from './check_access';
import * as userIdMatch from './user-id-match.js';
import * as passthrough from '../mutations/passthrough.js';

quietConsole();
const event = (overrides: object = {}) => ({
  arguments: { studentId: 's1' }, identity: { username: 'user-1' }, stash: { system: {} }, ...overrides
}) as any;

describe('check_access.request', () => {
  it('looks up the team record for the signed-in user', () => {
    const input = event();
    expect(request(input)).toMatchObject({ operation: 'GetItem', key: { pk: 'U#user-1', sk: 'S#s1#S' } });
    expect(input.stash.username).toBe('user-1');
  });

  it('reads the student id from a nested student', () => {
    expect(request(event({ arguments: { student: { studentId: 's2' } } })).key.sk).toBe('S#s2#S');
  });

  it('marks an identity with no username as system, keeping existing auth', () => {
    const fresh = event({ identity: {} });
    request(fresh);
    expect(fresh.stash.system.auth).toEqual({ service: 'system', student: {} });
    const existing = event({ identity: {}, stash: { system: { auth: { student: { data: 'Admin' } } } } });
    request(existing);
    expect(existing.stash.system.auth).toEqual({ service: 'system', student: { data: 'Admin' } });
  });
});

describe('check_access.response', () => {
  const team = (restrictions: object, extra: object = {}) => ({ restrictions, license: 'lic-1', ...extra });

  it('passes a call with no student', () => {
    expect(response(event({ arguments: {} }))).toEqual({ studentId: undefined, restrictions: undefined });
  });

  it('gives a system caller admin everywhere', () => {
    const result: any = response(event({ stash: { system: { auth: { service: 'system' } } } }));
    expect(result.restrictions.data).toBe('Admin');
  });

  it.each([['no team record', undefined], ['a removed member', team({}, { removed: 'date' })]])('denies %s', (_, result) => {
    expect(() => response(event({ result }))).toThrow('Access denied');
  });

  it('defaults info and service, and stashes permissions', () => {
    const result = team({ data: 'Read' }, { serviceTracking: true, behaviorTracking: false });
    const input = event({ result });
    expect(response(input)).toBe(result);
    expect(input.stash.permissions).toEqual({
      student: { data: 'Read', info: 'Read', service: 'No Access' }, serviceTracking: true, behaviorTracking: false, license: 'lic-1'
    });
  });

  // KNOWN BUG (security): the loop compares auth[key], not auth.student[key], so an Admin
  // requirement is never enforced here. Goes red when fixed.
  it.fails('enforces an Admin requirement', () => {
    const input = event({ result: team({ data: 'Read' }), stash: { system: { auth: { student: { data: 'Admin' } } } } });
    expect(() => response(input)).toThrow('Access denied');
  });
});

describe('graphQLWrapper requirements', () => {
  const run = (requirement: object) => WebUtils.graphQLWrapper(async () => 'ok', { student: requirement })(
    appSyncContext({ studentId: 's1' }, { identity: { groups: [] } }));

  it('enforces an admin requirement', async () => {
    stub(TeamDal, { getTeamMember: member({ data: AccessLevel.read }) });
    await expect(run({ data: AccessLevel.admin })).rejects.toThrow('Access Denied');
  });

  // KNOWN BUG (security): the wrapper checks for 'Read Only' but AccessLevel.read is 'Read', so
  // read requirements are never enforced. Goes red when fixed.
  it.fails('enforces a read requirement', async () => {
    stub(TeamDal, { getTeamMember: member({ data: AccessLevel.none }) });
    await expect(run({ data: AccessLevel.read })).rejects.toThrow(/denied/i);
  });
});

describe('user-id-match', () => {
  it('allows a user to act on themselves', () => {
    expect(userIdMatch.request({ args: { userId: 'u' }, identity: { username: 'u' } })).toEqual({ payload: null });
    expect(userIdMatch.response({})).toBeNull();
  });

  it('refuses anyone else', () => {
    expect(() => userIdMatch.request({ args: { userId: 'u' }, identity: { username: 'x' } })).toThrow('Unauthorized');
  });
});

describe('passthrough', () => {
  it('forwards input and returns the result', () => {
    expect(passthrough.request({ arguments: { input: { a: 1 } } })).toEqual({ payload: { a: 1 } });
    expect(passthrough.response({ result: 'r' })).toBe('r');
  });
});
