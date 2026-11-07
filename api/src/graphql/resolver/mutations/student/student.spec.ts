import { LicenseDal, MttIndexes, ScheduleDal, StudentDal, TeamDal, UserDal } from '@mytaptrack/lib';
import { AccessLevel } from '@mytaptrack/types';
import { appSyncContext, quietConsole, stub, stubTables, transactItems } from '../../../../testing/unit-kit';

vi.hoisted(() => { process.env.PrimaryTable = 'primary-table'; process.env.DataTable = 'data-table'; });
vi.mock('@aws-appsync/utils', () => ({ util: { dynamodb: { toMapValues: (x: unknown) => x } } }));

import * as deleteTeam from './delete-team-member';
import * as deleteNotifications from './notifications/delete-notifications';
import * as serviceData from './service/update-definition/data';
import * as servicePrimary from './service/update-definition/primary';
import * as updateTeam from './update-team-member';
import * as deleteStudent from './update-info/delete';
import * as update from './update-info/data';
import { processSchedules } from './update-info/schedules';

quietConsole();
let db: ReturnType<typeof stubTables>;
beforeEach(() => { db = stubTables(); });

describe('delete-team-member', () => {
  const run = (level: AccessLevel) => deleteTeam.eventHandler(appSyncContext({ studentId: 's1', userId: 'u2' }, { access: { team: level } }));

  it('removes the member', async () => {
    const dal = stub(TeamDal, { removeUserFromTeam: undefined });
    await expect(run(AccessLevel.admin)).resolves.toBe(true);
    expect(dal.removeUserFromTeam).toHaveBeenCalledWith('u2', 's1');
  });

  it('denies a member with no team access', async () => {
    await expect(run(AccessLevel.none)).rejects.toThrow('Access Denied');
  });

  // KNOWN BUG: read-only team access can remove members, while update-team-member needs admin.
  // Goes red when fixed.
  it.fails('denies a read-only member', async () => {
    stub(TeamDal, { removeUserFromTeam: undefined });
    await expect(run(AccessLevel.read)).rejects.toThrow('Access Denied');
  });
});

describe('update-team-member', () => {
  const member = (overrides: object = {}) => ({ userId: 'u2', email: 'e@x', name: 'N', restrictions: {}, ...overrides });
  const run = (teamMember: object, access: object = {}) => updateTeam.eventHandler(appSyncContext({ studentId: 's1', teamMember }, { access }));

  it('requires team admin and contact details', async () => {
    await expect(run(member(), { team: AccessLevel.read })).rejects.toThrow('Access Denied');
    await expect(run({ userId: 'u2' })).rejects.toThrow('Email and name are required');
  });

  it('saves a known user, defaulting status and version', async () => {
    const dal = stub(TeamDal, { putTeamMember: async (x: any) => x });
    const result = await run(member());
    expect(dal.putTeamMember).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', license: 'lic-1', version: 1, details: { email: 'e@x', name: 'N' } }));
    expect(result).toMatchObject({ userId: 'u2', email: 'e@x', name: 'N' });
  });

  it('prefers nested details', async () => {
    stub(TeamDal, { putTeamMember: async (x: any) => x });
    await expect(run(member({ email: undefined, name: undefined, details: { email: 'd@x', name: 'D' } }))).resolves.toMatchObject({ email: 'd@x', name: 'D' });
  });

  it('resolves an email to a user id, or keeps the email', async () => {
    stub(TeamDal, { putTeamMember: async (x: any) => x });
    stub(UserDal, { getUserByEmail: { userId: 'found' } });
    await expect(run(member({ userId: undefined }))).resolves.toMatchObject({ userId: 'found' });
    stub(UserDal, { getUserByEmail: undefined });
    await expect(run(member({ userId: 'e@x' }))).resolves.toMatchObject({ userId: 'e@x' });
  });
});

