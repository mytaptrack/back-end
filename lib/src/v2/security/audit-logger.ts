/**
 * Audit Logging Implementation
 * Provides comprehensive audit logging for all database operations
 */

import { DatabaseKey, TransactionOperation } from '../types/database-abstraction';
import { SecurityContext } from './access-control';

// Audit event types
export type AuditEventType = 
  | 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'WRITE'
  | 'QUERY' | 'SCAN' | 'BATCH_READ' | 'BATCH_WRITE'
  | 'TRANSACTION_START' | 'TRANSACTION_COMMIT' | 'TRANSACTION_ROLLBACK'
  | 'CONNECTION' | 'AUTHENTICATION' | 'AUTHORIZATION'
  | 'ENCRYPTION' | 'DECRYPTION' | 'KEY_ROTATION'
  | 'MIGRATION' | 'BACKUP' | 'RESTORE';

// Audit event severity levels
export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Audit event status
export type AuditStatus = 'SUCCESS' | 'FAILURE' | 'WARNING' | 'INFO';

// Audit event interface
export interface AuditEvent {
  // Core event information
  eventId: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: AuditSeverity;
  status: AuditStatus;
  
  // Security context
  userId?: string;
  userRole?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  
  // Operation details
  operation: string;
  resource: {
    type: string;
    identifier: string;
    table?: string;
    database?: string;
  };
  
  // Data details (sanitized)
  dataDetails?: {
    recordCount?: number;
    fieldsAccessed?: string[];
    fieldsModified?: string[];
    queryType?: string;
    indexUsed?: string;
    recordsRequested?: number;
  };
  
  // Performance metrics
  performance?: {
    duration: number;
    bytesProcessed?: number;
    recordsProcessed?: number;
  };
  
  // Error information (if applicable)
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  
  // Additional context
  metadata?: Record<string, any>;
  
  // Compliance tags
  complianceTags?: string[];
}

// Audit configuration
export interface AuditConfig {
  enabled: boolean;
  logLevel: AuditSeverity;
  includeDataDetails: boolean;
  includePerformanceMetrics: boolean;
  includeStackTraces: boolean;
  sanitizeData: boolean;
  retentionDays: number;
  destinations: AuditDestination[];
  complianceMode?: 'HIPAA' | 'GDPR' | 'SOX' | 'PCI_DSS';
}

// Audit destination configuration
export interface AuditDestination {
  type: 'console' | 'file' | 'database' | 'cloudwatch' | 'syslog' | 'webhook';
  config: Record<string, any>;
  filter?: (event: AuditEvent) => boolean;
}

// Audit logger interface
export interface IAuditLogger {
  /**
   * Log a database operation audit event
   */
  logDatabaseOperation(
    eventType: AuditEventType,
    operation: string,
    resource: AuditEvent['resource'],
    context: SecurityContext,
    result: { success: boolean; error?: Error; duration?: number },
    additionalData?: Partial<AuditEvent>
  ): Promise<void>;

  /**
   * Log an authentication event
   */
  logAuthenticationEvent(
    success: boolean,
    context: SecurityContext,
    error?: Error
  ): Promise<void>;

  /**
   * Log an authorization event
   */
  logAuthorizationEvent(
    operation: string,
    resource: string,
    allowed: boolean,
    context: SecurityContext,
    reason?: string
  ): Promise<void>;

  /**
   * Log a security event
   */
  logSecurityEvent(
    eventType: AuditEventType,
    severity: AuditSeverity,
    message: string,
    context: SecurityContext,
    additionalData?: Record<string, any>
  ): Promise<void>;

  /**
   * Log a custom audit event
   */
  logEvent(event: AuditEvent): Promise<void>;

  /**
   * Query audit logs
   */
  queryLogs(
    filters: {
      startTime?: Date;
      endTime?: Date;
      userId?: string;
      eventType?: AuditEventType;
      severity?: AuditSeverity;
      status?: AuditStatus;
    },
    limit?: number
  ): Promise<AuditEvent[]>;

  /**
   * Get audit statistics
   */
  getAuditStatistics(
    timeRange: { start: Date; end: Date }
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<AuditEventType, number>;
    eventsBySeverity: Record<AuditSeverity, number>;
    eventsByStatus: Record<AuditStatus, number>;
    topUsers: Array<{ userId: string; eventCount: number }>;
    errorRate: number;
  }>;
}

// Default audit logger implementation
export class DefaultAuditLogger implements IAuditLogger {
  private config: AuditConfig;
  private auditEvents: AuditEvent[] = []; // In-memory storage for demo
  private eventIdCounter = 0;

  constructor(config?: Partial<AuditConfig>) {
    this.config = {
      enabled: true,
      logLevel: 'LOW',
      includeDataDetails: true,
      includePerformanceMetrics: true,
      includeStackTraces: false,
      sanitizeData: true,
      retentionDays: 90,
      destinations: [{ type: 'console', config: {} }],
      ...config
    };
  }

