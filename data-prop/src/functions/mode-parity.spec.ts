/**
 * data-prop runs only on AWS triggers, so its capabilities reach container mode only if
 * the handlers themselves are portable. Every deployed function must load and export the
 * handler CDK names under each runtime profile. Missing container triggers are tracked in
 * api/src/container/parity/async-parity.spec.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const stack = readFileSync(join(ROOT, 'lib/aws-stack.ts'), 'utf8');

const functions = [...stack.matchAll(/new MttFunction\(context, \{\s*id: '([^']+)',\s*codePath: '([^']+)',\s*handler: '([^']+)'/g)]
  .map(([, id, codePath, handler]) => ({ id, codePath, handler }));

const MODES: Record<string, Record<string, string>> = {
  serverless: { AWS_LAMBDA_FUNCTION_NAME: 'mytaptrack-test' },
  'container-local': { USE_LOCAL: 'true', DYNAMODB_ENDPOINT: 'http://dynamodb-local:8000' },
  'container-aws': { NODE_ENV: 'production' }
};

it('finds every function declared in the stack (guards against the parser going stale)', () => {
  expect(functions.length).toBe(stack.match(/new MttFunction\(context,/g)!.length);
  expect(functions.length).toBeGreaterThan(10);
});

describe.each(Object.keys(MODES))('%s', mode => {
  beforeAll(() => {
    ['USE_LOCAL', 'NODE_ENV', 'DYNAMODB_ENDPOINT', 'AWS_LAMBDA_FUNCTION_NAME'].forEach(key => delete process.env[key]);
    Object.assign(process.env, MODES[mode], {
      AWS_REGION: 'us-west-2', PrimaryTable: 'primary', DataTable: 'data'
    });
    vi.resetModules();
  });

  const check = async ({ codePath, handler }: typeof functions[number]) => {
    const loaded = await import(/* @vite-ignore */ join(ROOT, codePath));
    expect(typeof loaded[handler]).toBe('function');
  };

  it.each(functions)('loads $id and exports $handler()', check);
});

describe('DynamoDB stream to event bus', () => {
  const send = vi.fn().mockResolvedValue({});

  beforeAll(() => {
    process.env.EVENT_BUS = 'test-bus';
    vi.resetModules();
    vi.doMock('@aws-sdk/client-eventbridge', () => ({
      EventBridgeClient: class { send = send; },
      PutEventsCommand: class { constructor(public input: any) {} }
    }));
  });

  it('turns a table change into the typed event every subscriber filters on', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const { handler } = await import('./eventbus/from-dynamo');

    await handler({
      Records: [{ dynamodb: { NewImage: { pk: { S: 'U#user-1' }, sk: { S: 'P' } } } }]
    });

    const [entry] = send.mock.calls[0][0].input.Entries;
    expect(entry).toMatchObject({ EventBusName: 'test-bus', Source: 'DynamoDB', DetailType: 'user-config' });
  });

  it('forwards every record in a full stream batch', async () => {
    send.mockClear();
    const { handler } = await import('./eventbus/from-dynamo');

    await handler({
      Records: Array.from({ length: 10 }, (_, i) => ({
        dynamodb: { NewImage: { pk: { S: `U#user-${i}` }, sk: { S: 'P' } } }
      }))
    });

    expect(send.mock.calls.flatMap(call => call[0].input.Entries)).toHaveLength(10);
  });
});
