"use strict";
/**
 * Base database provider interface with connection management
 * Defines the contract that all database providers must implement
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultMetricsCollector = exports.BaseTransaction = exports.BaseDatabaseProvider = exports.ConnectionState = void 0;
const database_errors_1 = require("./database-errors");
// Connection state enum
var ConnectionState;
(function (ConnectionState) {
    ConnectionState["DISCONNECTED"] = "disconnected";
    ConnectionState["CONNECTING"] = "connecting";
    ConnectionState["CONNECTED"] = "connected";
    ConnectionState["RECONNECTING"] = "reconnecting";
    ConnectionState["ERROR"] = "error";
})(ConnectionState || (exports.ConnectionState = ConnectionState = {}));
// Abstract base database provider
class BaseDatabaseProvider {
    connectionManager;
    providerType;
    config;
    constructor(providerType, config) {
        this.providerType = providerType;
        this.config = config;
    }
    // Connection management methods (delegated to connection manager)
    async connect() {
        return this.connectionManager.connect();
    }
    async disconnect() {
        return this.connectionManager.disconnect();
    }
    isConnected() {
        return this.connectionManager.isConnected();
    }
    getProviderType() {
        return this.providerType;
    }
    async healthCheck() {
        return this.connectionManager.healthCheck();
    }
    // Utility methods for subclasses
    validateConnection() {
        if (!this.isConnected()) {
            throw new database_errors_1.ConnectionError('Database not connected', undefined, this.providerType);
        }
    }
    validateKey(key) {
        if (!key || !key.primary) {
            throw new database_errors_1.ValidationError('Invalid database key: primary key is required', undefined, this.providerType);
        }
    }
    validateData(data) {
        if (!data || typeof data !== 'object') {
            throw new database_errors_1.ValidationError('Invalid data: must be a non-null object', undefined, this.providerType);
        }
    }
}
exports.BaseDatabaseProvider = BaseDatabaseProvider;
// Abstract base transaction class
class BaseTransaction {
    provider;
    active = true;
    operations = [];
    constructor(provider) {
        this.provider = provider;
    }
    isActive() {
        return this.active;
    }
    validateActive() {
        if (!this.active) {
            throw new database_errors_1.TransactionError('Transaction is not active', undefined, this.provider.getProviderType());
        }
    }
}
exports.BaseTransaction = BaseTransaction;
// Default metrics collector implementation
class DefaultMetricsCollector {
    metrics = new Map();
    recordOperation(operation, duration, success, provider) {
        const metrics = this.getOrCreateMetrics(provider);
        metrics.totalOperations++;
        if (success) {
            metrics.successfulOperations++;
        }
        else {
            metrics.failedOperations++;
        }
        // Update average response time
        const totalTime = metrics.averageResponseTime * (metrics.totalOperations - 1) + duration;
        metrics.averageResponseTime = totalTime / metrics.totalOperations;
        // Update error rate
        metrics.errorRate = metrics.failedOperations / metrics.totalOperations;
    }
    recordConnectionEvent(event, provider) {
        const metrics = this.getOrCreateMetrics(provider);
        metrics.connectionEvents[`${event}s`]++;
    }
    recordQueryPerformance(queryType, duration, resultCount, provider) {
        const metrics = this.getOrCreateMetrics(provider);
        if (!metrics.queryMetrics[queryType]) {
            metrics.queryMetrics[queryType] = {
                count: 0,
                averageTime: 0,
                averageResultCount: 0
            };
        }
        const queryMetrics = metrics.queryMetrics[queryType];
        queryMetrics.count++;
        // Update averages
        const totalTime = queryMetrics.averageTime * (queryMetrics.count - 1) + duration;
        queryMetrics.averageTime = totalTime / queryMetrics.count;
        const totalResults = queryMetrics.averageResultCount * (queryMetrics.count - 1) + resultCount;
        queryMetrics.averageResultCount = totalResults / queryMetrics.count;
    }
    getMetrics() {
        // Aggregate metrics across all providers
        const aggregated = this.createEmptyMetrics();
        for (const metrics of this.metrics.values()) {
            aggregated.totalOperations += metrics.totalOperations;
            aggregated.successfulOperations += metrics.successfulOperations;
            aggregated.failedOperations += metrics.failedOperations;
            aggregated.connectionEvents.connects += metrics.connectionEvents.connects;
            aggregated.connectionEvents.disconnects += metrics.connectionEvents.disconnects;
            aggregated.connectionEvents.errors += metrics.connectionEvents.errors;
            // Merge query metrics
            for (const [queryType, queryMetrics] of Object.entries(metrics.queryMetrics)) {
                if (!aggregated.queryMetrics[queryType]) {
                    aggregated.queryMetrics[queryType] = { ...queryMetrics };
                }
                else {
                    const existing = aggregated.queryMetrics[queryType];
                    const totalCount = existing.count + queryMetrics.count;
                    existing.averageTime = (existing.averageTime * existing.count + queryMetrics.averageTime * queryMetrics.count) / totalCount;
                    existing.averageResultCount = (existing.averageResultCount * existing.count + queryMetrics.averageResultCount * queryMetrics.count) / totalCount;
                    existing.count = totalCount;
                }
            }
        }
        // Calculate aggregated averages
        if (aggregated.totalOperations > 0) {
            aggregated.errorRate = aggregated.failedOperations / aggregated.totalOperations;
        }
        return {
            timestamp: new Date(),
            provider: 'aggregated',
            operations: {
                totalOperations: aggregated.totalOperations,
                successfulOperations: aggregated.successfulOperations,
                failedOperations: aggregated.failedOperations,
                averageResponseTime: aggregated.averageResponseTime,
                errorRate: aggregated.errorRate,
                operationCounts: {},
                operationTimings: {}
            },
            connections: {
                activeConnections: 0,
                totalConnections: aggregated.connectionEvents.connects,
                failedConnections: aggregated.connectionEvents.errors,
                connectionEvents: {
                    connect: aggregated.connectionEvents.connects,
                    disconnect: aggregated.connectionEvents.disconnects,
                    error: aggregated.connectionEvents.errors,
                    reconnect: 0
                }
            },
            queries: {
                totalQueries: 0,
                averageQueryTime: 0,
                averageResultCount: 0,
                queryTypes: {},
                slowQueries: []
            },
            performance: {
                warningThresholds: {},
                warnings: [],
                slowOperations: []
            }
        };
    }
    getOrCreateMetrics(provider) {
        if (!this.metrics.has(provider)) {
            this.metrics.set(provider, this.createEmptyMetrics());
        }
        return this.metrics.get(provider);
    }
    reset() {
        this.metrics.clear();
    }
    createEmptyMetrics() {
        return {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            averageResponseTime: 0,
            errorRate: 0,
            connectionEvents: {
                connects: 0,
                disconnects: 0,
                errors: 0
            },
            queryMetrics: {}
        };
    }
}
exports.DefaultMetricsCollector = DefaultMetricsCollector;
//# sourceMappingURL=database-provider.js.map