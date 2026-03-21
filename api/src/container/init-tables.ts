import { DynamoDBClient, CreateTableCommand, ListTablesCommand, ScalarAttributeType, KeyType, ProjectionType } from '@aws-sdk/client-dynamodb';
import { containerConfig } from './config';

const client = new DynamoDBClient(containerConfig.dynamodb);

const tables = [
  {
    TableName: 'mytaptrack-local-data',
    KeySchema: [
      { AttributeName: 'pk', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'studentId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'tsk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lpk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lsk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'deviceId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'dsk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'appId', AttributeType: ScalarAttributeType.S }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'Student',
        KeySchema: [
          { AttributeName: 'studentId', KeyType: KeyType.HASH },
          { AttributeName: 'tsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'License',
        KeySchema: [
          { AttributeName: 'lpk', KeyType: KeyType.HASH },
          { AttributeName: 'lsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'Device',
        KeySchema: [
          { AttributeName: 'deviceId', KeyType: KeyType.HASH },
          { AttributeName: 'dsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'App',
        KeySchema: [
          { AttributeName: 'appId', KeyType: KeyType.HASH },
          { AttributeName: 'deviceId', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  {
    TableName: 'mytaptrack-local-primary',
    KeySchema: [
      { AttributeName: 'pk', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lpk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lsk', AttributeType: ScalarAttributeType.S }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'License',
        KeySchema: [
          { AttributeName: 'lpk', KeyType: KeyType.HASH },
          { AttributeName: 'lsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  {
    TableName: 'mytaptrack-data',
    KeySchema: [
      { AttributeName: 'pk', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'studentId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'tsk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lpk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lsk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'deviceId', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'dsk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'appId', AttributeType: ScalarAttributeType.S }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'Student',
        KeySchema: [
          { AttributeName: 'studentId', KeyType: KeyType.HASH },
          { AttributeName: 'tsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'License',
        KeySchema: [
          { AttributeName: 'lpk', KeyType: KeyType.HASH },
          { AttributeName: 'lsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'Device',
        KeySchema: [
          { AttributeName: 'deviceId', KeyType: KeyType.HASH },
          { AttributeName: 'dsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      },
      {
        IndexName: 'App',
        KeySchema: [
          { AttributeName: 'appId', KeyType: KeyType.HASH },
          { AttributeName: 'deviceId', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  },
  {
    TableName: 'mytaptrack-primary',
    KeySchema: [
      { AttributeName: 'pk', KeyType: KeyType.HASH },
      { AttributeName: 'sk', KeyType: KeyType.RANGE }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'sk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lpk', AttributeType: ScalarAttributeType.S },
      { AttributeName: 'lsk', AttributeType: ScalarAttributeType.S }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'License',
        KeySchema: [
          { AttributeName: 'lpk', KeyType: KeyType.HASH },
          { AttributeName: 'lsk', KeyType: KeyType.RANGE }
        ],
        Projection: { ProjectionType: ProjectionType.ALL },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
      }
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 }
  }
];

export async function initTables(existingClient?: DynamoDBClient) {
  const c = existingClient ?? client;
  const { TableNames } = await c.send(new ListTablesCommand({}));
  console.log('Existing tables:', TableNames);

  for (const table of tables) {
    if (TableNames?.includes(table.TableName)) {
      console.log(`Table ${table.TableName} already exists`);
      continue;
    }

    console.log(`Creating table ${table.TableName}...`);
    await c.send(new CreateTableCommand(table));
    console.log(`Table ${table.TableName} created`);
  }

  console.log('Table initialization complete');
}

// Auto-execute when run directly (container:init-tables script)
if (require.main === module) {
  initTables().catch((error) => {
    console.error('Error initializing tables:', error);
    process.exit(1);
  });
}
