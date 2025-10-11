# Primary Table Reload Utility

This utility deletes all records from the `mytaptrack-prod-primary` DynamoDB table and reloads the data from JSON files in the `primary` folder.

## Usage

### Option 1: Using the shell script (recommended)
```bash
./reload-primary-table.sh
```

### Option 2: Using npm directly
```bash
cd utils
npm run reload-primary-table
```

### Option 3: Direct execution
```bash
cd utils
npx ts-node reload-primary-table.ts
```

## What it does

1. **Delete Phase**: Scans the entire `mytaptrack-prod-primary` table and deletes all records in batches of 25 (DynamoDB limit)
2. **Load Phase**: Reads all `.json` files from the `primary` folder and inserts the data into the table in batches of 25

## Prerequisites

- AWS credentials configured with permissions to:
  - Scan the DynamoDB table
  - Delete items from the DynamoDB table  
  - Put items into the DynamoDB table
- Node.js and npm installed
- The `primary` folder must contain valid JSON files with DynamoDB export format

## JSON File Format

The utility expects JSON files where each line contains a single JSON object with an `Item` property containing the DynamoDB item:

```json
{"Item":{"pk":{"S":"example"},"sk":{"S":"data"},"field":{"S":"value"}}}
{"Item":{"pk":{"S":"example2"},"sk":{"S":"data2"},"field":{"N":"123"}}}
```

## Safety Features

- The shell script includes a confirmation prompt before proceeding
- Progress is logged throughout the process
- Errors will stop execution and display helpful messages

## Configuration

The utility is configured to work with:
- **Table Name**: `mytaptrack-prod-primary`
- **AWS Region**: `us-west-2`
- **Source Folder**: `../primary` (relative to utils directory)

To modify these settings, edit the constants at the top of `reload-primary-table.ts`.

## Error Handling

If the process fails:
1. Check AWS credentials and permissions
2. Verify the table name and region are correct
3. Ensure JSON files are in the correct format
4. Check that the `primary` folder exists and contains `.json` files

## Performance

- Deletion speed depends on table size (scans entire table)
- Loading speed depends on number and size of JSON files
- Both operations use batch processing for optimal performance