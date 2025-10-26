#!/usr/bin/env npx ts-node

/**
 * Script to configure system tests for AWS mode
 */

import { configureForAWS } from './container-config';
import { Logger, LoggingLevel } from './lib/logging';

const logger = new Logger(LoggingLevel.INFO);

async function main() {
    try {
        logger.info('Configuring system tests for AWS environment...');
        
        // Configure environment for AWS
        configureForAWS();
        
        logger.info('✅ System tests successfully configured for AWS');
        logger.info('');
        logger.info('You can now run tests with:');
        logger.info('  npm run test:env            # Run tests against AWS (with env setup)');
        logger.info('  npm test                    # Run tests against AWS (if env already set)');
        logger.info('');
        logger.info('To switch back to container mode, run:');
        logger.info('  npx ts-node src/configure-containers.ts');
        
    } catch (error) {
        logger.error('Failed to configure system tests for AWS:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}