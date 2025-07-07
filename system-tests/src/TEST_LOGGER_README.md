# TestLogger System

The TestLogger system provides comprehensive logging capabilities for system tests, creating separate log files for each test case and enabling detailed debugging and tracing.

## Features

- **Per-test log files**: Each test gets its own log file with timestamps and unique identifiers
- **Multiple log levels**: DEBUG, INFO, WARN, ERROR with configurable filtering
- **Console and file output**: Logs can be written to both console and files
- **File rotation**: Automatic log file rotation when size limits are reached
- **Test integration**: Easy integration with Jest test framework
- **Shared function support**: Pass loggers to shared functions for consistent logging
- **API call logging**: Special methods for logging API calls and responses
- **Assertion logging**: Track test assertions with detailed logging

## Quick Start

### Basic Usage

```typescript
import { setupTestLogger, cleanupTestLogger, getTestLogger } from '../lib';

describe('My Test Suite', () => {
    beforeEach(() => {
        setupTestLogger();
    });

    afterEach(() => {
        cleanupTestLogger();
    });

    test('my test', async () => {
        const logger = getTestLogger();
        
        logger!.info('Starting test');
        logger!.debug('Debug information', { data: 'value' });
        
        // Your test code here
        
        logger!.info('Test completed');
    });
});
```

### Automatic Setup

```typescript
import { createJestLoggerSetup } from '../lib';

const loggerSetup = createJestLoggerSetup({
    logLevel: LogLevel.DEBUG,
    logToConsole: true
});

describe('My Test Suite', () => {
    beforeEach(loggerSetup.beforeEach);
    afterEach(loggerSetup.afterEach);
    afterAll(loggerSetup.afterAll);

    test('my test', async () => {
        const logger = getTestLogger();
        logger!.info('This test uses automatic setup');
    });
});
```

## Configuration Options

### TestLoggerOptions

```typescript
interface TestLoggerOptions {
    logLevel?: LogLevel;           // Minimum log level to output
    logToConsole?: boolean;        // Whether to also log to console
    logDirectory?: string;         // Directory for log files (default: 'logs')
    includeTimestamp?: boolean;    // Include timestamps in log entries
    maxLogFileSize?: number;       // Max file size in MB before rotation
}
```

### Log Levels

```typescript
enum LogLevel {
    DEBUG = 0,    // Most verbose
    INFO = 1,     // General information
    WARN = 2,     // Warning messages
    ERROR = 3     // Error messages only
}
```

## Advanced Features

### Using withLogging Helper

```typescript
import { withLogging } from '../lib';

test('complex operation', async () => {
    const result = await withLogging(async (logger) => {
        logger.info('Starting complex operation');
        
        // Your operation here
        const data = await someAsyncOperation();
        
        logger.debug('Operation data', data);
        return data;
    }, 'Complex Operation Step');
    
    expect(result).toBeDefined();
});
```

### Logging API Calls

```typescript
test('api integration', async () => {
    const logger = getTestLogger();
    
    // Log an API call
    const startTime = Date.now();
    const response = await fetch('/api/data');
    const duration = Date.now() - startTime;
    
    logger!.logApiCall('GET', '/api/data', response.status, duration);
    logger!.logApiResponse(await response.json());
});
```

### Logged Function Decorator

```typescript
import { loggedFunction } from '../lib';

// Create a logged version of any async function
const loggedApiCall = loggedFunction(
    async (url: string, data: any) => {
        // Your API call implementation
        return await fetch(url, { method: 'POST', body: JSON.stringify(data) });
    },
    'API Call'
);

test('using logged function', async () => {
    const result = await loggedApiCall('/api/endpoint', { key: 'value' });
    expect(result).toBeDefined();
});
```

### Step Logging

```typescript
test('multi-step process', async () => {
    const logger = getTestLogger();
    
    logger!.logStepStart('Setup');
    // Setup code
    logger!.logStepEnd('Setup');
    
    logger!.logStepStart('Processing');
    // Processing code
    logger!.logStepEnd('Processing', 1500); // Optional duration in ms
    
    logger!.logStepStart('Validation');
    // Validation code
    logger!.logStepEnd('Validation');
});
```

### Assertion Logging

```typescript
import { loggedExpect } from '../lib';

test('with logged assertions', async () => {
    const result = await someOperation();
    
    loggedExpect(result.status, 'Operation should succeed').toBe('success');
    loggedExpect(result.data, 'Data should be present').toBeDefined();
    loggedExpect(result.items.length, 'Should have 3 items').toBe(3);
});
```

