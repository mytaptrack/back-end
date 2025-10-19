# MyTapTrack Business Logic Packages

This directory contains modular business logic packages designed for optimal Lambda bundle sizes and tree-shaking optimization.

## Package Structure

```
business-logic/
├── core/           # @mytaptrack/business-logic-core - Core interfaces, types, and errors
├── user/           # @mytaptrack/business-logic-user - User-specific operations
├── student/        # @mytaptrack/business-logic-student - Student-specific operations
├── license/        # @mytaptrack/business-logic-license - License-specific operations
├── report/         # @mytaptrack/business-logic-report - Report-specific operations
├── app/            # @mytaptrack/business-logic-app - App-specific operations
└── device/         # @mytaptrack/business-logic-device - Device-specific operations
```

## Key Features

- **Tree-shaking optimized**: Each package contains only specific business logic
- **Static operation classes**: All business logic implemented as static methods for optimal performance
- **Comprehensive validation**: Each package includes validation functions for data integrity
- **TypeScript support**: Full type definitions and declarations
- **Modular architecture**: Clean separation between core interfaces and domain-specific implementations

## Usage

### Installing Dependencies

```bash
# Install all package dependencies
npm run install:all

# Install specific package dependencies
npm run install:core
npm run install:user
# etc.
```

### Building Packages

```bash
# Build all packages
npm run build

# Build specific packages
npm run build:core
npm run build:user
# etc.
```

### Testing

```bash
# Run all tests
npm test

# Run specific package tests
npm run test:core
npm run test:user
# etc.
```

### Cleaning Build Artifacts

```bash
# Clean all packages
npm run clean

# Clean specific packages
npm run clean:core
npm run clean:user
# etc.
```

## Package Dependencies

- **core**: No dependencies on other business logic packages
- **user, student, license, report, app, device**: All depend on `core`

## Lambda Usage

Lambda functions can import only the specific business logic they need:

```typescript
// User Lambda
import { UserOperations } from '@mytaptrack/business-logic-user';

// Student Lambda  
import { StudentOperations } from '@mytaptrack/business-logic-student';

// Multi-domain Lambda
import { UserOperations } from '@mytaptrack/business-logic-user';
import { StudentOperations } from '@mytaptrack/business-logic-student';
```

This approach ensures minimal bundle sizes through tree-shaking and reduces cold start times.

## Docker Container Usage

Docker containers can import multiple packages as needed:

```typescript
import { UserOperations } from '@mytaptrack/business-logic-user';
import { StudentOperations } from '@mytaptrack/business-logic-student';
import { LicenseOperations } from '@mytaptrack/business-logic-license';
import { ReportOperations } from '@mytaptrack/business-logic-report';
```

## Development

When adding new business logic:

1. Determine which domain package it belongs to
2. Add operations to the appropriate `operations/` directory
3. Add validation to the appropriate `validation/` directory
4. Update the package's `index.ts` to export new functionality
5. Add tests if required
6. Build and test the package

For cross-cutting concerns, consider adding to the `core` package.