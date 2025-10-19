/**
 * Authentication provider interface for token validation and user context extraction
 */
export interface IAuthenticationProvider {
  /**
   * Validates a token and returns authentication result
   */
  validateToken(token: string): Promise<AuthenticationResult>;
  
  /**
   * Extracts user context from a validated token
   */
  getUserContext(token: string): Promise<UserContext>;
  
  /**
   * Refreshes an access token using a refresh token
   */
  refreshToken(refreshToken: string): Promise<TokenResult>;
}

/**
 * Result of token validation
 */
export interface AuthenticationResult {
  valid: boolean;
  userContext?: UserContext;
  error?: string;
}

/**
 * Standardized user context that normalizes user data across authentication providers
 */
export interface UserContext {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  groups: string[];
  customAttributes: Record<string, any>;
}

/**
 * Token refresh result
 */
export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

/**
 * Authentication configuration for different providers
 */
export interface AuthConfig {
  provider: 'cognito' | 'jwt' | 'oidc';
  
  // Cognito-specific configuration
  userPoolId?: string;
  region?: string;
  clientId?: string;
  
  // JWT/OIDC-specific configuration
  publicKey?: string;
  issuer?: string;
  audience?: string;
  jwksUri?: string;
  algorithms?: string[];
  
  // Common configuration
  tokenValidation?: {
    clockTolerance?: number;
    maxAge?: number;
  };
}