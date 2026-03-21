# Testing Patterns

**Analysis Date:** 2026-03-21

## Test Framework

**Runner:**
- Jest
- Config: `lib/jest.config.js`, `cicd/jest.config.js`
- Multiple configurations per module with shared preset

**Assertion Library:**
- Jest built-in expect()

**Run Commands:**
```bash
npm test                    # Run all tests in module
npm test -- --watch        # Watch mode (not explicitly configured but supported by jest)
npm test -- --coverage     # Coverage report (configured in jest.config.js)
```

## Test File Organization

**Location:**
- Co-located with source files: `*.spec.ts` or `*.test.ts` in same directory as source
- Example: `user-dal.ts` paired with `user-dal.spec.ts` in `lib/src/v2/dals/`

**Naming:**
- Pattern: `[module].spec.ts` - `user-dal.spec.ts`, `device-dal.spec.ts`
- Pattern: `[function].spec.ts` - `timeGet.spec.ts`
- Alternative: `[module].test.ts` - `optimization.test.ts`, `security.test.ts`

**Structure:**
```
lib/
├── src/
│   ├── v2/
│   │   ├── dals/
│   │   │   ├── user-dal.ts
│   │   │   ├── user-dal.spec.ts
│   │   │   ├── device-dal.ts
│   │   │   ├── device-dal.spec.ts
│   │   ├── testing/
│   │   │   ├── test-setup.ts
│   │   │   ├── example-test.spec.ts
api/
├── src/
│   ├── device/functions/api/
│   │   ├── timeGet.ts
│   │   ├── timeGet.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe('entity-name', () => {
    describe('feature-name', () => {
        test('description', async () => {
            // Arrange
            const input = setupData();

            // Act
            const result = await operation(input);

            // Assert
            expect(result).toBeDefined();
            expect(result.property).toBe(expectedValue);
        });
    });
});
```

**Patterns:**

1. **Environment setup at top of file** - Set env vars before imports
   ```typescript
   process.env.AWS_REGION = 'us-west-2';
   process.env.PrimaryTable = 'mytaptrack-test-primary';
   process.env.DataTable = 'mytaptrack-test-data';
   process.env.UserPoolId = 'us-west-2_R89C3N8h5';

   import { UserDal } from './user-dal';
   ```

2. **beforeEach cleanup** - Reset state between tests
   ```typescript
   beforeEach(async () => {
       await DeviceDal.delete(testDsn);
   });
   ```

3. **Nested describe blocks** - Organize by feature
   ```typescript
   describe('user-dal', () => {
       describe('weekstart', () => { /* tests */ });
       describe('data', () => { /* tests */ });
       describe('schedule', () => { /* tests */ });
   });
   ```

4. **Test timeouts** - Extended for integration tests
   ```typescript
   test('Valid', async () => { /* test */ }, 30000);  // 30 second timeout
   ```

## Mocking

**Framework:** Jest mocks with `jest.mock()`

**Patterns:**

1. **AWS SDK mocking** - In `lib/src/v2/testing/test-setup.ts`
   ```typescript
   jest.mock('@aws-sdk/client-dynamodb', () => ({
     DynamoDBClient: jest.fn().mockImplementation(() => ({
       destroy: jest.fn()
     }))
   }));

   jest.mock('@aws-sdk/lib-dynamodb', () => ({
     DynamoDBDocumentClient: {
       from: jest.fn().mockReturnValue({
         send: jest.fn().mockResolvedValue({
           Items: [],
           Item: null,
           LastEvaluatedKey: undefined
         })
       })
     },
     // ... command mocks
   }));
   ```

2. **Cognito mocking**
   ```typescript
   jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
     CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
       send: jest.fn().mockResolvedValue({})
     }))
   }));
   ```

3. **AppSync/Fetch mocking**
   ```typescript
   jest.mock('aws-sigv4-fetch', () => ({
     createSignedFetcher: jest.fn().mockReturnValue(
       jest.fn().mockResolvedValue({
         json: jest.fn().mockResolvedValue({ data: {} })
       })
     )
   }));
   ```

**What to Mock:**
- AWS SDK clients (required due to credential requirements in tests)
- HTTP requests to external APIs
- Database connections (use test databases when possible)

**What NOT to Mock:**
- Core business logic classes
- DAL methods (test them directly)
- Utility functions (test real implementations)
- Custom error classes

