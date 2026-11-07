import jwt from 'jsonwebtoken';
import { quietConsole } from '../testing/unit-kit';

const redis = vi.hoisted(() => ({
  status: 'connecting', store: new Map<string, string>(), fail: false,
  setex: vi.fn(), get: vi.fn(), del: vi.fn(), retry: undefined as any
}));
vi.mock('ioredis', () => ({
  default: class {
    constructor(options: any) { redis.retry = options.retryStrategy; }
    get status() { return redis.status; }
    on() { return this; }
    connect() { return Promise.reject(new Error('offline')); }
    setex(key: string, _: number, value: string) { redis.setex(key); if (redis.fail) { throw new Error('down'); } redis.store.set(key, value); return Promise.resolve(); }
    get(key: string) { if (redis.fail) { throw new Error('down'); } return Promise.resolve(redis.store.get(key) ?? null); }
    del(key: string) { redis.del(key); if (redis.fail) { throw new Error('down'); } redis.store.delete(key); return Promise.resolve(); }
  }
}));

import { AuthManager } from './auth-manager';

quietConsole();
beforeEach(() => {
  redis.status = 'connecting';
  redis.fail = false;
  redis.store.clear();
  redis.setex.mockClear();
  redis.del.mockClear();
});

describe.each([['in memory', 'connecting'], ['in redis', 'ready']])('tokens stored %s', (_, status) => {
  beforeEach(() => { redis.status = status; });

  it('issues a token carrying the user and groups', async () => {
    const { token } = await AuthManager.generateToken('u1', 'e@x', 'N', ['admins']);
    await expect(AuthManager.validateToken(token)).resolves.toMatchObject({ sub: 'u1', email: 'e@x', name: 'N', 'cognito:groups': ['admins'] });
  });

  it('stores a cognito-shaped identity', async () => {
    await AuthManager.generateToken('u1', 'e@x', 'N', ['admins']);
    await expect(AuthManager.getIdentity('u1')).resolves.toMatchObject({
      sub: 'u1', username: 'u1', 'cognito:username': 'u1', groups: ['admins'], cognitoIdentityAuthProvider: null
    });
  });

  it('a newer token replaces the old one', async () => {
    const first = await AuthManager.generateToken('u1', 'e@x');
    await new Promise(resolve => setTimeout(resolve, 1100));
    await AuthManager.generateToken('u1', 'e@x');
    await expect(AuthManager.validateToken(first.token)).resolves.toBeNull();
  });

  it('revoking ends the session', async () => {
    const { token, refreshToken } = await AuthManager.generateToken('u1', 'e@x');
    await AuthManager.revokeToken('u1');
    await expect(AuthManager.validateToken(token)).resolves.toBeNull();
    await expect(AuthManager.refreshToken(refreshToken)).resolves.toBeNull();
    await expect(AuthManager.getIdentity('u1')).resolves.toBeNull();
  });

  it('refreshing preserves the identity flags', async () => {
    const { refreshToken } = await AuthManager.generateToken('u1', 'e@x', 'N', ['g'], true, true);
    const refreshed = await AuthManager.refreshToken(refreshToken);
    await expect(AuthManager.validateToken(refreshed!.token)).resolves.toMatchObject({ sub: 'u1', 'cognito:groups': ['g'] });
    await expect(AuthManager.getIdentity('u1')).resolves.toMatchObject({ accountId: 'local-account', userArn: 'arn:aws:iot:local:device/u1' });
  });
});

describe('token validation', () => {
  it('rejects a forged token', async () => {
    const forged = jwt.sign({ sub: 'u1' }, 'wrong-secret');
    await expect(AuthManager.validateToken(forged)).resolves.toBeNull();
    await expect(AuthManager.refreshToken(forged)).resolves.toBeNull();
  });

  it('rejects a validly signed token it did not issue', async () => {
    const stray = jwt.sign({ sub: 'nobody' }, process.env.JWT_SECRET || 'local-dev-secret');
    await expect(AuthManager.validateToken(stray)).resolves.toBeNull();
    await expect(AuthManager.refreshToken(stray)).resolves.toBeNull();
  });

  it('a rotated refresh token cannot be replayed', async () => {
    const first = await AuthManager.generateToken('u1', 'e@x');
    await new Promise(resolve => setTimeout(resolve, 1100));
    await AuthManager.generateToken('u1', 'e@x');
    await expect(AuthManager.refreshToken(first.refreshToken)).resolves.toBeNull();
  });

  it('a refresh needs the stored identity', async () => {
    redis.status = 'ready';
    const { refreshToken } = await AuthManager.generateToken('u1', 'e@x');
    redis.store.delete('identity:u1');
    await expect(AuthManager.refreshToken(refreshToken)).resolves.toBeNull();
  });

  it('an unreadable identity counts as none', async () => {
    redis.status = 'ready';
    redis.store.set('identity:u1', 'not json');
    await expect(AuthManager.getIdentity('u1')).resolves.toBeNull();
  });
});

describe('redis resilience', () => {
  it('falls back to memory when redis fails mid-session', async () => {
    redis.status = 'ready';
    redis.fail = true;
    const { token } = await AuthManager.generateToken('u1', 'e@x');
    await expect(AuthManager.validateToken(token)).resolves.toMatchObject({ sub: 'u1' });
    await expect(AuthManager.revokeToken('u1')).resolves.toBeUndefined();
    await expect(AuthManager.validateToken(token)).resolves.toBeNull();
  });

  it('expires memory entries', async () => {
    const { token } = await AuthManager.generateToken('u1', 'e@x');
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 9 * 3600 * 1000);
    await expect(AuthManager.getIdentity('u1')).resolves.toBeNull();
    clock.mockRestore();
    expect(token).toBeTruthy();
  });

  it('gives up reconnecting after three tries, with backoff', () => {
    expect(redis.retry(1)).toBe(50);
    expect(redis.retry(3)).toBe(150);
    expect(redis.retry(4)).toBeNull();
  });
});

describe('secret handling', () => {
  // KNOWN BUG (security): the module logs JWT_SECRET at startup. Goes red when fixed.
  it.fails('does not log the signing secret', async () => {
    process.env.JWT_SECRET = 'do-not-log-me';
    vi.resetModules();
    const log = vi.spyOn(console, 'log');
    await import('./auth-manager');
    delete process.env.JWT_SECRET;
    expect(JSON.stringify(log.mock.calls)).not.toContain('do-not-log-me');
  });
});
