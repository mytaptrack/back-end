// Load local environment setup FIRST
process.env.CONFIG_PATH = "../config/";
process.env.CONFIG_FILE = 'example_test.yml';
import { validateDynamoDB, initRabbitMQ, docClient, rabbitChannel } from './local-env-setup';

import express from 'express';
import { graphqlHTTP } from 'express-graphql';
import { buildSchema } from 'graphql';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuthManager } from './auth-manager';
import { LoggingLevel, MttLogger } from '@mytaptrack/lib';

const logger = new MttLogger('GraphQL Server', LoggingLevel.error);

const PORT = process.env.GRAPHQL_PORT || 4000;

const schemaPath = join(__dirname, '../graphql');

function processIncludes(content: string, basePath: string): string {
  const includeRegex = /#include\s+"([^"]+)"/g;
  return content.replace(includeRegex, (_, includePath) => {
    const fullPath = join(basePath, includePath);
    const included = readFileSync(fullPath, 'utf-8');
    return processIncludes(included, basePath);
  });
}

function stripAwsDirectives(schema: string): string {
  return schema
    .replace(/@aws_iam/g, '')
    .replace(/@aws_cognito_user_pools/g, '')
    .replace(/@aws_api_key/g, '')
    .replace(/@aws_auth/g, '')
    .replace(/@aws_subscribe\([^)]*\)/g, '');
}

const schemaFile = readFileSync(join(schemaPath, 'schema.graphql'), 'utf-8');
const processedSchema = processIncludes(schemaFile, schemaPath);
const schemaString = stripAwsDirectives(processedSchema);

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AppSyncStack } from '../../lib/app-sync';
import { Construct, IConstruct, Node } from 'constructs';
import { LambdaResolverProps } from '@mytaptrack/cdk';

const schema = buildSchema(schemaString);

const scope: Construct = {
  node: new Node(undefined, undefined, '')
};

class MockConstruct extends Construct implements IConstruct {
  constructor(public scope: any, public id: string, public props?: any) {
    super(scope, 'mock stack');
  }
}
class MockStack extends MockConstruct {
  public stackName = 'mock-stack';
  public region = 'us-east-1';
}

// Load resolver mappings from YAML file
function loadResolverMappings(): Record<string, string> {
  // Mock the stack props and dependencies
  const mockProps: any = {
    environment: 'dev',
    coreStack: 'mock-core-stack'
  };
  
  const lambdaResolvers: LambdaResolverProps[] = [];
  const appsync: any = {
    addLambdaResolver: (id, props: LambdaResolverProps) => { lambdaResolvers.push(props) },
    addNoneDataSource: (id, props) => {},
    createResolver: (id, props) => {}
  };
  const ddbTable: any = {};
  const bus: any = {};
  const object: any = {};
  const config: any = {
    env: { 
      app: { secrets: { tokenKey: { name: '' } } },
      domain: { sub: { device: { appid: '' } } }
    }
  };
  AppSyncStack.addResolversToAppSync({ 
    appsync,
    primaryTable: ddbTable,
    dataTable: ddbTable,
    eventBus: bus,
    reportDataQueue: object,
    dataBucket: object,
    cognito: object,
    props: {},
    config,
    region: '',
    account: ''
  });
  
  // Flatten the structure to match the original format (file path -> field name)
  const resolverMap: Record<string, string> = {};

  lambdaResolvers.forEach(config => {
    resolverMap[config.codePath] = config.fieldName;
  })
  
  return resolverMap;
}

const resolverMap = loadResolverMappings();

function loadResolvers() {
  const resolvers: any = {};
  
  // Add scalar resolvers
  resolvers.Long = {
    serialize: (value: any) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseInt(value, 10);
      return null;
    },
    parseValue: (value: any) => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseInt(value, 10);
      return null;
    },
    parseLiteral: (ast: any) => {
      if (ast.kind === 'IntValue') return parseInt(ast.value, 10);
      return null;
    }
  };
  
  logger.log('Loading resolvers...');
  for (const [codePath, fieldName] of Object.entries(resolverMap)) {
    const cleanPath = codePath.replace(/^\.\//, '');
    const fullPath = join(__dirname, '../..', cleanPath);
    try {
      const resolver = require(fullPath);
      resolvers[fieldName] = wrapResolver(resolver.handler);
      logger.log(`✓ Loaded ${fieldName} from ${codePath}`);
    } catch (e) {
      logger.warn(`✗ Failed to load resolver ${fieldName} from ${codePath}:`, e.message);
    }
  }
  
  logger.log('Resolver loading complete');
  logger.log('Available resolvers:', Object.keys(resolvers));
  return resolvers;
}

