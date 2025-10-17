# Testing Guidelines

This document outlines the testing strategy, procedures, and requirements for the MyTapTrack codebase.

## Testing Strategy

### Testing Pyramid

Our testing strategy follows the testing pyramid approach:

```
    /\
   /  \     E2E Tests (Few)
  /____\    - System-wide workflows
 /      \   - User journey testing
/________\  Integration Tests (Some)
           - API endpoint testing
           - Service integration
           - Database interactions

Unit Tests (Many)
- Function-level testing
- Component isolation
- Business logic validation
```

### Test Types

#### Unit Tests
- **Purpose**: Test individual functions, classes, and components in isolation
- **Scope**: Single unit of code
- **Speed**: Fast (< 1 second per test)
- **Coverage**: 80% minimum code coverage

#### Integration Tests
- **Purpose**: Test interaction between components and services
- **Scope**: Multiple components working together
- **Speed**: Medium (1-10 seconds per test)
- **Coverage**: All API endpoints and critical workflows

#### End-to-End (E2E) Tests
- **Purpose**: Test complete user workflows and system behavior
- **Scope**: Full application stack
- **Speed**: Slow (10+ seconds per test)
- **Coverage**: Critical user journeys and business processes

#### Contract Tests
- **Purpose**: Ensure API contracts between services are maintained
- **Scope**: Service boundaries and interfaces
- **Speed**: Fast to medium
- **Coverage**: All external API interactions

## Testing Framework and Tools

### Core Testing Stack

#### Jest
Primary testing framework for unit and integration tests.

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false"
  }
}
```

#### Testing Library
For testing React components and user interactions.

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserProfile } from './UserProfile';

test('displays user information', async () => {
  render(<UserProfile userId="123" />);
  
  await waitFor(() => {
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
```

#### Supertest
For API endpoint testing.

```typescript
import request from 'supertest';
import { app } from '../app';

describe('User API', () => {
  test('GET /api/users/:id returns user', async () => {
    const response = await request(app)
      .get('/api/users/123')
      .expect(200);
    
    expect(response.body.id).toBe('123');
  });
});
```

### AWS Testing Tools

#### AWS SDK Mocks
Mock AWS services for unit testing.

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
});

test('getUserById returns user from DynamoDB', async () => {
  dynamoMock.on(GetItemCommand).resolves({
    Item: { id: { S: '123' }, name: { S: 'John Doe' } }
  });

  const user = await getUserById('123');
  expect(user.name).toBe('John Doe');
});
```

#### LocalStack
Local AWS cloud stack for integration testing.

```bash
# Start LocalStack
docker run -p 4566:4566 localstack/localstack

# Configure AWS SDK to use LocalStack
export AWS_ENDPOINT_URL=http://localhost:4566
```

## Unit Testing

### Test Structure

#### AAA Pattern
Follow Arrange-Act-Assert pattern for clear test structure.

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    test('should create user with valid data', async () => {
      // Arrange
      const userData = { email: 'test@example.com', name: 'Test User' };
      const mockRepository = {
        create: jest.fn().mockResolvedValue({ id: '123', ...userData })
      };
      const userService = new UserService(mockRepository);

      // Act
      const result = await userService.createUser(userData);

      // Assert
      expect(result).toEqual({ id: '123', ...userData });
      expect(mockRepository.create).toHaveBeenCalledWith(userData);
    });
  });
});
```

#### Test Naming
Use descriptive test names that explain the scenario and expected outcome.

```typescript
// ✅ Good
test('should throw ValidationError when email is invalid', () => {});
test('should return user when valid ID is provided', () => {});
test('should call repository.create with correct parameters', () => {});

// ❌ Bad
test('email validation', () => {});
test('get user', () => {});
test('create test', () => {});
```

### Mocking Strategies

#### Dependency Injection
Use dependency injection to make components testable.

```typescript
// ✅ Good - Testable with dependency injection
class UserService {
  constructor(
    private repository: UserRepository,
    private validator: UserValidator,
    private logger: Logger
  ) {}

  async createUser(userData: CreateUserData): Promise<User> {
    this.validator.validate(userData);
    const user = await this.repository.create(userData);
    this.logger.info('User created', { userId: user.id });
    return user;
  }
}

// Test with mocks
const mockRepository = { create: jest.fn() };
const mockValidator = { validate: jest.fn() };
const mockLogger = { info: jest.fn() };
const service = new UserService(mockRepository, mockValidator, mockLogger);
```

#### Module Mocking
Mock external modules and services.

```typescript
// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  GetItemCommand: jest.fn(),
  PutItemCommand: jest.fn()
}));

// Mock external API
jest.mock('../services/external-api', () => ({
  fetchUserData: jest.fn().mockResolvedValue({ id: '123', name: 'John' })
}));
```