## Fixtures and Factories

**Test Data:**

1. **Environment-based constants at top of spec file**
   ```typescript
   const userId = 'f299c614-2537-4c72-bab7-1aaa5734d7c3';
   const studentId = '07159216-5b6b-4996-95e5-71d41025e107';
   const license = '202101014755aab4610743c7a11282197f19d49c';
   const dsn = 'M200000000000A';
   ```

2. **Test data objects inline**
   ```typescript
   const event = {
       studentId,
       awaitingResponse: false,
       count: 1
   };
   ```

3. **Factory helper function** (for complex objects)
   ```typescript
   function getServiceStudent(lastUpdate: number): StudentConfigStorage {
       return {
           // structured data
       };
   }
   ```

**Location:**
- Test data inline in spec files
- Complex factories: helper functions at bottom of spec file
- Shared test utilities: `lib/src/v2/testing/` directory

## Coverage

**Requirements:** Not enforced (no coverage threshold in jest.config.js)

**View Coverage:**
```bash
npm test -- --coverage
```

**Coverage configuration in jest.config.js:**
```javascript
collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts'
],
coverageDirectory: 'coverage',
coverageReporters: ['text', 'lcov', 'html']
```

## Test Types

**Unit Tests:**
- Scope: Individual methods and functions
- Approach: Test business logic in isolation with mocked dependencies
- Location: `*-dal.spec.ts`, `*-utils.spec.ts`
- Example: Testing DataDal.getWeekStart() with date inputs

**Integration Tests:**
- Scope: Multi-component interactions within single service
- Approach: Test DAL operations with mocked AWS clients but real business logic
- Location: `dal-integration.test.ts` or `*-integration.test.ts`
- Example: Testing user creation and group membership in UserDal

**E2E Tests:**
- Framework: Not explicitly configured in main jest config
- System tests: `system-tests/` directory (separate from unit tests)
- Approach: Full end-to-end validation with real AWS resources

## Common Patterns

**Async Testing:**
```typescript
test('description', async () => {
    const result = await UserDal.getUserId(email, defaultUserId);
    expect(result).toBeDefined();
});
```

**Error Testing:**
```typescript
test.skip('description', async () => {
    try {
        await operationThatFails();
        fail('Should have thrown error');
    } catch (error) {
        expect(error.message).toContain('expected text');
    }
});
```

**Multiple assertions on same entity:**
```typescript
const device = await DeviceDal.get(dsn);
expect(device.dsn).toBe(dsn);
expect(device.validated).toBeTruthy();
expect(device.studentId).toBe(studentId);
```

**State verification through multiple operations:**
```typescript
// Initial state
await UserDal.setStudentActiveNoResponse(userId, studentId, true);
let events = await UserDal.getUserStudentStats(userId);
expect(events.find(x => x.studentId === studentId)?.awaitingResponse).toBe(true);

// Modified state
await UserDal.setStudentActiveNoResponse(userId, studentId, false);
events = await UserDal.getUserStudentStats(userId);
expect(events.find(x => x.studentId === studentId)?.awaitingResponse).toBe(false);
```

## Test Execution Configuration

**Jest Config in lib/jest.config.js:**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/v2/testing/test-setup.ts'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  testTimeout: 30000,
  testEnvironmentOptions: {
    AWS_REGION: 'us-west-2',
    PrimaryTable: 'mytaptrack-test-primary',
    DataTable: 'mytaptrack-test-data'
  }
};
```

**Key features:**
- `preset: 'ts-jest'` - TypeScript support
- `testEnvironment: 'node'` - Node.js environment for AWS Lambda testing
- `setupFilesAfterEnv` - Loads test-setup.ts with mocks before running tests
- `testMatch` - Both `__tests__` directories and `*.spec.ts`/`*.test.ts` files
- `testTimeout: 30000` - Extended timeout for database operations

## Test Skip/Skip Patterns

**Skipped tests:** Tests marked with `test.skip()` are used for:
- Integration tests that require real AWS credentials
- Long-running database operations
- Tests dependent on specific data state
- Development/debug tests not meant for CI

**Pattern in codebase:**
```typescript
test.skip('getUserLarge', async () => {
    // Test with real database
    const user = await UserDal.getUser(userId, '');
    expect(user.students.length).toBe(21);
});
```

---

*Testing analysis: 2026-03-21*
