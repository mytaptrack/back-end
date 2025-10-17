# API Documentation

This section provides comprehensive documentation for all MyTapTrack APIs, including GraphQL, REST, and Device APIs.

## API Overview

MyTapTrack provides multiple API interfaces to support different use cases:

- **GraphQL API**: Primary API for web applications and complex data operations
- **REST API**: Traditional REST endpoints for simple operations and third-party integrations
- **Device API**: Specialized endpoints for IoT device communication and data collection

## Authentication

All APIs use AWS Cognito for authentication and authorization:

- **Cognito User Pools**: For user authentication and session management
- **IAM Roles**: For service-to-service authentication
- **JWT Tokens**: Bearer tokens for API access

## API Sections

- [GraphQL API](./GraphQL/README.md) - Complete GraphQL schema, queries, mutations, and subscriptions
- [REST API](./REST/README.md) - REST endpoint specifications and examples
- [Device API](./Device/README.md) - IoT device integration and communication protocols

## Quick Start

### GraphQL API Access

```typescript
import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const httpLink = createHttpLink({
  uri: 'https://your-appsync-endpoint.appsync-api.region.amazonaws.com/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('jwt-token');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    }
  }
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache()
});
```

### REST API Access

```typescript
const response = await fetch('https://api.mytaptrack.com/v2/students', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  }
});
```

### Device API Access

```typescript
const deviceData = {
  dsn: 'device-serial-number',
  auth: 'device-auth-token',
  events: [
    {
      behaviorId: 'behavior-123',
      timestamp: Date.now(),
      intensity: 3
    }
  ]
};

const response = await fetch('https://device-api.mytaptrack.com/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(deviceData)
});
```

## Rate Limiting

All APIs implement rate limiting to ensure fair usage:

- **GraphQL API**: 1000 requests per minute per user
- **REST API**: 500 requests per minute per user  
- **Device API**: 10,000 events per minute per device

## Error Handling

All APIs return standardized error responses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid student ID provided",
    "details": {
      "field": "studentId",
      "value": "invalid-id"
    }
  }
}
```

## Support

For API support and questions:
- Documentation: [https://docs.mytaptrack.com](https://docs.mytaptrack.com)
- Support Email: api-support@mytaptrack.com
- Developer Forum: [https://community.mytaptrack.com](https://community.mytaptrack.com)