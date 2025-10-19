import { AuthProviderFactory } from '../auth-provider-factory';
import { CognitoAuthenticationProvider } from '../cognito-authentication-provider';
import { JWTAuthenticationProvider } from '../jwt-authentication-provider';
import { AuthProviderError, AuthErrorType } from '../types';
import { AuthConfig } from '../interfaces';

describe('AuthProviderFactory', () => {
  describe('create', () => {
    it('should create CognitoAuthenticationProvider for cognito provider', () => {
      const config: AuthConfig = {
        provider: 'cognito',
        userPoolId: 'us-east-1_test123',
        region: 'us-east-1'
      };

      const provider = AuthProviderFactory.create(config);
      expect(provider).toBeInstanceOf(CognitoAuthenticationProvider);
    });

    it('should create JWTAuthenticationProvider for jwt provider', () => {
      const config: AuthConfig = {
        provider: 'jwt',
        issuer: 'https://example.com',
        publicKey: 'test-key'
      };

      const provider = AuthProviderFactory.create(config);
      expect(provider).toBeInstanceOf(JWTAuthenticationProvider);
    });

    it('should create JWTAuthenticationProvider for oidc provider', () => {
      const config: AuthConfig = {
        provider: 'oidc',
        issuer: 'https://example.com',
        jwksUri: 'https://example.com/.well-known/jwks.json'
      };

      const provider = AuthProviderFactory.create(config);
      expect(provider).toBeInstanceOf(JWTAuthenticationProvider);
    });

    it('should throw error for unsupported provider', () => {
      const config = {
        provider: 'unsupported'
      } as any;

      expect(() => AuthProviderFactory.create(config)).toThrow(AuthProviderError);
    });
  });

  describe('createForAWS', () => {
    it('should create cognito provider with default provider', () => {
      const config = {
        userPoolId: 'us-east-1_test123',
        region: 'us-east-1'
      };

      const provider = AuthProviderFactory.createForAWS(config);
      expect(provider).toBeInstanceOf(CognitoAuthenticationProvider);
    });
  });

  describe('createForDocker', () => {
    it('should create JWT provider with default provider', () => {
      const config = {
        issuer: 'https://example.com',
        publicKey: 'test-key'
      };

      const provider = AuthProviderFactory.createForDocker(config);
      expect(provider).toBeInstanceOf(JWTAuthenticationProvider);
    });
  });

  describe('validateConfig', () => {
    it('should validate cognito config successfully', () => {
      const config: AuthConfig = {
        provider: 'cognito',
        userPoolId: 'us-east-1_test123',
        region: 'us-east-1'
      };

      expect(() => AuthProviderFactory.validateConfig(config)).not.toThrow();
    });

    it('should validate JWT config successfully', () => {
      const config: AuthConfig = {
        provider: 'jwt',
        issuer: 'https://example.com',
        publicKey: 'test-key'
      };

      expect(() => AuthProviderFactory.validateConfig(config)).not.toThrow();
    });

    it('should throw error for missing provider', () => {
      const config = {} as AuthConfig;

      expect(() => AuthProviderFactory.validateConfig(config)).toThrow(
        new AuthProviderError(AuthErrorType.CONFIGURATION_ERROR, 'Authentication provider is required')
      );
    });

    it('should throw error for cognito config missing userPoolId', () => {
      const config: AuthConfig = {
        provider: 'cognito',
        region: 'us-east-1'
      };

      expect(() => AuthProviderFactory.validateConfig(config)).toThrow(
        new AuthProviderError(AuthErrorType.CONFIGURATION_ERROR, 'Cognito configuration requires userPoolId')
      );
    });

    it('should throw error for JWT config missing issuer', () => {
      const config: AuthConfig = {
        provider: 'jwt',
        publicKey: 'test-key'
      };

      expect(() => AuthProviderFactory.validateConfig(config)).toThrow(
        new AuthProviderError(AuthErrorType.CONFIGURATION_ERROR, 'JWT configuration requires issuer')
      );
    });
  });
});