  async logDatabaseOperation(
    eventType: AuditEventType,
    operation: string,
    resource: AuditEvent['resource'],
    context: SecurityContext,
    result: { success: boolean; error?: Error; duration?: number },
    additionalData?: Partial<AuditEvent>
  ): Promise<void> {
    const event: AuditEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date(),
      eventType,
      severity: this.determineSeverity(eventType, result.success),
      status: result.success ? 'SUCCESS' : 'FAILURE',
      
      // Security context
      userId: context.userId,
      userRole: context.userRole,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      
      // Operation details
      operation,
      resource,
      
      // Performance metrics
      performance: result.duration ? {
        duration: result.duration
      } : undefined,
      
      // Error information
      error: result.error ? {
        code: result.error.name || 'UNKNOWN_ERROR',
        message: this.sanitizeErrorMessage(result.error.message),
        stack: this.config.includeStackTraces ? result.error.stack : undefined
      } : undefined,
      
      // Additional data
      ...additionalData
    };

    await this.logEvent(event);
  }

  async logAuthenticationEvent(
    success: boolean,
    context: SecurityContext,
    error?: Error
  ): Promise<void> {
    await this.logDatabaseOperation(
      'AUTHENTICATION',
      success ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE',
      { type: 'authentication', identifier: 'auth_system' },
      context,
      { success, error }
    );
  }

  async logAuthorizationEvent(
    operation: string,
    resource: string,
    allowed: boolean,
    context: SecurityContext,
    reason?: string
  ): Promise<void> {
    await this.logDatabaseOperation(
      'AUTHORIZATION',
      operation,
      { type: 'authorization', identifier: resource },
      context,
      { success: allowed },
      {
        metadata: reason ? { reason } : undefined,
        severity: allowed ? 'LOW' : 'MEDIUM'
      }
    );
  }

  async logSecurityEvent(
    eventType: AuditEventType,
    severity: AuditSeverity,
    message: string,
    context: SecurityContext,
    additionalData?: Record<string, any>
  ): Promise<void> {
    const event: AuditEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date(),
      eventType,
      severity,
      status: 'INFO',
      
      userId: context.userId,
      userRole: context.userRole,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      
      operation: message,
      resource: { type: 'security', identifier: 'security_system' },
      
      metadata: additionalData
    };

    await this.logEvent(event);
  }

  async logEvent(event: AuditEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Check if event meets minimum severity level
    if (!this.meetsSeverityThreshold(event.severity)) {
      return;
    }

    // Add compliance tags
    event.complianceTags = this.generateComplianceTags(event);

    // Sanitize data if required
    if (this.config.sanitizeData) {
      event = this.sanitizeEvent(event);
    }

    // Store event (in production, this would go to persistent storage)
    this.auditEvents.push(event);

    // Send to configured destinations
    await this.sendToDestinations(event);

    // Clean up old events based on retention policy
    this.cleanupOldEvents();
  }

  async queryLogs(
    filters: {
      startTime?: Date;
      endTime?: Date;
      userId?: string;
      eventType?: AuditEventType;
      severity?: AuditSeverity;
      status?: AuditStatus;
    },
    limit = 100
  ): Promise<AuditEvent[]> {
    let filteredEvents = this.auditEvents;

    // Apply filters
    if (filters.startTime) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= filters.endTime!);
    }
    if (filters.userId) {
      filteredEvents = filteredEvents.filter(e => e.userId === filters.userId);
    }
    if (filters.eventType) {
      filteredEvents = filteredEvents.filter(e => e.eventType === filters.eventType);
    }
    if (filters.severity) {
      filteredEvents = filteredEvents.filter(e => e.severity === filters.severity);
    }
    if (filters.status) {
      filteredEvents = filteredEvents.filter(e => e.status === filters.status);
    }

    // Sort by timestamp (newest first) and limit
    return filteredEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async getAuditStatistics(
    timeRange: { start: Date; end: Date }
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<AuditEventType, number>;
    eventsBySeverity: Record<AuditSeverity, number>;
    eventsByStatus: Record<AuditStatus, number>;
    topUsers: Array<{ userId: string; eventCount: number }>;
    errorRate: number;
  }> {
    const eventsInRange = this.auditEvents.filter(
      e => e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
    );

    const stats = {
      totalEvents: eventsInRange.length,
      eventsByType: {} as Record<AuditEventType, number>,
      eventsBySeverity: {} as Record<AuditSeverity, number>,
      eventsByStatus: {} as Record<AuditStatus, number>,
      topUsers: [] as Array<{ userId: string; eventCount: number }>,
      errorRate: 0
    };

    // Count events by type, severity, and status
    const userCounts: Record<string, number> = {};
    let errorCount = 0;

    for (const event of eventsInRange) {
      // Count by type
      stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;
      
      // Count by severity
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;
      
      // Count by status
      stats.eventsByStatus[event.status] = (stats.eventsByStatus[event.status] || 0) + 1;
      
      // Count by user
      if (event.userId) {
        userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
      }
      
      // Count errors
      if (event.status === 'FAILURE') {
        errorCount++;
      }
    }

    // Calculate error rate
    stats.errorRate = stats.totalEvents > 0 ? (errorCount / stats.totalEvents) * 100 : 0;

    // Get top users
    stats.topUsers = Object.entries(userCounts)
      .map(([userId, eventCount]) => ({ userId, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);

    return stats;
  }

  private generateEventId(): string {
    return `audit_${Date.now()}_${++this.eventIdCounter}`;
  }

  private determineSeverity(eventType: AuditEventType, success: boolean): AuditSeverity {
    if (!success) {
      return eventType === 'AUTHENTICATION' || eventType === 'AUTHORIZATION' ? 'HIGH' : 'MEDIUM';
    }

    switch (eventType) {
      case 'DELETE':
      case 'TRANSACTION_ROLLBACK':
        return 'MEDIUM';
      case 'AUTHENTICATION':
      case 'AUTHORIZATION':
      case 'ENCRYPTION':
      case 'DECRYPTION':
        return 'LOW';
      default:
        return 'LOW';
    }
  }

  private meetsSeverityThreshold(severity: AuditSeverity): boolean {
    const severityLevels = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    return severityLevels[severity] >= severityLevels[this.config.logLevel];
  }

  private sanitizeEvent(event: AuditEvent): AuditEvent {
    const sanitized = { ...event };

    // Remove sensitive data from metadata
    if (sanitized.metadata) {
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'ssn', 'creditCard'];
      for (const key of sensitiveKeys) {
        if (key in sanitized.metadata) {
          sanitized.metadata[key] = '[REDACTED]';
        }
      }
    }

    // Sanitize error messages
    if (sanitized.error?.message) {
      sanitized.error.message = this.sanitizeErrorMessage(sanitized.error.message);
    }

    return sanitized;
  }

  private sanitizeErrorMessage(message: string): string {
    // Remove potential sensitive information from error messages
    return message
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, 'XXX-XX-XXXX') // SSN pattern
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, 'XXXX-XXXX-XXXX-XXXX'); // Credit card pattern
  }

  private generateComplianceTags(event: AuditEvent): string[] {
    const tags: string[] = [];

    // Add compliance tags based on event type and configuration
    if (this.config.complianceMode) {
      tags.push(this.config.complianceMode);
    }

    // Add specific compliance tags based on event characteristics
    if (event.eventType === 'AUTHENTICATION' || event.eventType === 'AUTHORIZATION') {
      tags.push('ACCESS_CONTROL');
    }

    if (event.eventType === 'ENCRYPTION' || event.eventType === 'DECRYPTION') {
      tags.push('DATA_PROTECTION');
    }

    if (event.dataDetails?.fieldsAccessed?.some(field => 
      ['ssn', 'creditCard', 'medicalRecord'].includes(field))) {
      tags.push('SENSITIVE_DATA');
    }

    return tags;
  }

  private async sendToDestinations(event: AuditEvent): Promise<void> {
    for (const destination of this.config.destinations) {
      // Apply destination filter if configured
      if (destination.filter && !destination.filter(event)) {
        continue;
      }

      try {
        await this.sendToDestination(event, destination);
      } catch (error) {
        console.error(`Failed to send audit event to ${destination.type}:`, error);
      }
    }
  }

  private async sendToDestination(event: AuditEvent, destination: AuditDestination): Promise<void> {
    switch (destination.type) {
      case 'console':
        console.log(`[AUDIT] ${event.timestamp.toISOString()} ${event.eventType} ${event.status}:`, 
          JSON.stringify(event, null, 2));
        break;
      
      case 'file':
        // In production, implement file logging
        break;
      
      case 'database':
        // In production, implement database logging
        break;
      
      case 'cloudwatch':
        // In production, implement CloudWatch logging
        break;
      
      case 'webhook':
        // In production, implement webhook notifications
        break;
      
      default:
        console.warn(`Unknown audit destination type: ${destination.type}`);
    }
  }

  private cleanupOldEvents(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
    
    this.auditEvents = this.auditEvents.filter(event => event.timestamp >= cutoffDate);
  }

  // Configuration methods
  updateConfig(config: Partial<AuditConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AuditConfig {
    return { ...this.config };
  }

  // Administrative methods
  clearLogs(): void {
    this.auditEvents = [];
  }

  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.auditEvents, null, 2);
    } else {
      // Implement CSV export
      const headers = ['eventId', 'timestamp', 'eventType', 'severity', 'status', 'userId', 'operation'];
      const rows = this.auditEvents.map(event => [
        event.eventId,
        event.timestamp.toISOString(),
        event.eventType,
        event.severity,
        event.status,
        event.userId || '',
        event.operation
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }
  }
}

// Helper functions
export function createAuditLogger(config?: Partial<AuditConfig>): DefaultAuditLogger {
  return new DefaultAuditLogger(config);
}

export function createSecurityAuditEvent(
  eventType: AuditEventType,
  operation: string,
  context: SecurityContext,
  additionalData?: Partial<AuditEvent>
): Partial<AuditEvent> {
  return {
    eventType,
    operation,
    userId: context.userId,
    userRole: context.userRole,
    sessionId: context.sessionId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    timestamp: new Date(),
    ...additionalData
  };
}