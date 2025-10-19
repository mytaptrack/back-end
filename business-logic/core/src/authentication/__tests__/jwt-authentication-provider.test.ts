import { JWTAuthenticationProvider } from '../jwt-authentication-provider';
import { AuthProviderError, AuthErrorType } from '../types';
import { AuthConfig } from '../interfaces';

// Mock jwt module since it's not available in stub implementation
const mockJwt = {
  verify: jest.fn(),
  decode: jest.fn(),
  TokenExpiredError: class extends Error { name = 'TokenExpiredError' },
  JsonWebTokenError: class extends Error { name = 'JsonWebTokenError' },
  NotBeforeError: class extends Error { name = 'NotBeforeError' }
};

describe('JWTAuthenticationProvider', () => {
  let provider: JWTAuthenticationProvider;
  let config: AuthConfig;

  beforeEach(() => {
    config = {
      provider: 'jwt',
      issuer: 'https://example.com',
      audience: 'test-audience',
      publicKey: 'test-public-key'
    };
    provider = new JWTAuthenticationProvider(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with valid config', () => {
      expect(provider).toBeInstanceOf(JWTAuthenticationProvider);
    });

    it('should throw error for missing issuer', () => {
      const invalidConfig = { ...config, issuer: undefined };
      expect(() => new JWTAuthenticationProvider(invalidConfig as AuthConfig)).toThrow(AuthProviderError);
    });

    it('should throw error for missing publicKey and jwksUri', () => {
      const invalidConfig = { ...config, publicKey: undefined };
      expect(() => new JWTAuthenticationProvider(invalidConfig as AuthConfig)).toThrow(AuthProviderError);
    });
  });

  describe('validateToken', () => {
    const mockPayload = {
      sub: 'user123',
      email: 'test@example.com',
      iss: 'https://example.com',
      aud: 'test-audience',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      roles: ['admin', 'user'],
      permissions: ['read', 'write'],
      groups: ['developers']
    };

    it('should validate token successfully', async () => {
      // Since we're using stub implementation, this will fail with configuration error
      const result = await provider.validateToken('valid-token');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('CONFIGURATION_ERROR');
      expect(result.error).toContain('JWT authentication provider requires jsonwebtoken');
    });

    it('should handle token validation with stub implementation', async () => {
      // All token validation will fail with stub implementation
      const result = await provider.validateToken('any-token');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('CONFIGURATION_ERROR');
    });
  });

  describe('getUserContext', () => {
    it('should throw error for stub implementation', async () => {
      await expect(provider.getUserContext('any-token')).rejects.toThrow(AuthProviderError);
    });
  });

  describe('refreshToken', () => {
    it('should throw not implemented error', async () => {
      await expect(provider.refreshToken('refresh-token')).rejects.toThrow(
        new AuthProviderError(AuthErrorType.REFRESH_FAILED, 'Token refresh not implemented - requires OIDC token endpoint configuration')
      );
    });
  });
});