#!/bin/bash

# MyTapTrack Primary Table Reload Script
# This script deletes all records from mytaptrack-prod-primary table
# and reloads data from JSON files in the primary folder

echo "=== MyTapTrack Primary Table Reload ==="
echo "WARNING: This will delete ALL data from mytaptrack-prod-primary table!"
echo "Press Ctrl+C to cancel, or Enter to continue..."
read

cd utils
npm run reload-primary-table