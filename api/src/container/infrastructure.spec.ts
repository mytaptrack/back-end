import { EventEmitter } from 'events';
import { mockNativeModule } from '@mytaptrack/lib/dist/v2/testing/native-module-mock';
import { quietConsole } from '../testing/unit-kit';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), connect: vi.fn(), processData: vi.fn(), dynamo: vi.fn() }));
vi.mock('child_process', async original => ({ ...(await original<any>()), spawn: mocks.spawn }));
vi.mock('amqplib', () => ({ default: { connect: mocks.connect }, connect: mocks.connect }));
vi.mock('../graphql/resolver/mutations/report/process', () => ({ processData: mocks.processData }));
vi.mock('./local-env-setup', () => ({ validateDynamoDB: vi.fn() }));
vi.mock('@aws-sdk/client-dynamodb', async original => ({ ...(await original<any>()), DynamoDBClient: class { send = mocks.dynamo; } }));

// app-sync.ts no longer has createResolversFromMappings, so extraction finds nothing today.
const REAL_RESOLVERS = {};

quietConsole();
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('config', () => {
  async function load() {
    vi.resetModules();
    return (await import('./config')).containerConfig;
  }

  it('defaults to local infrastructure', async () => {
    for (const key of ['DYNAMODB_ENDPOINT', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'RABBITMQ_URL', 'PORT', 'GRAPHIQL_ENABLED']) { delete process.env[key]; }
    await expect(load()).resolves.toMatchObject({
      dynamodb: { endpoint: 'http://localhost:8000', region: 'us-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } },
      rabbitmq: { queue: 'mytaptrack-events' },
      server: { port: 4000, graphiql: true }
    });
  });

  it('reads the environment', async () => {
    Object.assign(process.env, { DYNAMODB_ENDPOINT: 'http://db', PORT: '99', GRAPHIQL_ENABLED: 'false', RABBITMQ_URL: 'amqp://x' });
    await expect(load()).resolves.toMatchObject({ dynamodb: { endpoint: 'http://db' }, rabbitmq: { url: 'amqp://x' }, server: { port: 99, graphiql: false } });
  });
});

describe('init-tables', () => {
  beforeEach(() => { mocks.dynamo.mockReset(); });
  const created = () => mocks.dynamo.mock.calls.slice(1).map(([c]) => c.input.TableName);

  it('creates every table when none exist', async () => {
    mocks.dynamo.mockResolvedValue({ TableNames: [] });
    await (await import('./init-tables')).initTables();
    expect(created()).toEqual(['mytaptrack-local-data', 'mytaptrack-local-primary', 'mytaptrack-data', 'mytaptrack-primary']);
  });

  it('leaves existing tables alone, using a supplied client', async () => {
    const send = vi.fn().mockResolvedValueOnce({ TableNames: ['mytaptrack-data', 'mytaptrack-local-data', 'mytaptrack-local-primary'] }).mockResolvedValue({});
    await (await import('./init-tables')).initTables({ send } as any);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].input.TableName).toBe('mytaptrack-primary');
    expect(mocks.dynamo).not.toHaveBeenCalled();
  });

  it('gives data tables the indexes the app queries', async () => {
    mocks.dynamo.mockResolvedValue({ TableNames: [] });
    await (await import('./init-tables')).initTables();
    const indexes = (i: number) => mocks.dynamo.mock.calls[i + 1][0].input.GlobalSecondaryIndexes.map((x: any) => x.IndexName);
    expect(indexes(0)).toEqual(['Student', 'License', 'Device', 'App']);
    expect(indexes(1)).toEqual(['License']);
  });
});

describe('extract-resolvers', () => {
  async function load(source: string) {
    vi.resetModules();
    vi.doMock('fs', async original => ({ ...(await original<any>()), readFileSync: () => source }));
    const module = await import('./extract-resolvers');
    vi.doUnmock('fs');
    return module;
  }

  it('reads resolver code paths from the stack source', async () => {
    const { extractResolverConfigurations, updateGraphQLServerWithExtractedConfigs } = await load(`
  createResolversFromMappings(mappings: any, resources: any) {
    this.addLambdaResolver(\`a\`, {
      codePath: 'path/one',
      fieldName: 'one',
    });
    this.addLambdaResolver(\`b\`, {
      codePath: 'path/two',
      fieldName: 'two',
    });
  }
`);
    expect(extractResolverConfigurations()).toEqual({ 'path/one': 'one', 'path/two': 'two' });
    expect(updateGraphQLServerWithExtractedConfigs()).toEqual({ 'path/one': 'one', 'path/two': 'two' });
  });

  it('finds nothing when the method is absent', async () => {
    const { extractResolverConfigurations } = await load('class Empty {}');
    expect(extractResolverConfigurations()).toEqual({});
  });

  it('parses the real stack source', async () => {
    vi.resetModules();
    const { extractResolverConfigurations } = await import('./extract-resolvers');
    expect(extractResolverConfigurations()).toEqual(REAL_RESOLVERS);
  });
});

