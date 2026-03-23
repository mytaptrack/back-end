// Set environment variables BEFORE any imports
if (process.env.USE_LOCAL === 'true') {
    const environment = process.env.STAGE ?? 'dev';
    process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000';
    process.env.PrimaryTable = 'mytaptrack-local-primary';
    process.env.DataTable = 'mytaptrack-local-data';
    process.env.USE_DATABASE_ABSTRACTION = 'false';
    process.env.DB_TYPE = 'dynamodb';
    process.env.AWS_ACCESS_KEY_ID = 'local';
    process.env.AWS_SECRET_ACCESS_KEY = 'local';
    process.env.AWS_REGION = 'us-east-1';
    process.env.STRONGLY_CONSISTENT_READ = 'true';
} else {
    // Ensure AWS mode is explicit — prevents SSM calls failing due to absent env var
    if (!process.env.USE_LOCAL) {
        process.env.USE_LOCAL = 'false';
    }
}

// Jest setup file to handle AWS credential issues gracefully

// Mock localStorage for Node environment
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
global.localStorage = localStorageMock as any;

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