/**
 * JWT token payload structure
 */
export interface JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  jti?: string;
  
  // Cognito-specific claims
  'cognito:username'?: string;
  'cognito:groups'?: string[];
  'custom:roles'?: string;
  'custom:permissions'?: string;
  
  // Generic claims
  roles?: string | string[];
  permissions?: string | string[];
  groups?: string | string[];
  
  // Custom attributes
  [key: string]: any;
}

/**
 * Cognito user attributes structure
 */
export interface CognitoUserAttributes {
  sub: string;
  email: string;
  email_verified: boolean;
  'cognito:username': string;
  'cognito:groups'?: string[];
  'custom:roles'?: string;
  'custom:permissions'?: string;
  [key: string]: any;
}

/**
 * OIDC user info structure
 */
export interface OIDCUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  roles?: string[];
  groups?: string[];
  [key: string]: any;
}

/**
 * Authentication error types
 */
export enum AuthErrorType {
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  MALFORMED_TOKEN = 'MALFORMED_TOKEN',
  INVALID_ISSUER = 'INVALID_ISSUER',
  INVALID_AUDIENCE = 'INVALID_AUDIENCE',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  REFRESH_FAILED = 'REFRESH_FAILED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

/**
 * Authentication provider error class
 */
export class AuthProviderError extends Error {
  constructor(
    public readonly type: AuthErrorType,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AuthProviderError';
  }
}