describe('start-all', () => {
  function child() {
    return Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.spawn.mockReset().mockImplementation(child);
  });
  afterEach(() => { vi.useRealTimers(); });

  async function start() {
    vi.resetModules();
    const handlers: Record<string, () => void> = {};
    const on = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => { handlers[event] = handler; return process; }) as any);
    await import('./start-all');
    on.mockRestore();
    return handlers;
  }

  it('starts graphql, then the consumer after a delay', async () => {
    await start();
    expect(mocks.spawn.mock.calls.map(c => c[1][1])).toEqual(['graphql:start']);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.spawn.mock.calls.map(c => c[1][1])).toEqual(['graphql:start', 'rabbitmq:consumer']);
  });

  it('prefixes child output and reports exits', async () => {
    await start();
    const first = mocks.spawn.mock.results[0].value;
    first.stdout.emit('data', 'ready\n');
    first.stderr.emit('data', 'oops\n');
    first.emit('close', 1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[GraphQL]\x1b[0m ready'));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[GraphQL]\x1b[0m oops'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('exited with code 1'));
  });

  it('stops children on SIGINT', async () => {
    const handlers = await start();
    await vi.advanceTimersByTimeAsync(2000);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    handlers.SIGINT();
    for (const { value } of mocks.spawn.mock.results) { expect(value.kill).toHaveBeenCalledWith('SIGINT'); }
    expect(exit).toHaveBeenCalledWith(0);
  });
});

describe('rabbitmq-consumer', () => {
  const channel = {
    assertQueue: vi.fn(), prefetch: vi.fn(), consume: vi.fn(), ack: vi.fn(), nack: vi.fn(), close: vi.fn()
  };
  const connection = { createChannel: vi.fn(async () => channel), on: vi.fn(), close: vi.fn() };
  let restore: () => void;

  async function consumer() {
    vi.resetModules();
    const { RabbitMQConsumer } = await import('./rabbitmq-consumer');
    return new RabbitMQConsumer();
  }
  const started = async () => {
    const c = await consumer();
    await c.connect();
    await c.startReportDataConsumer();
    return channel.consume.mock.calls[0][1] as (msg: unknown) => Promise<void>;
  };
  const message = (body: string) => ({ content: Buffer.from(body) });

  beforeEach(() => {
    restore = mockNativeModule('dotenv', { config: vi.fn() }, __dirname);
    for (const mock of [...Object.values(channel), connection.on, connection.close, mocks.processData]) { mock.mockReset(); }
    mocks.connect.mockReset().mockResolvedValue(connection);
  });
  afterEach(() => { restore(); });

  it('refuses to consume before connecting', async () => {
    await expect((await consumer()).startReportDataConsumer()).rejects.toThrow('RabbitMQ channel not initialized');
  });

  it('rethrows a connection failure', async () => {
    mocks.connect.mockRejectedValue(new Error('refused'));
    await expect((await consumer()).connect()).rejects.toThrow('refused');
  });

  it('logs connection events', async () => {
    const c = await consumer();
    await c.connect();
    for (const [, handler] of connection.on.mock.calls) { expect(() => handler(new Error('x'))).not.toThrow(); }
    expect(connection.on.mock.calls.map(x => x[0])).toEqual(['error', 'close']);
  });

  it('reads the report queue one message at a time', async () => {
    await started();
    expect(channel.assertQueue).toHaveBeenCalledWith('report-data-queue', { durable: true });
    expect(channel.prefetch).toHaveBeenCalledWith(1);
  });

  it('acks a processed message', async () => {
    const consume = await started();
    const msg = message(JSON.stringify({ studentId: 's1', dateEpoc: 1 }));
    await consume(msg);
    expect(mocks.processData).toHaveBeenCalledWith({ studentId: 's1', dateEpoc: 1 }, 's1');
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('drops a failed message rather than requeueing it forever', async () => {
    const consume = await started();
    mocks.processData.mockRejectedValue(new Error('bad'));
    const msg = message('{}');
    await consume(msg);
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('drops an unparseable message', async () => {
    const consume = await started();
    const msg = message('not json');
    await consume(msg);
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it('ignores a cancelled consumer', async () => {
    const consume = await started();
    await expect(consume(null)).resolves.toBeUndefined();
  });

  it('closes cleanly, connected or not', async () => {
    const c = await consumer();
    await expect(c.close()).resolves.toBeUndefined();
    await c.connect();
    await c.close();
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });
});
