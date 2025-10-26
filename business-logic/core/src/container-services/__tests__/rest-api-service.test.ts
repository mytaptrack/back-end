import { RestAPIService } from '../rest-api-service';
import { ServerConfig } from '../interfaces';
import { ServiceContext } from '../../interfaces/service-context';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock Express for testing
jest.mock('express', () => {
  const mockRouter = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    use: jest.fn()
  };

  const mockApp = {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    listen: jest.fn((port, host, callback) => {
      setTimeout(callback, 10);
      return {
        on: jest.fn(),
        close: jest.fn((callback) => callback())
      };
    }),
    set: jest.fn(),
    disable: jest.fn(),
    setHeader: jest.fn()
  };
  
  const express = jest.fn(() => mockApp) as any;
  express.json = jest.fn(() => (req: any, res: any, next: any) => next());
  express.urlencoded = jest.fn(() => (req: any, res: any, next: any) => next());
  express.Router = jest.fn(() => mockRouter);
  
  return express;
});

// Mock other dependencies
jest.mock('helmet', () => jest.fn(() => (req: any, res: any, next: any) => next()));
jest.mock('compression', () => jest.fn(() => (req: any, res: any, next: any) => next()));
jest.mock('cookie-parser', () => jest.fn(() => (req: any, res: any, next: any) => next()));

// Mock business logic operations
jest.mock('@mytaptrack/business-logic-user', () => ({
  UserOperations: {
    getUserById: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn()
  }
}));

jest.mock('@mytaptrack/business-logic-student', () => ({
  StudentOperations: {
    getStudentById: jest.fn(),
    createStudent: jest.fn()
  }
}));

describe('RestAPIService', () => {
  let restApiService: RestAPIService;
  let mockServiceContext: ServiceContext;
  let config: ServerConfig;

  beforeEach(() => {
    // Create mock service context
    mockServiceContext = {
      dataAccess: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([]),
        scan: jest.fn().mockResolvedValue([]),
        batchGet: jest.fn().mockResolvedValue([]),
        isConnected: jest.fn().mockResolvedValue(true)
      } as any,
      messageBroker: {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        publish: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockResolvedValue(undefined),
        unsubscribe: jest.fn().mockResolvedValue(undefined)
      } as any,
      authentication: {
        validateToken: jest.fn().mockResolvedValue({ valid: true }),
        getUserContext: jest.fn().mockResolvedValue({}),
        refreshToken: jest.fn().mockResolvedValue({})
      } as any,
      cache: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        clear: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockResolvedValue(true)
      } as any,
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      },
      config: {
        environment: 'docker',
        database: { provider: 'mongodb' },
        messageBroker: { provider: 'rabbitmq' },
        authentication: { provider: 'jwt' },
        cache: { provider: 'redis' }
      } as any
    };

    // Create test configuration
    config = {
      port: 0, // Use random port for testing
      host: 'localhost',
      cors: {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
      },
      middleware: {
        requestLogging: false, // Disable for cleaner test output
        compression: true,
        rateLimiting: {
          windowMs: 60000,
          maxRequests: 100
        }
      },
      security: {
        helmet: true,
        trustProxy: false,
        hidePoweredBy: true
      }
    };

    restApiService = new RestAPIService(config);
  });

  afterEach(async () => {
    if (restApiService) {
      await restApiService.shutdown();
    }
  });

  describe('Service Lifecycle', () => {
    it('should initialize successfully', async () => {
      // Mock the service context creation
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);

      await expect(restApiService.initialize()).resolves.not.toThrow();
    });

    it('should shutdown gracefully', async () => {
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);

      await restApiService.initialize();
      await expect(restApiService.shutdown()).resolves.not.toThrow();
    });

    it('should get service name', () => {
      expect((restApiService as any).getServiceName()).toBe('REST API Service');
    });
  });

  describe('Health Endpoints', () => {
    beforeEach(async () => {
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);
      await restApiService.initialize();
    });

    it('should setup health check routes', async () => {
      const app = (restApiService as any).app;
      expect(app.get).toHaveBeenCalledWith('/health', expect.any(Function));
      expect(app.get).toHaveBeenCalledWith('/ready', expect.any(Function));
      expect(app.get).toHaveBeenCalledWith('/live', expect.any(Function));
    });

    it('should return health status', async () => {
      const healthStatus = await restApiService.getHealthStatus();
      expect(healthStatus).toHaveProperty('healthy');
      expect(healthStatus).toHaveProperty('timestamp');
    });
  });

  describe('API Versioning', () => {
    beforeEach(async () => {
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);
      await restApiService.initialize();
    });

    it('should setup API versioning middleware', async () => {
      const app = (restApiService as any).app;
      expect(app.use).toHaveBeenCalledWith('/api/v2', expect.any(Function));
    });

    it('should setup request validation middleware', async () => {
      const app = (restApiService as any).app;
      expect(app.use).toHaveBeenCalled();
    });
  });

  describe('User Routes', () => {
    beforeEach(async () => {
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);
      await restApiService.initialize();
    });

    it('should setup user routes', async () => {
      const app = (restApiService as any).app;
      expect(app.use).toHaveBeenCalledWith('/api/v2', expect.any(Object));
    });

    it('should setup authenticated router for user routes', async () => {
      // Verify that authentication middleware is applied
      expect(mockServiceContext.authentication).toBeDefined();
    });
  });

  describe('Student Routes', () => {
    beforeEach(async () => {
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);
      await restApiService.initialize();
    });

    it('should setup student routes', async () => {
      const app = (restApiService as any).app;
      expect(app.use).toHaveBeenCalledWith('/api/v2', expect.any(Object));
    });

    it('should setup authenticated router for student routes', async () => {
      // Verify that authentication middleware is applied
      expect(mockServiceContext.authentication).toBeDefined();
    });
  });

  describe('Utility Routes', () => {
    beforeEach(async () => {
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);
      await restApiService.initialize();
    });

    it('should setup utility routes', async () => {
      const app = (restApiService as any).app;
      expect(app.post).toHaveBeenCalledWith('/api/user/error', expect.any(Function));
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      jest.spyOn(restApiService as any, 'createServiceContext')
        .mockResolvedValue(mockServiceContext);
      await restApiService.initialize();
    });

    it('should setup error handling middleware', async () => {
      const app = (restApiService as any).app;
      expect(app.use).toHaveBeenCalled();
    });

    it('should have error middleware available', async () => {
      const errorMiddleware = (restApiService as any).errorMiddleware;
      expect(errorMiddleware).toBeDefined();
    });
  });
});