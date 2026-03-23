/**
 * Unit test stubs: DynamoDB client endpoint config
 *
 * These tests document the contract that Dal respects DYNAMODB_ENDPOINT when set.
 *
 * Wave 0 — RED stubs. Tests run and assert the correct contract; they should
 * pass against the current implementation (which already has this behavior).
 *
 * Strategy: jest.resetModules() + require() inside each test so env var
 * changes take effect. Re-require the mock to get the same instance as Dal uses.
 */

jest.mock('@aws-sdk/client-dynamodb', () => {
    const mockDynamoDBClient = jest.fn().mockImplementation(() => ({
        destroy: jest.fn(),
    }));
    return { DynamoDBClient: mockDynamoDBClient };
});

jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: jest.fn().mockReturnValue({
            send: jest.fn().mockResolvedValue({ Items: [], Item: null }),
        }),
    },
    GetCommand: jest.fn(),
    PutCommand: jest.fn(),
    UpdateCommand: jest.fn(),
    DeleteCommand: jest.fn(),
    QueryCommand: jest.fn(),
    ScanCommand: jest.fn(),
    BatchGetCommand: jest.fn(),
    TransactWriteCommand: jest.fn(),
    TransactGetCommand: jest.fn(),
}));

describe('Dal', () => {
    beforeEach(() => {
        // Base env that every test needs
        process.env.AWS_REGION = 'us-east-1';
        process.env.PrimaryTable = 'test-primary';
        process.env.DataTable = 'test-data';
    });

    afterEach(() => {
        delete process.env.DYNAMODB_ENDPOINT;
        jest.clearAllMocks();
    });

    describe('with DYNAMODB_ENDPOINT set', () => {
        beforeEach(() => {
            process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
        });

        it('should configure DynamoDBClient with the endpoint URL', () => {
            const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
            const { Dal } = require('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as jest.Mock).mock.calls[0][0];
            expect(callConfig.endpoint).toBe('http://localhost:8000');
        });

        it('should configure DynamoDBClient with local credentials when endpoint is set', () => {
            const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
            const { Dal } = require('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as jest.Mock).mock.calls[0][0];
            expect(callConfig.credentials).toEqual({
                accessKeyId: 'local',
                secretAccessKey: 'local',
            });
        });
    });

    describe('without DYNAMODB_ENDPOINT', () => {
        beforeEach(() => {
            delete process.env.DYNAMODB_ENDPOINT;
        });

        it('should create DynamoDBClient with no endpoint override', () => {
            const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
            const { Dal } = require('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as jest.Mock).mock.calls[0][0];
            expect(callConfig.endpoint).toBeUndefined();
        });

        it('should create DynamoDBClient with no local credentials', () => {
            const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
            const { Dal } = require('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as jest.Mock).mock.calls[0][0];
            expect(callConfig.credentials).toBeUndefined();
        });
    });
});
