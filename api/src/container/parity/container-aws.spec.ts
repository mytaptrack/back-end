/** Startup behaviour of the shared bootstrap when a container runs against real AWS. */
import { capability } from './gaps';
import { mockNativeModule } from '@mytaptrack/lib/dist/v2/testing/native-module-mock';
import { applyMode } from './modes';

const dynamoConfig = vi.fn();
const connect = vi.fn();
const createServer = vi.fn(() => ({ on: vi.fn(), listen: (...args: any[]) => args[args.length - 1]() }));

async function loadSetup() {
  vi.resetModules();
  vi.doMock('http', async () => {
    const http = await vi.importActual<typeof import('http')>('http');
    return { ...http, default: { ...http, createServer }, createServer };
  });
  vi.doMock('amqplib', () => ({ default: { connect }, connect }));
  vi.doMock('@aws-sdk/client-dynamodb', async () => ({
    ...await vi.importActual('@aws-sdk/client-dynamodb'),
    DynamoDBClient: class {
      constructor(config: unknown) { dynamoConfig(config); }
      send = vi.fn().mockResolvedValue({ TableNames: [process.env.PrimaryTable, process.env.DataTable] });
    }
  }));
  vi.doMock('@aws-sdk/lib-dynamodb', () => ({ DynamoDBDocumentClient: { from: () => ({}) } }));
  return import('../local-env-setup');
}

// init-tables.ts builds its own client first; the last one is local-env-setup's.
const lastDynamoConfig = () => dynamoConfig.mock.calls[dynamoConfig.mock.calls.length - 1][0];

let restoreDotenv: () => void;

// local-env-setup.ts loads dotenv with require(); see mockNativeModule. The real .env would
// otherwise switch every profile to local mode.
beforeEach(() => {
  restoreDotenv = mockNativeModule('dotenv', { config: vi.fn() }, __dirname);
  createServer.mockClear();
  dynamoConfig.mockClear();
  connect.mockReset();
});

afterEach(() => restoreDotenv());

describe('container-aws', () => {
  beforeEach(() => applyMode('container-aws'));

  capability('uses the task role rather than hard-coded credentials', async () => {
    await loadSetup();
    expect(lastDynamoConfig().credentials).toBeUndefined();
  });

  it('does not redirect AWS SDK traffic to the local S3 mock', async () => {
    await loadSetup();
    expect(process.env.AWS_ENDPOINT_URL).toBeUndefined();
  });

  it('does not set a DynamoDB endpoint override', async () => {
    await loadSetup();
    expect(lastDynamoConfig().endpoint).toBeUndefined();
  });

  it('table validation does not start the S3 mock', async () => {
    const setup = await loadSetup();
    await setup.validateDynamoDB();
    expect(createServer).not.toHaveBeenCalled();
  });

  // Production has EventBridge and SQS, so a missing broker must not be fatal.
  capability('starts without a RabbitMQ broker', async () => {
    connect.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect((await loadSetup()).initRabbitMQ()).resolves.toBeUndefined();
  });
});

describe('container-local', () => {
  beforeEach(() => applyMode('container-local'));
  afterEach(() => { delete process.env.AWS_ENDPOINT_URL; });

  it('targets DynamoDB Local with dummy credentials', async () => {
    await loadSetup();
    expect(lastDynamoConfig()).toMatchObject({
      endpoint: 'http://dynamodb-local:8000',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
    });
  });

  it('routes S3 traffic to the local mock', async () => {
    await loadSetup();
    expect(process.env.AWS_ENDPOINT_URL).toBe('http://localhost:9000');
  });

  it('table validation starts the S3 mock', async () => {
    const setup = await loadSetup();
    await setup.validateDynamoDB();
    expect(createServer).toHaveBeenCalledTimes(1);
  });

  it('fails fast when RabbitMQ is down, since the local pipeline depends on it', async () => {
    connect.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect((await loadSetup()).initRabbitMQ()).rejects.toThrow('RabbitMQ connection failed');
  });
});
