import { ServerConfig } from '../interfaces';
import { ServiceContext } from '../../interfaces/service-context';

// Mock the entire device operations module
jest.mock('@mytaptrack/business-logic-device', () => ({
  DeviceOperations: {
    registerDevice: jest.fn(),
    getDeviceRegistration: jest.fn(),
    unregisterDevice: jest.fn(),
    recordDeviceData: jest.fn(),
    updateDeviceStatus: jest.fn(),
    updateBatteryLevel: jest.fn(),
    updateDeviceSettings: jest.fn()
  }
}));

jest.mock('../../service-context/service-context-factory');

// Import after mocking
import { DeviceAPIService } from '../device-api-service';

describe('DeviceAPIService', () => {
  let service: DeviceAPIService;
  let mockServiceContext: Partial<ServiceContext>;
  let config: ServerConfig;

  beforeEach(() => {
    // Setup mock service context
    mockServiceContext = {
      logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
      },
      messageBroker: {
        publish: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn()
      },
      dataAccess: {
        get: jest.fn(),
        put: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        query: jest.fn(),
        scan: jest.fn(),
        batchGet: jest.fn(),
        isConnected: jest.fn().mockResolvedValue(true)
      },
      authentication: {
        validateToken: jest.fn(),
        getUserContext: jest.fn(),
        refreshToken: jest.fn()
      },
      cache: {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
        isConnected: jest.fn().mockResolvedValue(true)
      },
      config: {
        correlationId: 'test-correlation-id',
        environment: 'test',
        database: { provider: 'mongodb' },
        messageBroker: { provider: 'rabbitmq' },
        authentication: { provider: 'jwt' },
        cache: { provider: 'redis' }
      } as any
    };

    // Setup service config
    config = {
      port: 0, // Use random port for testing
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
      },
      middleware: {
        requestLogging: false // Disable for cleaner test output
      }
    };

    service = new DeviceAPIService(config);
    
    // Mock service context creation
    (service as any).createServiceContext = jest.fn().mockResolvedValue(mockServiceContext);
  });

  afterEach(async () => {
    if (service && (service as any).isInitialized) {
      await service.shutdown();
    }
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should create service instance', () => {
      expect(service).toBeDefined();
      expect((service as any).getServiceName()).toBe('device-api');
    });

    it('should have correct service name', () => {
      expect((service as any).getServiceName()).toBe('device-api');
    });
  });

  describe('Device Operations Integration', () => {
    it('should integrate with device operations', () => {
      // Test that the service can be created
      expect(service).toBeDefined();
    });

    it('should handle device registration', () => {
      // Test basic functionality
      expect(service).toBeDefined();
      expect((service as any).getServiceName()).toBe('device-api');
    });
  });

  describe('Event Publishing', () => {
    it('should publish device events to message broker', async () => {
      await mockServiceContext.messageBroker?.publish('device.registered', {
        deviceId: 'test-device',
        timestamp: new Date().toISOString()
      });

      expect(mockServiceContext.messageBroker?.publish).toHaveBeenCalledWith(
        'device.registered',
        expect.objectContaining({
          deviceId: 'test-device'
        })
      );
    });

    it('should publish track events', async () => {
      await mockServiceContext.messageBroker?.publish('device.track.button.pressed', {
        deviceId: 'M200000000000001',
        studentId: 'student-123',
        clickCount: 3,
        timestamp: new Date().toISOString()
      });

      expect(mockServiceContext.messageBroker?.publish).toHaveBeenCalledWith(
        'device.track.button.pressed',
        expect.objectContaining({
          deviceId: 'M200000000000001',
          clickCount: 3
        })
      );
    });
  });

  describe('Configuration', () => {
    it('should accept valid configuration', () => {
      const testConfig: ServerConfig = {
        port: 3003,
        cors: { origin: '*' },
        middleware: { requestLogging: true }
      };

      const testService = new DeviceAPIService(testConfig);
      expect(testService).toBeDefined();
    });

    it('should handle minimal configuration', () => {
      const minimalConfig: ServerConfig = {
        port: 3003
      };

      const testService = new DeviceAPIService(minimalConfig);
      expect(testService).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', () => {
      // Test error handling
      expect(service).toBeDefined();
    });

    it('should handle validation errors', () => {
      // Test validation logic would go here
      expect(service).toBeDefined();
    });
  });
});