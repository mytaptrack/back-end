/**
 * Helper utilities for container-based testing
 */

import { containerEndpoints } from '../container-config';
import { Logger, LoggingLevel } from './logging';

const logger = new Logger(LoggingLevel.INFO);

// Default timeout and retry settings
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRY_DELAY = 2000; // 2 seconds

/**
 * Wait for a service to be ready by checking its health endpoint
 */
export async function waitForService(
    serviceUrl: string, 
    healthPath: string = '/health',
    timeout: number = DEFAULT_TIMEOUT
): Promise<boolean> {
    const startTime = Date.now();
    const retryDelay = DEFAULT_RETRY_DELAY;
    
    logger.info(`Waiting for service at ${serviceUrl}${healthPath}...`);
    
    while (Date.now() - startTime < timeout) {
        try {
            const response = await fetch(`${serviceUrl}${healthPath}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                logger.info(`Service at ${serviceUrl} is ready`);
                return true;
            }
            
            logger.debug(`Service not ready, status: ${response.status}`);
        } catch (error) {
            logger.debug(`Service check failed: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    logger.error(`Service at ${serviceUrl} failed to become ready within ${timeout}ms`);
    return false;
}

/**
 * Wait for all container services to be ready
 */
export async function waitForAllServices(): Promise<boolean> {
    const services = [
        { name: 'GraphQL API', url: containerEndpoints.graphql },
        { name: 'REST API', url: containerEndpoints.rest },
        { name: 'Device API', url: containerEndpoints.device }
    ];
    
    logger.info('Waiting for all container services to be ready...');
    
    const results = await Promise.all(
        services.map(async service => {
            const isReady = await waitForService(service.url);
            if (!isReady) {
                logger.error(`${service.name} failed to start`);
            }
            return isReady;
        })
    );
    
    const allReady = results.every(result => result);
    
    if (allReady) {
        logger.info('All container services are ready');
    } else {
        logger.error('Some container services failed to start');
    }
    
    return allReady;
}

/**
 * Create a test user for container testing
 */
export async function createTestUser(userData: any): Promise<any> {
    const response = await fetch(`${containerEndpoints.rest}/api/v2/users`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
    });
    
    if (!response.ok) {
        throw new Error(`Failed to create test user: ${response.statusText}`);
    }
    
    return response.json();
}

/**
 * Clean up test data after tests
 */
export async function cleanupTestData(): Promise<void> {
    logger.info('Cleaning up test data...');
    
    try {
        // Clean up via REST API endpoints
        const cleanupEndpoints = [
            '/api/v2/test/cleanup/users',
            '/api/v2/test/cleanup/students',
            '/api/v2/test/cleanup/devices'
        ];
        
        for (const endpoint of cleanupEndpoints) {
            try {
                await fetch(`${containerEndpoints.rest}${endpoint}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            } catch (error) {
                logger.debug(`Cleanup endpoint ${endpoint} not available: ${error.message}`);
            }
        }
        
        logger.info('Test data cleanup completed');
    } catch (error) {
        logger.warn(`Test data cleanup failed: ${error.message}`);
    }
}

/**
 * Get container service health status
 */
export async function getServiceHealth(): Promise<Record<string, any>> {
    const services = {
        graphql: containerEndpoints.graphql,
        rest: containerEndpoints.rest,
        device: containerEndpoints.device
    };
    
    const healthStatus: Record<string, any> = {};
    
    for (const [name, url] of Object.entries(services)) {
        try {
            const response = await fetch(`${url}/health`);
            healthStatus[name] = {
                status: response.ok ? 'healthy' : 'unhealthy',
                statusCode: response.status,
                data: response.ok ? await response.json() : null
            };
        } catch (error) {
            healthStatus[name] = {
                status: 'error',
                error: error.message
            };
        }
    }
    
    return healthStatus;
}