import { IAuthenticationProvider, AuthConfig } from './interfaces';
import { CognitoAuthenticationProvider } from './cognito-authentication-provider';
import { JWTAuthenticationProvider } from './jwt-authentication-provider';
import { AuthProviderError, AuthErrorType } from './types';

/**
 * Factory that selects appropriate authentication implementation based on environment configuration
 */
export class AuthProviderFactory {
  /**
   * Creates an authentication provider based on configuration
   */
  static create(config: AuthConfig): IAuthenticationProvider {
    switch (config.provider) {
      case 'cognito':
        return new CognitoAuthenticationProvider(config);
      
      case 'jwt':
      case 'oidc':
        return new JWTAuthenticationProvider(config);
      
      default:
        throw new AuthProviderError(
          AuthErrorType.CONFIGURATION_ERROR,
          `Unsupported authentication provider: ${config.provider}`
        );
    }
  }

  /**
   * Creates an authentication provider for AWS environment
   */
  static createForAWS(config: Partial<AuthConfig>): IAuthenticationProvider {
    const awsConfig: AuthConfig = {
      provider: 'cognito',
      ...config
    };
    
    return this.create(awsConfig);
  }

  /**
   * Creates an authentication provider for Docker environment
   */
  static createForDocker(config: Partial<AuthConfig>): IAuthenticationProvider {
    const dockerConfig: AuthConfig = {
      provider: 'jwt',
      ...config
    };
    
    return this.create(dockerConfig);
  }

  /**
   * Validates authentication configuration
   */
  static validateConfig(config: AuthConfig): void {
    if (!config.provider) {
      throw new AuthProviderError(
        AuthErrorType.CONFIGURATION_ERROR,
        'Authentication provider is required'
      );
    }

    switch (config.provider) {
      case 'cognito':
        this.validateCognitoConfig(config);
        break;
      
      case 'jwt':
      case 'oidc':
        this.validateJWTConfig(config);
        break;
      
      default:
        throw new AuthProviderError(
          AuthErrorType.CONFIGURATION_ERROR,
          `Unsupported authentication provider: ${config.provider}`
        );
    }
  }

  /**
   * Validates Cognito-specific configuration
   */
  private static validateCognitoConfig(config: AuthConfig): void {
    if (!config.userPoolId) {
      throw new AuthProviderError(
        AuthErrorType.CONFIGURATION_ERROR,
        'Cognito configuration requires userPoolId'
      );
    }

    if (!config.region) {
      throw new AuthProviderError(
        AuthErrorType.CONFIGURATION_ERROR,
        'Cognito configuration requires region'
      );
    }
  }

  /**
   * Validates JWT/OIDC-specific configuration
   */
  private static validateJWTConfig(config: AuthConfig): void {
    if (!config.issuer) {
      throw new AuthProviderError(
        AuthErrorType.CONFIGURATION_ERROR,
        'JWT configuration requires issuer'
      );
    }

    if (!config.publicKey && !config.jwksUri) {
      throw new AuthProviderError(
        AuthErrorType.CONFIGURATION_ERROR,
        'JWT configuration requires either publicKey or jwksUri'
      );
    }

    if (config.algorithms && config.algorithms.length === 0) {
      throw new AuthProviderError(
        AuthErrorType.CONFIGURATION_ERROR,
        'JWT configuration algorithms cannot be empty if specified'
      );
    }
  }
}