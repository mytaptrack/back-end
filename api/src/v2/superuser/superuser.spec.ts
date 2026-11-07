import { v2 } from '@mytaptrack/lib';
import { callApi, quietConsole, stub, webUser } from '../../testing/unit-kit';
import * as del from './license/delete';
import * as get from './license/get';
import * as put from './license/put';

quietConsole();

describe('superuser license routes', () => {
  it.each([
    ['delete', del.handleEvent, { query: { license: '"a"' } }],
    ['get', get.handleEvent, {}],
    ['put', put.handleEvent, { body: {} }]
  ])('%s requires the admins role', async (_, handleEvent, options) => {
    expect((await callApi(handleEvent, options)).status).toBe('403');
  });

  it('deletes the parsed license id', async () => {
    const dal = stub(v2.LicenseDal, { delete: undefined });
    const res = await callApi(del.handleEvent, { query: { license: '"lic-1"' }, groups: ['admins'] });
    expect(res).toEqual({ status: '200', body: { success: true } });
    expect(dal.delete).toHaveBeenCalledWith('lic-1');
  });

  it('rejects a missing delete request', async () => {
    await expect(del.deleteEvent(null as any, webUser)).rejects.toThrow('Invalid input');
  });

  it('lists all licenses', async () => {
    stub(v2.LicenseDal, { getAll: [{ license: 'a' }] });
    await expect(get.getLicense(null, webUser)).resolves.toEqual([{ license: 'a' }]);
  });

  it('keeps the used count when updating', async () => {
    const dal = stub(v2.LicenseDal, { get: { singleUsed: 4 }, save: undefined });
    const result = await put.create({ license: 'a' } as any, webUser);
    expect(result).toEqual({ license: 'a', singleUsed: 4 });
    expect(dal.save).toHaveBeenCalledWith(result);
  });

  it('initialises a new license with empty collections', async () => {
    stub(v2.LicenseDal, { save: undefined });
    const result = await put.create({} as any, webUser);
    expect(result.license).toMatch(/^\d{8}[0-9a-f]{32}$/);
    expect(result).toMatchObject({ mobileTemplates: [], studentTemplates: [], tags: { devices: [] }, abcCollections: [] });
  });
});