#### Partial Mocking
Mock only specific methods when needed.

```typescript
import * as userUtils from '../utils/user-utils';

jest.spyOn(userUtils, 'generateUserId').mockReturnValue('mock-id-123');
jest.spyOn(userUtils, 'validateEmail').mockReturnValue(true);
```

### Testing Async Code

#### Promises
Test async functions properly.

```typescript
test('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBe('expected value');
});

test('should handle rejected promises', async () => {
  await expect(asyncFunction()).rejects.toThrow('Error message');
});
```

#### Callbacks
Test callback-based code.

```typescript
test('should handle callbacks', (done) => {
  callbackFunction((error, result) => {
    expect(error).toBeNull();
    expect(result).toBe('expected value');
    done();
  });
});
```

### Error Testing

Test error conditions and edge cases.

```typescript
describe('error handling', () => {
  test('should throw ValidationError for invalid input', () => {
    expect(() => validateUser(null)).toThrow(ValidationError);
  });

  test('should handle network errors gracefully', async () => {
    mockApiCall.mockRejectedValue(new Error('Network error'));
    
    await expect(fetchUserData('123')).rejects.toThrow('Network error');
  });

  test('should return default value when data is missing', () => {
    const result = getUserName(undefined);
    expect(result).toBe('Anonymous');
  });
});
```

## Integration Testing

### API Testing

#### REST API Testing
Test REST endpoints with realistic scenarios.

```typescript
import request from 'supertest';
import { app } from '../app';
import { setupTestDatabase, cleanupTestDatabase } from '../test-utils';

describe('User API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await cleanupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  describe('POST /api/users', () => {
    test('should create user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        role: 'user'
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        email: userData.email,
        name: userData.name,
        role: userData.role,
        createdAt: expect.any(String)
      });
    });

    test('should return 400 for invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/api/users')
        .send(userData)
        .expect(400);

      expect(response.body.error).toContain('Invalid email');
    });
  });

  describe('GET /api/users/:id', () => {
    test('should return user by ID', async () => {
      // Create user first
      const createResponse = await request(app)
        .post('/api/users')
        .send({ email: 'test@example.com', name: 'Test User' });

      const userId = createResponse.body.id;

      // Get user
      const response = await request(app)
        .get(`/api/users/${userId}`)
        .expect(200);

      expect(response.body.id).toBe(userId);
      expect(response.body.email).toBe('test@example.com');
    });

    test('should return 404 for non-existent user', async () => {
      await request(app)
        .get('/api/users/non-existent-id')
        .expect(404);
    });
  });
});
```

#### GraphQL Testing
Test GraphQL queries and mutations.

```typescript
import { createTestClient } from 'apollo-server-testing';
import { server } from '../graphql-server';

const { query, mutate } = createTestClient(server);

describe('User GraphQL API', () => {
  test('should create user via mutation', async () => {
    const CREATE_USER = gql`
      mutation CreateUser($input: CreateUserInput!) {
        createUser(input: $input) {
          id
          email
          name
        }
      }
    `;

    const response = await mutate({
      mutation: CREATE_USER,
      variables: {
        input: {
          email: 'test@example.com',
          name: 'Test User'
        }
      }
    });

    expect(response.errors).toBeUndefined();
    expect(response.data.createUser).toMatchObject({
      id: expect.any(String),
      email: 'test@example.com',
      name: 'Test User'
    });
  });

  test('should query user by ID', async () => {
    const GET_USER = gql`
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          email
          name
        }
      }
    `;

    const response = await query({
      query: GET_USER,
      variables: { id: 'test-user-id' }
    });

    expect(response.errors).toBeUndefined();
    expect(response.data.user).toBeDefined();
  });
});
```

### Database Testing

#### DynamoDB Testing
Test database operations with real or mocked DynamoDB.

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UserRepository } from '../repositories/user-repository';

