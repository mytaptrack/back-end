# Authentication Abstraction Layer

This module provides a unified authentication interface that works with both AWS Cognito (for AWS deployments) and generic JWT/OIDC providers (for Docker deployments).

## Features

- **Unified Interface**: Single `IAuthenticationProvider` interface for all authentication providers
- **Environment-Specific Implementations**: 
  - `CognitoAuthenticationProvider` for AWS deployments
  - `JWTAuthenticationProvider` for Docker deployments with JWT/OIDC
- **Factory Pattern**: `AuthProviderFactory` automatically selects the correct implementation
- **Standardized User Context**: Normalized user data across different authentication systems
- **Comprehensive Error Handling**: Detailed error types and messages

## Usage

### Basic Usage with Factory

```typescript
import { AuthProviderFactory, AuthConfig } from '@mytaptrack/business-logic-core';

// AWS Cognito configuration
const awsConfig: AuthConfig = {
  provider: 'cognito',
  userPoolId: 'us-east-1_ABC123',
  region: 'us-east-1',
  clientId: 'your-client-id'
};

// Docker JWT configuration
const dockerConfig: AuthConfig = {
  provider: 'jwt',
  issuer: 'https://your-auth-server.com',
  audience: 'your-api',
  publicKey: 'your-public-key'
};

// Create provider based on environment
const authProvider = AuthProviderFactory.create(
  process.env.DEPLOYMENT_TYPE === 'aws' ? awsConfig : dockerConfig
);

// Validate a token
const result = await authProvider.validateToken(token);
if (result.valid) {
  console.log('User:', result.userContext);
} else {
  console.error('Authentication failed:', result.error);
}
```

### Environment-Specific Factory Methods

```typescript
// For AWS environments
const awsProvider = AuthProviderFactory.createForAWS({
  userPoolId: 'us-east-1_ABC123',
  region: 'us-east-1'
});

// For Docker environments
const dockerProvider = AuthProviderFactory.createForDocker({
  issuer: 'https://your-auth-server.com',
  publicKey: 'your-public-key'
});
```

### Direct Provider Usage

```typescript
import { CognitoAuthenticationProvider, JWTAuthenticationProvider } from '@mytaptrack/business-logic-core';

// Direct Cognito usage
const cognitoProvider = new CognitoAuthenticationProvider({
  provider: 'cognito',
  userPoolId: 'us-east-1_ABC123',
  region: 'us-east-1'
});

// Direct JWT usage
const jwtProvider = new JWTAuthenticationProvider({
  provider: 'jwt',
  issuer: 'https://auth.example.com',
  jwksUri: 'https://auth.example.com/.well-known/jwks.json'
});
```

## Configuration Options

### Cognito Configuration

```typescript
interface CognitoConfig {
  provider: 'cognito';
  userPoolId: string;        // Required: Cognito User Pool ID
  region: string;            // Required: AWS region
  clientId?: string;         // Optional: Cognito App Client ID
}
```

### JWT/OIDC Configuration

```typescript
interface JWTConfig {
  provider: 'jwt' | 'oidc';
  issuer: string;            // Required: Token issuer
  audience?: string;         // Optional: Expected audience
  
  // Key configuration (one required)
  publicKey?: string;        // Static public key
  jwksUri?: string;          // JWKS endpoint URL
  
  // Optional settings
  algorithms?: string[];     // Allowed algorithms (default: ['RS256', 'HS256'])
  tokenValidation?: {
    clockTolerance?: number; // Clock tolerance in seconds (default: 30)
    maxAge?: number;         // Maximum token age in seconds
  };
}
```

## User Context

All providers return a standardized `UserContext`:

```typescript
interface UserContext {
  userId: string;                    // Unique user identifier
  email: string;                     // User email address
  roles: string[];                   // User roles
  permissions: string[];             // User permissions
  groups: string[];                  // User groups
  customAttributes: Record<string, any>; // Additional custom attributes
}
```

## Error Handling

The authentication layer provides detailed error information:

```typescript
import { AuthProviderError, AuthErrorType } from '@mytaptrack/business-logic-core';

try {
  const userContext = await authProvider.getUserContext(token);
  // Use userContext
} catch (error) {
  if (error instanceof AuthProviderError) {
    switch (error.type) {
      case AuthErrorType.EXPIRED_TOKEN:
        // Handle expired token
        break;
      case AuthErrorType.INVALID_TOKEN:
        // Handle invalid token
        break;
      case AuthErrorType.CONFIGURATION_ERROR:
        // Handle configuration issues
        break;
      // ... other error types
    }
  }
}
```

## Integration with Service Context

The authentication provider integrates seamlessly with the service context:

```typescript
import { ServiceContext, AuthProviderFactory } from '@mytaptrack/business-logic-core';

const serviceContext: ServiceContext = {
  dataAccess: dataAccessProvider,
  messageBroker: messageBrokerProvider,
  authentication: AuthProviderFactory.create(authConfig),
  cache: cacheProvider,
  logger: loggerProvider,
  config: serviceConfig
};
```

## Implementation Notes

### Current Limitations

1. **External Dependencies**: The full implementations require external dependencies:
   - Cognito provider needs `@aws-sdk/client-cognito-identity-provider` and `aws-jwt-verify`
   - JWT provider needs `jsonwebtoken` and `jwks-rsa`

2. **Token Refresh**: Token refresh functionality is not yet implemented and requires:
   - Cognito: Client credentials flow setup
   - JWT/OIDC: Token endpoint configuration

### Future Enhancements

1. **Additional Providers**: Support for other authentication systems (Auth0, Keycloak, etc.)
2. **Token Refresh**: Complete implementation of token refresh flows
3. **Caching**: Token validation result caching for improved performance
4. **Metrics**: Authentication metrics and monitoring integration

## Testing

The authentication layer includes comprehensive tests:

```bash
# Run authentication tests
npm test -- src/authentication

# Run specific test file
npm test -- src/authentication/__tests__/basic-functionality.test.ts
```

## Dependencies

To use the full functionality, install the required dependencies:

```bash
# For Cognito support
npm install @aws-sdk/client-cognito-identity-provider aws-jwt-verify

# For JWT/OIDC support  
npm install jsonwebtoken jwks-rsa @types/jsonwebtoken @types/jwks-rsa
```