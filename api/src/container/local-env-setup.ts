// Centralized local environment setup for container APIs
// This MUST be imported first, before any AWS SDK imports

// Load environment variables from .env file in the root directory
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import amqp from 'amqplib';
import { initTables } from './init-tables';

// Set local environment variables to override any AWS defaults
// These MUST be set before any AWS SDK clients are initialized
const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT;
const RABBITMQ_URL = process.env.RABBITMQ_URL;

const dynamoClient = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  },
  requestHandler: {
    requestTimeout: 3000
  }
});

export const docClient = DynamoDBDocumentClient.from(dynamoClient);
export let rabbitChannel: amqp.Channel;

console.log('✓ Local environment configured for container API');

export async function validateDynamoDB() {
  try {
    console.log('Checking DynamoDB connection...', process.env.DYNAMODB_ENDPOINT);
    const { TableNames } = await dynamoClient.send(new ListTablesCommand({}));
    console.log('✓ Connected to DynamoDB');
    console.log('Available tables:', TableNames);
    
    const requiredTables = [process.env.PrimaryTable, process.env.DataTable];
    const missingTables = requiredTables.filter(table => !TableNames?.includes(table));
    
    if (missingTables.length > 0) {
      console.log(`Tables not found, creating: ${missingTables.join(', ')}`);
      await initTables(dynamoClient);
    }

    console.log('✓ All required tables exist');
  } catch (error) {
    console.error('✗ Failed to validate DynamoDB:', error);
    throw error;
  }
}

export async function initRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await connection.createChannel();
    await rabbitChannel.assertQueue('mytaptrack-events', { durable: true });
    
    console.log('✓ Connected to RabbitMQ');
  } catch (error) {
    console.error('✗ Failed to connect to RabbitMQ:', error);
    throw new Error('RabbitMQ connection failed');
  }
}
