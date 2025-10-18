# Coding Standards

This document outlines the coding standards and best practices for the MyTapTrack codebase.

## General Principles

### Code Quality Standards
- **Readability**: Code should be self-documenting and easy to understand
- **Consistency**: Follow established patterns and conventions throughout the codebase
- **Maintainability**: Write code that is easy to modify and extend
- **Performance**: Consider performance implications, especially for Lambda functions
- **Security**: Follow security best practices for AWS and Node.js applications

### SOLID Principles
- **Single Responsibility**: Each class/function should have one reason to change
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Derived classes must be substitutable for base classes
- **Interface Segregation**: Clients shouldn't depend on interfaces they don't use
- **Dependency Inversion**: Depend on abstractions, not concretions

## TypeScript Standards

### Type Safety
- **Strict Mode**: Always use TypeScript strict mode
- **No Any**: Avoid `any` type; use proper typing or `unknown`
- **Explicit Return Types**: Always specify return types for functions
- **Interface over Type**: Prefer interfaces for object shapes

```typescript
// ✅ Good
interface UserData {
  id: string;
  email: string;
  createdAt: Date;
}

function getUser(id: string): Promise<UserData | null> {
  // implementation
}

// ❌ Bad
function getUser(id: any): any {
  // implementation
}
```

### Naming Conventions

#### Variables and Functions
- Use **camelCase** for variables and functions
- Use descriptive names that explain purpose
- Avoid abbreviations unless they're widely understood

```typescript
// ✅ Good
const userAccountBalance = 1000;
const isUserAuthenticated = true;

function calculateMonthlyPayment(principal: number, rate: number): number {
  // implementation
}

// ❌ Bad
const bal = 1000;
const auth = true;

function calc(p: number, r: number): number {
  // implementation
}
```

#### Constants
- Use **SCREAMING_SNAKE_CASE** for constants
- Group related constants in enums or const objects

```typescript
// ✅ Good
const MAX_RETRY_ATTEMPTS = 3;
const API_ENDPOINTS = {
  USERS: '/api/users',
  DEVICES: '/api/devices'
} as const;

enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer'
}

// ❌ Bad
const maxRetries = 3;
const userEndpoint = '/api/users';
```

#### Classes and Interfaces
- Use **PascalCase** for classes and interfaces
- Prefix interfaces with 'I' only when necessary for disambiguation
- Use descriptive names that indicate purpose

```typescript
// ✅ Good
class UserService {
  // implementation
}

interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

// ❌ Bad
class userservice {
  // implementation
}

interface IDB {
  // implementation
}
```

#### Files and Directories
- Use **kebab-case** for file and directory names
- Use descriptive names that indicate content
- Group related files in directories

```
// ✅ Good
src/
├── user-service/
│   ├── user-repository.ts
│   ├── user-validator.ts
│   └── user-types.ts
└── device-management/
    ├── device-controller.ts
    └── device-models.ts

// ❌ Bad
src/
├── UserService.ts
├── userRepo.ts
└── DevCtrl.ts
```

### Code Organization

#### File Structure
- One primary export per file
- Group related functionality together
- Separate concerns (types, logic, configuration)

```typescript
// user-service.ts
import { UserRepository } from './user-repository';
import { UserValidator } from './user-validator';
import { User, CreateUserRequest } from './user-types';

export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly validator: UserValidator
  ) {}

  async createUser(request: CreateUserRequest): Promise<User> {
    this.validator.validateCreateRequest(request);
    return this.repository.create(request);
  }
}
```

#### Import Organization
- Group imports by type (external, internal, relative)
- Use absolute imports for shared modules
- Avoid circular dependencies

```typescript
// ✅ Good
// External libraries
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Internal shared modules
import { Logger } from '@mytaptrack/lib';
import { User } from '@mytaptrack/types';

// Relative imports
import { UserRepository } from './user-repository';
import { validateUser } from '../validators/user-validator';

// ❌ Bad
import { validateUser } from '../validators/user-validator';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UserRepository } from './user-repository';
import { v4 as uuidv4 } from 'uuid';
```

## AWS CDK Standards

### Construct Organization
- One construct per file
- Use descriptive construct names
- Follow AWS CDK best practices

```typescript
// ✅ Good
export class UserManagementStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const userTable = new Table(this, 'UserTable', {
      tableName: `${props.stage}-users`,
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const userFunction = new Function(this, 'UserFunction', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: Code.fromAsset('dist/user-function'),
      environment: {
        USER_TABLE_NAME: userTable.tableName
      }
    });

    userTable.grantReadWriteData(userFunction);
  }
}
```

### Resource Naming
- Use consistent naming patterns
- Include stage/environment in resource names
- Use logical names that indicate purpose

```typescript
// ✅ Good
const userTable = new Table(this, 'UserTable', {
  tableName: `${stage}-users`,
  // ...
});

const deviceApi = new RestApi(this, 'DeviceApi', {
  restApiName: `${stage}-device-api`,
  // ...
});

// ❌ Bad
const table1 = new Table(this, 'Table1', {
  tableName: 'users',
  // ...
});
```

