import { ServiceContext } from '../interfaces/service-context';
import { ConfigurationError } from '../errors/service-errors';

/**
 * Service lifecycle manager for graceful startup and shutdown
 */
export class ServiceLifecycleManager {
  private context?: ServiceContext;
  private isInitialized = false;
  private isShuttingDown = false;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private shutdownTimeout = 30000; // 30 seconds default

  /**
   * Initialize services with graceful startup
   */
  public async initialize(context: ServiceContext): Promise<void> {
    if (this.isInitialized) {
      throw new ConfigurationError('Service lifecycle manager already initialized');
    }

    try {
      this.context = context;
      
      // Setup shutdown handlers
      this.setupShutdownHandlers();
      
      // Initialize all services
      await this.initializeServices();
      
      this.isInitialized = true;
      
      this.context.logger.info('Service lifecycle manager initialized successfully');
    } catch (error) {
      this.context?.logger.error('Failed to initialize service lifecycle manager', { error });
      throw new ConfigurationError(
        `Service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        { error }
      );
    }
  }

  /**
   * Shutdown services with graceful cleanup
   */
  public async shutdown(): Promise<void> {
    if (!this.isInitialized || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    
    try {
      this.context?.logger.info('Starting graceful shutdown');
      
      // Create shutdown promise with timeout
      const shutdownPromise = this.performShutdown();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown timeout')), this.shutdownTimeout);
      });

      // Race between shutdown and timeout
      await Promise.race([shutdownPromise, timeoutPromise]);
      
      this.context?.logger.info('Graceful shutdown completed');
    } catch (error) {
      this.context?.logger.error('Error during shutdown', { error });
      throw error;
    } finally {
      this.isInitialized = false;
      this.isShuttingDown = false;
    }
  }

  /**
   * Add a custom shutdown handler
   */
  public addShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Set shutdown timeout
   */
  public setShutdownTimeout(timeoutMs: number): void {
    this.shutdownTimeout = timeoutMs;
  }

  /**
   * Check if services are initialized
   */
  public get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Check if shutdown is in progress
   */
  public get shuttingDown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Get service context
   */
  public getContext(): ServiceContext | undefined {
    return this.context;
  }

  private async initializeServices(): Promise<void> {
    if (!this.context) {
      throw new ConfigurationError('Service context not available');
    }

    const { dataAccess, messageBroker, authentication, cache, logger } = this.context;

    // Initialize data access layer
    if (dataAccess && typeof (dataAccess as any).initialize === 'function') {
      logger.debug('Initializing data access layer');
      await (dataAccess as any).initialize();
    }

    // Connect to message broker
    if (messageBroker) {
      logger.debug('Connecting to message broker');
      await messageBroker.connect();
    }

    // Initialize authentication provider
    if (authentication && typeof (authentication as any).initialize === 'function') {
      logger.debug('Initializing authentication provider');
      await (authentication as any).initialize();
    }

    // Initialize cache provider
    if (cache && typeof (cache as any).initialize === 'function') {
      logger.debug('Initializing cache provider');
      await (cache as any).initialize();
    }

    logger.info('All services initialized successfully');
  }

  private async performShutdown(): Promise<void> {
    if (!this.context) {
      return;
    }

    const { dataAccess, messageBroker, authentication, cache, logger } = this.context;
    const shutdownPromises: Promise<void>[] = [];

    // Execute custom shutdown handlers first
    for (const handler of this.shutdownHandlers) {
      shutdownPromises.push(
        handler().catch(error => {
          logger.warn('Custom shutdown handler failed', { error });
        })
      );
    }

    // Shutdown cache provider
    if (cache && typeof (cache as any).shutdown === 'function') {
      shutdownPromises.push(
        (cache as any).shutdown().catch((error: any) => {
          logger.warn('Cache provider shutdown failed', { error });
        })
      );
    }

    // Disconnect from message broker
    if (messageBroker) {
      shutdownPromises.push(
        messageBroker.disconnect().catch(error => {
          logger.warn('Message broker disconnect failed', { error });
        })
      );
    }

    // Shutdown authentication provider
    if (authentication && typeof (authentication as any).shutdown === 'function') {
      shutdownPromises.push(
        (authentication as any).shutdown().catch((error: any) => {
          logger.warn('Authentication provider shutdown failed', { error });
        })
      );
    }

    // Shutdown data access layer last
    if (dataAccess && typeof (dataAccess as any).shutdown === 'function') {
      shutdownPromises.push(
        (dataAccess as any).shutdown().catch((error: any) => {
          logger.warn('Data access layer shutdown failed', { error });
        })
      );
    }

    // Wait for all shutdowns to complete
    await Promise.all(shutdownPromises);
  }

  private setupShutdownHandlers(): void {
    // Handle process termination signals
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    for (const signal of signals) {
      process.on(signal, () => {
        this.context?.logger.info(`Received ${signal}, starting graceful shutdown`);
        this.shutdown().then(() => {
          process.exit(0);
        }).catch(error => {
          this.context?.logger.error('Shutdown failed', { error });
          process.exit(1);
        });
      });
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.context?.logger.error('Uncaught exception', { error });
      this.shutdown().then(() => {
        process.exit(1);
      }).catch(() => {
        process.exit(1);
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.context?.logger.error('Unhandled promise rejection', { reason, promise });
      this.shutdown().then(() => {
        process.exit(1);
      }).catch(() => {
        process.exit(1);
      });
    });
  }
}

/**
 * Global service lifecycle manager instance
 */
export const globalLifecycleManager = new ServiceLifecycleManager();