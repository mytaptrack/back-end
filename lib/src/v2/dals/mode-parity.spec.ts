/**
 * Shared library behaviour that branches on deployment mode. serverless and container-aws
 * must use managed AWS services; container-local must use their local replacements.
 */
type Mode = 'serverless' | 'container-local' | 'container-aws';

const MODE_ENV: Record<Mode, Record<string, string>> = {
  serverless: {},
  'container-local': {
    USE_LOCAL: 'true',
    DYNAMODB_ENDPOINT: 'http://dynamodb-local:8000',
    RABBITMQ_URL: 'amqp://mytaptrack:mytaptrack@rabbitmq:5672'
  },
  'container-aws': { NODE_ENV: 'production' }
};
const AWS_MODES: Mode[] = ['serverless', 'container-aws'];
const ALL_MODES: Mode[] = ['serverless', 'container-local', 'container-aws'];

import { mockNativeModule } from '../testing/native-module-mock';

const originalEnv = { ...process.env };

const eventBridgeSend = vi.fn().mockResolvedValue({});
const cognitoSend = vi.fn();
const channel = {
  assertQueue: vi.fn(), assertExchange: vi.fn(), sendToQueue: vi.fn(), publish: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined)
};
const connection = { createChannel: vi.fn(async () => channel), close: vi.fn().mockResolvedValue(undefined) };
const amqpConnect = vi.fn(async (_url?: string) => connection);
const dynamoConfigs: any[] = [];
const createSignedFetcher = vi.fn(() => 'signed-fetch');
const graphQLClient = vi.fn(function () {});
const trace = vi.fn((fn: unknown) => fn);
const lumigo = vi.fn(() => ({ trace }));

function useMode(mode: Mode) {
  ['USE_LOCAL', 'NODE_ENV', 'DYNAMODB_ENDPOINT', 'RABBITMQ_URL', 'LUMIGO_TOKEN'].forEach(k => delete process.env[k]);
  Object.assign(process.env, MODE_ENV[mode], { EVENT_BUS: 'test-bus', UserPoolId: 'pool-1' });
  vi.resetModules();

  vi.doMock('@aws-sdk/client-eventbridge', () => ({
    EventBridgeClient: class { send = eventBridgeSend; },
    PutEventsCommand: class { constructor(public input: any) {} }
  }));
  vi.doMock('@aws-sdk/client-cognito-identity-provider', async () => ({
    ...await vi.importActual('@aws-sdk/client-cognito-identity-provider'),
    CognitoIdentityProviderClient: class { send = cognitoSend; }
  }));
  vi.doMock('@aws-sdk/client-dynamodb', async () => ({
    ...await vi.importActual('@aws-sdk/client-dynamodb'),
    DynamoDBClient: class { constructor(config: any) { dynamoConfigs.push(config); } }
  }));
  vi.doMock('aws-sigv4-fetch', () => ({ createSignedFetcher }));
  vi.doMock('graphql-request', () => ({ GraphQLClient: graphQLClient }));
  vi.doMock('@lumigo/tracer', () => ({
    initTracer: lumigo, default: lumigo, addExecutionTag: vi.fn(), error: vi.fn(), warn: vi.fn()
  }));
}

let restoreAmqp: () => void;

