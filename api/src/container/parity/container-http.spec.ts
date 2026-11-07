/**
 * Drives every container route over real HTTP with handlers replaced by recorders.
 * Proves the route reaches the handler Lambda would run, and that the Express adapter
 * produces the API Gateway event and honours the response those handlers rely on.
 */
import { join } from 'path';
import { capability } from './gaps';
import { applyMode } from './modes';
import { ContainerRoute, loadContainerRoutes } from './container-manifest';
import { BootedServer, bootServer, mockHandlerModule, stubLocalEnvSetup } from './boot-server';

const API_ROOT = join(__dirname, '../../..');
const JWT_SECRET = 'parity-secret';

const routes = loadContainerRoutes().filter(r => r.codePath);
const calls: { codePath: string; handler: string; event: any; context: any }[] = [];
let failNextCall = false;
const servers: Record<ContainerRoute['server'], BootedServer> = {} as any;

const toRequestPath = (path: string) => `${path}?studentId=student-1&flag=true`;

beforeAll(async () => {
  applyMode('container-local');
  process.env.JWT_SECRET = JWT_SECRET;
  vi.resetModules();
  stubLocalEnvSetup();
  new Set(routes.map(r => r.codePath!)).forEach(codePath => {
    mockHandlerModule(join(API_ROOT, codePath), (handler, event, context) => {
      calls.push({ codePath, handler, event, context });
      if (failNextCall) {
        failNextCall = false;
        return Promise.reject(new Error('handler failed'));
      }
      return Promise.resolve({
        statusCode: 201,
        headers: { 'Content-Type': 'application/json', 'X-Parity': 'yes' },
        body: JSON.stringify({ ok: true })
      });
    });
  });
  servers.rest = await bootServer('rest-api-server.ts');
  servers.device = await bootServer('device-server.ts');
}, 60000);

afterAll(async () => {
  await Promise.all(Object.values(servers).map(s => s.close()));
  delete process.env.JWT_SECRET;
});

beforeEach(() => {
  calls.length = 0;
});

describe.each(routes.map(r => [`${r.server} ${r.method} ${r.path}`, r] as const))('%s', (id, route) => {
  capability(`${id} dispatches to the Lambda handler and maps its response`, async () => {
    const body = ['GET', 'DELETE'].includes(route.method) ? undefined : { studentId: 'student-1' };
    const res = await servers[route.server].request(route.method, toRequestPath(route.path), { body });

    expect(calls).toHaveLength(1);
    expect({ codePath: calls[0].codePath, handler: calls[0].handler })
      .toEqual({ codePath: route.codePath, handler: route.handler });

    expect(res.status).toBe(201);
    expect(res.headers['x-parity']).toBe('yes');
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const { event, context } = calls[0];
    expect(event.httpMethod).toBe(route.method);
    expect(event.path).toBe(route.path);
    expect(event.queryStringParameters).toEqual({ studentId: 'student-1', flag: 'true' });
    expect(event.isBase64Encoded).toBe(false);
    expect(event.requestContext.requestId).toEqual(expect.any(String));
    expect(event.requestContext.requestTime).toEqual(expect.any(String));
    expect(event.requestContext.requestTimeEpoch).toEqual(expect.any(Number));
    expect(context.getRemainingTimeInMillis()).toBeGreaterThan(0);
    if (body) {
      expect(JSON.parse(event.body)).toEqual(body);
    }
  });
});

describe('API Gateway event contract', () => {
  const restRoute = routes.find(r => r.server === 'rest' && r.path === '/api/v2/user' && r.method === 'GET')!;
  const deviceRoute = routes.find(r => r.server === 'device' && r.path === '/time')!;

  async function eventFor(route: ContainerRoute, headers: Record<string, string> = {}) {
    await servers[route.server].request(route.method, route.path, { headers });
    return calls[calls.length - 1].event;
  }

  it('maps a verified bearer token to the Cognito claims the REST handlers read', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign(
      { sub: 'user-1', email: 'u@example.com', name: 'User', 'cognito:groups': ['licenses/abc', 'admins'] },
      JWT_SECRET
    );
    const { requestContext } = await eventFor(restRoute, { authorization: `Bearer ${token}` });

    expect(requestContext.authorizer.claims).toEqual({
      sub: 'user-1',
      'cognito:username': 'user-1',
      email: 'u@example.com',
      name: 'User',
      'cognito:groups': 'licenses/abc,admins'
    });
  });

  // API Gateway rejects these before the Lambda runs; the handlers rely on that.
  capability('a request without a token is rejected, as the Cognito authorizer would', async () => {
    const res = await servers.rest.request(restRoute.method, restRoute.path);
    expect(res.status).toBe(401);
  });

  capability('a token with a bad signature is rejected, as the Cognito authorizer would', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign({ sub: 'attacker' }, 'not-the-secret');
    const res = await servers.rest.request(restRoute.method, restRoute.path, {
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.status).toBe(401);
  });

  // apiWrapperEx enforces its Origin allow-list by reading the canonical header names.
  capability('headers reach handlers under the casing API Gateway forwards', async () => {
    const { headers } = await eventFor(restRoute, { Origin: 'https://evil.example', Referer: 'https://evil.example/x' });
    expect(headers.Origin ?? headers.Referer).toBeDefined();
  });

  it('device routes pass text bodies through untouched, as API Gateway does', async () => {
    await servers.device.request('PUT', '/data', { headers: { 'content-type': 'text/plain' }, rawBody: 'raw-payload' });
    expect(calls[calls.length - 1].event.body).toBe('raw-payload');
  });

  it('a repeated query key keeps the last value as a string, as API Gateway does', async () => {
    await servers.rest.request('GET', '/api/v2/user?tag=a&tag=b');
    expect(calls[calls.length - 1].event.queryStringParameters).toEqual({ tag: 'b' });
  });

  it('device routes have no authorizer, matching the API key auth they use in serverless', async () => {
    const { requestContext } = await eventFor(deviceRoute);
    expect(requestContext.authorizer).toBeUndefined();
    expect(requestContext.identity.sourceIp).toEqual(expect.any(String));
  });

  it('a request with no body gives handlers a null body, as API Gateway does', async () => {
    await servers.rest.request('GET', '/api/v2/user');
    expect(calls[calls.length - 1].event.body).toBeNull();
  });

  it('a handler exception becomes a 500, as API Gateway reports a Lambda failure', async () => {
    failNextCall = true;
    const res = await servers.device.request(deviceRoute.method, deviceRoute.path);
    expect(res.status).toBe(500);
  });
});
