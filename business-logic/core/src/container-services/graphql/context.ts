import { Request, Response } from 'express';
import { 
  ServiceContext, 
  IDataAccessLayer, 
  IMessageBroker, 
  IAuthenticationProvider, 
  UserContext, 
  ICacheProvider, 
  ILogger 
} from '../../interfaces/service-context';
import { GraphQLResolvers } from './resolvers';

/**
 * GraphQL context interface
 * Provides all necessary dependencies and request context for GraphQL resolvers
 */
export interface GraphQLContext {
  // Core service dependencies
  serviceContext: ServiceContext;
  dataAccess: IDataAccessLayer;
  messageBroker: IMessageBroker;
  authentication: IAuthenticationProvider;
  cache: ICacheProvider;
  logger: ILogger;
  
  // HTTP request/response
  req: Request;
  res: Response;
  
  // User authentication context
  userContext?: UserContext;
  
  // Request tracking
  correlationId: string;
  requestId: string;
  requestStartTime: number;
  
  // Business logic
  resolvers: GraphQLResolvers;
}

/**
 * GraphQL resolver function signature
 */
export type GraphQLResolver<TArgs = any, TResult = any> = (
  parent: any,
  args: TArgs,
  context: GraphQLContext,
  info: any
) => Promise<TResult> | TResult;

/**
 * GraphQL field resolver map
 */
export interface GraphQLResolverMap {
  [typeName: string]: {
    [fieldName: string]: GraphQLResolver;
  };
}

/**
 * GraphQL subscription resolver
 */
export interface GraphQLSubscriptionResolver {
  subscribe: GraphQLResolver;
  resolve?: GraphQLResolver;
}

/**
 * Complete GraphQL resolver structure
 */
export interface GraphQLResolverStructure {
  Query?: { [fieldName: string]: GraphQLResolver };
  Mutation?: { [fieldName: string]: GraphQLResolver };
  Subscription?: { [fieldName: string]: GraphQLSubscriptionResolver };
  [typeName: string]: any;
}