function wrapResolver(handler: Function) {
  return async (args: any, context: any, info: any) => {
    try {
      logger.info(`Calling resolver: ${info?.fieldName}`);
      
      // Extract selection set from GraphQL info
      const selectionSetList = info?.fieldNodes?.[0]?.selectionSet?.selections?.map((selection: any) => selection.name.value) || [];
      
      const event = {
        arguments: args,
        source: {},
        identity: context.identity || null,
        request: {
          headers: context.headers || {}
        },
        info: {
          fieldName: info?.fieldName || '',
          parentTypeName: info?.parentType?.name || '',
          variables: info?.variableValues || {},
          selectionSetList: selectionSetList,
          selectionSetGraphQL: ''
        },
        stash: {
          permissions: context.permissions || {}
        }
      };
      
      logger.info(`Identity for ${info?.fieldName}:`, context.identity);
      logger.info(`Event for ${info?.fieldName}:`, JSON.stringify(event, null, 2));
      const result = await handler(event);
      logger.info(`Result for ${info?.fieldName}:`, result);
      return result;
    } catch (error) {
      logger.error(`[${new Date().toISOString()}] Resolver Error:`, error);
      throw error;
    }
  };
}

const root = loadResolvers();

// NoneDataSource stubs — these fields use createResolver() in app-sync.ts and are not
// captured by addLambdaResolver. Per GQL-03, return null (graceful skip) instead of throwing.
root['onUserLicenseChange'] = async (_args: any, _context: any, _info: any) => {
  logger.log('onUserLicenseChange: subscription not supported in local mode, returning null');
  return null;
};
root['onStudentDataChange'] = async (_args: any, _context: any, _info: any) => {
  logger.log('onStudentDataChange: subscription not supported in local mode, returning null');
  return null;
};
root['studentDataChange'] = async (_args: any, _context: any, _info: any) => {
  logger.log('studentDataChange: NoneDataSource passthrough — returning null in local mode');
  return null;
};

const app = express();

// Add JSON body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  logger.debug('Headers:', JSON.stringify(req.headers, null, 2));
  logger.debug('Body:', JSON.stringify(req.body, null, 2));
  
  const originalSend = res.send;
  res.send = function(data) {
    logger.info(`Response ${res.statusCode}`);
    logger.debug('Response:', typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500));
    return originalSend.call(this, data);
  };
  
  next();
});

// JWT verification middleware - must be before GraphQL endpoint
app.use(async (req, res, next) => {
  const authHeader: string = req.headers.authorization || (req.headers.Authorization as string);
  
  if (authHeader) {
    let token = authHeader;
    
    // Handle both "Bearer <token>" and raw token
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    logger.log('Validating JWT token for GraphQL request');
    const payload = await AuthManager.validateToken(token);
    
    if (payload) {
      // Get full identity from Redis
      const identity = await AuthManager.getIdentity(payload.sub);
      
      if (identity) {
        (req as any).userIdentity = identity;
        logger.info('✓ JWT validated for user:', payload.sub);
        logger.info('✓ Identity set:', identity);
      } else {
        logger.warn('✗ Identity not found in Redis for user:', payload.sub);
      }
    } else {
      logger.warn('✗ Invalid JWT token');
    }
  } else {
    logger.warn('✗ No authorization header found');
  }
  
  next();
});

app.use('/graphql', graphqlHTTP((req) => ({
  schema,
  rootValue: root,
  graphiql: true,
  context: { 
    docClient, 
    rabbitChannel,
    identity: (req as any).userIdentity || null,
    headers: req.headers
  },
  customFormatErrorFn: (error) => {
    logger.error(`[${new Date().toISOString()}] GraphQL Error:`, error);
    return error;
  }
})));

async function start() {
  try {
    logger.log('Starting GraphQL container server...');
    logger.log(`DynamoDB endpoint: ${process.env.DYNAMODB_ENDPOINT}`);
    logger.log(`RabbitMQ URL: ${process.env.RABBITMQ_URL}`);
    
    await validateDynamoDB();
    await initRabbitMQ();
    app.listen(PORT, () => {
      logger.log(`GraphQL server running at http://localhost:${PORT}/graphql`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
