import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { buildSchema } from 'graphql';

const app = express();
const port = process.env.PORT || 4500;

// Simple GraphQL schema
const typeDefs = `
  type Query {
    hello: String
    health: HealthStatus
  }
  
  type Mutation {
    echo(message: String!): String
  }
  
  type HealthStatus {
    status: String
    service: String
    timestamp: String
  }
`;

// Simple resolvers
const resolvers = {
  Query: {
    hello: () => 'Hello from MyTapTrack GraphQL API!',
    health: () => ({
      status: 'healthy',
      service: 'graphql-api',
      timestamp: new Date().toISOString()
    })
  },
  Mutation: {
    echo: (_: any, { message }: { message: string }) => `Echo: ${message}`
  }
};

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true
  });

  await server.start();
  server.applyMiddleware({ app: app as any, path: '/graphql' });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'graphql-api', timestamp: new Date().toISOString() });
  });

  app.listen(port, () => {
    console.log(`GraphQL API service listening on port ${port}`);
    console.log(`GraphQL endpoint: http://localhost:${port}${server.graphqlPath}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start GraphQL API service:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});