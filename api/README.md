# MyTapTrack User API

## Overview
This is a serverless GraphQL API built using AWS CDK (Cloud Development Kit) with TypeScript. The project integrates multiple AWS services and provides a robust backend infrastructure.

## Project Structure
- `bin/`: Entry point for CDK application
- `lib/`: Infrastructure as Code (IaC) definitions
- `src/`: Source code for Lambda functions and GraphQL resolvers
- `node_modules/`: Project dependencies

## Prerequisites
- Node.js (version 16 or later)
- AWS CLI configured
- AWS CDK CLI installed (`npm install -g aws-cdk`)

## Installation

1. Clone the repository
2. Navigate to the `api` directory
3. Install dependencies:
```bash
npm install
```

## Available Scripts

- `npm start`: Deploy and watch the GraphQL stack
- `npm run deploy`: Deploy all stacks
- `npm run build`: Synthesize CloudFormation templates
- `npm test`: Run Jest test suite with coverage

## AWS Services Integrated
- AppSync (GraphQL)
- Lambda
- DynamoDB
- Cognito
- S3
- SNS
- SES
- EventBridge
- Secrets Manager
- And more...

## Key Dependencies
- AWS SDK v3
- GraphQL
- TypeScript
- AWS CDK v2

## Environment Setup
1. Ensure AWS credentials are configured
2. Set up any required environment variables
3. Review `cdk.context.json` for configuration details

## Deployment
```bash
# Deploy all stacks
npm run deploy

# Deploy with hot-swap
npm run start-cdk
```

## Testing
Run the test suite with:
```bash
npm test
```

## Debug and Development
- Use `npm run setDebug` to link local development libraries
- Use `npm run unsetDebug` to revert to published packages

## Security
- Uses AWS IAM for access management
- Implements least-privilege principle
- Leverages Secrets Manager for sensitive configurations

## Monitoring
- Integrated with Lumigo for distributed tracing
- CloudWatch logs and metrics enabled

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push and create a Pull Request

## License
[Specify your project's license]

## Support
For issues or questions, please file a GitHub issue in the repository.