# Lambda Bundle Size Optimization Guide

This guide provides best practices for optimizing Lambda bundle sizes using the modular business logic packages.

## Overview

The MyTapTrack system uses modular business logic packages that are designed for optimal tree-shaking and minimal bundle sizes. Each Lambda function should only import the specific operations it needs.

## Import Patterns

### ❌ Bad: Barrel Imports (Large Bundles)

```typescript
// DON'T: This imports everything from the package
import * as UserLogic from '@mytaptrack/business-logic-user';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core';

export const handler = async (event) => {
  const context = await createLambdaServiceContext();
  return UserLogic.UserOperations.createUser(event.userData, context);
};
```

### ✅ Good: Specific Imports (Small Bundles)

```typescript
// DO: Import only what you need
import { UserOperations } from '@mytaptrack/business-logic-user/operations';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';

export const handler = async (event) => {
  const context = await createLambdaServiceContext();
  return UserOperations.createUser(event.userData, context);
};
```

### ✅ Better: Direct Operation Imports

```typescript
// BEST: Import specific operations directly
import { createUser } from '@mytaptrack/business-logic-user/operations/user-operations';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';

export const handler = async (event) => {
  const context = await createLambdaServiceContext();
  return createUser(event.userData, context);
};
```

## Package Structure for Tree-Shaking

### Business Logic Core Package

```typescript
// @mytaptrack/business-logic-core exports
import { ServiceContext } from '@mytaptrack/business-logic-core/interfaces';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';
import { ConfigFactory } from '@mytaptrack/business-logic-core/config';
import { LambdaLogger } from '@mytaptrack/business-logic-core/logging';
```

### Domain-Specific Packages

```typescript
// User operations
import { createUser, updateUser } from '@mytaptrack/business-logic-user/operations';
import { validateUserData } from '@mytaptrack/business-logic-user/validation';

// Device operations
import { processDeviceData } from '@mytaptrack/business-logic-device/operations';
import { validateDeviceInput } from '@mytaptrack/business-logic-device/validation';

// Student operations
import { createStudent, updateStudent } from '@mytaptrack/business-logic-student/operations';
```

## Function-Specific Optimization

### Device API Functions (Target: 5MB)

```typescript
// api/src/device/functions/api/dataPut.ts
import { processDeviceData } from '@mytaptrack/business-logic-device/operations/device-operations';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';
import { DeviceDataRequest } from '@mytaptrack/types';

export const handler = async (event: APIGatewayEvent) => {
  const context = await createLambdaServiceContext();
  const request = JSON.parse(event.body) as DeviceDataRequest;
  
  return processDeviceData(request, context);
};
```

### Event Handlers (Target: 10MB)

```typescript
// api/src/device/functions/events/patternEventNotification.ts
import { processPatternEvent } from '@mytaptrack/business-logic-device/operations/event-operations';
import { sendNotification } from '@mytaptrack/business-logic-user/operations/notification-operations';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';

export const handler = async (event: EventBridgeEvent) => {
  const context = await createLambdaServiceContext();
  
  const result = await processPatternEvent(event.detail, context);
  await sendNotification(result.notification, context);
  
  return result;
};
```

### Migration Functions (Target: 20MB)

```typescript
// api/src/migration/migrateUsers.ts
import { migrateUserData } from '@mytaptrack/business-logic-user/operations/migration-operations';
import { validateMigrationData } from '@mytaptrack/business-logic-core/validation';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';

export const handler = async (event: any) => {
  const context = await createLambdaServiceContext();
  
  await validateMigrationData(event.data, context);
  return migrateUserData(event.data, context);
};
```

## Bundle Size Monitoring

### Development Workflow

```bash
# Build and analyze bundles
npm run build:optimized

# Monitor specific bundler
npm run bundle:monitor

# Compare bundlers
npm run bundle:compare-bundlers

# CI/CD check
npm run ci:bundle-check
```

### Bundle Size Targets

