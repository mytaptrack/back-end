import { randomUUID } from 'crypto';
import { AddressInfo } from 'net';
import { mockNativeModule } from '@mytaptrack/lib/dist/v2/testing/native-module-mock';
import { quietConsole } from '../testing/unit-kit';

const mocks = vi.hoisted(() => ({ dynamo: vi.fn(), connect: vi.fn(), servers: [] as any[], failListen: undefined as any }));
vi.mock('http', async original => {
  const actual = await original<any>();
  const createServer = (...args: any[]) => {
    const server = actual.createServer(...args);
    const listen = server.listen.bind(server);
    server.listen = (_: number, host: string, callback: () => void) => {
      if (mocks.failListen) { server.emit('error', mocks.failListen); return server; }
      mocks.servers.push(server);
      return listen(0, host, callback);
    };
    return server;
  };
  return { ...actual, default: { ...actual, createServer }, createServer };
});
vi.mock('@aws-sdk/client-dynamodb', async original => ({ ...(await original<any>()), DynamoDBClient: class { send = mocks.dynamo; } }));
vi.mock('@aws-sdk/lib-dynamodb', async original => ({ ...(await original<any>()), DynamoDBDocumentClient: { from: () => ({}) } }));
vi.mock('amqplib', () => ({ default: { connect: mocks.connect }, connect: mocks.connect }));

quietConsole();
const saved = { ...process.env };
let restore: () => void;

async function load() {
  vi.resetModules();
  return import('./local-env-setup');
}

beforeEach(() => {
  restore = mockNativeModule('dotenv', { config: vi.fn() }, __dirname);
  mocks.dynamo.mockReset();
  mocks.connect.mockReset();
  mocks.failListen = undefined;
  process.env.PrimaryTable = 'p-table';
  process.env.DataTable = 'd-table';
});
afterEach(async () => {
  restore();
  await Promise.all(mocks.servers.splice(0).map(s => new Promise(resolve => s.close(resolve))));
  process.env = { ...saved };
});

describe('environment', () => {
  it('points the AWS SDK at the local S3 mock in local mode', async () => {
    process.env.USE_LOCAL = 'true';
    await load();
    expect(process.env.AWS_ENDPOINT_URL).toBe('http://localhost:9000');
    expect(process.env.AWS_REQUEST_CHECKSUM_CALCULATION).toBe('when_required');
  });

  it('leaves it alone otherwise', async () => {
    delete process.env.USE_LOCAL;
    delete process.env.AWS_ENDPOINT_URL;
    await load();
    expect(process.env.AWS_ENDPOINT_URL).toBeUndefined();
  });
});

describe('validateDynamoDB', () => {
  it('passes when tables exist', async () => {
    mocks.dynamo.mockResolvedValue({ TableNames: ['p-table', 'd-table'] });
    await expect((await load()).validateDynamoDB()).resolves.toBeUndefined();
    expect(mocks.dynamo).toHaveBeenCalledTimes(1);
  });

  it('creates missing tables', async () => {
    mocks.dynamo.mockResolvedValue({ TableNames: ['p-table'] });
    await (await load()).validateDynamoDB();
    expect(mocks.dynamo.mock.calls.slice(1).some(([c]) => c.constructor.name === 'CreateTableCommand')).toBe(true);
  });

  it('rethrows a connection failure', async () => {
    mocks.dynamo.mockRejectedValue(new Error('refused'));
    await expect((await load()).validateDynamoDB()).rejects.toThrow('refused');
  });

  it('starts the S3 mock first in local mode', async () => {
    process.env.USE_LOCAL = 'true';
    mocks.dynamo.mockResolvedValue({ TableNames: ['p-table', 'd-table'] });
    await (await load()).validateDynamoDB();
    expect(mocks.servers).toHaveLength(1);
  });
});

describe('initRabbitMQ', () => {
  it('declares the durable events queue', async () => {
    const channel = { assertQueue: vi.fn() };
    mocks.connect.mockResolvedValue({ createChannel: async () => channel });
    await (await load()).initRabbitMQ();
    expect(channel.assertQueue).toHaveBeenCalledWith('mytaptrack-events', { durable: true });
  });

  it('wraps a connection failure', async () => {
    mocks.connect.mockRejectedValue(new Error('refused'));
    await expect((await load()).initRabbitMQ()).rejects.toThrow('RabbitMQ connection failed');
  });
});

describe('local S3 mock', () => {
  const bucket = `spec-${randomUUID()}`;
  let base: string;

  beforeEach(async () => {
    await (await load()).startLocalS3Mock();
    base = `http://127.0.0.1:${(mocks.servers[0].address() as AddressInfo).port}/${bucket}`;
  });

  it('round-trips an object, with metadata', async () => {
    expect((await fetch(`${base}/a/b.txt`, { method: 'PUT', body: 'hello' })).status).toBe(200);
    const res = await fetch(`${base}/a/b.txt`);
    expect(await res.text()).toBe('hello');
    expect(res.headers.get('content-length')).toBe('5');
    const head = await fetch(`${base}/a/b.txt`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('last-modified')).toBeTruthy();
  });

  it('answers a missing key the way S3 does', async () => {
    const res = await fetch(`${base}/missing`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('<Code>NoSuchKey</Code>');
    expect((await fetch(`${base}/missing`, { method: 'HEAD' })).status).toBe(404);
  });

  it('lists recursively by prefix, escaping xml', async () => {
    await fetch(`${base}/list/one.txt`, { method: 'PUT', body: '1' });
    await fetch(`${base}/list/deep/a&b.txt`, { method: 'PUT', body: '22' });
    await fetch(`${base}/other.txt`, { method: 'PUT', body: '3' });
    const xml = await (await fetch(`${base}?prefix=list%2F`)).text();
    expect(xml).toContain('<Key>list/one.txt</Key><Size>1</Size>');
    expect(xml).toContain('<Key>list/deep/a&amp;b.txt</Key>');
    expect(xml).not.toContain('other.txt');
    expect(xml).toContain('<IsTruncated>false</IsTruncated>');
  });

  it('lists an unknown bucket as empty', async () => {
    const xml = await (await fetch(`${base}-nothing`)).text();
    expect(xml).toContain('<ListBucketResult>');
    expect(xml).not.toContain('<Contents>');
  });

  it('deletes, idempotently', async () => {
    await fetch(`${base}/gone.txt`, { method: 'PUT', body: 'x' });
    expect((await fetch(`${base}/gone.txt`, { method: 'DELETE' })).status).toBe(204);
    expect((await fetch(`${base}/gone.txt`)).status).toBe(404);
    expect((await fetch(`${base}/gone.txt`, { method: 'DELETE' })).status).toBe(204);
  });

  it('accepts anything else without error', async () => {
    expect((await fetch(`${base}/x`, { method: 'POST' })).status).toBe(200);
  });
});

describe('S3 mock startup failures', () => {
  it.each([['the port is taken', 'EADDRINUSE'], ['it cannot bind', 'EACCES']])('carries on when %s', async (_, code) => {
    mocks.failListen = Object.assign(new Error('nope'), { code });
    await expect((await load()).startLocalS3Mock()).resolves.toBeUndefined();
  });
});
