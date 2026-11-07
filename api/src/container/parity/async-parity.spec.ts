/**
 * Serverless capabilities that run off a trigger rather than a request. Each needs an
 * equivalent trigger in the container, or the capability silently never happens there.
 */
import { readFileSync } from 'fs';
import { join, posix } from 'path';
import { capability } from './gaps';
import { LambdaFunction, loadServerlessManifest } from './serverless-manifest';

const REPO_ROOT = join(__dirname, '../../../..');
const manifest = await loadServerlessManifest();

const consumerSource = readFileSync(join(__dirname, '../rabbitmq-consumer.ts'), 'utf8');
const consumed = new Set([...consumerSource.matchAll(/from '(\.\.\/[^']+)'/g)]
  .map(m => `${posix.join('src/container', m[1])}.ts`));

const isTriggered = (fn: LambdaFunction) =>
  fn.props.sqs?.some((s: any) => s.access === 'subscribe')
  || fn.props.events?.some((e: any) => e.access === 'subscribe')
  || fn.props.schedules?.length > 0;

// EventDal publishes track events straight to report-data-queue in container mode, which
// replaces this EventBridge-to-SQS hop. lib/src/v2/dals/mode-parity.spec.ts verifies it.
const REPLACED_IN_CONTAINER = new Set(['ReportQueueManagement']);

const dataPropFunctions = [...readFileSync(join(REPO_ROOT, 'data-prop/lib/aws-stack.ts'), 'utf8')
  .matchAll(/new MttFunction\(context, \{\s*id: '([^']+)',\s*codePath: '([^']+)'/g)]
  .map(m => ({ id: m[1], codePath: m[2] }));

it('discovers the async functions (guards against an empty list passing vacuously)', () => {
  expect(manifest.functions.filter(isTriggered).length).toBeGreaterThan(5);
  expect(dataPropFunctions.length).toBeGreaterThan(10);
});

describe('api functions with an SQS, EventBridge or schedule trigger', () => {
  manifest.functions
    .filter(fn => isTriggered(fn) && !REPLACED_IN_CONTAINER.has(fn.id))
    .forEach(fn => {
      capability(`container triggers ${fn.id}`, () => {
        expect([...consumed]).toContain(fn.codePath.replace(/^\.\//, ''));
      });
    });
});

describe('data-prop functions (DynamoDB stream, EventBridge and Cognito triggers)', () => {
  dataPropFunctions.forEach(fn => {
    capability(`container triggers data-prop ${fn.id}`, () => {
      expect(consumerSource).toContain(fn.codePath.split('/').pop()!.replace('.ts', ''));
    });
  });
});

describe('container event delivery', () => {
  capability('events published to the mytaptrack-events exchange have a consumer', () => {
    expect(consumerSource).toContain('mytaptrack-events');
  });

  it('track events and the consumer use the same queue', () => {
    const publisher = readFileSync(join(REPO_ROOT, 'lib/src/v2/dals/event-dal.ts'), 'utf8');
    const queue = "'report-data-queue'";
    expect(publisher).toContain(queue);
    expect(consumerSource).toContain(queue);
  });
});
