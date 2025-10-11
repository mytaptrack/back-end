# Data Export Script

This script exports all tracked data and student configurations organized by license.

## Folder Structure

The export creates the following folder structure:

```
export/
├── license1/
│   ├── student_name_1/
│   │   ├── data.csv
│   │   └── config.json
│   └── student_name_2/
│       ├── data.csv
│       └── config.json
└── license2/
    └── student_name_3/
        ├── data.csv
        └── config.json
```

## Files

### data.csv
Contains all tracked behavior data for the student in CSV format with columns:
- Date: Date of the tracked event (YYYY-MM-DD)
- Time: Time of the tracked event (HH:mm:ss)
- Behavior: Name of the behavior tracked
- Score: Intensity or score value
- Source: Source of the data (device, manual, etc.)
- ABC_Antecedent: Antecedent from ABC data
- ABC_Consequence: Consequence from ABC data
- Notes: Any notes or comments
- Duration: Duration in minutes (for duration behaviors)
- Manual: Whether the entry was manually entered (Yes/No)

### config.json
Contains the complete student configuration including:
- Student details (name, ID, etc.)
- License information
- Behavior definitions
- Response definitions
- Services configuration
- Documents
- Dashboard settings
- ABC collections
- Milestones
- Tags
- Absences
- School year information

## Usage

### Basic Usage
```bash
cd utils
npm run export-data [output-directory] [start-date] [end-date]
```

### Examples

Export all data to default directory (./export):
```bash
npm run export-data
```

Export to specific directory:
```bash
npm run export-data /path/to/export
```

Export data for specific date range:
```bash
npm run export-data ./export 2023-01-01 2023-12-31
```

Export last 6 months of data:
```bash
npm run export-data ./export 2024-06-01 2024-12-31
```

### Parameters

1. **output-directory** (optional): Directory where export files will be created
   - Default: `./export`
   - Directory will be created if it doesn't exist

2. **start-date** (optional): Start date for data export in YYYY-MM-DD format
   - Default: 1 year ago from current date
   - Only affects data.csv, not config.json

3. **end-date** (optional): End date for data export in YYYY-MM-DD format
   - Default: Current date
   - Only affects data.csv, not config.json

## Prerequisites

- Node.js environment set up
- AWS credentials configured
- Database access permissions
- All dependencies installed (`npm ci`)

## Notes

- The script exports data for all licenses in the system
- Student folder names are sanitized (special characters replaced with underscores)
- Deleted data points are excluded from the export
- If a student has no tracking data, an empty CSV with headers is created
- The script handles large datasets by processing one license at a time
- Progress is logged to the console during execution

## Error Handling

- If a student's data cannot be exported, an error is logged and an empty CSV is created
- The script continues processing other students even if individual exports fail
- Network timeouts and database errors are handled gracefully

## Performance

- The script processes licenses sequentially to avoid overwhelming the database
- Large exports may take several minutes depending on data volume
- Memory usage is optimized by processing students individually