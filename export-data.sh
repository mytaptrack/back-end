#!/bin/bash

# Data Export Script for MyTapTrack
# Usage: ./export-data.sh [output-directory] [start-date] [end-date]

set -e

# Set AWS Profile
export AWS_PROFILE=mytaptrack

echo "MyTapTrack Data Export Script"
echo "============================="

# Check if we're in the right directory
if [ ! -f "makefile" ] || [ ! -d "utils" ]; then
    echo "Error: This script must be run from the back-end project root directory"
    exit 1
fi

# Set default values
OUTPUT_DIR=${1:-"./export"}
START_DATE=${2:-""}
END_DATE=${3:-""}

echo "Configuration:"
echo "  Output Directory: $OUTPUT_DIR"
echo "  Start Date: ${START_DATE:-"(1 year ago)"}"
echo "  End Date: ${END_DATE:-"(current date)"}"
echo ""

# Ensure dependencies are installed
echo "Checking dependencies..."
if [ ! -d "utils/node_modules" ]; then
    echo "Installing dependencies..."
    cd utils && npm ci && cd ..
fi

# Run the export
echo "Starting data export..."
cd utils

if [ -n "$START_DATE" ] && [ -n "$END_DATE" ]; then
    npm run export-data "$OUTPUT_DIR" "$START_DATE" "$END_DATE"
elif [ -n "$START_DATE" ]; then
    npm run export-data "$OUTPUT_DIR" "$START_DATE"
else
    npm run export-data "$OUTPUT_DIR"
fi

cd ..

echo ""
echo "Export completed successfully!"
echo "Data exported to: $OUTPUT_DIR"
echo ""
echo "Folder structure:"
echo "  license/"
echo "    student_name/"
echo "      data.csv      - Tracked behavior data"
echo "      config.json   - Student configuration"