## Lambda Function Standards

### Function Structure
- Keep functions small and focused
- Use proper error handling
- Implement proper logging

```typescript
// ✅ Good
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Logger } from '@mytaptrack/lib';

const logger = new Logger('UserHandler');

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    logger.info('Processing user request', { requestId: event.requestContext.requestId });

    const userId = event.pathParameters?.id;
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID is required' })
      };
    }

    const user = await getUserById(userId);
    
    return {
      statusCode: 200,
      body: JSON.stringify(user)
    };
  } catch (error) {
    logger.error('Error processing user request', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function getUserById(id: string): Promise<User> {
  // implementation
}
```

### Error Handling
- Always handle errors gracefully
- Log errors with context
- Return appropriate HTTP status codes

```typescript
// ✅ Good
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  if (error instanceof ValidationError) {
    logger.warn('Validation failed', { error: error.message });
    throw new BadRequestError(error.message);
  }
  
  logger.error('Unexpected error', error);
  throw new InternalServerError('Operation failed');
}

// ❌ Bad
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.log(error);
  throw error;
}
```

## GraphQL Standards

### Schema Design
- Use descriptive type and field names
- Follow GraphQL best practices
- Implement proper input validation

```graphql
# ✅ Good
type User {
  id: ID!
  email: String!
  displayName: String
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

input CreateUserInput {
  email: String!
  displayName: String
}

type Mutation {
  createUser(input: CreateUserInput!): User!
}

# ❌ Bad
type User {
  id: String
  email: String
  name: String
}

type Mutation {
  createUser(email: String, name: String): User
}
```

### Resolver Implementation
- Keep resolvers focused and simple
- Use proper error handling
- Implement field-level authorization

```typescript
// ✅ Good
export const createUser: AppSyncResolverHandler<
  MutationCreateUserArgs,
  User
> = async (ctx) => {
  try {
    const { input } = ctx.arguments;
    
    // Validate input
    if (!isValidEmail(input.email)) {
      throw new Error('Invalid email format');
    }
    
    // Check authorization
    if (!ctx.identity?.sub) {
      throw new Error('Authentication required');
    }
    
    const user = await userService.createUser(input);
    return user;
  } catch (error) {
    logger.error('Failed to create user', error);
    throw error;
  }
};
```

## Testing Standards

### Unit Tests
- Test one thing at a time
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
// ✅ Good
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid input', async () => {
      // Arrange
      const mockRepository = {
        create: jest.fn().mockResolvedValue(mockUser)
      };
      const service = new UserService(mockRepository);
      const input = { email: 'test@example.com', displayName: 'Test User' };

      // Act
      const result = await service.createUser(input);

      // Assert
      expect(result).toEqual(mockUser);
      expect(mockRepository.create).toHaveBeenCalledWith(input);
    });

    it('should throw error when email is invalid', async () => {
      // Arrange
      const service = new UserService(mockRepository);
      const input = { email: 'invalid-email', displayName: 'Test User' };

      // Act & Assert
      await expect(service.createUser(input)).rejects.toThrow('Invalid email');
    });
  });
});
```

### Integration Tests
- Test complete workflows
- Use realistic test data
- Clean up resources after tests

```typescript
// ✅ Good
describe('User API Integration', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  it('should create and retrieve user via API', async () => {
    // Create user
    const createResponse = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', displayName: 'Test User' })
      .expect(201);

    const userId = createResponse.body.id;

    // Retrieve user
    const getResponse = await request(app)
      .get(`/api/users/${userId}`)
      .expect(200);

    expect(getResponse.body.email).toBe('test@example.com');
  });
});
```

## Documentation Standards

### Code Comments
- Use JSDoc for functions and classes
- Explain why, not what
- Keep comments up to date

```typescript
/**
 * Calculates the monthly payment for a loan
 * @param principal - The loan amount in dollars
 * @param annualRate - The annual interest rate as a decimal (e.g., 0.05 for 5%)
 * @param termInMonths - The loan term in months
 * @returns The monthly payment amount
 * @throws {Error} When any parameter is negative or zero
 */
function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termInMonths: number
): number {
  if (principal <= 0 || annualRate < 0 || termInMonths <= 0) {
    throw new Error('Invalid loan parameters');
  }

  // Convert annual rate to monthly rate
  const monthlyRate = annualRate / 12;
  
  // Calculate payment using standard loan formula
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, termInMonths)) /
         (Math.pow(1 + monthlyRate, termInMonths) - 1);
}
```

### README Files
- Include purpose and overview
- Provide setup instructions
- Document API endpoints and usage

```markdown
# User Service

## Overview
Handles user management operations including creation, authentication, and profile management.

## Setup
```bash
npm install
npm run build
npm run deploy
```

