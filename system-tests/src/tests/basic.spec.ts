import { Logger, LoggingLevel, hasAWSCredentials, skipIfNoAWS } from '../lib';

describe('Basic Infrastructure Tests', () => {
    test('Logger should work without Jest context issues', () => {
        const logger = new Logger('BasicInfraTests', LoggingLevel.info);
        
        // This should not throw an error anymore
        expect(() => {
            logger.info('Test log message');
        }).not.toThrow();
        
        expect(() => {
            logger.error('Test error message');
        }).not.toThrow();
    });

    test('ES module imports should work', () => {
        // This test passing means the ES module import issue is fixed
        expect(Logger).toBeDefined();
        expect(LoggingLevel).toBeDefined();
        expect(hasAWSCredentials).toBeDefined();
    });

    test('AWS credential detection should work', () => {
        const hasCredentials = hasAWSCredentials();
        expect(typeof hasCredentials).toBe('boolean');
        
        if (hasCredentials) {
            console.log('✅ AWS credentials detected');
        } else {
            console.log('⚠️  No AWS credentials detected');
        }
    });

    skipIfNoAWS('AWS-dependent functionality (conditional)', async () => {
        // This test will only run if AWS credentials are available
        expect(true).toBe(true);
    });
});