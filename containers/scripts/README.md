# Database Migration and Management Scripts

This directory contains scripts for database initialization, migration, validation, and backup/restore operations for the MyTapTrack Docker containerization project.

## Overview

The scripts provide comprehensive database management functionality:

- **MongoDB Initialization**: Set up MongoDB collections, indexes, and seed data
- **Data Migration**: Convert DynamoDB data to MongoDB format
- **Schema Validation**: Validate MongoDB collections against expected schema
- **Backup/Restore**: Create and restore database backups

## Scripts

### 1. MongoDB Initialization Scripts

Located in `../init-scripts/mongodb/`:

#### `01-init-database.js`
- Creates required MongoDB collections (`primary`, `data`, `migrations`)
- Sets up collection validation schemas
- Creates optimized indexes for query performance
- Creates application user for database access

#### `02-seed-development-data.js`
- Seeds the database with sample development data
- Creates sample users, students, devices, and license configurations
- Generates time-series data for testing
- Useful for development and testing environments

### 2. Migration Manager (`migration-manager.ts`)

Core migration functionality with support for:
- DynamoDB to MongoDB data export/import
- Schema transformation and validation
- Progress tracking and error handling
- Rollback capabilities

**Key Classes:**
- `MigrationManager`: Main orchestrator for migration operations
- `DynamoDBExporter`: Exports data from DynamoDB tables
- `MongoDBImporter`: Imports data into MongoDB collections
- `MigrationValidator`: Validates migration integrity

### 3. Migration CLI (`migrate-dynamodb-to-mongodb.ts`)

Command-line interface for executing migrations:

```bash
# Basic migration
migrate-dynamodb-to-mongodb --mongo-url mongodb://localhost:27017 --region us-east-1

# Migration with validation and backup
migrate-dynamodb-to-mongodb --config ./migration-config.json --validate --backup

# Export only
migrate-dynamodb-to-mongodb --region us-east-1 --output ./export.json --tables primary
```

**Options:**
- `--config <file>`: Configuration file path
- `--region <region>`: AWS region
- `--profile <profile>`: AWS profile
- `--mongo-url <url>`: MongoDB connection string
- `--mongo-db <database>`: MongoDB database name
- `--tables <tables>`: Comma-separated list of tables
- `--batch-size <size>`: Batch size for operations
- `--validate`: Validate migration after completion
- `--backup`: Create backup before migration
- `--skip-errors`: Skip errors during import
- `--output <file>`: Save export data to file

### 4. Schema Validator (`database-schema-validator.ts`)

Validates MongoDB collections against expected schema:

```bash
# Validate local database
database-schema-validator

# Validate remote database with report
database-schema-validator --mongo-url mongodb://user:pass@host:27017 --output validation-report.md
```

**Features:**
- Collection existence validation
- Index validation and performance analysis
- Document structure validation
- Generates comprehensive validation reports

### 5. Backup/Restore Utility (`database-backup-restore.ts`)

Comprehensive backup and restore functionality:

```bash
# Create backup
database-backup-restore backup --output ./my-backups

# Restore backup
database-backup-restore restore ./backups/backup-2023-12-01T10-00-00-000Z

# List backups
database-backup-restore list --output ./my-backups
```

**Features:**
- Compressed and uncompressed backups
- Index backup and restoration
- Batch processing for large datasets
- Progress tracking and validation
- Selective collection backup/restore

## Installation and Setup

1. **Install Dependencies:**
   ```bash
   cd containers/scripts
   npm install
   ```

2. **Build TypeScript:**
   ```bash
   npm run build
   ```

3. **Make Scripts Executable:**
   ```bash
   chmod +x dist/*.js
   ```

## Usage Examples

### Complete Migration Workflow

