# Core Infrastructure Module

## Overview
This core module serves as a foundational infrastructure component, providing essential utilities, configurations, and shared resources for the project.

## Project Structure
```
core/
│
├── bin/                   # Entry point scripts
├── lib/                   # Core library and infrastructure definitions
├── utils/                 # Utility functions and helpers
├── params/                # Configuration and parameter management
│
├── cdk.json               # CDK configuration
├── package.json           # Project dependencies and scripts
└── tsconfig.json          # TypeScript configuration
```

## Key Features
- Centralized infrastructure management
- Reusable utility functions
- Standardized configuration management
- TypeScript-based infrastructure as code
- Social authentication providers support (Google)

## Prerequisites
- Node.js (v14+ recommended)
- AWS CDK CLI
- AWS CLI configured with appropriate credentials
- Google OAuth credentials (if using Google authentication)

## Setup and Installation
1. Clone the repository
2. Navigate to the core directory
3. Install dependencies:
   ```bash
   npm install
   ```

## Development Workflow
- Build the project:
  ```bash
  npm run build
  ```
- Run tests:
  ```bash
  npm test
  ```
- Deploy infrastructure:
  ```bash
  cdk deploy
  ```

## Configuration

### General Configuration
- Modify `params/` for environment-specific configurations
- Customize infrastructure in `lib/` directory
- Adjust CDK settings in `cdk.json`

### Authentication Configuration
The system supports multiple authentication providers that can be configured in your environment configuration file:

#### Google Authentication
To enable Google authentication, add the following to your configuration:

```yaml
env:
  auth:
    google:
      enabled: true
      clientId: "your-google-client-id"
      clientSecret: "your-google-client-secret"
```

Make sure to:
1. Create a project in Google Cloud Console
2. Configure OAuth 2.0 credentials
3. Add your application's callback URLs to the Google Cloud Console
4. Set the client ID and secret in your configuration

## Utilities
The `utils/` directory contains shared utility functions that can be used across the project.

## Contributing
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License
[Specify your license here - e.g., MIT, Apache 2.0]

## Contact
[Your contact information or team contact]