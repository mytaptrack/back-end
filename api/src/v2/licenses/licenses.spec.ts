import { LicenseDal, StudentDal, WebError } from '@mytaptrack/lib';
import { callApi, noLicenseUser, quietConsole, stub, webUser } from '../../testing/unit-kit';

const dynamoSend = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/lib-dynamodb', async original => ({
  ...(await original<any>()),
  DynamoDBDocumentClient: { from: () => ({ send: dynamoSend }) }
}));

import * as del from './delete';
import * as getDedicated from './getDedicated';
import * as getLicenses from './getLicenses';
import * as post from './post';
import * as put from './put';

quietConsole();
beforeEach(() => {
  dynamoSend.mockReset().mockResolvedValue({});
  process.env.StudentTable = 'students';
});

describe('licenses/delete', () => {
  it('requires the admins role', async () => {
    const res = await callApi(del.handleEvent, { query: { license: '"lic-1"' } });
    expect(res.status).toBe('403');
    expect(dynamoSend).not.toHaveBeenCalled();
  });

  it('deletes the license named by the query string', async () => {
    const licenseDelete = stub(LicenseDal, { delete: undefined }).delete;
    const res = await callApi(del.handleEvent, { query: { license: '"lic-1"' }, groups: ['admins'] });
    expect(res).toEqual({ status: '200', body: { success: true } });
    expect(licenseDelete).toHaveBeenCalledWith('lic-1');
  });

  it('rejects a missing request', async () => {
    await expect(del.deleteEvent(null as any, webUser)).rejects.toThrow('Invalid input');
  });
});

describe('licenses/getDedicated', () => {
  it('denies a license the user does not hold', async () => {
    await expect(getDedicated.post({ license: 'other' } as any, webUser)).rejects.toThrow('Access Denied');
  });

  it('returns the single-use count', async () => {
    stub(LicenseDal, { get: { singleUsed: 3 } });
    await expect(getDedicated.post({ license: 'lic-1' } as any, webUser)).resolves.toBe(3);
  });

  it('reports an unknown license', async () => {
    stub(LicenseDal, { get: undefined });
    await expect(getDedicated.post({ license: 'lic-1' } as any, webUser)).rejects.toThrow('License not found');
  });
});

describe('licenses/getLicenses', () => {
  it('requires the admins role', async () => {
    expect((await callApi(getLicenses.handleEvent)).status).toBe('403');
  });

  it('returns every license', async () => {
    stub(LicenseDal, { getAll: [{ license: 'a' }, { license: 'b' }] });
    const res = await callApi(getLicenses.handleEvent, { groups: ['admins'] });
    expect(res.body).toEqual([{ license: 'a' }, { license: 'b' }]);
  });
});

describe('licenses/post', () => {
  const request = { license: 'lic-1', studentId: 'student-1', licenseDetails: { flexible: true, fullYear: false } } as any;

  it.each([
    ['license', { ...request, license: undefined }],
    ['studentId', { ...request, studentId: undefined }],
    ['licenseDetails', { ...request, licenseDetails: undefined }]
  ])('rejects a request without %s', async (_, body) => {
    await expect(post.post(body, webUser)).rejects.toThrow('Arguments invalid');
  });

  it('denies a license the user does not hold', async () => {
    await expect(post.post(request, noLicenseUser)).rejects.toThrow('Access Denied');
  });

  it('writes the updated license details to the student', async () => {
    stub(StudentDal, { getStudentConfig: { licenseDetails: { flexible: false, fullYear: true } } });
    await expect(post.post(request, webUser)).resolves.toBeNull();
    const input = dynamoSend.mock.calls[0][0].input;
    expect(input.TableName).toBe('students');
    expect(input.Key).toEqual({ studentId: 'student-1' });
    expect(input.ExpressionAttributeValues).toEqual({ flexible: true, fullYear: false });
  });

  // KNOWN BUG: the update references :license and :licenseDetails but passes the bare details
  // object as ExpressionAttributeValues, so DynamoDB rejects it. Goes red when fixed.
  it.fails('supplies every placeholder its update expression references', async () => {
    stub(StudentDal, { getStudentConfig: { licenseDetails: { flexible: false, fullYear: true } } });
    await post.post(request, webUser);
    const input = dynamoSend.mock.calls[0][0].input;
    expect(Object.keys(input.ExpressionAttributeValues).sort()).toEqual([':license', ':licenseDetails']);
  });
});

describe('licenses/put', () => {
  it('requires the admins role', async () => {
    expect((await callApi(put.handleEvent, { body: {} })).status).toBe('403');
  });

  it('keeps the used count when updating an existing license', async () => {
    const dal = stub(LicenseDal, { get: { singleUsed: 7 }, save: undefined });
    const result = await put.create({ license: 'lic-1', singleUsed: 0 } as any, webUser);
    expect(result.singleUsed).toBe(7);
    expect(dal.save).toHaveBeenCalledWith(result);
  });

  it('generates a dated id for a new license', async () => {
    stub(LicenseDal, { save: undefined });
    const result = await put.create({} as any, webUser);
    expect(result.license).toMatch(/^\d{8}[0-9a-f]{32}$/);
  });
});

describe('WebError', () => {
  // KNOWN BUG (lib/src/utils/web-utils.ts): 'Access Denied' assigns the constructor parameter
  // rather than this.statusCode, so denials reach clients as 400, not 403. Goes red when fixed.
  it.fails('reports Access Denied as a 403', () => {
    expect(new WebError('Access Denied').statusCode).toBe(403);
  });
});
