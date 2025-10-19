import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';
import * as moment from 'moment-timezone';

/**
 * Report-specific business operations
 */
export class ReportOperations implements IBusinessOperations {
  
  /**
   * Generate student behavior report
   */
  static async generateBehaviorReport(
    reportRequest: BehaviorReportRequest,
    context: ServiceContext
  ): Promise<BehaviorReport> {
    // Validate input
    const validation = ReportOperations.validateReportRequest(reportRequest);
    if (!validation.valid) {
      throw new ValidationError('Invalid report request', context.config.correlationId, { errors: validation.errors });
    }

    const startDate = moment(reportRequest.startDate);
    const endDate = moment(reportRequest.endDate);

    // Get student data
    const studentKey = { pk: `S#${reportRequest.studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey);
    
    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId: reportRequest.studentId });
    }

    // Get behavior data for the date range
    const behaviorData = await context.dataAccess.query({
      keyExpression: 'pk = :pk and sk BETWEEN :startSk AND :endSk',
      attributeValues: {
        ':pk': `SBD#${reportRequest.studentId}`,
        ':startSk': `D#${startDate.format('YYYY-MM-DD')}`,
        ':endSk': `D#${endDate.format('YYYY-MM-DD')}`
      }
    });

    // Process behavior data
    const behaviorSummary = ReportOperations.processBehaviorData(behaviorData, reportRequest.behaviorIds);

    const report: BehaviorReport = {
      reportId: `BR#${reportRequest.studentId}#${Date.now()}`,
      studentId: reportRequest.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      startDate: reportRequest.startDate,
      endDate: reportRequest.endDate,
      behaviorIds: reportRequest.behaviorIds,
      summary: behaviorSummary,
      generatedAt: moment().toISOString(),
      generatedBy: reportRequest.userId
    };

    // Cache the report
    await context.cache.set(`report:${report.reportId}`, report, 3600); // 1 hour TTL

    // Publish report generated event
    await context.messageBroker.publish('report.generated', {
      reportId: report.reportId,
      studentId: reportRequest.studentId,
      reportType: 'behavior',
      timestamp: report.generatedAt
    });

    context.logger.info('Behavior report generated', { 
      reportId: report.reportId, 
      studentId: reportRequest.studentId 
    });

    return report;
  }

  /**
   * Generate service report
   */
  static async generateServiceReport(
    reportRequest: ServiceReportRequest,
    context: ServiceContext
  ): Promise<ServiceReport> {
    // Validate input
    const validation = ReportOperations.validateServiceReportRequest(reportRequest);
    if (!validation.valid) {
      throw new ValidationError('Invalid service report request', context.config.correlationId, { errors: validation.errors });
    }

    const startDate = moment(reportRequest.startDate);
    const endDate = moment(reportRequest.endDate);

    // Get student data
    const studentKey = { pk: `S#${reportRequest.studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey);
    
    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId: reportRequest.studentId });
    }

    // Get service data for the date range
    const serviceData = await context.dataAccess.query({
      keyExpression: 'pk = :pk and sk BETWEEN :startSk AND :endSk',
      attributeValues: {
        ':pk': `SSD#${reportRequest.studentId}`,
        ':startSk': `D#${startDate.format('YYYY-MM-DD')}`,
        ':endSk': `D#${endDate.format('YYYY-MM-DD')}`
      }
    });

    // Process service data
    const serviceSummary = ReportOperations.processServiceData(serviceData, reportRequest.serviceIds);

    const report: ServiceReport = {
      reportId: `SR#${reportRequest.studentId}#${Date.now()}`,
      studentId: reportRequest.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      startDate: reportRequest.startDate,
      endDate: reportRequest.endDate,
      serviceIds: reportRequest.serviceIds,
      summary: serviceSummary,
      generatedAt: moment().toISOString(),
      generatedBy: reportRequest.userId
    };

    // Cache the report
    await context.cache.set(`report:${report.reportId}`, report, 3600); // 1 hour TTL

    // Publish report generated event
    await context.messageBroker.publish('report.generated', {
      reportId: report.reportId,
      studentId: reportRequest.studentId,
      reportType: 'service',
      timestamp: report.generatedAt
    });

    context.logger.info('Service report generated', { 
      reportId: report.reportId, 
      studentId: reportRequest.studentId 
    });

    return report;
  }

  /**
   * Get cached report
   */
  static async getCachedReport(
    reportId: string,
    context: ServiceContext
  ): Promise<any | null> {
    const cachedReport = await context.cache.get(`report:${reportId}`);
    
    if (cachedReport) {
      context.logger.info('Report retrieved from cache', { reportId });
    }
    
    return cachedReport;
  }

  /**
   * Save report to storage
   */
  static async saveReport(
    report: any,
    context: ServiceContext
  ): Promise<void> {
    const reportKey = { pk: `R#${report.studentId}`, sk: `T#${report.reportId}` };
    
    await context.dataAccess.put({
      ...reportKey,
      pksk: `${reportKey.pk}#${reportKey.sk}`,
      ...report,
      version: 1
    });

    context.logger.info('Report saved to storage', { reportId: report.reportId });
  }

  /**
   * Get student reports
   */
  static async getStudentReports(
    studentId: string,
    context: ServiceContext,
    limit?: number
  ): Promise<any[]> {
    const reports = await context.dataAccess.query({
      keyExpression: 'pk = :pk and begins_with(sk, :sk)',
      attributeValues: {
        ':pk': `R#${studentId}`,
        ':sk': 'T#'
      },
      projectionExpression: 'reportId, reportType, startDate, endDate, generatedAt, generatedBy',
      scanIndexForward: false, // Get newest first
      limit
    });

    return reports;
  }

  /**
   * Process behavior data for reporting
   */
  private static processBehaviorData(behaviorData: any[], behaviorIds?: string[]): any {
    const summary = {
      totalEvents: 0,
      behaviorBreakdown: {} as any,
      dailyTotals: {} as any,
      trends: {} as any
    };

    behaviorData.forEach(record => {
      if (behaviorIds && !behaviorIds.includes(record.behaviorId)) {
        return; // Skip if not in requested behaviors
      }

      summary.totalEvents++;
      
      // Behavior breakdown
      if (!summary.behaviorBreakdown[record.behaviorId]) {
        summary.behaviorBreakdown[record.behaviorId] = {
          count: 0,
          duration: 0,
          intensity: []
        };
      }
      
      summary.behaviorBreakdown[record.behaviorId].count++;
      summary.behaviorBreakdown[record.behaviorId].duration += record.duration || 0;
      
      if (record.intensity) {
        summary.behaviorBreakdown[record.behaviorId].intensity.push(record.intensity);
      }

      // Daily totals
      const date = record.date;
      if (!summary.dailyTotals[date]) {
        summary.dailyTotals[date] = 0;
      }
      summary.dailyTotals[date]++;
    });

    return summary;
  }

  /**
   * Process service data for reporting
   */
  private static processServiceData(serviceData: any[], serviceIds?: string[]): any {
    const summary = {
      totalMinutes: 0,
      serviceBreakdown: {} as any,
      dailyTotals: {} as any,
      goalProgress: {} as any
    };

    serviceData.forEach(record => {
      if (serviceIds && !serviceIds.includes(record.serviceId)) {
        return; // Skip if not in requested services
      }

      summary.totalMinutes += record.minutes || 0;
      
      // Service breakdown
      if (!summary.serviceBreakdown[record.serviceId]) {
        summary.serviceBreakdown[record.serviceId] = {
          totalMinutes: 0,
          sessionCount: 0,
          averageSession: 0
        };
      }
      
      summary.serviceBreakdown[record.serviceId].totalMinutes += record.minutes || 0;
      summary.serviceBreakdown[record.serviceId].sessionCount++;

      // Daily totals
      const date = record.date;
      if (!summary.dailyTotals[date]) {
        summary.dailyTotals[date] = 0;
      }
      summary.dailyTotals[date] += record.minutes || 0;
    });

    // Calculate averages
    Object.keys(summary.serviceBreakdown).forEach(serviceId => {
      const service = summary.serviceBreakdown[serviceId];
      service.averageSession = service.sessionCount > 0 ? 
        service.totalMinutes / service.sessionCount : 0;
    });

    return summary;
  }

  /**
   * Validate report request
   */
  private static validateReportRequest(request: BehaviorReportRequest): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!request.studentId) {
      errors.push({ field: 'studentId', message: 'Student ID is required', code: 'REQUIRED' });
    }

    if (!request.startDate) {
      errors.push({ field: 'startDate', message: 'Start date is required', code: 'REQUIRED' });
    }

    if (!request.endDate) {
      errors.push({ field: 'endDate', message: 'End date is required', code: 'REQUIRED' });
    }

    if (request.startDate && request.endDate) {
      const start = moment(request.startDate);
      const end = moment(request.endDate);
      
      if (start.isAfter(end)) {
        errors.push({ field: 'dateRange', message: 'Start date must be before end date', code: 'INVALID_RANGE' });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate service report request
   */
  private static validateServiceReportRequest(request: ServiceReportRequest): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!request.studentId) {
      errors.push({ field: 'studentId', message: 'Student ID is required', code: 'REQUIRED' });
    }

    if (!request.startDate) {
      errors.push({ field: 'startDate', message: 'Start date is required', code: 'REQUIRED' });
    }

    if (!request.endDate) {
      errors.push({ field: 'endDate', message: 'End date is required', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors };
  }
}

// Input/Output types
export interface BehaviorReportRequest {
  studentId: string;
  startDate: string;
  endDate: string;
  behaviorIds?: string[];
  userId: string;
}

export interface ServiceReportRequest {
  studentId: string;
  startDate: string;
  endDate: string;
  serviceIds?: string[];
  userId: string;
}

export interface BehaviorReport {
  reportId: string;
  studentId: string;
  studentName: string;
  startDate: string;
  endDate: string;
  behaviorIds?: string[];
  summary: any;
  generatedAt: string;
  generatedBy: string;
}

export interface ServiceReport {
  reportId: string;
  studentId: string;
  studentName: string;
  startDate: string;
  endDate: string;
  serviceIds?: string[];
  summary: any;
  generatedAt: string;
  generatedBy: string;
}