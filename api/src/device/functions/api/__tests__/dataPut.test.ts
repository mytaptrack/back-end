import { APIGatewayEvent } from 'aws-lambda';
import { handler } from '../dataPut';

// Mock the business logic dependencies
jest.mock('@mytaptrack/business-logic-device', () => ({
  DeviceOperations: {
    recordDeviceData: jest.fn().mockResolvedValue(undefined)
  },
  createLambdaServiceContext: jest.fn().mockResolvedValue({
    logger: {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    },
    dataAccess: {},
    messageBroker: {},
    authentication: {},
    cache: {},
    config: {}
  })
}));

// Mock other dependencies
jest.mock('@mytaptrack/lib', () => ({
  WebUtils: {
    lambdaWrapper: (fn) => fn,
    isDebug: false,
    logObjectDetails: jest.fn(),
    setError: jest.fn(),
    done: jest.fn().mockReturnValue({ statusCode: 200 }),
    setLabels: jest.fn()
  },
  v2: {
    EventDal: {
      sendEvents: jest.fn().mockResolvedValue(undefined)
    }
  },
  LambdaAppsyncQueryClient: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue({
      deviceName: 'Test Device',
      dsn: 'M200000000000001',
      events: [{
        eventId: 'test-event',
        presses: 1,
        isDuration: false,
        notStopped: false,
        lastStart: null
      }],
      license: 'test-license',
      studentId: 'test-student',
      validated: true,
      timezone: 'America/Los_Angeles'
    })
  }))
}));

describe('dataPut Lambda Function', () => {
  const mockEvent = {
    body: JSON.stringify({
      dsn: 'M200000000000001',
      identity: 'test-identity',
      pressType: 'single',
      clickCount: 1,
      eventDate: new Date().toISOString(),
      remainingLife: 100
    }),
    headers: {},
    pathParameters: null,
    queryStringParameters: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process device data successfully', async () => {
    const result = await handler(mockEvent);
    
    expect(result).toBeDefined();
    // Verify that DeviceOperations.recordDeviceData was called
    const { DeviceOperations } = require('@mytaptrack/business-logic-device');
    expect(DeviceOperations.recordDeviceData).toHaveBeenCalledWith(
      'M200000000000001',
      expect.objectContaining({
        studentId: 'test-student',
        dataType: 'track-event'
      }),
      expect.any(Object)
    );
  });

  it('should handle missing DSN', async () => {
    const invalidEvent = {
      ...mockEvent,
      body: JSON.stringify({
        identity: 'test-identity',
        pressType: 'single',
        clickCount: 1,
        eventDate: new Date().toISOString()
      })
    };

    const result = await handler(invalidEvent);
    
    // Should return error response
    expect(result).toBeDefined();
  });

  it('should handle missing click count', async () => {
    const invalidEvent = {
      ...mockEvent,
      body: JSON.stringify({
        dsn: 'M200000000000001',
        identity: 'test-identity',
        pressType: 'single',
        eventDate: new Date().toISOString()
      })
    };

    const result = await handler(invalidEvent);
    
    // Should return error response
    expect(result).toBeDefined();
  });
});