1. **Setup Environment:**
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your MongoDB credentials
   ```

2. **Create Backup (Optional):**
   ```bash
   npm run dev:backup
   ```

3. **Run Migration:**
   ```bash
   npm run migrate -- --validate --backup
   ```

4. **Validate Schema:**
   ```bash
   npm run dev:validate -- --output ./validation-report.md
   ```

### Development Environment Setup

1. **Setup Configuration:**
   ```bash
   cp .env.example .env.development
   # Edit MongoDB connection details
   ```

2. **Initialize and Seed Database:**
   ```bash
   # Start MongoDB container
   docker-compose up -d mongodb
   
   # Seed development data
   npm run dev:seed
   ```

3. **Validate Setup:**
   ```bash
   npm run dev:validate
   ```

### Production Migration

1. **Export from DynamoDB:**
   ```bash
   npm run migrate -- --region us-east-1 --profile production --output ./production-export.json --tables primary,data
   ```

2. **Import to MongoDB:**
   ```bash
   npm run migrate -- --mongo-url mongodb://prod-host:27017 --input ./production-export.json --validate
   ```

## Configuration

### Environment Configuration

The scripts use environment files for configuration. Create the appropriate `.env` file for your environment:

#### `.env.development` (Development Environment)
```bash
NODE_ENV=development
MONGO_URL=mongodb://admin:devpassword@localhost:27018
MONGO_DB=mytaptrack_dev
AWS_REGION=us-east-1
BACKUP_DIRECTORY=./backups
LOG_LEVEL=info
```

#### `.env.test` (Test Environment)
```bash
NODE_ENV=test
TEST_MONGO_URL=mongodb://admin:devpassword@localhost:27018
TEST_DB_NAME=mytaptrack_test
LOG_LEVEL=error
```

#### `.env.production` (Production Environment)
```bash
NODE_ENV=production
MONGO_URL=mongodb://prod-user:prod-password@prod-host:27017
MONGO_DB=mytaptrack_prod
AWS_REGION=us-east-1
AWS_PROFILE=production
BACKUP_DIRECTORY=./prod-backups
LOG_LEVEL=warn
```

### Migration Configuration File

Create `migration-config.json`:

```json
{
  "source": {
    "type": "dynamodb",
    "region": "us-east-1",
    "profile": "production",
    "tables": ["primary", "data"]
  },
  "target": {
    "type": "mongodb",
    "connectionString": "mongodb://localhost:27017",
    "database": "mytaptrack"
  },
  "options": {
    "batchSize": 100,
    "validateData": true,
    "createBackup": true,
    "skipErrors": false,
    "outputFile": "./migration-export.json"
  }
}
```

### Environment Variables

The following environment variables can be set in `.env` files or passed directly:

- `NODE_ENV`: Environment type (development|test|production)
- `MONGO_URL`: MongoDB connection string
- `MONGO_DB`: MongoDB database name
- `TEST_MONGO_URL`: MongoDB connection string for tests
- `TEST_DB_NAME`: MongoDB database name for tests
- `AWS_REGION`: AWS region for migration operations
- `AWS_PROFILE`: AWS profile to use for migration
- `BACKUP_DIRECTORY`: Directory for storing backups
- `LOG_LEVEL`: Logging level (error|warn|info|debug)

### Quick Setup

1. **Copy example environment file:**
   ```bash
   cp .env.example .env.development
   ```

2. **Edit the configuration:**
   ```bash
   # Update MongoDB credentials and connection details
   vim .env.development
   ```

3. **Test the configuration:**
   ```bash
   npm run dev:validate
   ```

## Data Transformation

### DynamoDB to MongoDB Mapping

The migration scripts transform DynamoDB items to MongoDB documents:

**DynamoDB Item:**
```json
{
  "pk": "U#user001",
  "sk": "P",
  "pksk": "U#user001#P",
  "version": 1,
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe"
}
```

**MongoDB Document:**
```json
{
  "pk": "U#user001",
  "sk": "P",
  "pksk": "U#user001#P",
  "version": 1,
  "data": {
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "createdAt": "2023-12-01T10:00:00.000Z",
  "updatedAt": "2023-12-01T10:00:00.000Z"
}
```

### Index Mapping

DynamoDB indexes are converted to MongoDB indexes:

- **Primary Key**: `{ pk: 1, sk: 1 }` (unique)
- **GSI**: Converted to compound indexes
- **LSI**: Converted to compound indexes with partition key

## Error Handling

The scripts include comprehensive error handling:

- **Validation Errors**: Schema and data validation failures
- **Connection Errors**: Database connectivity issues
- **Migration Errors**: Data transformation and import failures
- **Rollback Support**: Automatic rollback on critical failures

## Performance Considerations

- **Batch Processing**: Configurable batch sizes for large datasets
- **Index Creation**: Background index creation to minimize impact
- **Compression**: Optional compression for backup files
- **Progress Tracking**: Real-time progress reporting for long operations

## Monitoring and Logging

All scripts provide detailed logging:

- **Progress Updates**: Real-time operation progress
- **Error Reporting**: Detailed error messages and stack traces
- **Validation Reports**: Comprehensive validation results
- **Performance Metrics**: Operation timing and throughput statistics

## Troubleshooting

### Common Issues

1. **Connection Timeouts:**
   - Increase connection timeout settings
   - Check network connectivity
   - Verify credentials and permissions

2. **Memory Issues:**
   - Reduce batch size
   - Use streaming for large datasets
   - Monitor memory usage during operations

3. **Index Creation Failures:**
   - Check for duplicate data
   - Verify index definitions
   - Use background index creation

4. **Validation Failures:**
   - Review data transformation logic
   - Check for schema mismatches
   - Validate source data integrity

### Debug Mode

Enable debug logging by setting environment variables:

```bash
export DEBUG=migration:*
export LOG_LEVEL=debug
```

## Contributing

When adding new migration functionality:

1. Follow existing code patterns and interfaces
2. Add comprehensive error handling
3. Include progress tracking for long operations
4. Write unit tests for new functionality
5. Update documentation and examples