describe('UserRepository Integration', () => {
  let repository: UserRepository;
  let dynamoClient: DynamoDBClient;

  beforeAll(() => {
    // Use LocalStack or test database
    dynamoClient = new DynamoDBClient({
      endpoint: 'http://localhost:4566',
      region: 'us-east-1'
    });
    repository = new UserRepository(dynamoClient, 'test-users-table');
  });

  beforeEach(async () => {
    await clearTable('test-users-table');
  });

  test('should create and retrieve user', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User'
    };

    // Create user
    const createdUser = await repository.create(userData);
    expect(createdUser.id).toBeDefined();

    // Retrieve user
    const retrievedUser = await repository.findById(createdUser.id);
    expect(retrievedUser).toEqual(createdUser);
  });

  test('should update user data', async () => {
    const user = await repository.create({
      email: 'test@example.com',
      name: 'Test User'
    });

    const updatedUser = await repository.update(user.id, {
      name: 'Updated Name'
    });

    expect(updatedUser.name).toBe('Updated Name');
    expect(updatedUser.email).toBe('test@example.com');
  });
});
```

### Service Integration Testing

Test interactions between services.

```typescript
describe('User Service Integration', () => {
  let userService: UserService;
  let emailService: EmailService;
  let auditService: AuditService;

  beforeEach(() => {
    // Use real services with test configuration
    userService = new UserService(testConfig);
    emailService = new EmailService(testConfig);
    auditService = new AuditService(testConfig);
  });

  test('should send welcome email when user is created', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User'
    };

    const user = await userService.createUser(userData);

    // Verify email was sent
    const sentEmails = await emailService.getSentEmails();
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(userData.email);
    expect(sentEmails[0].subject).toContain('Welcome');

    // Verify audit log
    const auditLogs = await auditService.getLogsForUser(user.id);
    expect(auditLogs).toContainEqual(
      expect.objectContaining({
        action: 'USER_CREATED',
        userId: user.id
      })
    );
  });
});
```

## End-to-End Testing

### System Testing

Test complete user workflows across the entire system.

```typescript
import { Browser, Page } from 'playwright';
import { chromium } from 'playwright';

describe('User Registration E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:3000');
  });

  afterEach(async () => {
    await page.close();
  });

  test('should complete user registration flow', async () => {
    // Navigate to registration
    await page.click('[data-testid="register-button"]');
    
    // Fill registration form
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="name-input"]', 'Test User');
    
    // Submit form
    await page.click('[data-testid="submit-button"]');
    
    // Verify success
    await page.waitForSelector('[data-testid="success-message"]');
    expect(await page.textContent('[data-testid="success-message"]'))
      .toContain('Registration successful');
    
    // Verify redirect to dashboard
    await page.waitForURL('**/dashboard');
    expect(await page.textContent('[data-testid="welcome-message"]'))
      .toContain('Welcome, Test User');
  });

  test('should handle registration errors', async () => {
    await page.click('[data-testid="register-button"]');
    
    // Submit with invalid email
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.click('[data-testid="submit-button"]');
    
    // Verify error message
    await page.waitForSelector('[data-testid="error-message"]');
    expect(await page.textContent('[data-testid="error-message"]'))
      .toContain('Invalid email');
  });
});
```

### API Workflow Testing

Test complete API workflows.

```typescript
describe('Device Management Workflow', () => {
  let authToken: string;
  let userId: string;
  let deviceId: string;

  beforeAll(async () => {
    // Authenticate user
    const authResponse = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password' });
    
    authToken = authResponse.body.token;
    userId = authResponse.body.user.id;
  });

  test('should complete device registration and data flow', async () => {
    // 1. Register device
    const deviceResponse = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Test Device',
        type: 'sensor',
        userId: userId
      })
      .expect(201);

    deviceId = deviceResponse.body.id;

    // 2. Send device data
    await request(app)
      .post(`/api/devices/${deviceId}/data`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        temperature: 25.5,
        humidity: 60.2,
        timestamp: new Date().toISOString()
      })
      .expect(200);

    // 3. Verify data appears in reports
    const reportResponse = await request(app)
      .get(`/api/reports/device/${deviceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(reportResponse.body.data).toHaveLength(1);
    expect(reportResponse.body.data[0].temperature).toBe(25.5);

    // 4. Update device settings
    await request(app)
      .put(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Updated Device Name',
        settings: { interval: 300 }
      })
      .expect(200);

    // 5. Verify device updated
    const updatedDevice = await request(app)
      .get(`/api/devices/${deviceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(updatedDevice.body.name).toBe('Updated Device Name');
  });
});
```

## Test Data Management

### Test Fixtures

Create reusable test data.

```typescript
// test-fixtures.ts
export const testUsers = {
  admin: {
    id: 'admin-123',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin'
  },
  user: {
    id: 'user-456',
    email: 'user@example.com',
    name: 'Regular User',
    role: 'user'
  }
};

export const testDevices = {
  sensor: {
    id: 'device-789',
    name: 'Temperature Sensor',
    type: 'sensor',
    userId: testUsers.user.id
  }
};