## Shared Function Integration

### Optional Logger Parameter

```typescript
// Shared function that accepts an optional logger
async function sharedFunction(data: any, logger?: TestLogger): Promise<any> {
    if (logger) {
        logger.info('Starting shared function', { data });
    }
    
    // Function implementation
    const result = await processData(data);
    
    if (logger) {
        logger.info('Shared function completed', { result });
    }
    
    return result;
}

// Usage in test
test('using shared function', async () => {
    const logger = getTestLogger();
    const result = await sharedFunction({ key: 'value' }, logger);
    expect(result).toBeDefined();
});
```

### Required Logger Parameter

```typescript
// Shared function that requires a logger
async function sharedFunctionWithLogging(data: any, logger: TestLogger): Promise<any> {
    logger.logStepStart('Processing data');
    
    try {
        const result = await processData(data);
        logger.logStepEnd('Processing data');
        return result;
    } catch (error) {
        logger.error('Processing failed', error);
        throw error;
    }
}

// Usage in test
test('using shared function with required logger', async () => {
    await withLogging(async (logger) => {
        const result = await sharedFunctionWithLogging({ key: 'value' }, logger);
        expect(result).toBeDefined();
    });
});
```

## File Output

Log files are created in the `logs` directory (configurable) with the following naming pattern:

```
{test-name}_{timestamp}.log
```

Example:
```
logs/
├── my_test_suite_my_test_2024-01-15T10-30-45-123Z.log
├── another_test_2024-01-15T10-31-02-456Z.log
└── complex_test_scenario_2024-01-15T10-31-20-789Z.log
```

## Log Format

Each log entry includes:
- Timestamp (ISO format)
- Log level
- Message
- Structured data (JSON formatted)

Example log entry:
```
[2024-01-15T10:30:45.123Z] [INFO] Starting test execution
[2024-01-15T10:30:45.124Z] [DEBUG] Debug information {
  "data": "value",
  "count": 42
}
[2024-01-15T10:30:45.125Z] [INFO] >>> Starting step: Setup
[2024-01-15T10:30:45.200Z] [INFO] <<< Completed step: Setup (75ms)
[2024-01-15T10:30:45.201Z] [INFO] 🌐 API Call: GET /api/data - 200 (150ms)
[2024-01-15T10:30:45.202Z] [INFO] ✅ Test passed: my test (250ms)
```

## Migration from Existing Logging

To migrate from the existing `constructLogger` system:

1. **Replace setup calls**:
   ```typescript
   // Old
   constructLogger(LoggingLevel.ERROR);
   
   // New
   const loggerSetup = createJestLoggerSetup({
       logLevel: LogLevel.ERROR,
       logToConsole: true
   });
   ```

2. **Update console calls**:
   ```typescript
   // Old
   console.info('Message');
   console.debug('Debug', data);
   
   // New
   const logger = getTestLogger();
   logger!.info('Message');
   logger!.debug('Debug', data);
   ```

3. **Add to shared functions**:
   ```typescript
   // Old
   async function sharedFunction(data: any) {
       console.info('Processing', data);
       // ...
   }
   
   // New
   async function sharedFunction(data: any, logger?: TestLogger) {
       if (logger) {
           logger.info('Processing', data);
       }
       // ...
   }
   ```

## Best Practices

1. **Use appropriate log levels**: DEBUG for detailed info, INFO for general flow, WARN for issues, ERROR for failures
2. **Log step boundaries**: Use `logStepStart`/`logStepEnd` for clear test structure
3. **Log API interactions**: Use `logApiCall` for external service calls
4. **Log assertions**: Use `loggedExpect` for important test assertions
5. **Pass loggers to shared functions**: Enable consistent logging across your test suite
6. **Clean up loggers**: Always use proper setup/teardown to avoid resource leaks

## Troubleshooting

### Logger not found error
```
Error: No logger found for test: test-name. Make sure to call setupTestLogger first.
```
**Solution**: Ensure `setupTestLogger()` is called in `beforeEach` or at the start of your test.

### Permission errors
```
Error: Failed to initialize log file: EACCES: permission denied
```
**Solution**: Check write permissions on the log directory, or specify a different directory.

### Large log files
If log files become too large, reduce the log level or decrease the `maxLogFileSize` option.

## Examples

See `system-tests/src/tests/example-logger-usage.spec.ts` for comprehensive examples of all features.