#!/usr/bin/env node

import * as dotenv from 'dotenv';

dotenv.config({ path: require('path').join(__dirname, '../../.env'), override: true });

import { Dal } from '@mytaptrack/lib/dist/v2/dals/dal';
const { unmarshall } = require("@aws-sdk/util-dynamodb");
import { DynamoDBClient, ScanCommand, BatchWriteItemCommand, DeleteItemCommand, DynamoDB } from '@aws-sdk/client-dynamodb';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const PRIMARY_FOLDER = join(__dirname, '../primary');

const dynamoClient = new DynamoDBClient({ region: 'us-west-2' });
const dal = new Dal('primary');

async function deleteAllRecords() {
  console.log('Starting deletion of all records from table:', dal.tableName);
  
  let lastEvaluatedKey: any = undefined;
  let totalDeleted = 0;
  
  do {
    const scanResult = await dal.scan<[{pk: string, sk: string}]>({projectionExpression: 'pk, sk', token: lastEvaluatedKey});
    
    if (scanResult.items && scanResult.items.length > 0) {
      await Promise.all(scanResult.items.map(item => {
        return dal.delete(item);
      }))
      console.log(`Deleted ${totalDeleted} records so far...`);
    }
    
    lastEvaluatedKey = scanResult.token;
  } while (lastEvaluatedKey);
  
  console.log(`Completed deletion. Total records deleted: ${totalDeleted}`);
}

async function loadDataFromJsonFiles() {
  console.log('Starting to load data from JSON files in:', PRIMARY_FOLDER);
  
  const files = readdirSync(PRIMARY_FOLDER).filter(file => file.endsWith('.json') && !file.endsWith('.gz'));
  console.log(`Found ${files.length} JSON files to process`);
  
  let totalInserted = 0;
  
  for (const file of files) {
    console.log(`Processing file: ${file}`);
    const filePath = join(PRIMARY_FOLDER, file);
    const fileContent = readFileSync(filePath, 'utf-8');
    
    // Split by lines and parse each JSON object
    const lines = fileContent.trim().split('\n');
    const items = lines.map(line => JSON.parse(line));
    console.log('Lines: ', items.length);
    
    for (let i = 0; i < items.length; i += 1) {
      const dynamoModel = items[i].Item
      const obj = unmarshall(dynamoModel);
      await dal.put(obj);
      totalInserted++;
    }
    
    console.log(`Completed file ${file}. Total inserted so far: ${totalInserted}`);
  }
  
  console.log(`Completed loading data. Total records inserted: ${totalInserted}`);
}

async function main() {
  try {
    console.log('=== MyTapTrack Primary Table Reload Utility ===');
    console.log(`Target table: ${dal.tableName}`);
    console.log(`Source folder: ${PRIMARY_FOLDER}`);
    
    // Step 1: Delete all existing records
    // await deleteAllRecords();
    
    // Step 2: Load data from JSON files
    await loadDataFromJsonFiles();
    
    console.log('=== Reload completed successfully! ===');
  } catch (error) {
    console.error('Error during reload process:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { deleteAllRecords, loadDataFromJsonFiles };