beforeEach(() => {
  vi.clearAllMocks();
  restoreAmqp = mockNativeModule('amqplib', { connect: amqpConnect }, __dirname);
  dynamoConfigs.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  restoreAmqp();
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('EventDal', () => {
  const trackEvent = { type: 'track-event', data: { studentId: 's1', dateEpoc: 1 } };
  const licenseEvent = { type: 'license', data: { license: 'l1' } };

  const send = async (events: any[]) => {
    const { EventDal } = await import('./event-dal');
    return EventDal.sendEvents('test-source', events as any);
  };

  describe.each(AWS_MODES)('%s', mode => {
    it('publishes to the EventBridge bus and leaves RabbitMQ alone', async () => {
      useMode(mode);
      await send([trackEvent, null, licenseEvent]);

      expect(eventBridgeSend).toHaveBeenCalledTimes(1);
      expect(eventBridgeSend.mock.calls[0][0].input.Entries).toEqual([
        { EventBusName: 'test-bus', Source: 'test-source', DetailType: 'track-event', Detail: JSON.stringify(trackEvent.data) },
        { EventBusName: 'test-bus', Source: 'test-source', DetailType: 'license', Detail: JSON.stringify(licenseEvent.data) }
      ]);
      expect(amqpConnect).not.toHaveBeenCalled();
    });

    it('propagates publish failures', async () => {
      useMode(mode);
      eventBridgeSend.mockRejectedValueOnce(new Error('throttled'));
      await expect(send([licenseEvent])).rejects.toThrow('throttled');
    });
  });

  describe('container-local', () => {
    it('sends track events to report-data-queue with the payload SQS would carry', async () => {
      useMode('container-local');
      await send([trackEvent]);

      const [queue, body, options] = channel.sendToQueue.mock.calls[0];
      expect(queue).toBe('report-data-queue');
      expect(options).toEqual({ persistent: true });
      // Serverless path: EventBridge Detail -> queue-management -> SQS MessageBody.
      expect(body.toString()).toBe(JSON.stringify(trackEvent.data));
      expect(eventBridgeSend).not.toHaveBeenCalled();
    });

    it('publishes other events to the topic exchange with the EventBridge envelope fields', async () => {
      useMode('container-local');
      await send([licenseEvent]);

      expect(channel.assertExchange).toHaveBeenCalledWith('mytaptrack-events', 'topic', { durable: true });
      const [exchange, routingKey, body] = channel.publish.mock.calls[0];
      expect(exchange).toBe('mytaptrack-events');
      expect(routingKey).toBe('test-source.license');
      expect(JSON.parse(body.toString())).toEqual({
        source: 'test-source', detailType: 'license', detail: licenseEvent.data
      });
    });

    it('closes the connection after each publish', async () => {
      useMode('container-local');
      await send([licenseEvent]);
      expect(channel.close).toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalled();
    });

    it('does not fail the request when the broker is down', async () => {
      useMode('container-local');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      amqpConnect.mockRejectedValueOnce(new Error('down'));
      await expect(send([licenseEvent])).resolves.toBeUndefined();
    });
  });
});

describe('LambdaAppsyncQueryClient', () => {
  const create = async () => {
    const { LambdaAppsyncQueryClient } = await import('../../utils/appsync-client');
    return new LambdaAppsyncQueryClient('https://appsync.test/graphql');
  };

  it.each(AWS_MODES)('%s signs requests for IAM-authorised AppSync', async mode => {
    useMode(mode);
    process.env.AWS_REGION = 'us-west-2';
    await create();

    expect(createSignedFetcher).toHaveBeenCalledWith(expect.objectContaining({ service: 'appsync', region: 'us-west-2' }));
    expect(graphQLClient).toHaveBeenCalledWith('https://appsync.test/graphql', { fetch: 'signed-fetch' });
  });

  it('container-local sends plain HTTP to the GraphQL container', async () => {
    useMode('container-local');
    await create();

    expect(createSignedFetcher).not.toHaveBeenCalled();
    expect(graphQLClient.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it.each(ALL_MODES)('%s returns the requested property of the response', async mode => {
    useMode(mode);
    graphQLClient.mockImplementation(function (this: any) {
      this.request = vi.fn().mockResolvedValue({ getUser: { id: 'u1' } });
    });
    await expect((await create()).query('query', {}, 'getUser')).resolves.toEqual({ id: 'u1' });
  });
});

describe('Dal', () => {
  const createDal = async () => {
    const { Dal } = await import('./dal');
    return new Dal('data');
  };

  it.each(AWS_MODES)('%s uses the default endpoint and credential chain', async mode => {
    useMode(mode);
    await createDal();
    expect(dynamoConfigs[dynamoConfigs.length - 1]).toEqual({});
  });

  it('container-local targets DYNAMODB_ENDPOINT with dummy credentials', async () => {
    useMode('container-local');
    await createDal();
    expect(dynamoConfigs[dynamoConfigs.length - 1]).toEqual({
      endpoint: 'http://dynamodb-local:8000',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
    });
  });

  it.each(ALL_MODES)('%s reads the table name from the environment', async mode => {
    useMode(mode);
    process.env.DataTable = 'table-for-mode';
    expect((await createDal()).tableName).toBe('table-for-mode');
  });
});

describe('UserDal', () => {
  const load = async () => (await import('./user-dal')).UserDal;

  it.each(AWS_MODES)('%s lists license users through Cognito', async mode => {
    useMode(mode);
    cognitoSend.mockResolvedValue({
      Users: [{ Username: 'u1', Attributes: [{ Name: 'email', Value: 'u1@example.com' }] }]
    });

    await expect((await load()).getUsersForLicense('lic')).resolves.toEqual([{ username: 'u1', email: 'u1@example.com' }]);
    expect(cognitoSend.mock.calls[0][0].input).toMatchObject({ GroupName: 'licenses/lic/users' });
  });

  it('container-local has no Cognito client and lists users from DynamoDB', async () => {
    useMode('container-local');
    const dal = await load();
    expect(dal.cognito).toBeNull();

    vi.spyOn(dal.primary, 'scan').mockResolvedValue({
      items: [{ pk: 'U#u1', email: 'u1@example.com' }, { pk: 'U#u2-at-example.com' }]
    });
    await expect(dal.getUsersForLicense('lic')).resolves.toEqual([
      { username: 'u1', email: 'u1@example.com' },
      { username: 'u2-at-example.com', email: 'u2@example.com' }
    ]);
    expect(cognitoSend).not.toHaveBeenCalled();
  });
});

describe('WebUtils.lambdaWrapper', () => {
  const wrap = async (handler: unknown) => (await import('../../utils/web-utils')).WebUtils.lambdaWrapper(handler);

  it.each(['serverless', 'container-aws'] as Mode[])('%s traces when a Lumigo token is configured', async mode => {
    useMode(mode);
    process.env.LUMIGO_TOKEN = 'token';
    const handler = vi.fn();
    await wrap(handler);
    expect(trace).toHaveBeenCalledWith(handler);
  });

  it('container-local never traces, even with a token present', async () => {
    useMode('container-local');
    process.env.LUMIGO_TOKEN = 'token';
    const handler = vi.fn();
    expect(await wrap(handler)).toBe(handler);
    expect(lumigo).not.toHaveBeenCalled();
  });

  it.each(ALL_MODES)('%s returns the handler unchanged without a token', async mode => {
    useMode(mode);
    const handler = vi.fn();
    expect(await wrap(handler)).toBe(handler);
  });
});
