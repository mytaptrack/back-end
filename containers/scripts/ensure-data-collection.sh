#!/bin/bash

# Script to ensure the 'data' collection exists in MongoDB
# This collection maps to the AWS DynamoDB "data" table

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Ensuring 'data' collection exists in MongoDB...${NC}"

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to be ready..."
until mongosh "mongodb://admin:devpassword@localhost:27018/mytaptrack_dev?authSource=admin" --eval "db.runCommand('ping')" > /dev/null 2>&1; do
    echo "MongoDB not ready yet, waiting..."
    sleep 2
done

echo "MongoDB is ready, checking for 'data' collection..."

# Check if data collection exists and create it if it doesn't
mongosh "mongodb://admin:devpassword@localhost:27018/mytaptrack_dev?authSource=admin" --eval "
if (!db.getCollectionNames().includes('data')) {
    print('Creating data collection...');
    db.createCollection('data');
    db.data.createIndex({ pk: 1, sk: 1 }, { unique: true, name: 'pk_sk_unique' });
    db.data.createIndex({ pk: 1 }, { name: 'pk_index' });
    db.data.createIndex({ sk: 1 }, { name: 'sk_index' });
    db.data.createIndex({ createdAt: 1 }, { name: 'created_at_index' });
    print('Data collection created with indexes');
} else {
    print('Data collection already exists');
}

print('Available collections:');
printjson(db.getCollectionNames());
"

echo -e "${GREEN}Data collection verification completed${NC}"