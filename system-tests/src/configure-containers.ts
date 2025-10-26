#!/usr/bin/env npx ts-node

/**
 * Script to configure system tests for container mode
 */

import { configureForContainers, createContainerConfig } from './container-config';
import { waitForAllServices } from './lib/container-helpers';
import { Logger, LoggingLevel } from './lib/logging';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const logger = new Logger(LoggingLevel.INFO);

async function main() {
    try {
        // Get environment from command line argument or default to 'dev'
        const environment = process.argv[2] || 'dev';
        
        logger.info(`Configuring system tests for container environment (${environment})...`);
        
        // Ensure config directory exists
        const configDir = join(__dirname, '../config');
        if (!existsSync(configDir)) {
            mkdirSync(configDir, { recursive: true });
        }
        
        // Configure environment for containers
        configureForContainers(environment);
        
        // Create container-specific config file
        createContainerConfig(environment);
        
        // Wait for container services to be ready
        logger.info('Waiting for container services to be ready...');
        const servicesReady = await waitForAllServices();
        
        if (!servicesReady) {
            logger.error('Container services are not ready. Make sure containers are running:');
            logger.error(`  make docker-${environment}-start`);
            process.exit(1);
        }
        
        logger.info('✅ System tests successfully configured for containers');
        logger.info('');
        logger.info('You can now run tests with:');
        logger.info('  npm test                    # Run all tests against containers');
        logger.info('  npm run test:container      # Run with container-specific config');
        logger.info('');
        logger.info('To switch back to AWS mode, run:');
        logger.info('  npx ts-node src/configure-aws.ts');
        
    } catch (error) {
        logger.error('Failed to configure system tests for containers:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}