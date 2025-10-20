import { DependencyContainer } from '../dependency-container';
import { ConfigurationError } from '../../errors/service-errors';

describe('DependencyContainer', () => {
  let container: DependencyContainer;

  beforeEach(() => {
    container = new DependencyContainer();
  });

  afterEach(async () => {
    await container.shutdown();
  });

  describe('register and get', () => {
    it('should register and retrieve a service', async () => {
      const mockService = { value: 'test' };
      const factory = jest.fn().mockResolvedValue(mockService);

      container.register('test-service', factory);
      const result = await container.get('test-service');

      expect(result).toBe(mockService);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should return same instance for singleton services', async () => {
      const mockService = { value: 'test' };
      const factory = jest.fn().mockResolvedValue(mockService);

      container.register('test-service', factory, { singleton: true });
      
      const result1 = await container.get('test-service');
      const result2 = await container.get('test-service');

      expect(result1).toBe(result2);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should create new instances for non-singleton services', async () => {
      let counter = 0;
      const factory = jest.fn().mockImplementation(async () => ({ value: ++counter }));

      container.register('test-service', factory, { singleton: false });
      
      const result1 = await container.get('test-service');
      const result2 = await container.get('test-service');

      expect(result1).not.toBe(result2);
      expect((result1 as any).value).toBe(1);
      expect((result2 as any).value).toBe(2);
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('should throw ServiceError for unregistered service', async () => {
      await expect(container.get('unknown-service')).rejects.toThrow(ConfigurationError);
    });

    it('should handle concurrent requests for same service', async () => {
      const mockService = { value: 'test' };
      const factory = jest.fn().mockResolvedValue(mockService);

      container.register('test-service', factory);
      
      // Make concurrent requests
      const promises = [
        container.get('test-service'),
        container.get('test-service'),
        container.get('test-service')
      ];

      const results = await Promise.all(promises);

      // All should return the same instance
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
      
      // Factory should only be called once
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerInstance', () => {
    it('should register and retrieve a service instance', async () => {
      const mockService = { value: 'test' };

      container.registerInstance('test-service', mockService);
      const result = await container.get('test-service');

      expect(result).toBe(mockService);
    });
  });

  describe('getOrCreate', () => {
    it('should create service using provided factory', async () => {
      const mockService = { value: 'test' };
      const factory = jest.fn().mockResolvedValue(mockService);

      const result = await container.getOrCreate('test-service', factory);

      expect(result).toBe(mockService);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should return existing instance on subsequent calls', async () => {
      const mockService = { value: 'test' };
      const factory = jest.fn().mockResolvedValue(mockService);

      const result1 = await container.getOrCreate('test-service', factory);
      const result2 = await container.getOrCreate('test-service', factory);

      expect(result1).toBe(result2);
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('has', () => {
    it('should return true for registered services', () => {
      container.register('test-service', async () => ({}));
      expect(container.has('test-service')).toBe(true);
    });

    it('should return true for registered instances', () => {
      container.registerInstance('test-service', {});
      expect(container.has('test-service')).toBe(true);
    });

    it('should return false for unregistered services', () => {
      expect(container.has('unknown-service')).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove service and call shutdown if available', async () => {
      const mockService = { 
        value: 'test',
        shutdown: jest.fn().mockResolvedValue(undefined)
      };
      
      container.registerInstance('test-service', mockService);
      
      await container.remove('test-service');

      expect(mockService.shutdown).toHaveBeenCalled();
      expect(container.has('test-service')).toBe(false);
    });

    it('should handle services without shutdown method', async () => {
      const mockService = { value: 'test' };
      
      container.registerInstance('test-service', mockService);
      
      await expect(container.remove('test-service')).resolves.not.toThrow();
      expect(container.has('test-service')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all services and call shutdown methods', async () => {
      const service1 = { 
        value: 'test1',
        shutdown: jest.fn().mockResolvedValue(undefined)
      };
      const service2 = { value: 'test2' };
      
      container.registerInstance('service1', service1);
      container.registerInstance('service2', service2);
      
      await container.clear();

      expect(service1.shutdown).toHaveBeenCalled();
      expect(container.has('service1')).toBe(false);
      expect(container.has('service2')).toBe(false);
    });
  });

  describe('getRegisteredKeys', () => {
    it('should return all registered service keys', () => {
      container.register('service1', async () => ({}));
      container.registerInstance('service2', {});
      
      const keys = container.getRegisteredKeys();
      
      expect(keys).toContain('service1');
      expect(keys).toContain('service2');
      expect(keys).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return container statistics', async () => {
      container.register('service1', async () => ({}));
      container.registerInstance('service2', {});
      
      // Create one instance
      await container.get('service1');
      
      const stats = container.getStats();
      
      expect(stats.totalRegistered).toBe(3); // service1 factory + service2 instance + service1 instance
      expect(stats.totalInstantiated).toBe(2); // service1 created, service2 registered as instance
      expect(stats.singletons).toBe(2);
      expect(stats.pendingInitializations).toBe(0);
    });
  });

  describe('service initialization', () => {
    it('should call initialize method if available', async () => {
      const mockService = {
        value: 'test',
        initialize: jest.fn().mockResolvedValue(undefined)
      };
      const factory = jest.fn().mockResolvedValue(mockService);

      container.register('test-service', factory);
      await container.get('test-service');

      expect(mockService.initialize).toHaveBeenCalled();
    });

    it('should handle services without initialize method', async () => {
      const mockService = { value: 'test' };
      const factory = jest.fn().mockResolvedValue(mockService);

      container.register('test-service', factory);
      
      await expect(container.get('test-service')).resolves.toBe(mockService);
    });

    it('should throw ServiceError if factory fails', async () => {
      const factory = jest.fn().mockRejectedValue(new Error('Factory failed'));

      container.register('test-service', factory);
      
      await expect(container.get('test-service')).rejects.toThrow(ConfigurationError);
    });
  });
});