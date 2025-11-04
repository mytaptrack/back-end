import {
  ServiceContext,
  BusinessLogicError,
  ValidationError,
  NotFoundError
} from '@mytaptrack/business-logic-core';
import moment from 'moment-timezone';
import { Student, User, Track, App, ExistingNote, GenerateExcelReportRequest, ExcelReportResponse } from '../types/report-types';

/**
 * Report-specific business operations
 */
export class ReportOperations {

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
    const student = await context.dataAccess.get(studentKey) as Student;

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
    const behaviorSummary = ReportOperations.processBehaviorDataSummary(behaviorData, reportRequest.behaviorIds);

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
    const student = await context.dataAccess.get(studentKey) as Student;

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
    const serviceSummary = ReportOperations.processServiceDataSummary(serviceData, reportRequest.serviceIds);

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
      projectionExpression: 'reportId, reportType, startDate, endDate, generatedAt, generatedBy'
    });

    return reports;
  }

  /**
   * Submit report data (for GraphQL mutations)
   */
  static async submitReportData(
    request: SubmitReportDataRequest,
    context: ServiceContext
  ): Promise<any> {
    const { studentId, data, userId } = request;

    // Validate request
    if (!data.behavior && !data.service) {
      throw new ValidationError('Cannot determine the type of item tracked', context.config.correlationId);
    }

    // Get student configuration
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey, 'behaviors, responses, services') as Student;

    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }

    // Find the behavior or service configuration
    const studentBehavior = student.behaviors?.find((x: any) => x.id === data.behavior) ??
      student.responses?.find((x: any) => x.id === data.behavior) ??
      student.services?.find((x: any) => x.id === data.service);

    if (!studentBehavior) {
      throw new NotFoundError('Could not find behavior or service', context.config.correlationId, {
        behaviorId: data.behavior,
        serviceId: data.service
      });
    }

    // Prepare tracking message
    const trackingMessage = {
      studentId,
      behaviorId: data.behavior,
      dateEpoc: data.dateEpoc ? moment(data.dateEpoc).toDate().getTime() : moment().toDate().getTime(),
      abc: data.abc,
      intensity: data.intensity,
      clickType: data.isManual ? 'manual' : 'clickCount',
      remainingLife: 1500,
      notStopped: data.duration !== undefined,
      duration: data.duration,
      isDuration: (studentBehavior as any).isDuration,
      source: data.source ?? {
        device: 'website',
        rater: userId
      },
      remove: data.deleted ? true : false,
      redoDurations: data.redoDurations
    };

    // Publish tracking event
    await context.messageBroker.publish('track.event', {
      type: 'trackEvent',
      data: trackingMessage,
      timestamp: moment().toISOString()
    });

    context.logger.info('Report data submitted successfully', {
      studentId,
      behaviorId: data.behavior,
      serviceId: data.service,
      userId
    });

    return data;
  }

  /**
   * Update date inclusions and exclusions for reports
   */
  static async updateDateInclusions(
    request: UpdateDateInclusionsRequest,
    context: ServiceContext
  ): Promise<void> {
    const { studentId, startDate, endDate, excludeDates, includeDates, license, userId } = request;

    // Validate date range
    const startMoment = moment(startDate);
    const endMoment = moment(endDate);

    if (startMoment.isAfter(endMoment)) {
      throw new ValidationError('Start date is after end date', context.config.correlationId);
    }

    // Parse and validate dates
    const excludeMoments = excludeDates
      .filter(x => x && x.trim())
      .map(x => moment(x, 'MM/DD/YYYY'));

    const includeMoments = includeDates
      .filter(x => x && x.trim())
      .map(x => moment(x, 'MM/DD/YYYY'));

    // Validate all dates are valid
    const invalidExcludes = excludeMoments.filter(m => !m.isValid());
    const invalidIncludes = includeMoments.filter(m => !m.isValid());

    if (invalidExcludes.length > 0 || invalidIncludes.length > 0) {
      throw new ValidationError('Invalid date format. Use MM/DD/YYYY format.', context.config.correlationId);
    }

    // Process date range week by week
    let currentDate = startMoment.clone();
    const processEndDate = endMoment.clone().subtract(1, 'second');

    context.logger.info('Processing date inclusions', {
      studentId,
      startDate: currentDate.format('YYYY-MM-DD'),
      endDate: processEndDate.format('YYYY-MM-DD'),
      excludeCount: excludeMoments.length,
      includeCount: includeMoments.length
    });

    while (currentDate.isBefore(processEndDate, 'day')) {
      const weekDate = currentDate.clone();

      // Check if report data exists for this week
      const reportExists = await ReportOperations.checkReportExists(studentId, weekDate, context);

      if (!reportExists) {
        // Create empty report if it doesn't exist
        await ReportOperations.createEmptyReport(studentId, license, weekDate, context);
      }

      // Get dates for this week
      const weekExcludes = excludeMoments
        .filter(x => x.isSame(weekDate, 'week'))
        .map(d => d.format('MM/DD/YYYY'));

      const weekIncludes = includeMoments
        .filter(x => x.isSame(weekDate, 'week'))
        .map(d => d.format('MM/DD/YYYY'));

      // Update report with inclusion/exclusion data
      await ReportOperations.updateReportDateSettings(
        studentId, weekDate, weekExcludes, weekIncludes, context
      );

      currentDate = currentDate.add(1, 'week');
    }

    // Publish event
    await context.messageBroker.publish('report.date.inclusions.updated', {
      studentId,
      startDate: startMoment.toISOString(),
      endDate: endMoment.toISOString(),
      excludeCount: excludeMoments.length,
      includeCount: includeMoments.length,
      updatedBy: userId,
      timestamp: moment().toISOString()
    });

    context.logger.info('Date inclusions updated successfully', { studentId, userId });
  }

  /**
   * Check if report exists for a given date
   */
  private static async checkReportExists(
    studentId: string,
    date: any,
    context: ServiceContext
  ): Promise<boolean> {
    const reportKey = {
      pk: `S#${studentId}#R`,
      sk: `${date.toDate().getTime()}#D`
    };

    const report = await context.dataAccess.get(reportKey);
    return !!report;
  }

  /**
   * Create empty report for a date
   */
  private static async createEmptyReport(
    studentId: string,
    license: string,
    date: any,
    context: ServiceContext
  ): Promise<void> {
    const reportKey = {
      pk: `S#${studentId}#R`,
      sk: `${date.toDate().getTime()}#D`
    };

    const emptyReport = {
      ...reportKey,
      pksk: `${reportKey.pk}#${reportKey.sk}`,
      studentId,
      license,
      date: date.toISOString(),
      data: [],
      services: [],
      excludeDays: [],
      includeDays: [],
      createdAt: moment().toISOString(),
      version: 1
    };

    await context.dataAccess.put(emptyReport);

    context.logger.info('Empty report created', { studentId, date: date.format('YYYY-MM-DD') });
  }

  /**
   * Update report date settings
   */
  private static async updateReportDateSettings(
    studentId: string,
    date: any,
    excludeDays: string[],
    includeDays: string[],
    context: ServiceContext
  ): Promise<void> {
    const reportKey = {
      pk: `S#${studentId}#R`,
      sk: `${date.toDate().getTime()}#D`
    };

    await context.dataAccess.update({
      key: reportKey,
      updateExpression: 'SET excludeDays = :excludeDays, includeDays = :includeDays',
      attributeValues: {
        ':excludeDays': excludeDays,
        ':includeDays': includeDays
      }
    });

    context.logger.debug('Report date settings updated', {
      studentId,
      date: date.format('YYYY-MM-DD'),
      excludeCount: excludeDays.length,
      includeCount: includeDays.length
    });
  }

  /**
   * Process student note (create, update, or delete)
   */
  static async processStudentNote(
    request: ProcessStudentNoteRequest,
    context: ServiceContext
  ): Promise<any> {
    const { note, userId, isApp } = request;

    // Validate required fields
    if (!note.studentId) {
      throw new ValidationError('Student ID is required', context.config.correlationId);
    }

    if (!note.remove && (!note.note || note.note.trim() === '')) {
      throw new ValidationError('Note content is required', context.config.correlationId);
    }

    // Get student information
    const studentKey = { pk: `S#${note.studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey, 'studentId, license, details') as Student;

    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId: note.studentId });
    }

    // Process note data
    const processedNote = await ReportOperations.prepareNoteData(note, userId, isApp, context);

    if (note.remove) {
      // Delete note
      await ReportOperations.deleteStudentNote(processedNote, student, userId, isApp, context);
    } else {
      // Create or update note
      await ReportOperations.saveStudentNote(processedNote, student, context);
    }

    // Publish event
    const eventType = note.remove ? 'student.note.deleted' : 'student.note.saved';
    await context.messageBroker.publish(eventType, {
      studentId: note.studentId,
      noteId: processedNote.noteId,
      product: processedNote.product,
      userId,
      timestamp: moment().toISOString()
    });

    context.logger.info(`Student note ${note.remove ? 'deleted' : 'saved'}`, {
      studentId: note.studentId,
      noteId: processedNote.noteId,
      userId
    });

    return processedNote;
  }

  /**
   * Prepare note data with defaults and validation
   */
  private static async prepareNoteData(
    note: any,
    userId: string,
    isApp: boolean,
    context: ServiceContext
  ): Promise<any> {
    const processedNote = { ...note };

    // Set default source if not provided
    if (!processedNote.source?.id || processedNote.source.id === '') {
      processedNote.source = {
        id: userId,
        name: '',
        type: 'user'
      };
    }

    // Normalize note date
    if (processedNote.noteDate) {
      const noteDate = moment(processedNote.noteDate).startOf('day');
      processedNote.noteDate = noteDate.toDate().getTime();
    }

    // Generate note ID if not provided
    if (!processedNote.noteId) {
      processedNote.noteId = ReportOperations.generateNoteId();
    }

    // Set default source type
    if (!processedNote.source.type) {
      processedNote.source.type = 'user';
    }

    return processedNote;
  }

  /**
   * Delete student note
   */
  private static async deleteStudentNote(
    note: any,
    student: any,
    userId: string,
    isApp: boolean,
    context: ServiceContext
  ): Promise<void> {
    const noteType = note.product === 'behavior' ? 'NB' : 'NS';
    const noteDate = moment(note.noteDate).startOf('day');
    const noteKey = {
      pk: `S#${student.studentId}#N#${noteType}`,
      sk: `${noteDate.toDate().getTime()}#${note.noteId}`
    };

    await context.dataAccess.update({
      key: noteKey,
      updateExpression: 'SET deleted = :deleted',
      attributeValues: {
        ':deleted': {
          id: userId,
          type: isApp ? 'app' : 'user',
          date: moment().toISOString()
        }
      }
    });
  }

  /**
   * Save student note
   */
  private static async saveStudentNote(
    note: any,
    student: any,
    context: ServiceContext
  ): Promise<void> {
    const noteType = note.product === 'behavior' ? 'NB' : 'NS';
    const noteDate = moment(note.noteDate).startOf('day');
    const noteKey = {
      pk: `S#${student.studentId}#N#${noteType}`,
      sk: `${noteDate.toDate().getTime()}#${note.noteId}`
    };

    // Check if note already exists
    const existingNote = await context.dataAccess.get(noteKey) as ExistingNote;
    if (existingNote) {
      // Validate source matches
      if (existingNote.source?.id !== note.source.id) {
        throw new ValidationError('Note source does not match existing note', context.config.correlationId);
      }
      note.source = existingNote.source;
    } else {
      // Resolve source name based on type
      note.source.name = await ReportOperations.resolveSourceName(note.source, student.license, context);
    }

    // Save note
    const noteRecord = {
      ...noteKey,
      pksk: `${noteKey.pk}#${noteKey.sk}`,
      lpk: student.license,
      lsk: `S#${student.studentId}#${noteType}#${noteDate.toDate().getTime()}`,
      ...note,
      createdAt: existingNote?.createdAt || moment().toISOString(),
      updatedAt: moment().toISOString()
    };

    await context.dataAccess.put(noteRecord);
  }

  /**
   * Resolve source name based on source type
   */
  private static async resolveSourceName(
    source: any,
    license: string,
    context: ServiceContext
  ): Promise<string> {
    switch (source.type) {
      case 'user':
        const userKey = { pk: `U#${source.id}`, sk: 'P' };
        const user = await context.dataAccess.get(userKey, 'details') as User;
        return user?.details?.name || source.id;

      case 'track':
        const trackKey = { pk: `TRACK#${source.id}`, sk: 'P' };
        const track = await context.dataAccess.get(trackKey, 'name') as Track;
        return track?.name || source.id;

      case 'app':
        const appKey = { pk: `L#${license}#AG`, sk: `P#${source.id}` };
        const app = await context.dataAccess.get(appKey, 'deviceName') as App;
        return app?.deviceName || source.id;

      default:
        return source.name || source.id;
    }
  }

  /**
   * Generate unique note ID
   */
  private static generateNoteId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get student report data for a date range
   */
  static async getStudentReportData(
    request: GetStudentReportDataRequest,
    context: ServiceContext
  ): Promise<StudentReportDataResponse> {
    const { studentId, startDate, endDate, scope, permissions } = request;

    // Validate input
    if (!studentId) {
      throw new ValidationError('Student ID is required', context.config.correlationId);
    }

    if (!startDate || !endDate) {
      throw new ValidationError('Start date and end date are required', context.config.correlationId);
    }

    const startMoment = moment(startDate);
    const endMoment = moment(endDate);

    if (startMoment.isAfter(endMoment)) {
      throw new ValidationError('Start date must be before end date', context.config.correlationId);
    }

    context.logger.info('Getting student report data', {
      studentId,
      startDate: startMoment.format('YYYY-MM-DD'),
      endDate: endMoment.format('YYYY-MM-DD'),
      scope
    });

    // Query report data
    const pk = `S#${studentId}#R`;
    const start = startMoment.clone().startOf('week').toDate().getTime() + '#D';
    const end = (endMoment.clone().endOf('week').toDate().getTime() + (1000 * 60 * 60 * 24)) + '#D';

    const reports = await context.dataAccess.query({
      keyExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      attributeNames: {
        '#data': 'data'
      },
      attributeValues: {
        ':pk': pk,
        ':start': start,
        ':end': end
      },
      projectionExpression: '#data,services,excludeDays,excludedIntervals,includeDays,schedules'
    });

    // Process report data
    const data: any[] = [];
    const services: any[] = [];
    const schedules = [].concat(...reports.map((r: any) => {
      if (r.schedules && !Array.isArray(r.schedules)) {
        return Object.keys(r.schedules).map(key => {
          return {
            date: `${key.slice(0, 4)}-${key.slice(5, 6)}-${key.slice(7, 8)}`,
            schedule: r.schedules[key]
          };
        });
      }
      return r.schedules;
    }).filter((x: any) => x ? true : false));

    const excludeDays = [].concat(...reports.map((r: any) => r.excludeDays).filter((x: any) => x ? true : false));
    const includeDays = [].concat(...reports.map((r: any) => r.includeDays).filter((x: any) => x ? true : false));
    const excludedIntervals = [].concat(...reports.map((r: any) => r.excludedIntervals).filter((x: any) => x ? true : false));
    const shortIds: string[] = [];
    let lastUpdateDate = 0;
    const raters: any[] = [];

    context.logger.debug('Processing reports', { reportCount: reports?.length });

    // Process each report
    reports.forEach((resp: any) => {
      // Process service data if requested and user has permissions
      if (scope.service && (permissions.serviceData === 'read' || permissions.serviceData === 'admin')) {
        resp.services?.forEach((item: any) => {
          if (item.deleted) {
            return;
          }
          if (permissions.services && !permissions.services.find((x: string) => x === item.service)) {
            return;
          }
          services.push({
            dateEpoc: item.dateEpoc,
            service: item.service,
            duration: item.duration,
            reported: item.reported,
            isManual: item.isManual,
            notStopped: item.notStopped,
            source: item.source,
            modifications: item.modifications,
            serviceProgress: item.serviceProgress
          });
        });
      }

      // Process behavior data if requested
      if (scope.behavior) {
        resp.data?.forEach((item: any) => {
          if (permissions.behaviors && !permissions.behaviors.find((x: string) => x === item.behavior)) {
            return;
          }
          if (item.abc) {
            context.logger.debug('Adding short keys');
            if (item.abc.a) shortIds.push(item.abc.a);
            if (item.abc.c) shortIds.push(item.abc.c);
          }
          data.push({
            abc: item.abc,
            intensity: item.intensity,
            behavior: item.behavior,
            dateEpoc: item.dateEpoc,
            duration: item.duration,
            deleted: item.deleted,
            isManual: item.isManual,
            reported: item.reported!,
            notStopped: item.notStopped,
            score: item.score,
            source: {
              rater: item.source!.rater!,
              device: item.source!.device
            }
          });

          if (item.source && !raters.find((x: any) => x.device === item.source.device && x.rater === item.source.rater)) {
            raters.push(item.source);
          }
        });
      }
    });

    // Resolve rater names if requested
    let raterNames: { rater: string; name: string }[] = [];
    if (request.includeRaterNames) {
      raterNames = await Promise.all(raters.map(async (r: any) => {
        if (r.device === 'Web') {
          const user = await context.dataAccess.get(
            { pk: `U#${r.rater}`, sk: 'P' },
            'details'
          ) as any;
          return { rater: r.rater, name: user?.details?.name ?? 'Unknown User' };
        }
        if (r.device === 'App') {
          const app = await context.dataAccess.get(
            { pk: `L#${permissions.license}#AG`, sk: `P#${r.rater}` },
            'deviceName'
          ) as any;
          return { rater: r.rater, name: app?.deviceName ?? 'Unknown App' };
        }
        if (r.device === 'Track 2.0') {
          const device = await context.dataAccess.get(
            { pk: `TRACK#${r.rater}`, sk: 'P' },
            'name'
          ) as any;
          return { rater: r.rater, name: device?.name ?? 'Unknown Track 2.0' };
        }
        return { rater: r.rater, name: 'Unknown Rater' };
      }));
    }

    // Resolve short IDs to tags if needed
    if (shortIds.length > 0) {
      context.logger.debug('Getting short ids', { shortIdCount: shortIds.length });
      
      // Get tags from lookup (this would need to be implemented in the data access layer)
      const tags = await ReportOperations.getTagsFromShortIds(permissions.license, shortIds, context);
      
      context.logger.debug('Processing short ids', { tagCount: tags.length });
      data.forEach((item: any) => {
        if (item.abc) {
          if (item.abc.a) {
            item.abc!.a = tags.find((k: any) => k.shortId === item.abc!.a)?.tag ?? item.abc.a;
          }
          if (item.abc.c) {
            item.abc!.c = tags.find((k: any) => k.shortId === item.abc!.c)?.tag ?? item.abc.c;
          }
        }
      });
    }

    context.logger.debug('Constructing result');
    const result: StudentReportDataResponse = {
      data: data.filter((x: any) => !x.deleted),
      services: services,
      raters: raterNames,
      startMillis: startMoment.toDate().getTime(),
      endMillis: endMoment.toDate().getTime(),
      schedules: schedules,
      excludeDays: excludeDays,
      includeDays: includeDays,
      excludedIntervals: excludedIntervals,
      lastUpdateDate: lastUpdateDate,
      version: 1
    };

    context.logger.debug('Report data retrieved successfully', {
      dataCount: result.data.length,
      serviceCount: result.services.length,
      raterCount: result.raters.length
    });

    return result;
  }

  /**
   * Get student notes for a date range
   */
  static async getStudentNotes(
    request: GetStudentNotesRequest,
    context: ServiceContext
  ): Promise<StudentNote[]> {
    const { studentId, product, startDate, endDate } = request;

    // Validate input
    if (!studentId) {
      throw new ValidationError('Student ID is required', context.config.correlationId);
    }

    if (!startDate || !endDate) {
      throw new ValidationError('Start date and end date are required', context.config.correlationId);
    }

    const startMoment = moment(startDate).startOf('day');
    const endMoment = moment(endDate).endOf('day');

    if (startMoment.isAfter(endMoment)) {
      throw new ValidationError('Start date must be before end date', context.config.correlationId);
    }

    context.logger.info('Getting student notes', {
      studentId,
      product,
      startDate: startMoment.format('YYYY-MM-DD'),
      endDate: endMoment.format('YYYY-MM-DD')
    });

    // Determine note type based on product
    let productId = 'NB'; // Default to behavior notes
    if (product === 'service') {
      productId = 'NS';
    }

    // Create date range keys for querying
    const startKey = `${startMoment.toDate().getTime()}#N#00000000-0000-0000-0000-000000000000`;
    const endKey = `${endMoment.toDate().getTime()}#N#ffffffff-ffff-ffff-ffff-ffffffffffff`;

    // Query notes from database
    const notes = await context.dataAccess.query({
      keyExpression: 'pk = :pk and sk between :startDate and :endDate',
      filterExpression: 'attribute_not_exists(#deleted)',
      attributeNames: {
        '#deleted': 'deleted'
      },
      attributeValues: {
        ':pk': `S#${studentId}#${productId}`,
        ':startDate': startKey,
        ':endDate': endKey
      }
    });

    context.logger.debug('Retrieved notes from database', { noteCount: notes.length });

    // Transform notes to expected format
    const transformedNotes = notes
      .sort((a: any, b: any) => a.dateEpoc - b.dateEpoc)
      .map((note: any) => ({
        studentId,
        product: product || 'behavior',
        noteDate: note.noteDate,
        noteId: note.noteId,
        dateEpoc: note.dateEpoc,
        date: note.date || '',
        source: note.source,
        note: note.note,
        threadId: note.threadId
      }));

    context.logger.info('Student notes retrieved successfully', {
      studentId,
      product,
      noteCount: transformedNotes.length
    });

    return transformedNotes;
  }

  /**
   * Get tags from short IDs (placeholder for lookup functionality)
   */
  private static async getTagsFromShortIds(
    license: string,
    shortIds: string[],
    context: ServiceContext
  ): Promise<{ shortId: string; tag: string }[]> {
    // This would need to be implemented based on the existing LookupDal functionality
    // For now, return empty array to avoid breaking the resolver
    context.logger.debug('Getting tags from short IDs', { license, shortIdCount: shortIds.length });
    
    try {
      // Query for tag mappings
      const tagMappings = await context.dataAccess.query({
        keyExpression: 'pk = :pk AND sk IN (:shortIds)',
        attributeValues: {
          ':pk': `L#${license}#TAGS`,
          ':shortIds': shortIds
        }
      });

      return tagMappings.map((mapping: any) => ({
        shortId: mapping.shortId,
        tag: mapping.tag
      }));
    } catch (error) {
      context.logger.warn('Failed to get tags from short IDs', { error, shortIds });
      return [];
    }
  }

  /**
   * Update report schedule
   */
  static async updateReportSchedule(
    request: UpdateReportScheduleRequest,
    context: ServiceContext
  ): Promise<any> {
    const { studentId, scheduleData, userId } = request;

    // Validate date format
    const date = moment(scheduleData.date, 'YYYY-MM-DD');
    if (!date.isValid()) {
      throw new ValidationError('Invalid date format. Use YYYY-MM-DD format.', context.config.correlationId);
    }

    const weekStart = date.clone().startOf('week');
    const reportKey = {
      pk: `S#${studentId}#R`,
      sk: `${weekStart.toDate().getTime()}#D`
    };

    // Get existing report
    const existingReport = await context.dataAccess.get(reportKey, 'schedules');

    if (existingReport) {
      // Update existing report
      await ReportOperations.updateExistingReportSchedule(
        existingReport, scheduleData, reportKey, context
      );
    } else {
      // Create new report if schedule data is provided
      if (scheduleData.schedule) {
        await ReportOperations.createNewReportWithSchedule(
          studentId, scheduleData, weekStart, reportKey, context
        );
      }
    }

    // Publish event
    const eventType = scheduleData.schedule ? 'report.schedule.updated' : 'report.schedule.removed';
    await context.messageBroker.publish(eventType, {
      studentId,
      date: scheduleData.date,
      updatedBy: userId,
      timestamp: moment().toISOString()
    });

    context.logger.info('Report schedule updated', {
      studentId,
      date: scheduleData.date,
      hasSchedule: !!scheduleData.schedule,
      userId
    });

    return scheduleData;
  }

  /**
   * Update existing report schedule
   */
  private static async updateExistingReportSchedule(
    existingReport: any,
    scheduleData: any,
    reportKey: any,
    context: ServiceContext
  ): Promise<void> {
    // Normalize schedules array
    let schedules = existingReport.schedules || [];

    // Convert legacy object format to array if needed
    if (!Array.isArray(schedules)) {
      schedules = Object.keys(schedules).map(k => {
        let date = moment(k, 'YYYYMMDD');
        if (!date.isValid()) {
          date = moment(k, 'YYYY-MM-DD');
        }
        return {
          date: date.format('YYYYMMDD'),
          schedule: schedules[k]
        };
      });
    }

    if (scheduleData.schedule) {
      // Add or update schedule
      const existingScheduleIndex = schedules.findIndex((x: any) => x.date === scheduleData.date);
      if (existingScheduleIndex >= 0) {
        schedules[existingScheduleIndex].schedule = scheduleData.schedule;
      } else {
        schedules.push(scheduleData);
      }
    } else {
      // Remove schedule
      const existingScheduleIndex = schedules.findIndex((x: any) => x.date === scheduleData.date);
      if (existingScheduleIndex >= 0) {
        schedules.splice(existingScheduleIndex, 1);
      }
    }

    // Update report
    await context.dataAccess.update({
      key: reportKey,
      updateExpression: 'SET schedules = :schedules',
      attributeValues: {
        ':schedules': schedules
      }
    });
  }

  /**
   * Create new report with schedule
   */
  private static async createNewReportWithSchedule(
    studentId: string,
    scheduleData: any,
    weekStart: any,
    reportKey: any,
    context: ServiceContext
  ): Promise<void> {
    // Get student license
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey, 'license') as Student;

    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }

    const weekStartEpoc = weekStart.toDate().getTime();
    const newReport = {
      ...reportKey,
      pksk: `${reportKey.pk}#${reportKey.sk}`,
      license: student.license,
      data: [],
      services: [],
      startMillis: weekStartEpoc,
      endMillis: weekStart.clone().endOf('week').toDate().getTime(),
      studentId,
      lpk: student.license,
      lsk: `${studentId}#${weekStartEpoc}`,
      tsk: `R#${weekStartEpoc}`,
      schedules: [scheduleData],
      excludeDays: [],
      includeDays: [],
      excludedIntervals: [],
      version: 2,
      createdAt: moment().toISOString()
    };

    await context.dataAccess.put(newReport);
  }

  /**
   * Process behavior data for reporting summary
   */
  private static processBehaviorDataSummary(behaviorData: any[], behaviorIds?: string[]): any {
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
   * Process service data for reporting summary
   */
  private static processServiceDataSummary(serviceData: any[], serviceIds?: string[]): any {
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
   * Process report events from SQS (for report processing)
   */
  static async processReportEvents(
    events: ProcessReportEventRequest[],
    context: ServiceContext
  ): Promise<void> {
    let reportPackage: ReportPackage | undefined;

    for (const event of events) {
      // Check if we need to reload report package
      if (reportPackage && 
          (reportPackage.report.studentId !== event.studentId || 
           event.dateEpoc < reportPackage.report.startMillis || 
           reportPackage.report.endMillis < event.dateEpoc)) {
        reportPackage = undefined;
      }

      if (!event.dateEpoc) {
        context.logger.warn('Event missing dateEpoc', { event });
        continue;
      }

      reportPackage = await ReportOperations.processReportData(event, reportPackage, context);
    }
  }

  /**
   * Process individual report data event
   */
  private static async processReportData(
    dataInput: ProcessReportEventRequest,
    previousReport: ReportPackage | undefined,
    context: ServiceContext
  ): Promise<ReportPackage | undefined> {
    const trackedDate = moment(dataInput.dateEpoc);
    const isWeekEndOverlap = (dataInput.timezone ? trackedDate.tz(dataInput.timezone) : trackedDate).weekday() === 6;
    const weekStart = moment(dataInput.dateEpoc)
      .subtract(isWeekEndOverlap ? 1 : 0, 'day')
      .startOf('week');
    
    const weekStartEpoc = weekStart.toDate().getTime();
    const reportKey = ReportOperations.generateReportKey(dataInput.studentId, weekStartEpoc);

    // Get report and student data
    let [report, student] = await Promise.all([
      previousReport ? Promise.resolve(previousReport.report) : context.dataAccess.get(reportKey),
      context.dataAccess.get({ pk: `S#${dataInput.studentId}`, sk: 'P' })
    ]) as [any, Student];

    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId: dataInput.studentId });
    }

    if (!student.license) {
      throw new ValidationError('Student does not have a license', context.config.correlationId, { studentId: dataInput.studentId });
    }

    // Find behavior or service configuration
    const behavior = student.behaviors?.find((x: any) => x.id === dataInput.behaviorId) ??
      student.responses?.find((x: any) => x.id === dataInput.behaviorId);
    
    // Process behavior data if present
    if (dataInput.behaviorId && behavior) {
      report = await ReportOperations.processBehaviorData(dataInput, report, student, behavior, weekStart, context);
    }

    // Process service data if present
    if (dataInput.serviceId) {
      report = await ReportOperations.processServiceData(dataInput, report, student, weekStart, context);
    }

    // Notify team members
    if (dataInput.behaviorId) {
      await ReportOperations.notifyTeamMembers(dataInput.studentId, dataInput, context);
    }

    return report ? { report, student } : undefined;
  }

  /**
   * Process behavior data for a report
   */
  private static async processBehaviorData(
    data: ProcessReportEventRequest,
    report: any,
    student: any,
    behavior: any,
    weekStart: any,
    context: ServiceContext
  ): Promise<any> {
    // Handle duration evaluation
    if (data.serviceId || behavior?.isDuration) {
      if (data.duration !== undefined) {
        delete data.notStopped;
      } else {
        data.notStopped = true;
      }
    }

    const reportData = {
      dateEpoc: data.dateEpoc,
      behavior: data.behaviorId,
      duration: behavior?.isDuration ? data.duration : undefined,
      isManual: data.isManual,
      notStopped: data.notStopped,
      source: {
        device: data.source?.device ?? '',
        rater: data.source?.rater
      },
      deleted: data.remove ? {
        by: data.source?.rater,
        date: moment().toISOString()
      } : undefined,
      abc: data.abc,
      intensity: data.intensity
    };

    if (!report) {
      // Create new report
      const weekStartEpoc = weekStart.toDate().getTime();
      const reportKey = ReportOperations.generateReportKey(data.studentId, weekStartEpoc);
      
      report = {
        ...reportKey,
        pksk: `${reportKey.pk}#${reportKey.sk}`,
        license: student.license,
        data: [reportData],
        services: [],
        startMillis: weekStartEpoc,
        endMillis: weekStart.endOf('week').toDate().getTime(),
        studentId: data.studentId,
        lpk: student.license,
        lsk: `${data.studentId}#${weekStartEpoc}`,
        tsk: `R#${weekStartEpoc}`,
        schedules: [],
        excludeDays: [],
        includeDays: [],
        excludedIntervals: [],
        version: 2
      };

      await context.dataAccess.put(report);
    } else {
      // Update existing report
      if (!report.data) {
        report.data = [];
      }

      // Process behavior logic based on type
      if (behavior.isDuration) {
        await ReportOperations.processDurationBehavior(data, report, behavior, context);
      } else {
        await ReportOperations.processEventBehavior(data, report, context);
      }
    }

    // Publish event
    await context.messageBroker.publish('report.processing', {
      type: 'reportProcessEvent',
      data: {
        ...reportData,
        studentId: data.studentId,
        behaviorId: data.behaviorId,
        attributes: {},
        remainingLife: data.remainingLife,
        serialNumber: data.serialNumber,
        clickType: data.clickType,
        remove: data.remove,
        isDuration: data.isDuration
      }
    });

    return report;
  }

  /**
   * Process duration-based behavior
   */
  private static async processDurationBehavior(
    data: ProcessReportEventRequest,
    report: any,
    behavior: any,
    context: ServiceContext
  ): Promise<void> {
    const dayStartEpoc = moment(data.dateEpoc).startOf('day').add(5, 'hours').toDate().getTime();
    const dayEndEpoc = dayStartEpoc + (24 * 60 * 60 * 1000);

    if (data.redoDurations) {
      // Rebuild durations logic
      const behaviorEvents = report.data.filter((x: any) => x.behavior === behavior.id);
      
      // Add end events for existing durations
      behaviorEvents.forEach((x: any) => {
        if (x.duration !== undefined) {
          behaviorEvents.push({
            ...x,
            dateEpoc: x.dateEpoc + x.duration
          });
        }
      });

      // Add or replace current event
      const existingIndex = behaviorEvents.findIndex((x: any) => x.dateEpoc === data.dateEpoc);
      if (existingIndex >= 0) {
        behaviorEvents[existingIndex] = {
          dateEpoc: data.dateEpoc,
          behavior: data.behaviorId,
          duration: data.duration,
          isManual: data.isManual,
          notStopped: data.notStopped,
          source: data.source,
          abc: data.abc,
          intensity: data.intensity
        };
      } else {
        behaviorEvents.push({
          dateEpoc: data.dateEpoc,
          behavior: data.behaviorId,
          duration: data.duration,
          isManual: data.isManual,
          notStopped: data.notStopped,
          source: data.source,
          abc: data.abc,
          intensity: data.intensity
        });
      }

      // Sort and pair events
      behaviorEvents.sort((a: any, b: any) => a.dateEpoc - b.dateEpoc);
      let lastEvent = null;
      
      for (let i = 0; i < behaviorEvents.length; i++) {
        const event = behaviorEvents[i];
        if (event.deleted) continue;

        if (lastEvent) {
          lastEvent.duration = event.dateEpoc - lastEvent.dateEpoc;
          lastEvent.notStopped = false;
          behaviorEvents.splice(i, 1);
          i--;
          lastEvent = null;
        } else {
          lastEvent = event;
          delete lastEvent.duration;
          lastEvent.notStopped = true;
        }
      }

      // Update report data
      report.data = [
        ...report.data.filter((x: any) => x.behavior !== behavior.id),
        ...behaviorEvents
      ];
      report.data.sort((a: any, b: any) => a.dateEpoc - b.dateEpoc);
    } else {
      // Standard duration processing
      const reportDatas = [...report.data].sort((a, b) => b.dateEpoc - a.dateEpoc);
      const lastData = reportDatas.find(d => 
        dayStartEpoc <= d.dateEpoc && d.dateEpoc <= dayEndEpoc &&
        d.behavior === data.behaviorId && 
        d.dateEpoc === data.dateEpoc);

      if (lastData) {
        if (lastData.dateEpoc === data.dateEpoc) {
          if (data.remove) {
            lastData.deleted = {
              by: data.source?.rater || 'unknown',
              date: moment().toISOString()
            };
          } else {
            lastData.notStopped = data.notStopped;
            lastData.duration = data.duration;
          }
        }
      } else {
        report.data.push({
          dateEpoc: data.dateEpoc,
          behavior: data.behaviorId,
          duration: undefined,
          isManual: data.isManual,
          notStopped: true,
          source: data.source,
          abc: data.abc,
          intensity: data.intensity
        });
      }
    }

    // Update database
    await context.dataAccess.update({
      key: { pk: report.pk, sk: report.sk },
      updateExpression: 'SET #data = :data',
      attributeNames: { '#data': 'data' },
      attributeValues: { ':data': report.data }
    });
  }

  /**
   * Process event-based behavior
   */
  private static async processEventBehavior(
    data: ProcessReportEventRequest,
    report: any,
    context: ServiceContext
  ): Promise<void> {
    const lastData = report.data.find((d: any) => {
      return d.behavior === data.behaviorId && 
             d.dateEpoc === data.dateEpoc && 
             d.source.rater === data.source?.rater;
    });

    if (lastData) {
      if (data.remove && !lastData.deleted) {
        lastData.deleted = {
          by: data.source?.rater || 'unknown',
          date: moment().toISOString()
        };
      }
      if (data.abc) {
        lastData.abc = data.abc;
      }
      if (data.intensity) {
        lastData.intensity = data.intensity;
      }
    } else {
      report.data.push({
        behavior: data.behaviorId,
        dateEpoc: data.dateEpoc,
        abc: data.abc,
        intensity: data.intensity,
        source: data.source
      });
    }

    // Update database
    await context.dataAccess.update({
      key: { pk: report.pk, sk: report.sk },
      updateExpression: 'SET #data = :data',
      attributeNames: { '#data': 'data' },
      attributeValues: { ':data': report.data }
    });
  }

  /**
   * Process service data for a report
   */
  private static async processServiceData(
    service: ProcessReportEventRequest,
    report: any,
    student: any,
    weekStart: any,
    context: ServiceContext
  ): Promise<any> {
    const reportService = {
      dateEpoc: service.dateEpoc,
      service: service.serviceId,
      duration: service.duration,
      isManual: service.isManual,
      notStopped: service.notStopped,
      source: {
        device: service.source?.device ?? '',
        rater: service.source?.rater ?? ''
      },
      deleted: service.remove ? {
        by: service.deviceId,
        date: moment().toISOString()
      } : undefined,
      modifications: service.modifications,
      serviceProgress: service.progress
    };

    if (!report) {
      // Create new report
      const weekStartEpoc = weekStart.toDate().getTime();
      const reportKey = ReportOperations.generateReportKey(service.studentId, weekStartEpoc);
      
      report = {
        ...reportKey,
        pksk: `${reportKey.pk}#${reportKey.sk}`,
        license: student.license,
        data: [],
        services: [reportService],
        startMillis: weekStartEpoc,
        endMillis: weekStart.endOf('week').toDate().getTime(),
        studentId: service.studentId,
        lpk: student.license,
        lsk: `${service.studentId}#${weekStartEpoc}`,
        tsk: `R#${weekStartEpoc}`,
        schedules: [],
        excludeDays: [],
        includeDays: [],
        excludedIntervals: [],
        version: 2
      };

      await context.dataAccess.put(report);
    } else {
      if (!report.services) {
        report.services = [];
      }

      const lastData = report.services.find((d: any) => 
        d.service === service.serviceId && 
        d.dateEpoc <= service.dateEpoc && 
        (d.dateEpoc === service.dateEpoc || d.source.rater === service.source?.rater));

      if (lastData) {
        if (lastData.dateEpoc === service.dateEpoc) {
          lastData.notStopped = service.notStopped;
          lastData.duration = service.duration;
          lastData.modifications = service.modifications;
          lastData.serviceProgress = service.progress;
        } else if (lastData.notStopped) {
          lastData.duration = service.dateEpoc - lastData.dateEpoc;
          lastData.serviceProgress = service.progress;
          lastData.modifications = service.modifications;
          if (service.remove && !lastData.deleted) {
            lastData.deleted = {
              by: service.source?.rater || 'unknown',
              date: moment().toISOString()
            };
          }
          delete lastData.notStopped;
        } else {
          report.services.push({
            ...reportService,
            notStopped: reportService.notStopped ? true : false,
            duration: reportService.duration
          });
        }
      } else {
        report.services.push({
          ...reportService,
          notStopped: true,
          duration: undefined
        });
      }

      // Update database
      await context.dataAccess.update({
        key: { pk: report.pk, sk: report.sk },
        updateExpression: 'SET #services = :services',
        attributeNames: { '#services': 'services' },
        attributeValues: { ':services': report.services }
      });
    }

    return report;
  }

  /**
   * Notify team members of report changes
   */
  private static async notifyTeamMembers(
    studentId: string,
    reportData: any,
    context: ServiceContext
  ): Promise<void> {
    const team = await context.dataAccess.query({
      keyExpression: 'studentId = :studentId and begins_with(tsk, :tsk)',
      indexName: 'student-index',
      attributeValues: {
        ':studentId': studentId,
        ':tsk': 'T#'
      }
    });

    await Promise.all(team.map(async (t: any) => {
      if (!(t.restrictions.data === 'admin' || t.restrictions.data === 'read')) {
        return;
      }

      // Publish notification event
      await context.messageBroker.publish('student.data.change', {
        userId: t.userId,
        studentId: t.studentId,
        behavior: reportData.behaviorId,
        dateEpoc: reportData.dateEpoc,
        deleted: reportData.deleted,
        duration: reportData.duration,
        isManual: reportData.isManual,
        modifications: reportData.modifications,
        notStopped: reportData.notStopped,
        progress: reportData.progress,
        redoDurations: reportData.redoDurations,
        reported: reportData.reported,
        score: reportData.score,
        service: reportData.serviceId,
        serviceProgress: reportData.serviceProgress,
        source: reportData.source
      });
    }));
  }

  /**
   * Generate report key for database operations
   */
  private static generateReportKey(studentId: string, weekStartEpoc: number): any {
    return {
      pk: `S#${studentId}#R`,
      sk: `${weekStartEpoc}#D`
    };
  }

  /**
   * Reprocess events from parsed data
   */
  static async reprocessEvents(
    request: ReprocessEventsRequest & { data: any[] },
    context: ServiceContext
  ): Promise<void> {
    const { key, userId, data } = request;

    context.logger.info('Starting event reprocessing', { key, userId });

    try {
      context.logger.debug('Processing reprocess data', { recordCount: data.length });

      // Parse and clean the event data
      const recordStrings = data.map((x: any) => x.event
        .replace(/\"/g, '\\"')
        .replace(/(?<=\W)\w+(?=(:\W))/g, '"c846fc46-8f67-434b-a4aa-8df1fddbe380"')
        .replace(/\'/g, '"')
        .replace(/\[Object\]/g, '[]'));

      const records = recordStrings.map((x: string) => JSON.parse(x
        .replace(/\\n/g, '\n')
        .replace(/\'/g, '"')
        .replace(/\w+\:\W/g, '"c846fc46-8f67-434b-a4aa-8df1fddbe380": ')));

      context.logger.info('Parsed reprocess records', { recordCount: records.length });

      // Group records by student and week to optimize report clearing
      const studentReports: { [key: string]: { [key: number]: boolean } } = {};
      
      for (const record of records) {
        if (!record.studentId) {
          context.logger.warn('Skipping record without studentId', { record });
          continue;
        }

        if (!studentReports[record.studentId]) {
          studentReports[record.studentId] = {};
        }

        const startOfWeek = moment(record.dateEpoc).startOf('week').toDate().getTime();
        
        if (!studentReports[record.studentId][startOfWeek]) {
          // Clear existing report data for this week
          await ReportOperations.clearReportData(record.studentId, startOfWeek, context);
          studentReports[record.studentId][startOfWeek] = true;
        }

        // Process the record if it has valid data
        if (record.studentId && record.dateEpoc) {
          const reportEvent: ProcessReportEventRequest = {
            studentId: record.studentId,
            dateEpoc: record.dateEpoc,
            behaviorId: record.behaviorId,
            serviceId: record.serviceId,
            duration: record.duration,
            isManual: record.isManual,
            notStopped: record.notStopped,
            abc: record.abc,
            intensity: record.intensity,
            remove: record.remove,
            redoDurations: record.redoDurations,
            source: record.source,
            deviceId: record.deviceId,
            modifications: record.modifications,
            progress: record.progress
          };

          // Send to message broker for processing
          await context.messageBroker.publish('report.reprocess.event', {
            type: 'reprocessEvent',
            data: reportEvent,
            timestamp: moment().toISOString(),
            reprocessKey: key,
            userId
          });
        }
      }

      context.logger.info('Event reprocessing completed successfully', {
        key,
        recordCount: records.length,
        studentCount: Object.keys(studentReports).length,
        userId
      });

      // Publish completion event
      await context.messageBroker.publish('report.reprocess.completed', {
        key,
        recordCount: records.length,
        studentCount: Object.keys(studentReports).length,
        completedBy: userId,
        timestamp: moment().toISOString()
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      context.logger.error('Failed to reprocess events', {
        error: errorMessage,
        key,
        userId,
        stack: errorStack
      });

      // Publish failure event
      await context.messageBroker.publish('report.reprocess.failed', {
        key,
        error: errorMessage,
        failedBy: userId,
        timestamp: moment().toISOString()
      });

      throw error;
    }
  }

  /**
   * Clear report data for a specific week
   */
  private static async clearReportData(
    studentId: string,
    weekStartEpoc: number,
    context: ServiceContext
  ): Promise<void> {
    const reportKey = ReportOperations.generateReportKey(studentId, weekStartEpoc);

    try {
      await context.dataAccess.update({
        key: reportKey,
        updateExpression: 'SET #data = :data',
        attributeNames: {
          '#data': 'data'
        },
        attributeValues: {
          ':data': []
        }
      });

      context.logger.debug('Cleared report data', {
        studentId,
        weekStartEpoc,
        reportKey
      });
    } catch (error) {
      // If report doesn't exist, that's fine - we'll create it when processing events
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorName !== 'ConditionalCheckFailedException') {
        context.logger.warn('Failed to clear report data', {
          error: errorMessage,
          studentId,
          weekStartEpoc
        });
      }
    }
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

  /**
   * Save snapshot report to storage
   */
  static async saveSnapshot(
    request: SaveSnapshotRequest,
    context: ServiceContext
  ): Promise<any> {
    const { studentId, date, reportType, snapshot } = request;

    // Validate input
    if (!studentId) {
      throw new ValidationError('Student ID is required', context.config.correlationId);
    }

    if (!date) {
      throw new ValidationError('Date is required', context.config.correlationId);
    }

    if (!reportType) {
      throw new ValidationError('Report type is required', context.config.correlationId);
    }

    if (!snapshot) {
      throw new ValidationError('Snapshot data is required', context.config.correlationId);
    }

    // Parse date and get week start
    const parsedDate = moment(date, 'yyyy-MM-DD').startOf('week');
    
    // Generate storage keys
    const saveKey = ReportOperations.getSnapshotSavedKey(studentId, reportType, parsedDate);
    const publishedKey = ReportOperations.getSnapshotKey(studentId, reportType, parsedDate);
    const storageKey = snapshot.published !== false ? publishedKey : saveKey;

    context.logger.info('Saving snapshot data', {
      studentId,
      reportType,
      date,
      storageKey,
      published: snapshot.published
    });

    // Save snapshot to storage (using data access layer for abstraction)
    // Note: This assumes the data access layer can handle S3-like operations
    // In a real implementation, you might need a separate file storage abstraction
    await context.dataAccess.put({
      pk: `SNAPSHOT#${storageKey}`,
      sk: 'DATA',
      data: JSON.stringify(snapshot),
      studentId,
      reportType,
      date: parsedDate.toISOString(),
      published: snapshot.published,
      createdAt: moment().toISOString()
    });

    // If snapshot is published, remove the working file
    if (snapshot.published) {
      try {
        context.logger.info('Removing working file', { saveKey });
        await context.dataAccess.delete({
          pk: `SNAPSHOT#${saveKey}`,
          sk: 'DATA'
        });
      } catch (error) {
        context.logger.warn('Error deleting working file', { error, saveKey });
      }
    }

    // Publish event
    await context.messageBroker.publish('snapshot.saved', {
      studentId,
      reportType,
      date,
      published: snapshot.published,
      timestamp: moment().toISOString()
    });

    context.logger.info('Snapshot saved successfully', {
      studentId,
      reportType,
      published: snapshot.published
    });

    return snapshot;
  }

  /**
   * Generate Excel report data
   */
  static async generateExcelReport(
    request: GenerateExcelReportRequest,
    context: ServiceContext
  ): Promise<ExcelReportResponse> {
    const { studentId, startDate, endDate, timezone, reportType } = request;

    // Validate input
    if (!studentId) {
      throw new ValidationError('Student ID is required', context.config.correlationId);
    }

    if (!startDate || !endDate) {
      throw new ValidationError('Start date and end date are required', context.config.correlationId);
    }

    if (!reportType || !['data', 'worksheet'].includes(reportType)) {
      throw new ValidationError('Report type must be "data" or "worksheet"', context.config.correlationId);
    }

    const startMoment = moment(startDate);
    const endMoment = moment(endDate);

    if (startMoment.isAfter(endMoment)) {
      throw new ValidationError('Start date must be before end date', context.config.correlationId);
    }

    context.logger.info('Generating Excel report', {
      studentId,
      startDate: startMoment.format('YYYY-MM-DD'),
      endDate: endMoment.format('YYYY-MM-DD'),
      reportType,
      timezone
    });

    // Get student data
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey) as Student;

    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }

    // Get report data for the date range
    const reportData = await ReportOperations.getStudentReportData({
      studentId,
      startDate,
      endDate,
      scope: { behavior: true, service: true },
      permissions: {
        serviceData: 'read',
        behaviors: undefined, // All behaviors
        services: undefined, // All services
        license: student.license
      },
      includeRaterNames: true
    }, context);

    // Generate Excel data based on report type
    let excelData: any[];
    let sheetName: string;

    if (reportType === 'data') {
      excelData = ReportOperations.generateDataExcelFormat(reportData, timezone);
      sheetName = 'Data';
    } else {
      excelData = ReportOperations.generateWorksheetExcelFormat(reportData, timezone);
      sheetName = 'Worksheet';
    }

    context.logger.info('Excel report generated successfully', {
      studentId,
      reportType,
      rowCount: excelData.length
    });

    return {
      data: excelData,
      sheetName,
      filename: `${student.firstName || 'Student'}_${student.lastName || studentId}_${reportType}_${startMoment.format('YYYY-MM-DD')}_to_${endMoment.format('YYYY-MM-DD')}.xlsx`
    };
  }

  /**
   * Generate data format for Excel export
   */
  private static generateDataExcelFormat(reportData: StudentReportDataResponse, timezone?: string): any[] {
    const excelData: any[] = [
      ['Activity', 'Date', 'Activity Begins', 'Activity Ends', 'Behavior', 'Timestamp', 'Duration (Seconds)', 'Start/Stop']
    ];

    // Process behavior data
    reportData.data.forEach(item => {
      const itemDate = moment(item.dateEpoc);
      if (timezone) {
        itemDate.tz(timezone);
      }

      const activityBegins = itemDate.format('HH:mm:ss');
      const activityEnds = item.duration ? 
        moment(item.dateEpoc + (item.duration * 1000)).format('HH:mm:ss') : 
        (item.notStopped ? 'Ongoing' : 'N/A');

      excelData.push([
        item.behavior || 'Unknown',
        itemDate.format('MM/DD/YYYY'),
        activityBegins,
        activityEnds,
        item.behavior || 'Unknown',
        itemDate.format('MM/DD/YYYY HH:mm:ss'),
        item.duration || 0,
        item.notStopped ? 'Start' : 'Stop'
      ]);
    });

    // Process service data
    reportData.services.forEach(item => {
      const itemDate = moment(item.dateEpoc);
      if (timezone) {
        itemDate.tz(timezone);
      }

      const activityBegins = itemDate.format('HH:mm:ss');
      const activityEnds = item.duration ? 
        moment(item.dateEpoc + (item.duration * 1000)).format('HH:mm:ss') : 
        (item.notStopped ? 'Ongoing' : 'N/A');

      excelData.push([
        item.service || 'Unknown Service',
        itemDate.format('MM/DD/YYYY'),
        activityBegins,
        activityEnds,
        item.service || 'Unknown Service',
        itemDate.format('MM/DD/YYYY HH:mm:ss'),
        item.duration || 0,
        item.notStopped ? 'Start' : 'Stop'
      ]);
    });

    // Sort by timestamp
    const headerRow = excelData.shift();
    excelData.sort((a, b) => moment(a[5], 'MM/DD/YYYY HH:mm:ss').valueOf() - moment(b[5], 'MM/DD/YYYY HH:mm:ss').valueOf());
    excelData.unshift(headerRow);

    return excelData;
  }

  /**
   * Generate worksheet format for Excel export
   */
  private static generateWorksheetExcelFormat(reportData: StudentReportDataResponse, timezone?: string): any[] {
    const excelData: any[] = [];

    // Group data by date
    const dataByDate: { [date: string]: any[] } = {};

    reportData.data.forEach(item => {
      const itemDate = moment(item.dateEpoc);
      if (timezone) {
        itemDate.tz(timezone);
      }
      const dateKey = itemDate.format('YYYY-MM-DD');

      if (!dataByDate[dateKey]) {
        dataByDate[dateKey] = [];
      }

      dataByDate[dateKey].push({
        type: 'behavior',
        time: itemDate.format('HH:mm:ss'),
        description: item.behavior,
        duration: item.duration,
        intensity: item.intensity,
        abc: item.abc
      });
    });

    reportData.services.forEach(item => {
      const itemDate = moment(item.dateEpoc);
      if (timezone) {
        itemDate.tz(timezone);
      }
      const dateKey = itemDate.format('YYYY-MM-DD');

      if (!dataByDate[dateKey]) {
        dataByDate[dateKey] = [];
      }

      dataByDate[dateKey].push({
        type: 'service',
        time: itemDate.format('HH:mm:ss'),
        description: item.service,
        duration: item.duration,
        progress: item.serviceProgress
      });
    });

    // Generate worksheet format
    const sortedDates = Object.keys(dataByDate).sort();

    sortedDates.forEach(date => {
      // Add date header
      excelData.push([`Date: ${moment(date).format('MM/DD/YYYY')}`, '', '', '', '']);
      excelData.push(['Time', 'Type', 'Description', 'Duration', 'Notes']);

      // Sort items by time
      const dayItems = dataByDate[date].sort((a, b) => a.time.localeCompare(b.time));

      dayItems.forEach(item => {
        let notes = '';
        if (item.intensity) {
          notes += `Intensity: ${item.intensity}`;
        }
        if (item.abc) {
          if (notes) notes += ', ';
          notes += `ABC: A=${item.abc.a || 'N/A'}, B=${item.description}, C=${item.abc.c || 'N/A'}`;
        }
        if (item.progress) {
          if (notes) notes += ', ';
          notes += `Progress: ${item.progress}`;
        }

        excelData.push([
          item.time,
          item.type,
          item.description,
          item.duration ? `${item.duration}s` : 'N/A',
          notes
        ]);
      });

      // Add empty row between dates
      excelData.push(['', '', '', '', '']);
    });

    return excelData;
  }

  /**
   * Generate snapshot storage key for published reports
   */
  static getSnapshotKey(studentId: string, reportType: string, date: any): string {
    const startOfWeek = date.clone().startOf('week');
    return `student/${studentId}/reports/${reportType}/${startOfWeek.format('yyyy')}/${startOfWeek.format('MM-DD')}.json`;
  }

  /**
   * Generate snapshot storage key for saved (unpublished) reports
   */
  static getSnapshotSavedKey(studentId: string, reportType: string, date: any): string {
    const startOfWeek = date.clone().startOf('week');
    return `student/${studentId}/reports-saved/${reportType}/${startOfWeek.format('yyyy')}/${startOfWeek.format('MM-DD')}.json`;
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

export interface SubmitReportDataRequest {
  studentId: string;
  data: {
    behavior?: string;
    service?: string;
    dateEpoc?: number;
    abc?: any;
    intensity?: number;
    duration?: number;
    isManual?: boolean;
    deleted?: boolean;
    redoDurations?: boolean;
    source?: {
      device: string;
      rater: string;
    };
  };
  userId: string;
}

export interface UpdateDateInclusionsRequest {
  studentId: string;
  startDate: number;
  endDate: number;
  excludeDates: string[];
  includeDates: string[];
  license: string;
  userId: string;
}

export interface ProcessStudentNoteRequest {
  note: {
    studentId: string;
    noteId?: string;
    noteDate?: number;
    dateEpoc?: number;
    note: string;
    product: string;
    source?: {
      id?: string;
      name?: string;
      type?: string;
    };
    remove?: boolean;
  };
  userId: string;
  isApp: boolean;
}

export interface UpdateReportScheduleRequest {
  studentId: string;
  scheduleData: {
    date: string;
    schedule?: any;
  };
  userId: string;
}

export interface ProcessReportEventRequest {
  studentId: string;
  behaviorId?: string;
  serviceId?: string;
  dateEpoc: number;
  duration?: number;
  isManual?: boolean;
  notStopped?: boolean;
  abc?: any;
  intensity?: number;
  remove?: boolean;
  redoDurations?: boolean;
  timezone?: string;
  source?: {
    device: string;
    rater: string;
  };
  deviceId?: string;
  modifications?: string[];
  progress?: any;
  remainingLife?: number;
  serialNumber?: string;
  clickType?: string;
  isDuration?: boolean;
  reported?: boolean;
  score?: any;
}

export interface ReportPackage {
  report: any;
  student: any;
}

export interface ReprocessEventsRequest {
  key: string;
  userId: string;
}

export interface SaveSnapshotRequest {
  studentId: string;
  date: string;
  reportType: string;
  snapshot: any; // QLSnapshotReport type
}

export interface SnapshotKeyOptions {
  studentId: string;
  reportType: string;
  date: any; // Moment object
}

export interface GetStudentReportDataRequest {
  studentId: string;
  startDate: string;
  endDate: string;
  scope: {
    behavior: boolean;
    service: boolean;
  };
  permissions: {
    serviceData: string;
    behaviors?: string[];
    services?: string[];
    license: string;
  };
  includeRaterNames?: boolean;
}

export interface StudentReportDataResponse {
  data: any[];
  services: any[];
  raters: { rater: string; name: string }[];
  startMillis: number;
  endMillis: number;
  schedules: any[];
  excludeDays: any[];
  includeDays: any[];
  excludedIntervals: any[];
  lastUpdateDate: number;
  version: number;
}

export interface GetStudentNotesRequest {
  studentId: string;
  product: 'behavior' | 'service';
  startDate: string;
  endDate: string;
}

export interface StudentNote {
  studentId: string;
  product: string;
  noteDate: number;
  noteId: string;
  dateEpoc: number;
  date: string;
  source: any;
  note: string;
  threadId?: string;
}