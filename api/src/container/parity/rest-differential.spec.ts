/**
 * Differential test with the real handlers. The same request goes to the Lambda handler
 * with a genuine API Gateway event (serverless) and through the Express server
 * (container), with both AWS SDK stacks stubbed to the same empty responses. The two
 * must agree on status and body. With an empty backend most routes stop at validation
 * or a not-found, so this proves the adapters are equivalent; it does not exercise
 * business logic against real data, which is what system-tests is for.
 */
import { join } from 'path';
import { capability } from './gaps';
import { applyMode, RuntimeMode } from './modes';
import { loadContainerRoutes } from './container-manifest';
import { BootedServer, bootServer, stubLocalEnvSetup } from './boot-server';
import { loadServerlessManifest, RestRoute } from './serverless-manifest';
import { mockNativeModule } from '@mytaptrack/lib/dist/v2/testing/native-module-mock';

const API_ROOT = join(__dirname, '../../..');
const JWT_SECRET = 'parity-secret';
const USER = { sub: 'user-1', email: 'u@example.com', name: 'User' };
const STUDENT = '00000000-0000-0000-0000-000000000001';

const containerRoutes = new Set(loadContainerRoutes().map(r => `${r.method} ${r.path}`));
const routes = (await loadServerlessManifest()).restRoutes.filter(r => r.path.startsWith('/api/') && containerRoutes.has(`${r.method} ${r.path}`));

const bodyFor = (route: RestRoute) => ['GET', 'DELETE'].includes(route.method) ? undefined : { studentId: STUDENT };
const queryFor = () => ({ studentId: STUDENT });

/** Stubs network IO at the SDK and fetch seams, for every SDK copy in the workspace. */
function stubBackends() {
  const roots = [API_ROOT, join(API_ROOT, '../lib')];
  roots.forEach(root => {
    try {
      const smithy = require(require.resolve('@smithy/smithy-client', { paths: [root] }));
      vi.spyOn(smithy.Client.prototype, 'send').mockImplementation(async () => ({ Items: [], Count: 0 }));
    } catch { /* this root has no separate copy */ }
  });
  const channel = {
    assertQueue: vi.fn(), assertExchange: vi.fn(), sendToQueue: vi.fn(), publish: vi.fn(), close: vi.fn()
  };
  const connect = vi.fn(async () => ({ createChannel: async () => channel, close: vi.fn() }));
  vi.doMock('amqplib', () => ({ default: { connect }, connect }));
  // EventDal and queue-management load amqplib lazily with require(); see mockNativeModule.
  roots.forEach(root => mockNativeModule('amqplib', { connect }, root));
  vi.doMock('node-fetch', () => ({
    default: vi.fn(async () => new Response(JSON.stringify({ data: {} }), {
      status: 200, headers: { 'content-type': 'application/json' }
    }))
  }));
}

const TIMED_OUT = -1;
const withTimeout = <T>(work: Promise<T>, fallback: T) => {
  let timer: NodeJS.Timeout;
  return Promise.race([
    work,
    new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), 3000); })
  ]).finally(() => clearTimeout(timer));
};

function loadIn(mode: RuntimeMode) {
  applyMode(mode);
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.appsyncUrl = 'http://appsync.test/graphql';
  vi.resetModules();
  vi.restoreAllMocks();
  stubBackends();
}

interface Outcome { status: number; body?: string }
const lambdaOutcomes = new Map<string, Outcome>();
const containerOutcomes = new Map<string, Outcome>();

beforeAll(async () => {
  (['log', 'info', 'debug', 'warn', 'error'] as const).forEach(level => { console[level] = () => undefined; });

  loadIn('serverless');
  for (const route of routes) {
    const body = bodyFor(route);
    const event = {
      httpMethod: route.method,
      path: route.path,
      resource: route.path,
      body: body ? JSON.stringify(body) : null,
      isBase64Encoded: false,
      // API Gateway forwards header names as the client sent them.
      headers: { 'Content-Type': 'application/json', Authorization: 'token' },
      multiValueHeaders: {},
      pathParameters: null,
      queryStringParameters: queryFor(),
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        stage: 'prod',
        requestId: 'parity',
        authorizer: { claims: { ...USER, 'cognito:username': USER.sub, 'cognito:groups': '' } }
      }
    };
    try {
      const handler = (await import(/* @vite-ignore */ join(API_ROOT, route.codePath)))[route.handler];
      const result = await withTimeout<any>(
        handler(event, { getRemainingTimeInMillis: () => 30000 }, () => undefined),
        { statusCode: TIMED_OUT }
      );
      lambdaOutcomes.set(`${route.method} ${route.path}`, {
        status: Number(result?.statusCode ?? 200),
        body: result?.body
      });
    } catch {
      lambdaOutcomes.set(`${route.method} ${route.path}`, { status: 500 });
    }
  }

  loadIn('container-local');
  stubLocalEnvSetup();
  const server: BootedServer = await bootServer('rest-api-server.ts');
  const { default: jwt } = await import('jsonwebtoken');
  const token = jwt.sign(USER, JWT_SECRET);
  for (const route of routes) {
    const query = new URLSearchParams(queryFor()).toString();
    const res = await withTimeout<{ status: number; body?: string }>(server.request(route.method, `${route.path}?${query}`, {
      body: bodyFor(route),
      headers: { authorization: `Bearer ${token}` }
    }), { status: TIMED_OUT });
    containerOutcomes.set(`${route.method} ${route.path}`, { status: res.status, body: res.body });
  }
  // Not awaited: close() waits on sockets held open by any handler that timed out.
  server.close();
}, 300000);

afterAll(() => { delete process.env.JWT_SECRET; delete process.env.appsyncUrl; });

it('exercises the REST surface (guards against an empty route list passing vacuously)', () => {
  expect(routes.length).toBeGreaterThan(50);
  expect(lambdaOutcomes.size).toBe(new Set(routes.map(r => `${r.method} ${r.path}`)).size);
});

describe('Lambda and container agree', () => {
  routes.forEach(route => {
    const id = `${route.method} ${route.path}`;
    capability(`${id} returns the same response in both modes`, () => {
      const lambda = lambdaOutcomes.get(id)!;
      const container = containerOutcomes.get(id)!;
      expect(lambda.status).not.toBe(TIMED_OUT);
      expect(container.status).toBe(lambda.status);
      // An escaped exception has no Lambda body to compare; API Gateway generates its own.
      if (lambda.body !== undefined) {
        expect(container.body).toBe(lambda.body);
      }
    });
  });
});