describe('notifications/delete-notifications', () => {
  const run = (events: object[]) => deleteNotifications.handleEvent(appSyncContext({ notifications: { studentId: 's1', events } }));

  it('deletes the named events', async () => {
    await expect(run([{ epoch: 5 }])).resolves.toEqual([]);
    expect(db.data.delete).toHaveBeenCalledWith({ pk: 'USN#user-1', sk: 'S#s1#T#5#TP#behavior' });
    expect(db.data.query).not.toHaveBeenCalled();
  });

  it('with no events, deletes everything for the student', async () => {
    db.data.query.mockResolvedValue([{ event: { date: 1 } }, { event: { date: 2 } }]);
    await run([]);
    expect(db.data.delete).toHaveBeenCalledTimes(2);
  });
});

describe.each([
  ['data', serviceData, 'name', { id: 'sv', name: 'N', desc: 'D', target: 1 }, { id: 'sv', target: 1 }],
  ['primary', servicePrimary, 'target', { id: 'sv', name: 'N', target: 1, measurementUnit: 'm', durationRounding: 1, detailedTargets: [] }, { id: 'sv', name: 'N' }]
])('service/update-definition/%s', (table, module: any, _, service, stored) => {
  const event = (student: object) => ({
    arguments: { studentId: 's1', service }, stash: { student }, prev: { result: student }
  }) as any;

  it('starts the list for a student with no services', () => {
    const result = module.request(event({}));
    expect(result).toMatchObject({ key: { pk: 'S#s1', sk: 'P' }, update: { expression: 'SET services = :service' } });
    expect(result.update.expressionValues[':service']).toEqual([stored]);
  });

  it('writes to the existing index', () => {
    const result = module.request(event({ services: [{ id: 'x' }, { id: 'sv' }] }));
    expect(result.update.expression).toBe('SET services[1] = :service');
    expect(result.update.expressionValues[':service']).toEqual(stored);
  });

  it('appends a new service', () => {
    const result = module.request(event({ services: [{ id: 'x' }] }));
    expect(result.update.expression).toBe('SET services = list_append(services, :service)');
  });

  it('returns the service', () => {
    expect(module.response(event({}))).toBe(service);
  });

  // KNOWN BUG: list_append needs a list, but :service is a single map, so DynamoDB rejects it.
  // Goes red when fixed.
  it.fails('appends with a list value', () => {
    expect(module.request(event({ services: [{ id: 'x' }] })).update.expressionValues[':service']).toBeInstanceOf(Array);
  });
});

describe('update-info/delete', () => {
  const run = () => deleteStudent.handleEvent(appSyncContext({ studentIds: ['s1'], license: 'lic-1' }));

  it('refuses a student on another license', async () => {
    db.data.get.mockResolvedValue({ license: 'other' });
    await expect(run()).rejects.toThrow('Access Denied');
    expect(db.data.delete).not.toHaveBeenCalled();
  });

  it('removes everything for the student and recounts the license', async () => {
    db.data.get.mockResolvedValue({ license: 'lic-1' });
    db.data.query
      .mockResolvedValueOnce([{ pk: 'a', sk: '1' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pk: 'b', sk: '2' }])
      .mockResolvedValueOnce([{}, {}, {}]);
    await expect(run()).resolves.toBe(true);
    expect(db.data.query.mock.calls.slice(0, 4).map(c => c[0].attributeValues[':pk'] ?? c[0].attributeValues[':studentId'])).toEqual(['S#s1', 'S#s1#SCH', 'S#s1#BS', 's1']);
    expect(db.data.query.mock.calls[3][0].indexName).toBe(MttIndexes.student);
    expect(db.data.delete).toHaveBeenCalledWith({ pk: 'b', sk: '2' });
    expect(db.data.update.mock.calls[0][0].attributeValues).toEqual({ ':singleUsed': 3 });
  });

  it('propagates a delete failure', async () => {
    db.data.get.mockResolvedValue({ license: 'lic-1' });
    db.data.query.mockRejectedValue(new Error('db down'));
    await expect(run()).rejects.toThrow('db down');
  });

  // KNOWN BUG (privacy): the student's records are listed from the data table but deleted from
  // the primary table, so primary PII is never found and survives deletion. Goes red when fixed.
  it.fails('lists PII from the table it deletes from', async () => {
    db.data.get.mockResolvedValue({ license: 'lic-1' });
    db.primary.query.mockResolvedValue([{ pk: 'S#s1', sk: 'P' }]);
    await run();
    expect(db.primary.delete).toHaveBeenCalledWith({ pk: 'S#s1', sk: 'P' });
  });
});

