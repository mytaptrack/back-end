# Environment Variable Setup

## Overview

This script helps automatically retrieve and set environment variables for system tests by querying the AWS Parameter Store and AWS Secrets Manager.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js and npm installed
- AWS SDK for JavaScript

## Setup Scripts

### `set-env-vars`
Retrieves and sets environment variables for system tests.

```bash
npm run set-env-vars
```

### `test:env`
Sets environment variables and runs tests in one command:

```bash
npm run test:env
```

## Environment Variables

The script sets the following environment variables:
- `apiKey`
- `DeviceDns`
- `ApiDns`
- `QlApi`
- `Environment`
- `StudentId2`
- `License`
- `PrimaryTable`
- `DataTable`

## Configuration

Modify `set-env-vars.js` to adjust parameter paths or add more environment variables.

## Notes

- Requires AWS credentials with SSM and Secrets Manager read access
- Default AWS region is set to `us-west-2`
- Environment variables are also written to a `.env` file for local development