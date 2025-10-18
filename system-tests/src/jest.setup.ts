// Jest setup file to handle AWS credential issues gracefully

// Check if AWS credentials are available
const hasAWSCredentials = () => {
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

// Skip AWS-dependent tests if credentials are not available
if (!hasAWSCredentials()) {
    console.warn('⚠️  AWS credentials not detected. AWS-dependent tests will be skipped.');
    console.warn('   To run full test suite, ensure AWS SSO is configured: aws sso login');
}

// Global test timeout for AWS operations
jest.setTimeout(120000);