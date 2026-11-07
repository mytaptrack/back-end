/**
 * The API code paths that branch on deployment mode. Each mode must reach the backing
 * service that exists there, and data leaving one side must be readable by the other.
 */
import { join } from 'path';
import { mockNativeModule } from '@mytaptrack/lib/dist/v2/testing/native-module-mock';
import { applyMode, RuntimeMode } from './modes';

const sqsSend = vi.fn();
const channel = {
  assertQueue: vi.fn().mockResolvedValue({}),
  sendToQueue: vi.fn().mockResolvedValue(true),
  prefetch: vi.fn().mockResolvedValue({}),
  consume: vi.fn(),
  ack: vi.fn(),
  nack: vi.fn(),
  close: vi.fn().mockResolvedValue({})
};
const connection = {
  createChannel: vi.fn().mockResolvedValue(channel),
  close: vi.fn().mockResolvedValue({}),
  on: vi.fn()
};
const amqpConnect = vi.fn().mockResolvedValue(connection);
const ssmSend = vi.fn();

async function load<T = any>(path: string, mode: RuntimeMode): Promise<T> {
  applyMode(mode);
  vi.resetModules();
  vi.doMock('amqplib', () => ({ default: { connect: amqpConnect }, connect: amqpConnect }));
  vi.doMock('@aws-sdk/client-sqs', () => ({ SQS: class { sendMessage = sqsSend; } }));
  vi.doMock('@aws-sdk/client-ssm', () => ({
    SSMClient: class { send = ssmSend; },
    GetParameterCommand: class { constructor(public input: unknown) {} }
  }));
  return import(/* @vite-ignore */ join(__dirname, path));
}

let restoreAmqp: () => void;
const trackEvent = { detail: { studentId: 'student-1', dateEpoc: 1700000000000 } };

beforeEach(() => {
  vi.clearAllMocks();
  // queue-management.ts loads amqplib lazily with require(); see mockNativeModule.
  restoreAmqp = mockNativeModule('amqplib', { connect: amqpConnect }, __dirname);
  process.env.DATA_QUEUE_URL = 'https://sqs.example/queue.fifo';
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  restoreAmqp();
  vi.restoreAllMocks();
});

describe('report queue management', () => {
  const path = '../../graphql/resolver/mutations/report/queue-management';

  it.each<RuntimeMode>(['serverless', 'container-aws'])('%s queues to FIFO SQS, grouped by student', async mode => {
    await (await load(path, mode)).handleEvent(trackEvent);

    expect(sqsSend).toHaveBeenCalledWith({
      QueueUrl: 'https://sqs.example/queue.fifo',
      MessageBody: JSON.stringify(trackEvent.detail),
      MessageGroupId: 'student-1'
    });
    expect(amqpConnect).not.toHaveBeenCalled();
  });

  it('container-local queues to RabbitMQ, durable and persistent', async () => {
    await (await load(path, 'container-local')).handleEvent(trackEvent);

    expect(amqpConnect).toHaveBeenCalledWith(process.env.RABBITMQ_URL);
    expect(channel.assertQueue).toHaveBeenCalledWith('report-data-queue', { durable: true });
    const [queue, body, options] = channel.sendToQueue.mock.calls[0];
    expect(queue).toBe('report-data-queue');
    expect(JSON.parse(body.toString())).toEqual(trackEvent.detail);
    expect(options).toEqual({ persistent: true });
    expect(sqsSend).not.toHaveBeenCalled();
  });

  it('closes the connection after publishing so a long-lived server does not leak', async () => {
    await (await load(path, 'container-local')).handleEvent(trackEvent);
    expect(channel.close).toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalled();
  });

  it('propagates publish failures so the message is retried', async () => {
    amqpConnect.mockRejectedValueOnce(new Error('broker down'));
    await expect((await load(path, 'container-local')).handleEvent(trackEvent)).rejects.toThrow('broker down');
  });
});

describe('report processing receives the same payload from either transport', () => {
  const processPath = '../../graphql/resolver/mutations/report/process';
  const processData = vi.fn().mockResolvedValue(undefined);

  async function consumeWithRabbit(body: string) {
    const { RabbitMQConsumer } = await load('../rabbitmq-consumer', 'container-local');
    const consumer = new RabbitMQConsumer();
    await consumer.connect();
    await consumer.startReportDataConsumer();
    const deliver = channel.consume.mock.calls[0][1];
    const message = { content: Buffer.from(body) };
    await deliver(message);
    return message;
  }

  beforeEach(() => {
    processData.mockClear();
    vi.doMock(join(__dirname, `${processPath}.ts`), () => ({ processData }));
    vi.doMock(join(__dirname, '../local-env-setup.ts'), () => ({ validateDynamoDB: vi.fn() }));
  });

  afterEach(() => {
    vi.doUnmock(join(__dirname, `${processPath}.ts`));
    vi.doUnmock(join(__dirname, '../local-env-setup.ts'));
  });

  it('the consumer passes the message to processData exactly as the SQS handler does', async () => {
    const message = await consumeWithRabbit(JSON.stringify(trackEvent.detail));
    expect(processData).toHaveBeenCalledWith(trackEvent.detail, 'student-1');
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('dead-letters a poison message rather than redelivering it forever', async () => {
    const message = await consumeWithRabbit('not json');
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(processData).not.toHaveBeenCalled();
  });

  it('processes one message at a time, preserving the per-student ordering FIFO SQS gives', async () => {
    await consumeWithRabbit(JSON.stringify(trackEvent.detail));
    expect(channel.prefetch).toHaveBeenCalledWith(1);
  });
});

describe('device token key', () => {
  const path = '../../device/functions/appApi/token-utils';

  beforeEach(() => {
    process.env.TokenEncryptKey = '/test/app/tokenKey';
    ssmSend.mockResolvedValue({ Parameter: { Value: 'ssm-key' } });
  });

  it.each<RuntimeMode>(['serverless', 'container-aws'])('%s reads the key from SSM', async mode => {
    await expect((await load(path, mode)).getTokenKey()).resolves.toBe('ssm-key');
    expect(ssmSend.mock.calls[0][0].input).toEqual({ Name: '/test/app/tokenKey', WithDecryption: true });
  });

  it('container-local uses TOKEN_ENCRYPT_KEY without calling SSM', async () => {
    const utils = await load(path, 'container-local');
    process.env.TOKEN_ENCRYPT_KEY = 'env-key';
    await expect(utils.getTokenKey()).resolves.toBe('env-key');
    expect(ssmSend).not.toHaveBeenCalled();
    delete process.env.TOKEN_ENCRYPT_KEY;
  });
});
