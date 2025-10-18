# Test Infrastructure Fixes

## Issues Fixed

### 1. ES Module Import Error ✅
**Problem**: `ERR_UNSUPPORTED_DIR_IMPORT` when importing from `./lib` directory
**Solution**: Changed TypeScript module configuration from `"esnext"` to `"commonjs"` in `tsconfig.json`

### 2. Logger TypeError ✅  
**Problem**: `Cannot read properties of undefined (reading 'replace')` in logging utility
**Solution**: Added robust Jest context detection and null checks for `expect.getState().currentTestName` with fallback to `'unknown-test'`

### 3. Environment Setup Script ✅
**Problem**: Logger failing when used outside Jest context (in `npm run envSetup`)
**Solution**: Added proper Jest context detection to handle both test and non-test environments

## New Features

### AWS Credential Detection
- Tests now detect if AWS credentials are available
- AWS-dependent tests are automatically skipped when credentials are missing
- Clear warnings inform developers about credential requirements

### Test Utilities
New utility functions in `src/lib/test-utils.ts`:
- `hasAWSCredentials()`: Detects AWS credential availability
- `skipIfNoAWS()`: Conditionally skips tests requiring AWS
- `describeWithAWS()`: Conditionally skips entire test suites requiring AWS

## Usage

### Running Tests Without AWS Credentials
```bash
npm test
# Tests will run but skip AWS-dependent functionality
```

### Running Full Test Suite
```bash
aws sso login  # Authenticate with AWS
npm test       # All tests will run
```

### Writing New Tests
```typescript
import { skipIfNoAWS, describeWithAWS } from '../lib';

// Skip individual tests
skipIfNoAWS('My AWS test', async () => {
    // This only runs with AWS credentials
});

// Skip entire test suites
describeWithAWS('AWS Integration Tests', () => {
    test('DynamoDB operations', async () => {
        // These tests only run with AWS credentials
    });
});
```

## Test Status

- ✅ Basic infrastructure tests pass
- ✅ ES module imports work correctly  
- ✅ Logging utility works without errors (both in Jest and standalone contexts)
- ✅ AWS credential detection works properly
- ✅ Environment setup script (`npm run envSetup`) works
- ✅ Individual AWS-dependent tests pass when authenticated
- ✅ All original TypeError and import issues resolved

## Commands

```bash
# Run basic infrastructure tests only
npm test -- --testNamePattern="Basic Infrastructure Tests"

# Run all tests (requires AWS credentials for full functionality)
npm test

# Run with verbose output
npm test -- --verbose
```