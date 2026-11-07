import { appSyncContext, quietConsole, stubTables, transactItems } from '../../../../testing/unit-kit';

vi.hoisted(() => { process.env.PrimaryTable = 'primary-table'; process.env.DataTable = 'data-table'; });

import { handleEvent } from './update';

quietConsole();
let db: ReturnType<typeof stubTables>;
beforeEach(() => { db = stubTables(); });

const conf = (overrides: object = {}) => ({
  studentId: 's1', studentName: 'Sam', groups: ['g'], behaviors: [{ id: 'b', abc: true, intensity: true, order: 1 }], responses: [], services: [{ id: 'sv', order: 2 }], ...overrides
});
const app = (overrides: object = {}) => ({ deviceId: 'd1', license: 'lic-1', name: 'Phone', tags: [], studentConfigs: [conf()], ...overrides });
const run = (a: object) => handleEvent(appSyncContext({ appConfig: a }));
const key = { pk: 'L#lic-1', sk: 'GD#d1' };

describe('app/update', () => {
  it('flags both tables on delete', async () => {
    await expect(run(app({ deleted: true }))).resolves.toEqual({ deviceId: 'd1' });
    const items = transactItems(db.primary.send);
    expect(items.map((i: any) => i.Update.TableName)).toEqual(['primary-table', 'data-table']);
    expect(items[0].Update.Key).toEqual(key);
    expect(items[0].Update.ExpressionAttributeValues[':deleted']).toMatchObject({ by: 'user-1', client: 'Web' });
  });

  it('creates a new MLC app with a generated auth', async () => {
    const { deviceId } = await run(app({ deviceId: undefined, tags: undefined }));
    expect(deviceId).toMatch(/^MLC-/);
    const [config, pii] = transactItems(db.primary.send);
    expect(config.Put).toMatchObject({ TableName: 'data-table', Item: { deviceId, license: 'lic-1', studentIds: ['s1'] } });
    expect(config.Put.Item.auth).toHaveLength(1);
    expect(config.Put.Item.students).toEqual([{ studentId: 's1', behaviors: [{ id: 'b', abc: true, intensity: true, order: 1 }], services: [{ id: 'sv', order: 2 }] }]);
    expect(pii.Put).toMatchObject({ TableName: 'primary-table', Item: { deviceName: 'Phone', lpk: 'lic-1#AG', studentIds: ['s1'] } });
    expect(pii.Put.Item.studentContextLookup).toEqual([{ id: 's1', name: 'Sam', groups: ['g'] }]);
  });

  it('writes nothing when nothing changed', async () => {
    db.primary.get.mockResolvedValue({ ...key, deviceName: 'Phone', tags: [], studentContextLookup: [{ id: 's1', name: 'Sam' }] });
    db.data.get.mockResolvedValue({ deviceId: 'd1', students: [{ studentId: 's1', behaviors: conf().behaviors, services: conf().services }] });
    await run(app());
    expect(db.primary.send).not.toHaveBeenCalled();
  });

  it('updates the pii on a rename', async () => {
    db.primary.get.mockResolvedValue({ ...key, deviceName: 'Old', tags: [], studentContextLookup: [{ id: 's1', name: 'Sam' }] });
    db.data.get.mockResolvedValue({ deviceId: 'd1', students: [{ studentId: 's1', behaviors: conf().behaviors, services: conf().services }] });
    await run(app());
    const items = transactItems(db.primary.send);
    expect(items).toHaveLength(1);
    expect(items[0].Put).toMatchObject({ TableName: 'primary-table', Item: { deviceName: 'Phone' } });
  });

  it('updates a student whose behaviors changed', async () => {
    db.primary.get.mockResolvedValue({ ...key, deviceName: 'Phone', tags: [], studentContextLookup: [{ id: 's1', name: 'Old name' }] });
    db.data.get.mockResolvedValue({ deviceId: 'd1', students: [{ studentId: 's1', behaviors: [], services: [] }] });
    await run(app());
    const [config, pii] = transactItems(db.primary.send);
    expect(config.Put.Item.students[0].behaviors).toEqual(conf().behaviors);
    expect(config.Put.Item.students[0].services).toEqual(conf().services);
    expect(pii.Put.Item.studentContextLookup[0].name).toBe('Sam');
  });

  it('removes a student, keeping the rest', async () => {
    db.primary.get.mockResolvedValue({ ...key, deviceName: 'Phone', tags: [], studentContextLookup: [{ id: 's1', name: 'Sam' }, { id: 's2', name: 'Pat' }] });
    db.data.get.mockResolvedValue({ deviceId: 'd1', students: [{ studentId: 's1', behaviors: [], services: [] }, { studentId: 's2', behaviors: [], services: [] }] });
    await run(app({ studentConfigs: [conf({ delete: true })] }));
    const [config, pii] = transactItems(db.primary.send);
    expect(config.Put.Item.studentIds).toEqual(['s2']);
    expect(pii.Put.Item.studentContextLookup).toEqual([{ id: 's2', name: 'Pat' }]);
  });

  it('deletes an unclaimed app when its last student leaves', async () => {
    const mlc = { pk: 'L#lic-1', sk: 'GD#MLC-1' };
    db.primary.get.mockResolvedValue({ ...mlc, deviceName: 'Phone', tags: [], studentContextLookup: [{ id: 's1', name: 'Sam' }] });
    db.data.get.mockResolvedValue({ deviceId: 'MLC-1', students: [{ studentId: 's1', behaviors: [], services: [] }] });
    await run(app({ deviceId: 'MLC-1', studentConfigs: [conf({ delete: true })] }));
    expect(transactItems(db.primary.send)[0].Put.Item.deleted).toMatchObject({ by: 'user-1' });
  });

  it('keeps a claimed device when its last student leaves', async () => {
    db.primary.get.mockResolvedValue({ ...key, deviceName: 'Phone', tags: [], studentContextLookup: [{ id: 's1', name: 'Sam' }] });
    db.data.get.mockResolvedValue({ deviceId: 'd1', students: [{ studentId: 's1', behaviors: [], services: [] }] });
    await run(app({ studentConfigs: [conf({ delete: true })] }));
    expect(transactItems(db.primary.send)[0].Put.Item.deleted).toBeUndefined();
  });

  it('reassign issues a new id and retires the old one', async () => {
    db.primary.get.mockResolvedValue({ ...key, deviceName: 'Phone', tags: [], studentContextLookup: [] });
    db.data.get.mockResolvedValue({ ...key, deviceId: 'd1', students: [] });
    const result = await run(app({ reassign: true, studentConfigs: [] }));
    expect(result.deviceId).toMatch(/^MLC-/);
    const updates = transactItems(db.primary.send).filter((x: any) => x.Update);
    expect(updates.map((x: any) => x.Update.Key)).toEqual([key, key]);
  });

  // KNOWN BUG: the deleted-flag block resets TransactItems = [] after the new records were queued,
  // so reassign retires the old app and the new one is never written. Goes red when fixed.
  it.fails('reassign writes the new app', async () => {
    db.primary.get.mockResolvedValue({ ...key, deviceName: 'Phone', tags: [], studentContextLookup: [] });
    db.data.get.mockResolvedValue({ ...key, deviceId: 'd1', students: [] });
    const result = await run(app({ reassign: true, studentConfigs: [] }));
    expect(transactItems(db.primary.send).filter((x: any) => x.Put?.Item.deviceId === result.deviceId)).toHaveLength(2);
  });
});
