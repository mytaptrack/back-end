/**
 * Example usage of the Authentication Abstraction Layer
 * 
 * This example demonstrates how to use the authentication providers
 * in both AWS and Docker environments.
 */

import { 
  AuthProviderFactory, 
  AuthConfig, 
  IAuthenticationProvider,
  UserContext,
  AuthProviderError,
  AuthErrorType
} from '../authentication';

/**
 * Example: Creating authentication providers for different environments
 */
export async function createAuthenticationProviders() {
  // AWS Cognito configuration
  const awsConfig: AuthConfig = {
    provider: 'cognito',
    userPoolId: 'us-east-1_ABC123DEF',
    region: 'us-east-1',
    clientId: 'your-cognito-client-id'
  };

  // Docker JWT configuration with static public key
  const dockerJWTConfig: AuthConfig = {
    provider: 'jwt',
    issuer: 'https://your-auth-server.com',
    audience: 'your-api-audience',
    publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----`
  };

  // Docker OIDC configuration with JWKS endpoint
  const dockerOIDCConfig: AuthConfig = {
    provider: 'oidc',
    issuer: 'https://auth.example.com',
    audience: 'your-api',
    jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    algorithms: ['RS256']
  };

  // Create providers using factory
  const awsProvider = AuthProviderFactory.create(awsConfig);
  const jwtProvider = AuthProviderFactory.create(dockerJWTConfig);
  const oidcProvider = AuthProviderFactory.create(dockerOIDCConfig);

  // Or use environment-specific factory methods
  const awsProviderAlt = AuthProviderFactory.createForAWS({
    userPoolId: 'us-east-1_ABC123DEF',
    region: 'us-east-1'
  });

  const dockerProviderAlt = AuthProviderFactory.createForDocker({
    issuer: 'https://auth.example.com',
    publicKey: 'your-public-key'
  });

  return {
    aws: awsProvider,
    jwt: jwtProvider,
    oidc: oidcProvider
  };
}

/**
 * Example: Token validation and user context extraction
 */
export async function validateTokenExample(
  provider: IAuthenticationProvider,
  token: string
): Promise<UserContext | null> {
  try {
    // Method 1: Validate token and get result
    const validationResult = await provider.validateToken(token);
    
    if (validationResult.valid && validationResult.userContext) {
      console.log('Token is valid');
      console.log('User ID:', validationResult.userContext.userId);
      console.log('Email:', validationResult.userContext.email);
      console.log('Roles:', validationResult.userContext.roles);
      console.log('Permissions:', validationResult.userContext.permissions);
      console.log('Groups:', validationResult.userContext.groups);
      
      return validationResult.userContext;
    } else {
      console.error('Token validation failed:', validationResult.error);
      return null;
    }
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
}

/**
 * Example: Direct user context extraction (throws on invalid token)
 */
export async function getUserContextExample(
  provider: IAuthenticationProvider,
  token: string
): Promise<UserContext | null> {
  try {
    // Method 2: Direct user context extraction (throws on failure)
    const userContext = await provider.getUserContext(token);
    
    console.log('Successfully extracted user context:');
    console.log('- User ID:', userContext.userId);
    console.log('- Email:', userContext.email);
    console.log('- Roles:', userContext.roles.join(', '));
    console.log('- Permissions:', userContext.permissions.join(', '));
    console.log('- Groups:', userContext.groups.join(', '));
    
    // Access custom attributes
    if (Object.keys(userContext.customAttributes).length > 0) {
      console.log('- Custom Attributes:', userContext.customAttributes);
    }
    
    return userContext;
  } catch (error) {
    if (error instanceof AuthProviderError) {
      console.error(`Authentication error (${error.type}):`, error.message);
      
      // Handle specific error types
      switch (error.type) {
        case AuthErrorType.EXPIRED_TOKEN:
          console.log('Token has expired, redirect to login');
          break;
        case AuthErrorType.INVALID_TOKEN:
          console.log('Token is invalid, clear session');
          break;
        case AuthErrorType.CONFIGURATION_ERROR:
          console.log('Authentication configuration issue');
          break;
        default:
          console.log('Other authentication error');
      }
    } else {
      console.error('Unexpected error:', error);
    }
    
    return null;
  }
}

/**
 * Example: Environment-based provider selection
 */
export function createProviderForEnvironment(): IAuthenticationProvider {
  const environment = process.env.DEPLOYMENT_TYPE || 'docker';
  
  if (environment === 'aws') {
    return AuthProviderFactory.createForAWS({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      region: process.env.AWS_REGION!,
      clientId: process.env.COGNITO_CLIENT_ID
    });
  } else {
    return AuthProviderFactory.createForDocker({
      issuer: process.env.JWT_ISSUER!,
      audience: process.env.JWT_AUDIENCE,
      publicKey: process.env.JWT_PUBLIC_KEY,
      jwksUri: process.env.JWKS_URI
    });
  }
}

/**
 * Example: Configuration validation
 */
export function validateAuthConfiguration(config: AuthConfig): boolean {
  try {
    AuthProviderFactory.validateConfig(config);
    console.log('Authentication configuration is valid');
    return true;
  } catch (error) {
    if (error instanceof AuthProviderError) {
      console.error('Configuration validation failed:', error.message);
    } else {
      console.error('Unexpected validation error:', error);
    }
    return false;
  }
}

/**
 * Example: Complete authentication workflow
 */
export async function completeAuthenticationWorkflow() {
  console.log('=== Authentication Abstraction Layer Example ===\n');
  
  // 1. Create providers for different environments
  console.log('1. Creating authentication providers...');
  const providers = await createAuthenticationProviders();
  console.log('✓ Providers created\n');
  
  // 2. Validate configuration
  console.log('2. Validating configurations...');
  const configs: AuthConfig[] = [
    {
      provider: 'cognito',
      userPoolId: 'us-east-1_ABC123',
      region: 'us-east-1'
    },
    {
      provider: 'jwt',
      issuer: 'https://example.com',
      publicKey: 'test-key'
    }
  ];
  
  configs.forEach((config, index) => {
    const isValid = validateAuthConfiguration(config);
    console.log(`   Config ${index + 1}: ${isValid ? '✓ Valid' : '✗ Invalid'}`);
  });
  console.log();
  
  // 3. Demonstrate token validation (with mock tokens)
  console.log('3. Token validation examples...');
  console.log('   Note: These are stub implementations - full functionality requires external dependencies');
  
  const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Mock JWT token
  
  // Try validation with each provider (will fail with stub implementations)
  for (const [name, provider] of Object.entries(providers)) {
    console.log(`   Testing ${name} provider:`);
    const result = await validateTokenExample(provider, mockToken);
    console.log(`   Result: ${result ? 'Success' : 'Failed (expected with stub implementation)'}`);
  }
  
  console.log('\n=== Example Complete ===');
}

// Export for use in other modules
export {
  AuthProviderFactory,
  AuthConfig,
  IAuthenticationProvider,
  UserContext,
  AuthProviderError,
  AuthErrorType
};