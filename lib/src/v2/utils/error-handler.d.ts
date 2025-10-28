/**
 * Enhanced error handling system with comprehensive error processing
 * Integrates with existing error types and provides additional error context
 */
import { DatabaseError } from '../types/database-errors';
import { ILogger } from './database-logger';
export interface ErrorContext {
    operation: string;
    provider: string;
    table?: string;
    key?: any;
    query?: any;
    duration?: number;
    attempt?: number;
    correlationId?: string;
    userId?: string;
    requestId?: string;
    metadata?: Record<string, any>;
}
export interface ErrorReport {
    error: DatabaseError;
    context: ErrorContext;
    timestamp: Date;
    severity: ErrorSeverity;
    actionable: boolean;
    suggestions: string[];
}
export declare enum ErrorSeverity {
    LOW = "LOW",
    MEDIUM = "MEDIUM",
    HIGH = "HIGH",
    CRITICAL = "CRITICAL"
}
export interface IErrorHandler {
    handleError(error: any, context: ErrorContext): DatabaseError;
    reportError(error: DatabaseError, context: ErrorContext): ErrorReport;
    shouldRetry(error: DatabaseError, attempt: number): boolean;
    getSuggestions(error: DatabaseError, context: ErrorContext): string[];
}
export declare class DatabaseErrorHandler implements IErrorHandler {
    private logger;
    private errorCounts;
    private lastErrorTime;
    constructor(logger?: ILogger);
    handleError(error: any, context: ErrorContext): DatabaseError;
    reportError(error: DatabaseError, context: ErrorContext): ErrorReport;
    shouldRetry(error: DatabaseError, attempt: number): boolean;
    getSuggestions(error: DatabaseError, context: ErrorContext): string[];
    private enrichError;
    private logError;
    private trackError;
    private determineSeverity;
    private isActionable;
    getErrorStatistics(): Record<string, any>;
    resetStatistics(): void;
}
export declare class ErrorAggregator {
    private errors;
    private logger;
    private maxErrors;
    constructor(maxErrors?: number);
    addError(report: ErrorReport): void;
    getErrorSummary(timeWindow?: number): Record<string, any>;
    clearErrors(): void;
}
export declare class ErrorHandlerFactory {
    private static handlers;
    static getHandler(provider: string): DatabaseErrorHandler;
    static createAggregator(maxErrors?: number): ErrorAggregator;
}
//# sourceMappingURL=error-handler.d.ts.map