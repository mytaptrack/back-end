/**
 * Test setup utilities to avoid AWS credential issues
 */

// Mock AWS SDK to avoid credential issues in tests
vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(function () {
    return { destroy: vi.fn() };
  })
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue({
        Items: [],
        Item: null,
        LastEvaluatedKey: undefined
      })
    })
  },
  GetCommand: vi.fn(),
  PutCommand: vi.fn(),
  UpdateCommand: vi.fn(),
  DeleteCommand: vi.fn(),
  QueryCommand: vi.fn(),
  ScanCommand: vi.fn(),
  BatchGetCommand: vi.fn(),
  TransactWriteCommand: vi.fn(),
  TransactGetCommand: vi.fn()
}));

// Mock AWS AppSync client
vi.mock('aws-sigv4-fetch', () => ({
  createSignedFetcher: vi.fn().mockReturnValue(
    vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ data: {} })
    })
  )
}));

// Mock Cognito client
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(function () {
    return { send: vi.fn().mockResolvedValue({}) };
  })
}));

// Set test environment variables
process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTENT_READ = 'false';

// Disable abstraction layer for legacy tests
process.env.USE_DATABASE_ABSTRACTION = 'false';

export {};