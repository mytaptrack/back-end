/**
 * The auth endpoints and middleware, through the real Express servers and the real AuthManager.
 * Only redis, the infrastructure bootstrap and SAML assertion checking are replaced.
 */
import { join } from 'path';
import { BootedServer, bootServer, stubLocalEnvSetup } from './parity/boot-server';
import { quietConsole } from '../testing/unit-kit';

vi.mock('ioredis', () => ({
  default: class {
    status = 'connecting';
    on() { return this; }
    connect() { return Promise.reject(new Error('offline')); }
  }
}));

const saml = vi.hoisted(() => ({ validate: vi.fn(), login: vi.fn() }));
const samlPath = join(__dirname, 'saml-handler.ts');

quietConsole();

const saved = { ...process.env };
afterAll(() => { process.env = { ...saved }; });

const json = (result: { body: string }) => JSON.parse(result.body);
const post = (server: BootedServer, path: string, body?: unknown, token?: string) =>
  server.request('POST', path, { body, headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('rest-api-server auth routes', () => {
  let server: BootedServer;

  beforeAll(async () => {
    vi.resetModules();
    stubLocalEnvSetup();
    vi.doMock(samlPath, () => ({ SAMLHandler: { getLoginUrl: saml.login, validateAndGenerateToken: saml.validate } }));
    server = await bootServer('rest-api-server.ts');
  });
  afterAll(async () => {
    await server.close();
    vi.doUnmock(samlPath);
  });
  beforeEach(() => {
    saml.validate.mockReset();
    saml.login.mockReset();
    delete process.env.USE_LOCAL;
    delete process.env.NODE_ENV;
  });

  describe('/auth/saml/login', () => {
    it('redirects to the identity provider', async () => {
      saml.login.mockResolvedValue('https://idp/login');
      const res = await server.request('GET', '/auth/saml/login');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://idp/login');
    });

    it('reports a failure', async () => {
      saml.login.mockRejectedValue(new Error('idp down'));
      const res = await server.request('GET', '/auth/saml/login');
      expect(res.status).toBe(500);
      expect(json(res)).toEqual({ error: 'Failed to initiate SAML login' });
    });
  });

  describe('/auth/saml/callback', () => {
    it('needs a response', async () => {
      expect((await post(server, '/auth/saml/callback', {})).status).toBe(400);
    });

    it('returns tokens for a valid assertion', async () => {
      saml.validate.mockResolvedValue({ token: 't', refreshToken: 'r', user: { userId: 'u1' } });
      const res = await post(server, '/auth/saml/callback', { SAMLResponse: 'x' });
      expect(json(res)).toEqual({ success: true, token: 't', refreshToken: 'r', expiresIn: 28800, user: { userId: 'u1' } });
    });

    it('refuses a bad assertion outside local mode', async () => {
      saml.validate.mockResolvedValue(null);
      const res = await post(server, '/auth/saml/callback', { SAMLResponse: 'x', userId: 'attacker' });
      expect(res.status).toBe(401);
    });

    it.each([['USE_LOCAL', 'true'], ['NODE_ENV', 'development']])('%s allows a test login', async (key, value) => {
      process.env[key] = value;
      saml.validate.mockResolvedValue(null);
      const res = await post(server, '/auth/saml/callback', { SAMLResponse: 'x', userId: 'dev', email: 'd@x', name: 'Dev' });
      expect(json(res)).toMatchObject({ success: true, user: { userId: 'dev', email: 'd@x', name: 'Dev' } });
    });

    it('reports a failure', async () => {
      saml.validate.mockRejectedValue(new Error('boom'));
      const res = await post(server, '/auth/saml/callback', { SAMLResponse: 'x' });
      expect(res.status).toBe(500);
      expect(json(res)).toEqual({ error: 'Authentication failed' });
    });
  });

  describe('session lifecycle', () => {
    async function login() {
      process.env.USE_LOCAL = 'true';
      saml.validate.mockResolvedValue(null);
      const { token, refreshToken } = json(await post(server, '/auth/saml/callback', { SAMLResponse: 'x', userId: `u-${Math.random()}`, email: 'e@x', name: 'N' }));
      delete process.env.USE_LOCAL;
      return { token, refreshToken };
    }

    it('validates a live token', async () => {
      const { token } = await login();
      const res = await post(server, '/auth/token/validate', undefined, token);
      expect(json(res)).toMatchObject({ valid: true, user: { email: 'e@x', name: 'N' } });
    });

    it('rejects a missing or bad token', async () => {
      expect((await post(server, '/auth/token/validate')).status).toBe(400);
      expect((await post(server, '/auth/token/validate', undefined, 'garbage')).status).toBe(401);
    });

    it('refreshes', async () => {
      const { refreshToken } = await login();
      const res = await post(server, '/auth/token/refresh', { refreshToken });
      expect(json(res)).toMatchObject({ success: true, expiresIn: 28800 });
    });

    it('rejects a missing or bad refresh token', async () => {
      expect((await post(server, '/auth/token/refresh', {})).status).toBe(400);
      expect((await post(server, '/auth/token/refresh', { refreshToken: 'garbage' })).status).toBe(401);
    });

    it('logging out ends the session', async () => {
      const { token } = await login();
      await expect(post(server, '/auth/logout', undefined, token).then(json)).resolves.toMatchObject({ success: true });
      expect((await post(server, '/auth/token/validate', undefined, token)).status).toBe(401);
    });

    it('logging out without a session is harmless', async () => {
      expect((await post(server, '/auth/logout')).status).toBe(200);
      expect((await post(server, '/auth/logout', undefined, 'garbage')).status).toBe(200);
    });
  });

  it('reports health and unknown paths', async () => {
    expect(json(await server.request('GET', '/health'))).toEqual({ status: 'ok', service: 'rest-api' });
    const res = await server.request('GET', '/nowhere');
    expect(res.status).toBe(404);
    expect(json(res)).toEqual({ error: 'Not Found', path: '/nowhere', method: 'GET' });
  });
});

describe('graphql-server', () => {
  let server: BootedServer;
  const query = (body: string, headers: Record<string, string> = {}) => server.request('POST', '/graphql', { body: { query: body }, headers });

  beforeAll(async () => {
    process.env.USE_LOCAL = 'true';
    vi.resetModules();
    stubLocalEnvSetup();
    server = await bootServer('graphql-server.ts');
  });
  afterAll(async () => {
    await server.close();
    delete process.env.USE_LOCAL;
  });

  it('answers with no credentials', async () => {
    expect(json(await query('{ __typename }'))).toEqual({ data: { __typename: 'Query' } });
  });

  it('carries on past a bad token', async () => {
    expect(json(await query('{ __typename }', { authorization: 'Bearer garbage' }))).toEqual({ data: { __typename: 'Query' } });
    expect(json(await query('{ __typename }', { authorization: 'garbage' }))).toEqual({ data: { __typename: 'Query' } });
  });

  it('accepts a real token, bearer or raw', async () => {
    const { AuthManager } = await import('./auth-manager');
    const { token } = await AuthManager.generateToken('gql-user', 'e@x');
    for (const authorization of [`Bearer ${token}`, token]) {
      expect((await query('{ __typename }', { authorization })).status).toBe(200);
    }
  });

  it('warns when a valid token has no identity', async () => {
    const { AuthManager } = await import('./auth-manager');
    const { token } = await AuthManager.generateToken('no-identity', 'e@x');
    const getIdentity = vi.spyOn(AuthManager, 'getIdentity').mockResolvedValue(null);
    expect((await query('{ __typename }', { authorization: token })).status).toBe(200);
    expect(getIdentity).toHaveBeenCalled();
  });

  // KNOWN BUG: the schema declares studentDataChange non-null, so the local stub's null is a
  // GraphQL error rather than the graceful skip its comment describes. Goes red when fixed.
  it.fails('the studentDataChange stub resolves without error', async () => {
    const res = json(await query('mutation { studentDataChange(input: { studentId: "s", userId: "u", dateEpoc: 1 }) { studentId } }'));
    expect(res.errors).toBeUndefined();
  });

  it('reports a query it cannot parse', async () => {
    const res = await query('{ nope ');
    expect(res.status).toBe(400);
    expect(json(res).errors).toHaveLength(1);
  });
});

describe('graphql-server startup failure', () => {
  it('exits rather than serving half-configured', async () => {
    vi.resetModules();
    vi.doMock(join(__dirname, 'local-env-setup.ts'), () => ({
      validateDynamoDB: vi.fn().mockRejectedValue(new Error('no db')),
      initRabbitMQ: vi.fn(), docClient: {}, rabbitChannel: {}
    }));
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    await import('./graphql-server');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    vi.doUnmock(join(__dirname, 'local-env-setup.ts'));
  });
});
