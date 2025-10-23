import { ServiceContext } from '../interfaces/service-context';
import { Request, Response, NextFunction } from 'express';

/**
 * Base interface for container services
 */
export interface IContainerService {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  getHealthStatus(): Promise<HealthStatus>;
}

/**
 * Health status interface
 */
export interface HealthStatus {
  healthy: boolean;
  checks: Record<string, boolean>;
  timestamp: string;
  uptime: number;
  version?: string;
}

/**
 * Health check interface
 */
export interface IHealthCheck {
  name: string;
  execute(): Promise<boolean>;
}

/**
 * HTTP server configuration
 */
export interface ServerConfig {
  port: number;
  host?: string;
  cors?: CorsConfig;
  middleware?: MiddlewareConfig;
  security?: SecurityConfig;
}

/**
 * CORS configuration
 */
export interface CorsConfig {
  origin: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  requestLogging?: boolean;
  compression?: boolean;
  rateLimiting?: RateLimitConfig;
  bodyParser?: BodyParserConfig;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Body parser configuration
 */
export interface BodyParserConfig {
  json?: {
    limit?: string;
    strict?: boolean;
  };
  urlencoded?: {
    limit?: string;
    extended?: boolean;
  };
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  helmet?: boolean;
  trustProxy?: boolean;
  hidePoweredBy?: boolean;
}

/**
 * Express middleware function type
 */
export type ExpressMiddleware = (req: Request, res: Response, next: NextFunction) => void | Promise<void>;

/**
 * Authentication middleware context
 */
export interface AuthMiddlewareContext {
  user?: any;
  token?: string;
  correlationId?: string;
}

/**
 * Error response interface
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    correlationId?: string;
    retryable: boolean;
    details?: any;
  };
}

/**
 * Request context interface
 */
export interface RequestContext {
  correlationId: string;
  startTime: number;
  user?: any;
  serviceContext: ServiceContext;
}