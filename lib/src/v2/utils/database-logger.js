"use strict";
/**
 * Structured logging system for database operations
 * Provides consistent logging format across all database providers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerFactory = exports.ConnectionLogger = exports.PerformanceLogger = exports.DatabaseLogger = exports.LogLevel = void 0;
exports.withLogging = withLogging;
exports.logDatabaseOperation = logDatabaseOperation;
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["NONE"] = 4] = "NONE";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class DatabaseLogger {
    level;
    baseContext;
    constructor(level = LogLevel.WARN, baseContext = {}) {
        this.level = level;
        this.baseContext = { ...baseContext };
    }
    debug(message, context = {}) {
        if (this.level <= LogLevel.DEBUG) {
            this.log(LogLevel.DEBUG, message, context);
        }
    }
    info(message, context = {}) {
        if (this.level <= LogLevel.INFO) {
            this.log(LogLevel.INFO, message, context);
        }
    }
    warn(message, context = {}) {
        if (this.level <= LogLevel.WARN) {
            this.log(LogLevel.WARN, message, context);
        }
    }
    error(message, error, context = {}) {
        if (this.level <= LogLevel.ERROR) {
            this.log(LogLevel.ERROR, message, context, error);
        }
    }
    setLevel(level) {
        this.level = level;
    }
    getLevel() {
        return this.level;
    }
    child(context) {
        return new DatabaseLogger(this.level, { ...this.baseContext, ...context });
    }
    log(level, message, context, error) {
        const entry = {
            timestamp: new Date(),
            level,
            message,
            context: { ...this.baseContext, ...context },
            error: error ? this.serializeError(error) : undefined
        };
        const logOutput = this.formatLogEntry(entry);
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(logOutput);
                break;
            case LogLevel.INFO:
                console.info(logOutput);
                break;
            case LogLevel.WARN:
                console.warn(logOutput);
                break;
            case LogLevel.ERROR:
                console.error(logOutput);
                break;
        }
    }
    formatLogEntry(entry) {
        const levelName = LogLevel[entry.level];
        const timestamp = entry.timestamp.toISOString();
        const logObject = {
            timestamp,
            level: levelName,
            message: entry.message,
            ...entry.context
        };
        if (entry.error) {
            logObject.error = entry.error;
        }
        return JSON.stringify(logObject);
    }
    serializeError(error) {
        if (error instanceof Error) {
            return {
                name: error.name,
                message: error.message,
                stack: error.stack,
                ...error // Include any additional properties
            };
        }
        return error;
    }
}
exports.DatabaseLogger = DatabaseLogger;
class PerformanceLogger {
    logger;
    slowOperationThreshold;
    constructor(logger, slowOperationThreshold = 1000) {
        this.logger = logger;
        this.slowOperationThreshold = slowOperationThreshold;
    }
    logOperation(metrics) {
        const context = {
            provider: metrics.provider,
            operation: metrics.operation,
            duration: metrics.duration,
            success: metrics.success,
            itemCount: metrics.itemCount,
            bytesProcessed: metrics.bytesProcessed
        };
        if (metrics.duration > this.slowOperationThreshold) {
            this.logger.warn(`Slow database operation detected`, context);
        }
        else if (metrics.success) {
            this.logger.debug(`Database operation completed`, context);
        }
        else {
            this.logger.error(`Database operation failed`, undefined, context);
        }
    }
    logSlowQuery(operation, provider, duration, query) {
        this.logger.warn(`Slow query detected`, {
            provider,
            operation,
            duration,
            query: query ? JSON.stringify(query) : undefined,
            threshold: this.slowOperationThreshold
        });
    }
}
exports.PerformanceLogger = PerformanceLogger;
// Connection logging utilities
class ConnectionLogger {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    logConnectionAttempt(provider, config) {
        this.logger.info(`Attempting database connection`, {
            provider,
            config: config ? this.sanitizeConfig(config) : undefined
        });
    }
    logConnectionSuccess(provider, duration) {
        this.logger.info(`Database connection established`, {
            provider,
            duration
        });
    }
    logConnectionFailure(provider, error, duration) {
        this.logger.error(`Database connection failed`, error, {
            provider,
            duration
        });
    }
    logConnectionClosed(provider) {
        this.logger.info(`Database connection closed`, {
            provider
        });
    }
    logRetryAttempt(provider, attempt, maxAttempts, delay) {
        this.logger.warn(`Connection retry attempt`, {
            provider,
            attempt,
            maxAttempts,
            delay
        });
    }
    sanitizeConfig(config) {
        const sanitized = { ...config };
        // Remove sensitive information
        const sensitiveKeys = ['password', 'connectionString', 'accessKey', 'secretKey', 'token'];
        sensitiveKeys.forEach(key => {
            if (sanitized[key]) {
                sanitized[key] = '[REDACTED]';
            }
        });
        return sanitized;
    }
}
exports.ConnectionLogger = ConnectionLogger;
// Logger factory
class LoggerFactory {
    static defaultLevel = LogLevel.WARN;
    static loggers = new Map();
    static setDefaultLevel(level) {
        this.defaultLevel = level;
    }
    static getLogger(name, context) {
        const key = `${name}:${JSON.stringify(context || {})}`;
        if (!this.loggers.has(key)) {
            const level = this.parseLogLevel(process.env.DATABASE_LOG_LEVEL) || this.defaultLevel;
            const logger = new DatabaseLogger(level, { component: name, ...context });
            this.loggers.set(key, logger);
        }
        return this.loggers.get(key);
    }
    static createPerformanceLogger(name, threshold) {
        const logger = this.getLogger(name);
        return new PerformanceLogger(logger, threshold);
    }
    static createConnectionLogger(name) {
        const logger = this.getLogger(name);
        return new ConnectionLogger(logger);
    }
    static parseLogLevel(level) {
        if (!level)
            return undefined;
        switch (level.toUpperCase()) {
            case 'DEBUG': return LogLevel.DEBUG;
            case 'INFO': return LogLevel.INFO;
            case 'WARN': return LogLevel.WARN;
            case 'ERROR': return LogLevel.ERROR;
            case 'NONE': return LogLevel.NONE;
            default: return undefined;
        }
    }
}
exports.LoggerFactory = LoggerFactory;
// Utility functions for common logging patterns
function withLogging(logger, operation, provider, fn, context) {
    const startTime = Date.now();
    const operationContext = { operation, provider, ...context };
    logger.debug(`Starting ${operation}`, operationContext);
    return fn()
        .then(result => {
        const duration = Date.now() - startTime;
        logger.debug(`Completed ${operation}`, { ...operationContext, duration, success: true });
        return result;
    })
        .catch(error => {
        const duration = Date.now() - startTime;
        logger.error(`Failed ${operation}`, error, { ...operationContext, duration, success: false });
        throw error;
    });
}
function logDatabaseOperation(logger, operation, provider, key, options) {
    const context = {
        operation,
        provider,
        key: key ? JSON.stringify(key) : undefined,
        options: options ? JSON.stringify(options) : undefined
    };
    logger.debug(`Database operation: ${operation}`, context);
    return context;
}
//# sourceMappingURL=database-logger.js.map