## API Endpoints
- `POST /users` - Create new user
- `GET /users/:id` - Get user by ID
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## Environment Variables
- `USER_TABLE_NAME` - DynamoDB table name for users
- `JWT_SECRET` - Secret for JWT token signing
```

## Security Standards

### Input Validation
- Validate all inputs at API boundaries
- Use schema validation libraries
- Sanitize user inputs

```typescript
// ✅ Good
import Joi from 'joi';

const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  displayName: Joi.string().min(1).max(100).optional(),
  age: Joi.number().integer().min(13).max(120).optional()
});

export function validateCreateUserInput(input: unknown): CreateUserInput {
  const { error, value } = createUserSchema.validate(input);
  if (error) {
    throw new ValidationError(error.details[0].message);
  }
  return value;
}
```

### Authentication and Authorization
- Always verify authentication for protected endpoints
- Implement proper authorization checks
- Use principle of least privilege

```typescript
// ✅ Good
export const protectedHandler = async (event: APIGatewayProxyEvent) => {
  // Verify authentication
  const user = await authenticateUser(event.headers.Authorization);
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Authentication required' })
    };
  }

  // Check authorization
  if (!user.permissions.includes('read:users')) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: 'Insufficient permissions' })
    };
  }

  // Process request
  // ...
};
```

### Secrets Management
- Never hardcode secrets in code
- Use AWS Parameter Store or Secrets Manager
- Rotate secrets regularly

```typescript
// ✅ Good
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({});

async function getSecret(parameterName: string): Promise<string> {
  const command = new GetParameterCommand({
    Name: parameterName,
    WithDecryption: true
  });
  
  const response = await ssmClient.send(command);
  return response.Parameter?.Value || '';
}

// ❌ Bad
const JWT_SECRET = 'hardcoded-secret-key';
```

## Performance Standards

### Lambda Optimization
- Minimize cold start times
- Reuse connections and clients
- Optimize bundle size

```typescript
// ✅ Good - Initialize outside handler
const dynamoClient = new DynamoDBClient({});
const logger = new Logger('UserHandler');

export const handler = async (event: APIGatewayProxyEvent) => {
  // Handler logic using pre-initialized clients
};

// ❌ Bad - Initialize inside handler
export const handler = async (event: APIGatewayProxyEvent) => {
  const dynamoClient = new DynamoDBClient({});
  const logger = new Logger('UserHandler');
  // Handler logic
};
```

### Database Optimization
- Use appropriate indexes
- Implement pagination for large datasets
- Cache frequently accessed data

```typescript
// ✅ Good
async function getUsers(limit: number = 20, lastKey?: string): Promise<{
  users: User[];
  lastKey?: string;
}> {
  const params = {
    TableName: USER_TABLE_NAME,
    Limit: limit,
    ExclusiveStartKey: lastKey ? JSON.parse(lastKey) : undefined
  };

  const result = await dynamoClient.scan(params).promise();
  
  return {
    users: result.Items as User[],
    lastKey: result.LastEvaluatedKey ? 
      JSON.stringify(result.LastEvaluatedKey) : undefined
  };
}
```

## Code Review Standards

### Review Checklist
- [ ] Code follows established patterns and conventions
- [ ] All functions have proper type annotations
- [ ] Error handling is implemented correctly
- [ ] Tests cover the new functionality
- [ ] Documentation is updated as needed
- [ ] Security considerations are addressed
- [ ] Performance implications are considered
- [ ] No hardcoded secrets or configuration

### Review Process
1. **Self Review**: Review your own code before submitting
2. **Automated Checks**: Ensure all CI checks pass
3. **Peer Review**: At least one team member must approve
4. **Testing**: Verify tests pass and cover new functionality
5. **Documentation**: Update relevant documentation

## Linting and Formatting

### ESLint Configuration
Use the project's ESLint configuration for consistent code style:

```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "error",
    "@typescript-eslint/no-explicit-any": "error",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

### Prettier Configuration
Use Prettier for consistent code formatting:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2
}
```

### Pre-commit Hooks
Set up pre-commit hooks to enforce standards:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write",
      "git add"
    ]
  }
}
```

## Continuous Integration

### Build Pipeline
- All code must pass linting and type checking
- All tests must pass
- Code coverage must meet minimum thresholds
- Security scans must pass

### Deployment Pipeline
- Automated deployment to staging environment
- Manual approval for production deployment
- Rollback procedures in case of issues
- Monitoring and alerting for deployments

## Best Practices Summary

1. **Type Safety**: Use TypeScript strictly, avoid `any`
2. **Error Handling**: Always handle errors gracefully
3. **Testing**: Write comprehensive tests for all functionality
4. **Documentation**: Keep documentation up to date
5. **Security**: Validate inputs, authenticate users, protect secrets
6. **Performance**: Optimize for Lambda cold starts and database queries
7. **Consistency**: Follow established patterns and conventions
8. **Code Review**: All code must be reviewed before merging
9. **Monitoring**: Implement proper logging and monitoring
10. **Automation**: Use CI/CD for consistent deployments