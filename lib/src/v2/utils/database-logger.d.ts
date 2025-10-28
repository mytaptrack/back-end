/**
 * Structured logging system for database operations
 * Provides consistent logging format across all database providers
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}
export interface LogContext {
    provider?: string;
    operation?: string;
    table?: string;
    key?: any;
    duration?: number;
    correlationId?: string;
    userId?: string;
    requestId?: string;
    [key: string]: any;
}
export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    context: LogContext;
    error?: any;
}
export interface ILogger {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: any, context?: LogContext): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    child(context: LogContext): ILogger;
}
export declare class DatabaseLogger implements ILogger {
    private level;
    private baseContext;
    constructor(level?: LogLevel, baseContext?: LogContext);
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: any, context?: LogContext): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    child(context: LogContext): ILogger;
    private log;
    private formatLogEntry;
    private serializeError;
}
export interface PerformanceMetrics {
    operation: string;
    provider: string;
    duration: number;
    success: boolean;
    itemCount?: number;
    bytesProcessed?: number;
}
export declare class PerformanceLogger {
    private logger;
    private slowOperationThreshold;
    constructor(logger: ILogger, slowOperationThreshold?: number);
    logOperation(metrics: PerformanceMetrics): void;
    logSlowQuery(operation: string, provider: string, duration: number, query?: any): void;
}
export declare class ConnectionLogger {
    private logger;
    constructor(logger: ILogger);
    logConnectionAttempt(provider: string, config?: any): void;
    logConnectionSuccess(provider: string, duration?: number): void;
    logConnectionFailure(provider: string, error: any, duration?: number): void;
    logConnectionClosed(provider: string): void;
    logRetryAttempt(provider: string, attempt: number, maxAttempts: number, delay: number): void;
    private sanitizeConfig;
}
export declare class LoggerFactory {
    private static defaultLevel;
    private static loggers;
    static setDefaultLevel(level: LogLevel): void;
    static getLogger(name: string, context?: LogContext): ILogger;
    static createPerformanceLogger(name: string, threshold?: number): PerformanceLogger;
    static createConnectionLogger(name: string): ConnectionLogger;
    private static parseLogLevel;
}
export declare function withLogging<T>(logger: ILogger, operation: string, provider: string, fn: () => Promise<T>, context?: LogContext): Promise<T>;
export declare function logDatabaseOperation(logger: ILogger, operation: string, provider: string, key?: any, options?: any): LogContext;
//# sourceMappingURL=database-logger.d.ts.map