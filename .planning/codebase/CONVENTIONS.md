# Coding Conventions

**Analysis Date:** 2026-03-21

## Naming Patterns

**Files:**
- DAL files (Data Access Layer): `*-dal.ts` - `user-dal.ts`, `device-dal.ts`, `student-dal.ts`
- Test files: `*.spec.ts` or `*.test.ts` - `user-dal.spec.ts`, `timeGet.spec.ts`
- Utilities: `*-utils.ts` or `*-helper.ts` - `key-mappings.ts`, `database-config-helper.ts`
- Types: `*-types.ts` in dedicated `types/` directories
- Functions: lowercase with hyphens - `ensureResponseUpdateStatus.ts`, `process-timestream.ts`
- Classes: PascalCase - `DalBaseClass`, `TimestreamDalClass`, `UserDalClass`
- Interfaces: PascalCase, often prefixed with `I` - `IDataAccessLayer`, `ILogger`, `IErrorHandler`

**Functions:**
- Instance methods: camelCase - `getUserId()`, `getStudentConfig()`, `setValidated()`
- DAL singleton instances: PascalCase + "Dal" - `UserDal`, `DeviceDal`, `StudentDal`, `NotificationDal`
- Arrow functions for exports: const function = () => {} pattern
- Event handlers: `handle*` prefix - `handleEvent()`, `handleError()`

**Variables:**
- Local variables: camelCase - `userId`, `studentId`, `license`, `dsn`
- Constants: UPPER_SNAKE_CASE - `UserPoolId = process.env.UserPoolId`
- Database keys: uppercase with hash prefix - `U#${email}#E`, `pk`, `sk`
- Environment variables: UPPER_SNAKE_CASE - `AWS_REGION`, `PrimaryTable`, `DataTable`, `USE_LOCAL`

**Types:**
- Interfaces: PascalCase - `UserIdStorage`, `UserPrimary`, `UserData`
- Type aliases: PascalCase - `UserStudentTeam`, `UserPrimaryStorage`
- Storage types: Suffix with "Storage" - `UserDataStorage`, `StudentPiiStorage`, `UserTeamInviteStorage`
- Enums: PascalCase values - `ErrorSeverity.LOW`, `LoggingLevel.warn`

## Code Style

**Formatting:**
- No dedicated Prettier/ESLint config at root level - teams use module-level configurations
- Indentation: 2 or 4 spaces (varies by module, typically 2)
- Line length: No explicit limit observed, code typically wraps naturally

**Linting:**
- No global linting rules enforced
- Each module has `tsconfig.json` with `strict: false` setting in lib module (enables decorators)
- Other modules: `strict: false` in lib, not enforced in others

**Import Organization:**

1. **External library imports** (AWS SDK, third-party packages)
   ```typescript
   import { AdminAddUserToGroupCommand, ... } from '@aws-sdk/client-cognito-identity-provider';
   import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
   ```

2. **Scoped package imports** (@mytaptrack packages)
   ```typescript
   import { NotificationType, User } from '@mytaptrack/types';
   import { MttLogger, LoggingLevel } from '../../utils/logger';
   ```

3. **Relative imports** (same module, local files)
   ```typescript
   import { DalBaseClass } from './dal';
   import { getStudentPrimaryKey } from '../utils/key-mappings';
   ```

**Path Aliases:**
- `@mytaptrack/types` - Shared type definitions
- `@mytaptrack/lib` - Business logic and utilities
- Relative imports with `..` for parent traversal in same package

## Error Handling

**Patterns:**
- Try-catch blocks for async operations
- Custom error types: `DatabaseError`, `ValidationError`, `ConnectionError`, `TimeoutError`, `TransactionError`
- Error context objects to capture operation metadata
- Log errors with full context before throwing
- Conditional rethrow based on error type

**Example:**
```typescript
try {
    const result = await this.data.get<UserIdStorage>(key, 'userId');
    if(!result) {
        throw new ValidationError('User not found');
    }
} catch (error) {
    logger.error('Failed to get user', error);
    if(error.message !== 'Access Denied') {
        throw error;
    }
}
```

## Logging

**Framework:** Custom `MttLogger` class in `lib/src/utils/logger.ts`

**Patterns:**
- Create logger instance at module level: `const logger = new MttLogger('ModuleName', LoggingLevel.warn);`
- Log levels: `LoggingLevel.warn`, `LoggingLevel.debug`, etc.
- Log with context objects: `logger.error('description', contextObject);`
- No console.log in production code (logger used instead)

**Example:**
```typescript
const logger = new MttLogger('UserDal', LoggingLevel.warn);
logger.warn('Failed to scan users from DynamoDB in local mode:', error);
```

## Comments

**When to Comment:**
- Complex algorithm explanations
- Non-obvious business logic
- Conditional imports or environment-specific code
- XXX/FIXME markers for known issues (none found in codebase indicates clean state)

**JSDoc/TSDoc:**
- Used sparingly
- Present on class definitions and complex utility functions
- Format: `/** description */` on single-line, `/** description */` for multi-line

**Example:**
```typescript
/**
 * Enhanced error handling system with comprehensive error processing
 * Integrates with existing error types and provides additional error context
 */
export class DatabaseErrorHandler implements IErrorHandler {
```

## Function Design

**Size:**
- Methods typically 30-80 lines
- Complex operations broken into helper methods
- DAL methods organize by operation type (get, put, query, delete)

**Parameters:**
- Named parameters preferred over positional for clarity
- Use destructuring for complex objects
- Typed parameters required (no implicit `any`)

**Return Values:**
- Explicit return types on all public methods
- Promise-based returns for async operations
- Generics used for flexible return typing: `get<UserIdStorage>(key, 'userId')`

**Example:**
```typescript
async getUserId(email: string, defaultUserId: string) {
    const key = { pk: `U#${email.toLowerCase()}#E`, sk: 'P'};
    const userIdLookup = await this.data.get<UserIdStorage>(key, 'userId');

    if(userIdLookup) {
        return userIdLookup.userId;
    }
    // ... additional logic
}
```

## Module Design

**Exports:**
- Each DAL module exports singleton instance: `export const UserDal = new UserDalClass();`
- Index files use barrel exports: `export { UserDal } from './user-dal';`
- Public interfaces and types exported from index files

**Barrel Files:**
- `lib/src/index.ts` - Re-exports from subdirectories and v2
- `lib/src/v2/index.ts` - Aggregates all v2 exports
- `lib/src/v2/dals/index.ts` - Aggregates all DAL exports
- Pattern: `export { EntityDal } from './entity-dal.ts';`

**Example:**
```typescript
// lib/src/v2/dals/index.ts
export { UserDal } from './user-dal';
export { StudentDal } from './student-dal';
export { DeviceDal } from './device-dal';
export type { UserPrimary, UserData } from './user-dal';
```

## Class Organization

**DAL Classes:**
- Extend `DalBaseClass` for data access
- Instance properties for AWS clients: `public cognito = new CognitoIdentityProviderClient({})`
- Public async methods for database operations
- Private helper methods for internal logic
- Initialization of logger at class level

**Wrapper Functions:**
- Export arrow functions that wrap business logic
- Pattern: `export const handleEvent = WebUtils.apiWrapperEx(functionName, config)`
- Used for REST endpoints and Lambda handlers

**Example:**
```typescript
class UserDalClass extends DalBaseClass {
    public cognito = new CognitoIdentityProviderClient({});

    async getUserId(email: string, defaultUserId: string) {
        // implementation
    }
}

export const UserDal = new UserDalClass();
```

---

*Convention analysis: 2026-03-21*
