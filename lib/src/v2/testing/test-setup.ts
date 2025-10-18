/**
 * Test setup utilities to avoid AWS credential issues
 */

// Mock AWS SDK to avoid credential issues in tests
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
  GetCommand: jest.fn(),
  PutCommand: jest.fn(),
  UpdateCommand: jest.fn(),
  DeleteCommand: jest.fn(),
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn(),
  BatchGetCommand: jest.fn(),
  TransactWriteCommand: jest.fn(),
  TransactGetCommand: jest.fn()
}));

// Mock AWS AppSync client
jest.mock('aws-sigv4-fetch', () => ({
  createSignedFetcher: jest.fn().mockReturnValue(
    jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ data: {} })
    })
  )
}));

// Mock Cognito client
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({})
  }))
}));

// Set test environment variables
process.env.AWS_REGION = 'us-west-2';
process.env.PrimaryTable = 'mytaptrack-test-primary';
process.env.DataTable = 'mytaptrack-test-data';
process.env.STRONGLY_CONSISTENT_READ = 'false';

// Disable abstraction layer for legacy tests
process.env.USE_DATABASE_ABSTRACTION = 'false';

export {};