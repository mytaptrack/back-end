/**
 * Utility functions for test management
 */

export const hasAWSCredentials = (): boolean => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    
    // Check environment variables
    if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_SSO_SESSION) {
        return true;
    }
    
    // Check for AWS config file
    const awsConfigPath = path.join(os.homedir(), '.aws', 'config');
    if (fs.existsSync(awsConfigPath)) {
        return true;
    }
    
    // Check for AWS credentials file
    const awsCredentialsPath = path.join(os.homedir(), '.aws', 'credentials');
    if (fs.existsSync(awsCredentialsPath)) {
        return true;
    }
    
    return false;
};

export const skipIfNoAWS = (testName: string, testFn: () => void | Promise<void>) => {
    if (hasAWSCredentials()) {
        return test(testName, testFn);
    } else {
        return test.skip(`${testName} (skipped - no AWS credentials)`, testFn);
    }
};

export const describeWithAWS = (suiteName: string, suiteFn: () => void) => {
    if (hasAWSCredentials()) {
        return describe(suiteName, suiteFn);
    } else {
        return describe.skip(`${suiteName} (skipped - no AWS credentials)`, suiteFn);
    }
};