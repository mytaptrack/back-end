import { AuthProviderFactory } from '../auth-provider-factory';
import { AuthProviderError, AuthErrorType } from '../types';

describe('Authentication Abstraction Layer', () => {
  describe('AuthProviderFactory', () => {
    it('should throw error for unsupported provider', () => {
      const config = {
        provider: 'unsupported'
      } as any;

      expect(() => AuthProviderFactory.create(config)).toThrow(AuthProviderError);
    });

    it('should validate configuration correctly', () => {
      expect(() => AuthProviderFactory.validateConfig({} as any)).toThrow(
        expect.objectContaining({
          type: AuthErrorType.CONFIGURATION_ERROR,
          message: 'Authentication provider is required'
        })
      );
    });
  });

  describe('AuthProviderError', () => {
    it('should create error with correct properties', () => {
      const error = new AuthProviderError(
        AuthErrorType.INVALID_TOKEN,
        'Test error message'
      );

      expect(error.type).toBe(AuthErrorType.INVALID_TOKEN);
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('AuthProviderError');
    });
  });
});