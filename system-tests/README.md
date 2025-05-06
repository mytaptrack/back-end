# System Tests Environment Variable Management

## Environment Variable Configuration

This project includes a mechanism to dynamically set environment variables from AWS Systems Manager Parameter Store.

### Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js installed
- Access to AWS Parameter Store

### Features

- Automatically retrieve and set environment variables from Parameter Store
- Support for recursive parameter retrieval
- Configurable parameter path

### Usage

#### Setting Environment Variables

1. Run the environment variable setup script:
```bash
npm run set-env-vars
```

2. Run tests with pre-configured environment variables:
```bash
npm run test:env
```

### Configuration

By default, the script looks for parameters under the path `/system-tests/`. 
You can override this by setting the `PARAMETER_STORE_PATH` environment variable:

```bash
PARAMETER_STORE_PATH='/custom/parameter/path/' npm run set-env-vars
```

### AWS Region Configuration

The script uses the AWS region specified in the `AWS_REGION` environment variable. 
If not set, it defaults to `us-east-1`.

### Important Notes

- Ensure you have the necessary IAM permissions to read from Parameter Store
- Sensitive information is retrieved with decryption enabled
- Parameters are converted to uppercase environment variable names

### Troubleshooting

- Check AWS CLI configuration
- Verify IAM permissions
- Validate parameter path and naming conventions
