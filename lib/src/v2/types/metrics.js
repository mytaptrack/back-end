"use strict";
/**
 * Performance monitoring and metrics types for database abstraction layer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_METRICS_CONFIG = void 0;
exports.DEFAULT_METRICS_CONFIG = {
    enabled: true,
    warningThresholds: {
        'get': 100, // 100ms
        'put': 200, // 200ms
        'update': 200, // 200ms
        'delete': 150, // 150ms
        'query': 500, // 500ms
        'scan': 1000, // 1000ms
        'batchGet': 300, // 300ms
        'transaction': 1000 // 1000ms
    },
    slowQueryThreshold: 1000, // 1 second
    maxSlowQueries: 100,
    maxWarnings: 50,
    healthCheckInterval: 30000 // 30 seconds
};
//# sourceMappingURL=metrics.js.map