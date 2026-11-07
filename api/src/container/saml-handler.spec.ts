import { quietConsole } from '../testing/unit-kit';

const saml = vi.hoisted(() => ({ validate: vi.fn(), authorize: vi.fn(), config: undefined as any, generateToken: vi.fn() }));
vi.mock('passport-saml', () => ({
  SAML: class {
    constructor(config: unknown) { saml.config = config; }
    validatePostResponseAsync = saml.validate;
    getAuthorizeUrlAsync = saml.authorize;
  }
}));
vi.mock('./auth-manager', () => ({ AuthManager: { generateToken: saml.generateToken } }));

quietConsole();

async function load(cert?: string) {
  if (cert) { process.env.SAML_CERT = cert; } else { delete process.env.SAML_CERT; }
  vi.resetModules();
  return (await import('./saml-handler')).SAMLHandler;
}

beforeEach(() => {
  saml.validate.mockReset();
  saml.authorize.mockReset();
  saml.generateToken.mockReset().mockResolvedValue({ token: 't', refreshToken: 'r' });
});
afterAll(() => { delete process.env.SAML_CERT; });

describe('without a certificate', () => {
  it('disables SAML', async () => {
    const handler = await load();
    await expect(handler.validateAndGenerateToken('x')).resolves.toBeNull();
    await expect(handler.getLoginUrl()).resolves.toBe('/auth/saml/callback');
    await expect(handler.getLogoutUrl('n')).resolves.toBe('/');
    expect(saml.validate).not.toHaveBeenCalled();
  });
});

describe('with a certificate', () => {
  it('configures the identity provider', async () => {
    await load('cert');
    expect(saml.config).toMatchObject({ cert: 'cert', issuer: 'mytaptrack-local', acceptedClockSkewMs: 5000 });
  });

  it('issues tokens for a full profile', async () => {
    const handler = await load('cert');
    saml.validate.mockResolvedValue({ nameID: 'u1', email: 'e@x', firstName: 'F', lastName: 'L', displayName: 'Dee', groups: ['g'] });
    await expect(handler.validateAndGenerateToken('resp')).resolves.toEqual({
      token: 't', refreshToken: 'r', user: { userId: 'u1', email: 'e@x', name: 'Dee', firstName: 'F', lastName: 'L' }
    });
    expect(saml.validate).toHaveBeenCalledWith({ SAMLResponse: 'resp' });
    expect(saml.generateToken).toHaveBeenCalledWith('u1', 'e@x', 'Dee', ['g']);
  });

  it('falls back through alternate attributes', async () => {
    const handler = await load('cert');
    saml.validate.mockResolvedValue({ nameID: 'u@x', givenName: 'F', surname: 'L', 'cognito:groups': ['c'] });
    await expect(handler.validateAndGenerateToken('resp')).resolves.toMatchObject({ user: { email: 'u@x', name: 'F L' } });
    expect(saml.generateToken).toHaveBeenCalledWith('u@x', 'u@x', 'F L', ['c']);
  });

  it('names a bare profile by email', async () => {
    const handler = await load('cert');
    saml.validate.mockResolvedValue({ nameID: 'u@x' });
    await expect(handler.validateAndGenerateToken('resp')).resolves.toMatchObject({ user: { name: 'u@x' } });
  });

  it.each([['an empty profile', async () => null], ['a profile with no id', async () => ({ email: 'x' })], ['a rejected assertion', async () => { throw new Error('bad'); }]])('refuses %s', async (_, validate) => {
    const handler = await load('cert');
    saml.validate.mockImplementation(validate);
    await expect(handler.validateAndGenerateToken('resp')).resolves.toBeNull();
    expect(saml.generateToken).not.toHaveBeenCalled();
  });

  it('builds a login url', async () => {
    const handler = await load('cert');
    saml.authorize.mockResolvedValue('https://idp/login');
    await expect(handler.getLoginUrl()).resolves.toBe('https://idp/login');
    await expect(handler.getLogoutUrl('n')).resolves.toBe('/');
  });
});
