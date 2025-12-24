export const containerConfig = {
  dynamodb: {
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local'
    }
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://mytaptrack:mytaptrack@localhost:5672',
    queue: 'mytaptrack-events'
  },
  server: {
    port: parseInt(process.env.PORT || '4000'),
    graphiql: process.env.GRAPHIQL_ENABLED !== 'false'
  }
};
