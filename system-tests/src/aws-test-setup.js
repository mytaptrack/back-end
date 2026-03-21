#!/usr/bin/env node

// AWS Test Configuration Setup
// This script ensures proper configuration for AWS-based testing

const fs = require('fs');
const path = require('path');

console.log('Setting up AWS test configuration...');

// Ensure USE_LOCAL is set to false for AWS testing
process.env.USE_LOCAL = 'false';

// Remove local AWS credentials that interfere with real AWS access
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;
delete process.env.DYNAMODB_ENDPOINT;

// Check for required AWS environment variables
const requiredEnvVars = [
    'AWS_REGION',
    'STAGE'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.warn('Warning: Missing environment variables for AWS testing:', missingVars.join(', '));
    console.log('Make sure your .env file or environment has these variables set.');
}

// Set default values if not provided
if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = 'us-east-1';
    console.log('Using default AWS_REGION: us-east-1');
}

if (!process.env.STAGE) {
    process.env.STAGE = 'dev';
    console.log('Using default STAGE: dev');
}

// Check if AWS credentials are available
console.log('Checking AWS credentials...');
const { execSync } = require('child_process');

try {
    execSync('aws sts get-caller-identity', { stdio: 'pipe' });
    console.log('✓ AWS credentials are configured');
} catch (error) {
    console.error('✗ AWS credentials not found or invalid');
    console.log('Please configure AWS credentials using one of:');
    console.log('  - aws configure');
    console.log('  - aws sso login');
    console.log('  - Set AWS_PROFILE environment variable');
    console.log('  - Use IAM roles');
    process.exit(1);
}

console.log('AWS test configuration complete.');
console.log(`Environment: ${process.env.STAGE}`);
console.log(`Region: ${process.env.AWS_REGION}`);
console.log(`Local mode: ${process.env.USE_LOCAL}`);
