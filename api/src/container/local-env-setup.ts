// Centralized local environment setup for container APIs
// This MUST be imported first, before any AWS SDK imports

// Load environment variables from .env file in the root directory
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

// Set the S3 endpoint to the local S3 mock BEFORE any AWS SDK imports load S3 clients.
// This must run before any module-level `new S3()` calls in handler files.
if (process.env.USE_LOCAL === 'true') {
    process.env.AWS_ENDPOINT_URL = 'http://localhost:9000';
    process.env.AWS_REQUEST_CHECKSUM_CALCULATION = 'when_required';
    process.env.AWS_RESPONSE_CHECKSUM_VALIDATION = 'when_required';
}

import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
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

// ── Local S3 mock server ─────────────────────────────────────────────────────
// Provides a minimal S3-compatible HTTP server for local development.
// Stores objects in a temp directory under /tmp/local-s3-mock.
// Handles GetObject, PutObject, ListObjects (V1 and V2) operations.

const S3_MOCK_PORT = 9000;
const S3_STORE_DIR = path.join(require('os').tmpdir(), 'local-s3-mock');

function encodeXmlText(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function startLocalS3Mock(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(S3_STORE_DIR)) {
            fs.mkdirSync(S3_STORE_DIR, { recursive: true });
        }

        const server = http.createServer((req, res) => {
            const urlParts = req.url ? req.url.split('?') : ['', ''];
            const pathParts = urlParts[0].split('/').filter(p => p.length > 0);
            const queryString = urlParts[1] || '';
            const queryParams: Record<string, string> = {};
            queryString.split('&').forEach(part => {
                const [k, v] = part.split('=');
                if (k) queryParams[decodeURIComponent(k)] = v ? decodeURIComponent(v) : '';
            });

            const bucket = pathParts[0] || '';
            const key = pathParts.slice(1).join('/');

            if (req.method === 'GET' && !key) {
                // ListObjects (V1 or V2)
                const prefix = queryParams['prefix'] || '';
                const bucketDir = path.join(S3_STORE_DIR, bucket);
                let objects: string[] = [];

                if (fs.existsSync(bucketDir)) {
                    function listFiles(dir: string, base: string): string[] {
                        const result: string[] = [];
                        const entries = fs.readdirSync(dir, { withFileTypes: true });
                        for (const entry of entries) {
                            const rel = base ? base + '/' + entry.name : entry.name;
                            if (entry.isDirectory()) {
                                result.push(...listFiles(path.join(dir, entry.name), rel));
                            } else {
                                result.push(rel);
                            }
                        }
                        return result;
                    }
                    objects = listFiles(bucketDir, '').filter(k => k.startsWith(prefix));
                }

                const contentsXml = objects.map(k => {
                    const stat = fs.statSync(path.join(bucketDir, k.replace(/\//g, path.sep)));
                    return `<Contents><Key>${encodeXmlText(k)}</Key><Size>${stat.size}</Size><LastModified>${stat.mtime.toISOString()}</LastModified></Contents>`;
                }).join('');

                const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${encodeXmlText(bucket)}</Name><Prefix>${encodeXmlText(prefix)}</Prefix><MaxKeys>1000</MaxKeys><IsTruncated>false</IsTruncated>${contentsXml}</ListBucketResult>`;
                res.writeHead(200, { 'Content-Type': 'application/xml', 'x-amz-request-id': 'local' });
                res.end(xml);

            } else if (req.method === 'GET' && key) {
                // GetObject
                const filePath = path.join(S3_STORE_DIR, bucket, key.replace(/\//g, path.sep));
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath);
                    const stat = fs.statSync(filePath);
                    res.writeHead(200, {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': content.length,
                        'Last-Modified': stat.mtime.toUTCString(),
                        'x-amz-request-id': 'local'
                    });
                    res.end(content);
                } else {
                    const xml = `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Key>${encodeXmlText(key)}</Key></Error>`;
                    res.writeHead(404, { 'Content-Type': 'application/xml', 'x-amz-request-id': 'local' });
                    res.end(xml);
                }

            } else if (req.method === 'PUT' && key) {
                // PutObject
                const filePath = path.join(S3_STORE_DIR, bucket, key.replace(/\//g, path.sep));
                const fileDir = path.dirname(filePath);
                if (!fs.existsSync(fileDir)) {
                    fs.mkdirSync(fileDir, { recursive: true });
                }
                const chunks: Buffer[] = [];
                req.on('data', chunk => chunks.push(chunk));
                req.on('end', () => {
                    fs.writeFileSync(filePath, Buffer.concat(chunks));
                    res.writeHead(200, { 'x-amz-request-id': 'local', 'ETag': '"local-etag"' });
                    res.end();
                });

            } else if (req.method === 'DELETE' && key) {
                // DeleteObject
                const filePath = path.join(S3_STORE_DIR, bucket, key.replace(/\//g, path.sep));
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
                res.writeHead(204, { 'x-amz-request-id': 'local' });
                res.end();

            } else if (req.method === 'HEAD' && key) {
                // HeadObject
                const filePath = path.join(S3_STORE_DIR, bucket, key.replace(/\//g, path.sep));
                if (fs.existsSync(filePath)) {
                    const stat = fs.statSync(filePath);
                    res.writeHead(200, {
                        'Content-Length': stat.size,
                        'Last-Modified': stat.mtime.toUTCString(),
                        'x-amz-request-id': 'local'
                    });
                    res.end();
                } else {
                    res.writeHead(404, { 'x-amz-request-id': 'local' });
                    res.end();
                }

            } else {
                res.writeHead(200, { 'x-amz-request-id': 'local' });
                res.end();
            }
        });

        server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`✓ Local S3 mock already running on port ${S3_MOCK_PORT}`);
                resolve();
            } else {
                console.error('✗ Failed to start local S3 mock:', err.message);
                resolve(); // Non-fatal: tests requiring S3 will fail but others continue
            }
        });

        server.listen(S3_MOCK_PORT, '127.0.0.1', () => {
            console.log(`✓ Local S3 mock running on http://127.0.0.1:${S3_MOCK_PORT}`);
            console.log(`  Storage directory: ${S3_STORE_DIR}`);
            resolve();
        });
    });
}

export async function validateDynamoDB() {
  // Start local S3 mock before anything else in local mode
  if (process.env.USE_LOCAL === 'true') {
    await startLocalS3Mock();
  }

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
