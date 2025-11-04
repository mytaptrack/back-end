# GraphQL Business Logic Migration Guide

## Overview

This document outlines the migration of GraphQL Lambda handlers from direct database access to using the centralized business logic layer.

## Current State

GraphQL resolvers currently:
- Import `@mytaptrack/lib` directly for database access
- Use `Dal` classes for direct DynamoDB operations
- Mix business logic with data access code
- Have inconsistent error handling and validation

## Target State

GraphQL resolvers should:
- Use business logic packages (`@mytaptrack/business-logic-*`)
- Have clean separation between GraphQL handling and business logic
- Consistent error handling and validation
- Optimized bundle sizes through specific imports

## Migration Strategy

### Phase 1: User Operations
- [x] `api/src/graphql/resolver/mutations/user/info.ts`
- [x] `api/src/graphql/resolver/query/getUsers/current.ts`
- [x] `api/src/graphql/resolver/mutations/user/dashboard.ts`
- [x] `api/src/graphql/resolver/query/getUsers/manage.ts`

### Phase 2: Student Operations
- [ ] Student mutation resolvers
- [ ] Student query resolvers

### Phase 3: Device Operations
- [ ] Device-related GraphQL resolvers

### Phase 4: App/License Operations
- [ ] App management resolvers
- [ ] License management resolvers

## Implementation Pattern

### Before (Current Pattern)
```typescript
import { WebUtils, UserDataStorage, getUserPrimaryKey } from '@mytaptrack/lib';
import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';

const data = new Dal('data');

export const handler = WebUtils.graphQLWrapper(async (context) => {
  const key = getUserPrimaryKey(context.identity.username);
  const user = await data.get<UserDataStorage>(key);
  
  // Business logic mixed with data access
  if (!user) {
    throw new Error('User not found');
  }
  
  // Manual data transformation
  return {
    id: user.userId,
    name: user.details.name,
    // ... more fields
  };
});
```

### After (Business Logic Pattern)
```typescript
import { WebUtils } from '@mytaptrack/lib';
import { UserOperations } from '@mytaptrack/business-logic-user/operations';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';

export const handler = WebUtils.graphQLWrapper(async (context) => {
  const serviceContext = await createLambdaServiceContext();
  
  try {
    const user = await UserOperations.getUserById(
      context.identity.username,
      serviceContext
    );
    
    if (!user) {
      throw new NotFoundError('User not found');
    }
    
    return user;
  } catch (error) {
    serviceContext.logger.error('Failed to get user', { error, userId: context.identity.username });
    throw error;
  }
});
```

## Benefits

1. **Consistent Business Logic**: All user operations go through the same business logic layer
2. **Better Error Handling**: Standardized error types and handling
3. **Improved Testing**: Business logic can be tested independently
4. **Bundle Optimization**: Specific imports reduce Lambda bundle sizes
5. **Maintainability**: Clear separation of concerns

## Bundle Size Impact

### Current Import Pattern (Large Bundles)
```typescript
import { WebUtils, UserDataStorage, getUserPrimaryKey, UserDal, StudentDal } from '@mytaptrack/lib';
// Imports entire lib package (~4.7MB)
```

### Optimized Import Pattern (Small Bundles)
```typescript
import { WebUtils } from '@mytaptrack/lib';
import { UserOperations } from '@mytaptrack/business-logic-user/operations';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';
// Only imports specific operations (~2-3MB reduction)
```

## Error Handling Standards

### Business Logic Errors
```typescript
import { 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';

// These map to appropriate HTTP status codes in GraphQL
throw new ValidationError('Invalid user data', correlationId, { field: 'email' });
throw new NotFoundError('User not found', correlationId, { userId });
throw new BusinessLogicError('Operation failed', correlationId, { reason });
```

### GraphQL Error Mapping
- `ValidationError` → 400 Bad Request
- `NotFoundError` → 404 Not Found  
- `BusinessLogicError` → 500 Internal Server Error
- `UnauthorizedError` → 401 Unauthorized

## Service Context Usage

The service context provides:
- **Data Access**: Abstracted database operations
- **Message Broker**: Event publishing
- **Logger**: Structured logging
- **Configuration**: Environment-specific settings
- **Cache**: Caching layer

```typescript
const serviceContext = await createLambdaServiceContext();

// Use throughout business logic operations
const user = await UserOperations.createUser(userData, serviceContext);

// Automatic logging and event publishing
serviceContext.logger.info('User created', { userId: user.id });
```

## Migration Checklist

For each GraphQL resolver:

- [ ] Replace direct `Dal` usage with business logic operations
- [ ] Update imports to use specific business logic packages
- [ ] Add proper error handling with business logic error types
- [ ] Use service context for all business operations
- [ ] Remove manual data transformation logic
- [ ] Update tests to mock business logic layer instead of database
- [ ] Verify bundle size reduction
- [ ] Test GraphQL operations end-to-end

## Testing Strategy

### Unit Tests
- Mock business logic operations
- Test GraphQL-specific logic (argument parsing, response formatting)
- Verify error handling and mapping

### Integration Tests
- Test with real business logic layer
- Verify database operations work correctly
- Test error scenarios

### Bundle Size Tests
- Monitor bundle sizes after migration
- Ensure significant size reduction
- Verify tree-shaking is working properly