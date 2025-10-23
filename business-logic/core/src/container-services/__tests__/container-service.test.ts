import { ContainerService } from '../container-service';
import { ServerConfig, HealthStatus } from '../interfaces';
import { ServiceContext } from '../../interfaces/service-context';
import { Request, Response } from 'express';
import { it } from 'node:test';
import { it } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { afterEach } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock Express for testing
jest.mock('express', () => {
  const mockApp = {
    use: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    listen: jest.fn((port, host, callback) => {
      setTimeout(callback, 10); // Simulate async server start
      return {
        on: jest.fn(),
        close: jest.fn((callback) => callback())
      };
    }),
    set: jest.fn(),
    disable: jest.fn()
  };
  
  const express = jest.fn(() => mockApp) as any;
  express.json = jest.fn(() => (req: any, res: any, next: any) => next());
  express.urlencoded = jest.fn(() => (req: any, res: any, next: any) => next());
  
  return express;
});

// Mock helmet
jest.mock('helmet', () => jest.fn(() => (req: any, res: any, next: any) => next()));

// Mock compression
jest.mock('compression', () => jest.fn(() => (req: any, res: any, next: any) => next()));

// Mock cookie-parser
jest.mock('cookie-parser', () => jest.fn(() => (req: any, res: any, next: any) => next()));

// Test implementation of ContainerService
class TestContainerService extends ContainerService {
  constructor(config: ServerConfig) {
    super(config);
  }

  protected getServiceName(): string {
    return 'test-service';
  }

  protected async setupRoutes(): Promise<void> {
    this.addRoute('get', '/test', (req: Request, res: Response) => {
      res.json({ message: 'test response' });
    });
  }

  // Override to use mock service context
  protected async createServiceContext(): Promise<ServiceContext> {
    return {
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
  }
}

describe('ContainerService', () => {
  let service: TestContainerService;
  let config: ServerConfig;

  beforeEach(() => {
    config = {
      port: 3000,
      host: 'localhost',
      cors: {
        origin: true,
        credentials: true
      },
      middleware: {
        requestLogging: true,
        compression: true
      },
      security: {
        helmet: true,
        trustProxy: true
      }
    };

    service = new TestContainerService(config);
  });

  afterEach(async () => {
    if (service) {
      await service.shutdown();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      
      expect(service).toBeDefined();
    });

    it('should throw error if already initialized', async () => {
      await service.initialize();
      
      await expect(service.initialize()).rejects.toThrow('Container service already initialized');
    });
  });

  describe('shutdown', () => {
    it('should shutdown successfully', async () => {
      await service.initialize();
      await service.shutdown();
      
      // Should not throw
    });

    it('should handle shutdown when not initialized', async () => {
      await service.shutdown();
      
      // Should not throw
    });
  });

  describe('health checks', () => {
    it('should return health status', async () => {
      await service.initialize();
      
      const healthStatus: HealthStatus = await service.getHealthStatus();
      
      expect(healthStatus).toBeDefined();
      expect(healthStatus).toHaveProperty('healthy');
      expect(healthStatus).toHaveProperty('checks');
      expect(healthStatus).toHaveProperty('timestamp');
      expect(healthStatus).toHaveProperty('uptime');
      expect(typeof healthStatus.healthy).toBe('boolean');
      expect(typeof healthStatus.checks).toBe('object');
      expect(typeof healthStatus.timestamp).toBe('string');
      expect(typeof healthStatus.uptime).toBe('number');
    });

    it('should include standard health checks', async () => {
      await service.initialize();
      
      const healthStatus = await service.getHealthStatus();
      
      expect(healthStatus.checks).toHaveProperty('database');
      expect(healthStatus.checks).toHaveProperty('messageBroker');
      expect(healthStatus.checks).toHaveProperty('cache');
      expect(healthStatus.checks).toHaveProperty('authentication');
    });
  });

  describe('service name', () => {
    it('should return correct service name', () => {
      expect(service['getServiceName']()).toBe('test-service');
    });
  });

  describe('middleware setup', () => {
    it('should setup middleware during initialization', async () => {
      await service.initialize();
      
      // Verify that Express app methods were called
      const app = (service as any).app;
      expect(app.use).toHaveBeenCalled();
      expect(app.get).toHaveBeenCalled(); // Health check routes
    });
  });

  describe('route setup', () => {
    it('should setup routes during initialization', async () => {
      await service.initialize();
      
      // Verify that routes were added
      const app = (service as any).app;
      expect(app.get).toHaveBeenCalled();
    });
  });

  describe('configuration', () => {
    it('should use provided configuration', () => {
      expect((service as any).config).toEqual(config);
    });

    it('should handle minimal configuration', () => {
      const minimalConfig: ServerConfig = { port: 4000 };
      const minimalService = new TestContainerService(minimalConfig);
      
      expect((minimalService as any).config.port).toBe(4000);
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Create a service that will fail during context creation
      class FailingService extends TestContainerService {
        protected async createServiceContext(): Promise<ServiceContext> {
          throw new Error('Context creation failed');
        }
      }

      const failingService = new FailingService(config);
      
      await expect(failingService.initialize()).rejects.toThrow('Context creation failed');
    });
  });
});

describe('ContainerService middleware integration', () => {
  let service: TestContainerService;
  let config: ServerConfig;

  beforeEach(() => {
    config = {
      port: 3001,
      middleware: {
        requestLogging: true,
        compression: true,
        rateLimiting: {
          windowMs: 15 * 60 * 1000,
          maxRequests: 100
        }
      }
    };

    service = new TestContainerService(config);
  });

  afterEach(async () => {
    if (service) {
      await service.shutdown();
    }
  });

  it('should setup rate limiting middleware when configured', async () => {
    await service.initialize();
    
    const app = (service as any).app;
    expect(app.use).toHaveBeenCalled();
  });

  it('should setup CORS middleware when configured', async () => {
    const corsConfig: ServerConfig = {
      port: 3002,
      cors: {
        origin: ['http://localhost:3000'],
        credentials: true
      }
    };

    const corsService = new TestContainerService(corsConfig);
    await corsService.initialize();
    
    const app = (corsService as any).app;
    expect(app.use).toHaveBeenCalled();
    
    await corsService.shutdown();
  });
});