describe('update-info/schedules', () => {
  const version = (overrides: object = {}) => ({ startDate: '2026-03-01', activities: [{ title: 'Math' }, { title: 'Art' }], ...overrides });
  const student = (categories: object[]) => ({ studentId: 's1', license: 'lic-1', scheduleCategories: categories }) as any;

  it('stores schedules sorted, with the latest version', async () => {
    stub(ScheduleDal, { getSchedules: [] });
    db.primary.get.mockResolvedValue(undefined);
    await processSchedules(student([{ name: 'Mon', schedules: [version({ startDate: '2026-04-01' }), version()] }]));
    const stored = db.data.put.mock.calls[0][0];
    expect(stored.schedules.map((x: any) => x.startDate)).toEqual(['2026-03-01', '2026-04-01']);
    expect(stored.latest.startDate).toBe('2026-04-01');
    expect(db.primary.put.mock.calls[0][0]).toMatchObject({ studentId: 's1', license: 'lic-1' });
  });

  it('reuses existing title ids', async () => {
    stub(ScheduleDal, { getSchedules: [] });
    db.primary.get.mockResolvedValue({ names: [{ name: 'Math', id: 'math-id' }] });
    await processSchedules(student([{ name: 'Mon', schedules: [version({ activities: [{ title: 'Math' }] })] }]));
    expect(db.data.put.mock.calls[0][0].schedules[0].activities[0].title).toBe('math-id');
  });

  it('deletes categories that were removed or emptied', async () => {
    stub(ScheduleDal, { getSchedules: [{ name: 'Gone' }, { name: 'Empty' }] });
    await processSchedules(student([{ name: 'Empty', schedules: [] }]));
    expect(db.data.delete).toHaveBeenCalledTimes(2);
    expect(db.primary.delete).toHaveBeenCalledTimes(2);
  });

  // KNOWN BUG: shortUUID().toString() stringifies the generator, not an id, so every activity title
  // gets the id '[object Object]' and the names can no longer be told apart. Goes red when fixed.
  it.fails('gives each activity title its own id', async () => {
    stub(ScheduleDal, { getSchedules: [] });
    db.primary.get.mockResolvedValue(undefined);
    await processSchedules(student([{ name: 'Mon', schedules: [version()] }]));
    const ids = db.primary.put.mock.calls[0][0].names.map((x: any) => x.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe('update-info/data', () => {
  const config = (overrides: object = {}) => ({ studentId: 's1', license: 'lic-1', licenseDetails: { flexible: false, fullYear: true, services: false }, behaviors: [], responses: [], services: [], ...overrides });
  const pii = (overrides: object = {}) => ({ firstName: 'Sam', lastName: 'Lee', nickname: 'S', tags: [], behaviorLookup: [], responseLookup: [], servicesLookup: [], ...overrides });
  const setup = (c: object = config(), p: object = pii()) => stub(StudentDal, { getStudentConfig: c, getStudentFullPii: p });
  const run = (student: object, options: object = {}) => update.handleEvent(appSyncContext({ student: { studentId: 's1', license: 'lic-1', ...student } }, options));
  const parts = () => {
    const items = transactItems(db.data.send).map((x: any) => x.Update);
    return { data: items.find((x: any) => x.TableName === 'data-table'), primary: items.find((x: any) => x.TableName === 'primary-table') };
  };

  describe('access', () => {
    it('denies a missing student', async () => {
      stub(StudentDal, { getStudentConfig: undefined, getStudentFullPii: undefined });
      await expect(run({})).rejects.toThrow('Access Denied');
    });

    it.each([
      ['milestones', { milestones: [{ date: 'd', title: 't', description: 'x' }] }, { milestones: AccessLevel.read }],
      ['abc', { abc: { name: 'a' } }, { abc: AccessLevel.read }],
      ['details', { details: { firstName: 'New' } }, { info: AccessLevel.read }],
      ['behaviors', { behaviors: [{ name: 'B' }] }, { behavior: AccessLevel.read }],
      ['services', { services: [{ name: 'S' }] }, { service: AccessLevel.read }]
    ])('ignores %s without admin', async (_, student, access) => {
      setup();
      await run(student, { access });
      expect(db.data.send).not.toHaveBeenCalled();
    });
  });

  it('writes only the changed details, to the primary table', async () => {
    setup();
    await run({ details: { firstName: 'Samuel', lastName: 'Lee', nickname: 'S' } });
    expect(parts().primary.UpdateExpression).toBe('SET #firstName = :firstName');
    expect(parts().primary.ExpressionAttributeValues).toEqual({ ':firstName': 'Samuel' });
    expect(parts().data).toBeUndefined();
  });

  it('a new nickname clears the legacy subtext', async () => {
    setup(config(), pii({ subtext: 'old' }));
    await run({ details: { firstName: 'Sam', lastName: 'Lee', nickname: 'New' } });
    expect(db.primary.update).toHaveBeenCalledWith(expect.objectContaining({ updateExpression: 'REMOVE subtext' }));
  });

  it('school id goes to both tables', async () => {
    setup();
    await run({ details: { firstName: 'Sam', lastName: 'Lee', nickname: 'S', schoolId: '9' } });
    expect(parts().data.ExpressionAttributeValues).toEqual({ ':schoolStudentId': '9' });
    expect(parts().primary.ExpressionAttributeValues).toEqual({ ':schoolStudentId': '9' });
  });

  it('stores milestones with only known fields', async () => {
    setup();
    await run({ milestones: [{ date: 'd', title: 't', description: 'x', extra: 1 }] });
    expect(parts().primary.ExpressionAttributeValues[':milestones']).toEqual([{ date: 'd', title: 't', description: 'x' }]);
  });

  it('stores abc', async () => {
    setup();
    await run({ abc: { name: 'a' } });
    expect(parts().primary.ExpressionAttributeValues[':abc']).toEqual({ name: 'a' });
  });

  // KNOWN BUG: removing an abc reads primaryUpdates.tags, which is never set, so it throws once a
  // license has collections. Goes red when fixed.
  it.fails('removing an abc falls back to the license collection', async () => {
    setup();
    stub(LicenseDal, { get: { abcCollections: [{ name: 'lic', tags: ['t'] }] } });
    await run({ abc: { remove: true } });
    expect(parts().primary.ExpressionAttributeValues[':abc']).toEqual({ name: 'lic', tags: ['t'] });
  });

  it('removing an abc with no license collections removes it', async () => {
    setup();
    stub(LicenseDal, { get: {} });
    await run({ abc: { remove: true } });
    expect(parts().primary.UpdateExpression).toContain('REMOVE #abc');
  });

  describe('license details', () => {
    it('a license holder can change them', async () => {
      setup();
      await run({ licenseDetails: { flexible: true, fullYear: true, services: true } });
      expect(parts().data.ExpressionAttributeValues[':licenseDetails']).toEqual({ flexible: true, fullYear: true, services: true });
    });

    it('others cannot', async () => {
      setup();
      await run({ licenseDetails: { flexible: true } }, { identity: { groups: [] } });
      expect(db.data.send).not.toHaveBeenCalled();
    });
  });

  describe('behaviors', () => {
    it('adds a behavior to config and pii', async () => {
      setup();
      const student = await run({ behaviors: [{ name: 'Run', desc: 'D', isDuration: true, targets: [{ targetType: 't', target: 1, measurements: [{ name: 'm', value: 1 }] }] }] });
      const stored = parts().data.ExpressionAttributeValues[':behaviors'][0];
      expect(stored).toMatchObject({ isDuration: true, managed: false, daytime: false, requireResponse: false, targets: [{ targetType: 't', target: 1, measurements: [{ name: 'm', value: 1 }] }] });
      expect(parts().primary.ExpressionAttributeValues[':behaviorLookup']).toEqual([{ id: stored.id, name: 'Run', desc: 'D', tags: [] }]);
      expect(student.behaviors[0]).toMatchObject({ id: stored.id, name: 'Run' });
    });

    it('updates an existing behavior', async () => {
      setup(config({ behaviors: [{ id: 'b', targets: [{ targetType: 't', target: 1, measurements: [] }] }] }), pii({ behaviorLookup: [{ id: 'b', name: 'Old' }] }));
      await run({ behaviors: [{ id: 'b', name: 'New', isDuration: true, trackAbc: true, targets: [{ targetType: 't', target: 2, measurements: [{ name: 'x', value: 1 }] }, { targetType: 'u', target: 3 }] }] });
      expect(parts().data.ExpressionAttributeValues[':behaviors'][0]).toMatchObject({ isDuration: true, trackAbc: true });
      expect(parts().data.ExpressionAttributeValues[':behaviors'][0].targets[0]).toMatchObject({ target: 2, measurements: [{ name: 'x', value: 1 }] });
      expect(parts().primary.ExpressionAttributeValues[':behaviorLookup'][0].name).toBe('New');
    });

    it('recreates missing pii', async () => {
      setup(config({ behaviors: [{ id: 'b', targets: [] }] }));
      await run({ behaviors: [{ id: 'b', name: 'N', targets: [] }] });
      expect(parts().primary.ExpressionAttributeValues[':behaviorLookup']).toEqual([{ id: 'b', name: 'N', desc: undefined, tags: [] }]);
    });

    it('skips behaviors outside the allowed list', async () => {
      setup();
      await run({ behaviors: [{ id: 'other', name: 'N' }] }, { access: { behaviors: ['allowed'] } });
      expect(db.data.send).not.toHaveBeenCalled();
    });

    it('handles responses the same way', async () => {
      setup();
      await run({ responses: [{ name: 'R' }] });
      expect(parts().primary.ExpressionAttributeValues[':responseLookup'][0].name).toBe('R');
    });
  });

  describe('dashboard', () => {
    it('saves a shared dashboard, filling in durations', async () => {
      setup();
      await run({ dashboard: { behaviors: [{ id: 'b' }] } });
      expect(parts().data.ExpressionAttributeValues[':dashboard']).toEqual({ behaviors: [{ id: 'b', duration: {} }] });
    });

    it('saves a user dashboard separately', async () => {
      setup();
      await run({ dashboard: { user: true } });
      expect(db.data.put.mock.calls[0][0]).toMatchObject({ userId: 'user-1', license: 'lic-1', lpk: 'lic-1#S', studentId: 's1' });
      expect(db.data.send).not.toHaveBeenCalled();
    });
  });

  describe('services', () => {
    const service = (overrides: object = {}) => ({ name: 'Speech', desc: 'D', modifications: ['Quiet'], goals: {}, ...overrides });

    it('adds a service with new modification ids', async () => {
      setup();
      await run({ services: [service()] });
      const stored = parts().data.ExpressionAttributeValues[':services'][0];
      const lookup = parts().primary.ExpressionAttributeValues[':servicesLookup'][0];
      expect(stored).toMatchObject({ isDuration: true, provided: 0, weeklyServiceSummary: {} });
      expect(stored.modifications).toEqual([lookup.modifications[0].id]);
      expect(lookup).toMatchObject({ name: 'Speech', modifications: [{ name: 'Quiet' }] });
    });

    it('updates a service, keeping known modification ids', async () => {
      setup(
        config({ services: [{ id: 'sv', modifications: ['m1'] }] }),
        pii({ servicesLookup: [{ id: 'sv', name: 'Old', modifications: [{ id: 'm1', name: 'Quiet' }] }] }));
      await run({ services: [service({ id: 'sv', target: 5, isArchived: true })] });
      expect(parts().data.ExpressionAttributeValues[':services'][0]).toMatchObject({ target: 5, isArchived: true, modifications: ['m1'], durationRounding: 0, detailedTargets: [] });
      expect(parts().primary.ExpressionAttributeValues[':servicesLookup'][0].name).toBe('Speech');
    });

    it('skips services outside the allowed list', async () => {
      setup();
      await run({ services: [service({ id: 'other' })] }, { access: { services: ['allowed'] } });
      expect(db.data.send).not.toHaveBeenCalled();
    });
  });

  it('saves schedule categories for a schedules admin', async () => {
    setup();
    const dal = stub(ScheduleDal, { getSchedules: [{ name: 'x' }] });
    await run({ scheduleCategories: [] });
    expect(dal.getSchedules).toHaveBeenCalled();
    expect(db.data.delete).toHaveBeenCalled();
  });

  describe('creating a student', () => {
    const create = (student: object, options: object = {}) => update.handleEvent(appSyncContext({ student: {
      license: 'lic-1', details: { firstName: 'Ann', lastName: 'Lee' }, licenseDetails: { flexible: true }, ...student
    } }, options));

    it('requires access to the license', async () => {
      await expect(create({}, { identity: { groups: ['licenses/other'] } })).rejects.toThrow(/access denied/i);
    });

    it('requires a license type', async () => {
      await expect(create({ licenseDetails: {} })).rejects.toThrow('No license set for new student');
    });

    it('writes config, pii and an admin team record', async () => {
      const result = await create({ details: { firstName: 'Ann', lastName: 'Lee', tags: [{ tag: 't' }] } });
      const [config_, pii_, team] = transactItems(db.data.send);
      expect(config_.Put).toMatchObject({ TableName: 'data-table', Item: { studentId: result.studentId, lpk: 'L#lic-1', version: 4 } });
      expect(pii_.Put).toMatchObject({ TableName: 'primary-table', Item: { nickname: 'Ann Lee', tags: [{ tag: 't', type: 'user', order: 0 }] } });
      expect(team.Put.Item).toMatchObject({ userId: 'user-1', status: 'Verified', behaviorTracking: true, serviceTracking: false, lpk: 'lic-1#T' });
      expect(result.restrictions.data).toBe(AccessLevel.admin);
    });

    it('a sys-admin can create on any license', async () => {
      await expect(create({}, { identity: { groups: ['sys-admin'] } })).resolves.toHaveProperty('studentId');
    });

    it('a single license increments usage', async () => {
      db.data.get.mockResolvedValue({ details: { singleUsed: ['a', 'b'] } });
      await create({ licenseDetails: { fullYear: true } });
      expect(transactItems(db.data.send)[3].Update.ExpressionAttributeValues).toEqual({ ':addOne': 3 });
    });
  });

  it('mapConfigAndPiiToStudent joins config to pii, dropping orphans', () => {
    const student = update.mapConfigAndPiiToStudent(
      { ...config({ behaviors: [{ id: 'b', isDuration: true }, { id: 'gone' }], responses: [{ id: 'r' }], services: [{ id: 'sv' }] }) } as any,
      pii({ behaviorLookup: [{ id: 'b', name: 'B' }], responseLookup: [{ id: 'r', name: 'R' }], servicesLookup: [{ id: 'sv', name: 'S' }], tags: [{ tag: 't' }] }) as any,
      {} as any);
    expect(student.behaviors).toEqual([{ id: 'b', name: 'B', desc: undefined, tags: [], isDuration: true }]);
    expect(student.responses[0]).toMatchObject({ name: 'R' });
    expect(student.services[0]).toMatchObject({ name: 'S' });
    expect(student.tags).toEqual(['t']);
  });
});
