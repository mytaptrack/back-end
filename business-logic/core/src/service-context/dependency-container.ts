import { ConfigurationError } from '../errors/service-errors';

/**
 * Dependency injection container for managing service instances and their dependencies
 */
export class DependencyContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, () => Promise<any>>();
  private singletons = new Set<string>();
  private initializationPromises = new Map<string, Promise<any>>();

  /**
   * Register a service factory function
   */
  public register<T>(
    key: string, 
    factory: () => Promise<T>, 
    options: { singleton?: boolean } = {}
  ): void {
    this.factories.set(key, factory);
    
    if (options.singleton !== false) {
      this.singletons.add(key);
    }
  }

  /**
   * Register a service instance directly
   */
  public registerInstance<T>(key: string, instance: T): void {
    this.services.set(key, instance);
    this.singletons.add(key);
  }

  /**
   * Get a service instance, creating it if necessary
   */
  public async get<T>(key: string): Promise<T> {
    // Return existing instance if it's a singleton and already created
    if (this.singletons.has(key) && this.services.has(key)) {
      return this.services.get(key);
    }

    // Check if initialization is already in progress
    if (this.initializationPromises.has(key)) {
      return this.initializationPromises.get(key);
    }

    // Get factory function
    const factory = this.factories.get(key);
    if (!factory) {
      throw new ConfigurationError(`Service '${key}' not registered`);
    }

    // Create initialization promise
    const initPromise = this.createService(key, factory);
    this.initializationPromises.set(key, initPromise);

    try {
      const instance = await initPromise;
      
      // Store instance if it's a singleton
      if (this.singletons.has(key)) {
        this.services.set(key, instance);
      }
      
      return instance;
    } finally {
      // Clean up initialization promise
      this.initializationPromises.delete(key);
    }
  }

  /**
   * Get or create a service using a factory function
   */
  public async getOrCreate<T>(key: string, factory: () => Promise<T>): Promise<T> {
    // Return existing instance if available
    if (this.services.has(key)) {
      return this.services.get(key);
    }

    // Check if initialization is already in progress
    if (this.initializationPromises.has(key)) {
      return this.initializationPromises.get(key);
    }

    // Create initialization promise
    const initPromise = factory();
    this.initializationPromises.set(key, initPromise);

    try {
      const instance = await initPromise;
      
      // Store as singleton by default
      this.services.set(key, instance);
      this.singletons.add(key);
      
      return instance;
    } finally {
      // Clean up initialization promise
      this.initializationPromises.delete(key);
    }
  }

  /**
   * Check if a service is registered
   */
  public has(key: string): boolean {
    return this.factories.has(key) || this.services.has(key);
  }

  /**
   * Remove a service from the container
   */
  public async remove(key: string): Promise<void> {
    // Shutdown service if it has a shutdown method
    const instance = this.services.get(key);
    if (instance && typeof instance.shutdown === 'function') {
      try {
        await instance.shutdown();
      } catch (error) {
        console.warn(`Error shutting down service '${key}':`, error);
      }
    }

    // Clean up
    this.services.delete(key);
    this.factories.delete(key);
    this.singletons.delete(key);
    this.initializationPromises.delete(key);
  }

  /**
   * Clear all services and factories
   */
  public async clear(): Promise<void> {
    const shutdownPromises: Promise<void>[] = [];

    // Shutdown all services that have a shutdown method
    for (const [key, instance] of this.services) {
      if (instance && typeof instance.shutdown === 'function') {
        shutdownPromises.push(
          instance.shutdown().catch((error: any) => {
            console.warn(`Error shutting down service '${key}':`, error);
          })
        );
      }
    }

    // Wait for all shutdowns to complete
    await Promise.all(shutdownPromises);

    // Clear all maps and sets
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
    this.initializationPromises.clear();
  }

  /**
   * Shutdown all services and clean up resources
   */
  public async shutdown(): Promise<void> {
    await this.clear();
  }

  /**
   * Get all registered service keys
   */
  public getRegisteredKeys(): string[] {
    const keys = new Set<string>();
    
    for (const key of this.factories.keys()) {
      keys.add(key);
    }
    
    for (const key of this.services.keys()) {
      keys.add(key);
    }
    
    return Array.from(keys);
  }

  /**
   * Get service statistics
   */
  public getStats(): {
    totalRegistered: number;
    totalInstantiated: number;
    singletons: number;
    pendingInitializations: number;
  } {
    return {
      totalRegistered: this.factories.size + this.services.size,
      totalInstantiated: this.services.size,
      singletons: this.singletons.size,
      pendingInitializations: this.initializationPromises.size
    };
  }

  private async createService<T>(key: string, factory: () => Promise<T>): Promise<T> {
    try {
      const instance = await factory();
      
      // Initialize service if it has an initialize method
      if (instance && typeof (instance as any).initialize === 'function') {
        await (instance as any).initialize();
      }
      
      return instance;
    } catch (error) {
      throw new ConfigurationError(
        `Failed to create service '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { key, error }
      );
    }
  }
}

/**
 * Global dependency container instance
 */
export const globalContainer = new DependencyContainer();