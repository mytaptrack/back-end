// Load local environment setup FIRST
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

const schema = buildSchema(schemaString);

const resolverMap: Record<string, string> = {
  'src/graphql/resolver/query/getGlobalServiceReport/data.ts': 'getGlobalServiceReport',
  'src/graphql/resolver/query/getStudent/get-students.ts': 'getStudents',
  'src/graphql/resolver/query/getStudent/find-students.ts': 'findStudent',
  'src/graphql/resolver/query/getLicenses/data.ts': 'getLicenses',
  'src/graphql/resolver/query/getStudent/data.ts': 'getStudent',
  'src/graphql/resolver/query/getData/data.ts': 'getData',
  'src/graphql/resolver/query/getData/notes.ts': 'getNotes',
  'src/graphql/resolver/mutations/report/notes.ts': 'updateNotes',
  'src/graphql/resolver/subscriptions/report/notes.ts': 'onStudentNote',
  'src/graphql/resolver/mutations/report/date-inclusion.ts': 'updateReportDateInclusion',
  'src/graphql/resolver/mutations/report/update-exclude-date.ts': 'updateExcludeDate',
  'src/graphql/resolver/mutations/user/dashboard.ts': 'updateUserBehaviorDashboardSettings',
  'src/graphql/resolver/mutations/student/update-info/data.ts': 'updateStudent',
  'src/graphql/resolver/mutations/student/update-info/delete.ts': 'deleteStudent',
  'src/graphql/resolver/mutations/student/delete-team-member.ts': 'deleteStudentTeamMember',
  'src/graphql/resolver/mutations/student/update-team-member.ts': 'updateStudentTeamMember',
  'src/graphql/resolver/query/getStudent/data-sources.ts': 'getStudentSources',
  'src/graphql/resolver/query/getSnapshot/list.ts': 'listSnapshots',
  'src/graphql/resolver/query/getSnapshot/get.ts': 'getSnapshot',
  'src/graphql/resolver/mutations/snapshot/save.ts': 'updateSnapshot',
  'src/graphql/resolver/mutations/report/data.ts': 'updateDataInReport',
  'src/graphql/resolver/mutations/report/schedule.ts': 'updateReportDaySchedule',
  'src/graphql/resolver/mutations/student/notifications/delete-notifications.ts': 'deleteNotifications',
  'src/graphql/resolver/query/getDevices/apps.ts': 'getAppList',
  'src/graphql/resolver/query/getDevices/app.ts': 'getApp',
  'src/graphql/resolver/query/getDevices/appToken.ts': 'getAppToken',
  'src/graphql/resolver/query/getDevices/apps-for-device.ts': 'getAppsForDevice',
  'src/graphql/resolver/query/getDevices/apps-for-license.ts': 'getAppsForLicense',
  'src/graphql/resolver/query/getDevices/track-for-dsn.ts': 'getTrackForDevice',
  'src/graphql/resolver/mutations/app/update.ts': 'updateApp',
  'src/graphql/resolver/query/getStudent/subscriptions.ts': 'getSubscriptionsForStudent',
  'src/graphql/resolver/query/getUsers/manage.ts': 'getUsersForLicense',
  'src/graphql/resolver/query/getServerSettings/data.ts': 'getServerSettings',
  'src/graphql/resolver/query/getUsers/current.ts': 'getUser',
  'src/graphql/resolver/mutations/user/accept-terms.ts': 'acceptUserTerms',
  'src/graphql/resolver/query/getUsers/payment-session.ts': 'getUserPaymentSession',
  'src/graphql/resolver/mutations/user/info.ts': 'updateUser',
  'src/graphql/resolver/mutations/license/license-updated.ts': 'userLicenseChange',
  'src/graphql/resolver/mutations/license/change-license.ts': 'changeLicense',
  './src/graphql/resolver/mutations/support/email.ts': 'emailSupport',
  './src/graphql/resolver/mutations/user/invite.ts': 'updateInvite',
  
  // Missing REST API functionality
  'src/graphql/resolver/query/getManageStudents/get-manage-students.ts': 'getManageStudents',
  'src/graphql/resolver/query/getManageStats/get-manage-stats.ts': 'getManageStats',
  'src/graphql/resolver/query/getLicenseDetails/get-license-details.ts': 'getLicenseDetails',
  'src/graphql/resolver/query/getStudentTeam/get-student-team.ts': 'getStudentTeam',
  'src/graphql/resolver/query/getReportData/get-report-data.ts': 'getReportData',
  'src/graphql/resolver/mutations/manage/update-manage-abc.ts': 'updateManageAbc',
  'src/graphql/resolver/mutations/reports/update-reports-data.ts': 'updateReportsData',
  'src/graphql/resolver/mutations/snapshot/create-snapshot.ts': 'createSnapshot',
};

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
  const authHeader = req.headers.authorization || req.headers.Authorization;
  
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