| Function Type | Target Size | AWS Limit | Notes |
|---------------|-------------|-----------|-------|
| Device API | 5 MB | 250 MB | Simple request/response |
| Event Handlers | 10 MB | 250 MB | Event processing logic |
| IoT Handlers | 3 MB | 250 MB | Minimal processing |
| Migration | 20 MB | 250 MB | Complex data transformations |
| Default | 15 MB | 250 MB | General purpose |

### CI/CD Integration

The bundle size check runs automatically in CI/CD:

```yaml
# .github/workflows/bundle-size-check.yml
- name: Check bundle sizes
  run: |
    cd api
    node scripts/ci-bundle-check.js
  env:
    CI_FAIL_ON_BUNDLE_WARNINGS: false
    CI_MAX_BUNDLE_SIZE: 52428800  # 50MB
```

## Optimization Techniques

### 1. Use Specific Imports

```typescript
// ❌ Imports entire package
import * as BusinessLogic from '@mytaptrack/business-logic-user';

// ✅ Imports specific module
import { UserOperations } from '@mytaptrack/business-logic-user/operations';

// ✅ Imports specific function
import { createUser } from '@mytaptrack/business-logic-user/operations/user-operations';
```

### 2. Conditional Imports

```typescript
// Use dynamic imports for optional features
export const handler = async (event) => {
  const context = await createLambdaServiceContext();
  
  if (event.requiresAdvancedProcessing) {
    const { advancedProcessor } = await import('@mytaptrack/business-logic-device/operations/advanced-operations');
    return advancedProcessor(event.data, context);
  }
  
  // Use lightweight processing for normal cases
  const { basicProcessor } = await import('@mytaptrack/business-logic-device/operations/basic-operations');
  return basicProcessor(event.data, context);
};
```

### 3. External Dependencies

Keep AWS SDK and runtime-provided libraries external:

```javascript
// webpack.config.js
externals: {
  'aws-sdk': 'aws-sdk',
  '@aws-sdk/*': '@aws-sdk/*',
  '@lumigo/tracer': '@lumigo/tracer'
}
```

### 4. Tree-Shaking Configuration

Ensure packages are configured for tree-shaking:

```json
// package.json
{
  "sideEffects": false,
  "module": "dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./operations": "./dist/operations/index.js"
  }
}
```

## Troubleshooting Large Bundles

### 1. Analyze Bundle Contents

```bash
# Generate bundle analyzer report
npm run build:analyze

# Check specific bundle
npm run bundle:monitor dist/device/functions/api/dataPut.js
```

### 2. Common Issues

- **Large dependencies**: Check if AWS SDK is being bundled
- **Barrel imports**: Using `import *` or importing from package root
- **Unused code**: Dead code not being eliminated
- **Duplicate dependencies**: Same package included multiple times

### 3. Bundle Analysis Tools

- Webpack Bundle Analyzer: `dist/bundle-report.html`
- esbuild Metafile: `dist-esbuild/metafile.json`
- Bundle size reports: `dist/bundle-size-report.json`

## Best Practices Summary

1. **Import specifically**: Only import what you need
2. **Use subpath imports**: Import from specific modules
3. **Keep externals external**: Don't bundle AWS SDK
4. **Monitor regularly**: Check bundle sizes in CI/CD
5. **Split large functions**: Break down complex handlers
6. **Use dynamic imports**: For optional or conditional code
7. **Configure tree-shaking**: Ensure packages support it
8. **Test both bundlers**: Compare webpack vs esbuild

## Example Lambda Function Template

```typescript
// Optimized Lambda function template
import { specificOperation } from '@mytaptrack/business-logic-domain/operations/specific-operations';
import { createLambdaServiceContext } from '@mytaptrack/business-logic-core/lambda';
import { InputType, OutputType } from '@mytaptrack/types';

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Create service context (includes all dependencies)
    const context = await createLambdaServiceContext();
    
    // Parse input
    const input: InputType = JSON.parse(event.body || '{}');
    
    // Execute business logic
    const result: OutputType = await specificOperation(input, context);
    
    // Return response
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Lambda execution failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

This template ensures minimal bundle size while maintaining clean architecture and proper error handling.