export function createTestUser(overrides = {}) {
  return {
    ...testUsers.user,
    id: `user-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    ...overrides
  };
}
```

### Database Seeding

Set up test data for integration tests.

```typescript
// test-utils.ts
export async function setupTestDatabase() {
  // Create test tables
  await createTestTables();
  
  // Seed initial data
  await seedTestData();
}

export async function cleanupTestDatabase() {
  // Clear all test data
  await clearAllTables();
  
  // Drop test tables
  await dropTestTables();
}

export async function seedTestData() {
  const userRepository = new UserRepository();
  const deviceRepository = new DeviceRepository();
  
  // Create test users
  await userRepository.create(testUsers.admin);
  await userRepository.create(testUsers.user);
  
  // Create test devices
  await deviceRepository.create(testDevices.sensor);
}
```

### Test Environment Configuration

```typescript
// test-config.ts
export const testConfig = {
  database: {
    host: 'localhost',
    port: 5432,
    database: 'mytaptrack_test',
    username: 'test_user',
    password: 'test_password'
  },
  aws: {
    region: 'us-east-1',
    endpoint: 'http://localhost:4566', // LocalStack
    accessKeyId: 'test',
    secretAccessKey: 'test'
  },
  api: {
    baseUrl: 'http://localhost:3001',
    timeout: 5000
  }
};
```

## Test Execution

### Running Tests

#### Local Development
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test user-service.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="createUser"

# Run tests for specific module
cd api/
npm test
```

#### Continuous Integration
```bash
# Run tests in CI mode
npm run test:ci

# Run tests with coverage and upload
npm run test:coverage
npm run coverage:upload
```

### Test Configuration

#### Jest Configuration
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts']
};
```

#### Test Setup
```typescript
// test-setup.ts
import { setupTestDatabase, cleanupTestDatabase } from './test-utils';

// Global test setup
beforeAll(async () => {
  await setupTestDatabase();
});

// Global test cleanup
afterAll(async () => {
  await cleanupTestDatabase();
});

// Mock console methods in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
```

## Performance Testing

### Load Testing

Test API performance under load.

```typescript
import { check } from 'k6';
import http from 'k6/http';

export let options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],    // Error rate under 10%
  },
};

export default function () {
  const response = http.get('https://api.mytaptrack.com/health');
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

### Memory and Performance Profiling

```typescript
// performance.test.ts
describe('Performance Tests', () => {
  test('should handle large datasets efficiently', async () => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    // Process large dataset
    const result = await processLargeDataset(10000);
    
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    // Performance assertions
    expect(endTime - startTime).toBeLessThan(5000); // Under 5 seconds
    expect(endMemory - startMemory).toBeLessThan(100 * 1024 * 1024); // Under 100MB
    expect(result).toHaveLength(10000);
  });
});
```

## Test Reporting and Coverage

### Coverage Reports

Generate and analyze test coverage.

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html

# Check coverage thresholds
npm run coverage:check
```

### Test Reports

Generate test reports for CI/CD.

```javascript
// jest.config.js
module.exports = {
  // ... other config
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results',
      outputName: 'junit.xml'
    }],
    ['jest-html-reporters', {
      publicPath: 'test-results',
      filename: 'report.html'
    }]
  ]
};
```

## Debugging Tests

### Debug Configuration

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Jest Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache", "--no-coverage"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Debug Techniques

```typescript
// Add debug logging
test('should debug test issue', async () => {
  console.log('Test input:', testData);
  
  const result = await functionUnderTest(testData);
  
  console.log('Test result:', result);
  console.log('Mock calls:', mockFunction.mock.calls);
  
  expect(result).toBe(expectedValue);
});

// Use debugger
test('should debug with breakpoint', async () => {
  debugger; // Execution will pause here when debugging
  
  const result = await functionUnderTest(testData);
  expect(result).toBe(expectedValue);
});
```

## Best Practices Summary

### General Testing Best Practices
1. **Write Tests First**: Follow TDD when possible
2. **Test Behavior**: Focus on what the code does, not how
3. **Keep Tests Simple**: One assertion per test when possible
4. **Use Descriptive Names**: Test names should explain the scenario
5. **Isolate Tests**: Each test should be independent

### Unit Testing Best Practices
1. **Mock Dependencies**: Isolate the unit under test
2. **Test Edge Cases**: Include boundary conditions and error cases
3. **Fast Execution**: Unit tests should run quickly
4. **High Coverage**: Aim for 80%+ code coverage
5. **Clear Assertions**: Use specific, meaningful assertions

### Integration Testing Best Practices
1. **Test Real Interactions**: Use actual services when possible
2. **Clean State**: Reset state between tests
3. **Realistic Data**: Use data that resembles production
4. **Error Scenarios**: Test failure conditions
5. **Performance Aware**: Monitor test execution time

### E2E Testing Best Practices
1. **Critical Paths**: Focus on most important user journeys
2. **Stable Selectors**: Use data-testid attributes
3. **Wait Strategies**: Use proper waits for async operations
4. **Parallel Execution**: Run tests in parallel when possible
5. **Failure Recovery**: Handle flaky tests gracefully