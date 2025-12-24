# Local Authentication System

## Overview

The local REST API includes SAML-based authentication with JWT token generation and Redis storage.

## SAML Authentication Flow

1. **Initiate Login**: Redirect to IdP
2. **SAML Assertion**: IdP returns SAML response
3. **Validate SAML**: Parse and validate SAML assertion
4. **Generate JWT**: Create JWT token from SAML profile
5. **Store in Redis**: Token stored with 8h expiry
6. **Return Token**: Client receives JWT + refresh token

## Environment Variables

### SAML Configuration
- `SAML_CERT`: IdP certificate for validation
- `SAML_ENTRY_POINT`: IdP SSO endpoint
- `SAML_ISSUER`: Service provider identifier (default: mytaptrack-local)
- `SAML_CALLBACK_URL`: Callback URL (default: http://localhost:3000/auth/saml/callback)

### Token Configuration
- `REDIS_HOST`: Redis hostname (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `JWT_SECRET`: Secret for signing tokens (default: local-dev-secret)

## Endpoints

### Initiate SAML Login
```bash
GET /auth/saml/login
```

Redirects to IdP login page.

### SAML Callback
```bash
POST /auth/saml/callback
Content-Type: application/x-www-form-urlencoded

SAMLResponse=<base64-encoded-saml-assertion>
```

**Production**: Validates SAML assertion and extracts user info

**Development/Local**: Falls back to test credentials if SAML validation fails:
```bash
POST /auth/saml/callback
Content-Type: application/json

{
  "SAMLResponse": "test",
  "userId": "test-user",
  "email": "test@local.dev",
  "name": "Test User"
}
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 28800,
  "user": {
    "userId": "user@example.com",
    "email": "user@example.com",
    "name": "John Doe",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

### Refresh Token
```bash
POST /auth/token/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGc..."
}
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "expiresIn": 28800
}
```

### Validate Token
```bash
POST /auth/token/validate
Authorization: Bearer eyJhbGc...
```

Response:
```json
{
  "valid": true,
  "user": {
    "userId": "user123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Logout
```bash
POST /auth/logout
Authorization: Bearer eyJhbGc...
```

Response:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Token Lifecycle

1. **Initial Authentication**: SAML callback generates token + refresh token
2. **Token Expiry**: After 8 hours, token expires
3. **Refresh**: Use refresh token to get new token (valid for 24 hours from initial auth)
4. **Logout**: Revokes both tokens from Redis

## Environment Variables

- `REDIS_HOST`: Redis hostname (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `JWT_SECRET`: Secret for signing tokens (default: local-dev-secret)

## Testing

```bash
# Start services
docker-compose up -d

# Test SAML callback
curl -X POST http://localhost:3000/auth/saml/callback \
  -d "SAMLResponse=test" \
  -d "userId=test-user" \
  -d "email=test@local.dev" \
  -d "name=Test User"

# Save the token
TOKEN="<token-from-response>"

# Validate token
curl -X POST http://localhost:3000/auth/token/validate \
  -H "Authorization: Bearer $TOKEN"

# Refresh token
REFRESH_TOKEN="<refresh-token-from-response>"
curl -X POST http://localhost:3000/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"

# Logout
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

## Production Considerations

1. **SAML Validation**: Implement proper SAML assertion validation
2. **JWT Secret**: Use strong, randomly generated secret
3. **Redis Persistence**: Configure Redis persistence for production
4. **HTTPS Only**: Enforce HTTPS in production
5. **Rate Limiting**: Add rate limiting to auth endpoints
6. **Token Rotation**: Implement token rotation on refresh
