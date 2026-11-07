/**
 * Unit test stubs: DynamoDB client endpoint config
 *
 * These tests document the contract that Dal respects DYNAMODB_ENDPOINT when set.
 *
 * Wave 0 — RED stubs. Tests run and assert the correct contract; they should
 * pass against the current implementation (which already has this behavior).
 *
 * Strategy: vi.resetModules() + import() inside each test so env var
 * changes take effect. Re-import the mock to get the same instance as Dal uses.
 */

vi.mock('@aws-sdk/client-dynamodb', () => {
    const mockDynamoDBClient = vi.fn(function () {
        return { destroy: vi.fn() };
    });
    return { DynamoDBClient: mockDynamoDBClient };
});

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: vi.fn().mockReturnValue({
            send: vi.fn().mockResolvedValue({ Items: [], Item: null }),
        }),
    },
    GetCommand: vi.fn(),
    PutCommand: vi.fn(),
    UpdateCommand: vi.fn(),
    DeleteCommand: vi.fn(),
    QueryCommand: vi.fn(),
    ScanCommand: vi.fn(),
    BatchGetCommand: vi.fn(),
    TransactWriteCommand: vi.fn(),
    TransactGetCommand: vi.fn(),
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
        vi.clearAllMocks();
    });

    describe('with DYNAMODB_ENDPOINT set', () => {
        beforeEach(() => {
            process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
        });

        it('should configure DynamoDBClient with the endpoint URL', async () => {
            const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
            const { Dal } = await import('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as vi.Mock).mock.calls[0][0];
            expect(callConfig.endpoint).toBe('http://localhost:8000');
        });

        it('should configure DynamoDBClient with local credentials when endpoint is set', async () => {
            const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
            const { Dal } = await import('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as vi.Mock).mock.calls[0][0];
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

        it('should create DynamoDBClient with no endpoint override', async () => {
            const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
            const { Dal } = await import('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as vi.Mock).mock.calls[0][0];
            expect(callConfig.endpoint).toBeUndefined();
        });

        it('should create DynamoDBClient with no local credentials', async () => {
            const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
            const { Dal } = await import('./dal');
            new Dal('primary');

            expect(DynamoDBClient).toHaveBeenCalledTimes(1);
            const callConfig = (DynamoDBClient as vi.Mock).mock.calls[0][0];
            expect(callConfig.credentials).toBeUndefined();
        });
    });
});
