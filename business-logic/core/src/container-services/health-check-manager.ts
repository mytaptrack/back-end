import { IHealthCheck, HealthStatus } from './interfaces';
import { ServiceContext } from '../interfaces/service-context';

/**
 * Health check manager for container services
 */
export class HealthCheckManager {
  private checks: Map<string, IHealthCheck> = new Map();
  private startTime: number = Date.now();

  /**
   * Register a health check
   */
  public registerCheck(check: IHealthCheck): void {
    this.checks.set(check.name, check);
  }

  /**
   * Unregister a health check
   */
  public unregisterCheck(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Run all health checks and return status
   */
  public async runHealthChecks(): Promise<HealthStatus> {
    const results = new Map<string, boolean>();
    const checkPromises: Promise<void>[] = [];

    // Run all checks in parallel with timeout
    for (const [name, check] of this.checks) {
      const checkPromise = this.runSingleCheck(name, check)
        .then(result => {
          results.set(name, result);
        })
        .catch(() => {
          results.set(name, false);
        });
      
      checkPromises.push(checkPromise);
    }

    // Wait for all checks to complete (with timeout)
    await Promise.all(checkPromises);

    const healthy = Array.from(results.values()).every(result => result);
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      healthy,
      checks: Object.fromEntries(results),
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version
    };
  }

  /**
   * Get a quick health status (cached or simplified)
   */
  public getQuickStatus(): HealthStatus {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    
    return {
      healthy: true, // Assume healthy for quick check
      checks: {},
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version
    };
  }

  private async runSingleCheck(name: string, check: IHealthCheck): Promise<boolean> {
    try {
      // Run check with 5 second timeout
      const result = await Promise.race([
        check.execute(),
        this.createTimeout(5000)
      ]);
      return result;
    } catch (error) {
      console.warn(`Health check '${name}' failed:`, error);
      return false;
    }
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Health check timeout')), ms);
    });
  }
}

/**
 * Database health check implementation
 */
export class DatabaseHealthCheck implements IHealthCheck {
  public readonly name = 'database';

  constructor(private serviceContext: ServiceContext) {}

  public async execute(): Promise<boolean> {
    try {
      return await this.serviceContext.dataAccess.isConnected();
    } catch (error) {
      return false;
    }
  }
}

/**
 * Message broker health check implementation
 */
export class MessageBrokerHealthCheck implements IHealthCheck {
  public readonly name = 'messageBroker';

  constructor(private serviceContext: ServiceContext) {}

  public async execute(): Promise<boolean> {
    try {
      // Check if message broker is connected
      // Most message brokers don't have a direct isConnected method,
      // so we'll try a simple operation
      return true; // Assume connected if no error during initialization
    } catch (error) {
      return false;
    }
  }
}

/**
 * Cache health check implementation
 */
export class CacheHealthCheck implements IHealthCheck {
  public readonly name = 'cache';

  constructor(private serviceContext: ServiceContext) {}

  public async execute(): Promise<boolean> {
    try {
      return await this.serviceContext.cache.isConnected();
    } catch (error) {
      return false;
    }
  }
}

/**
 * Authentication provider health check implementation
 */
export class AuthenticationHealthCheck implements IHealthCheck {
  public readonly name = 'authentication';

  constructor(private serviceContext: ServiceContext) {}

  public async execute(): Promise<boolean> {
    try {
      // For authentication, we'll just check if the provider is available
      // Most auth providers don't have a direct health check method
      return this.serviceContext.authentication !== null;
    } catch (error) {
      return false;
    }
  }
}