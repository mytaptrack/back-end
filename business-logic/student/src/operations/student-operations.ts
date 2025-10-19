import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';

/**
 * Student-specific business operations
 */
export class StudentOperations implements IBusinessOperations {
  
  /**
   * Create a new student
   */
  static async createStudent(
    studentData: CreateStudentInput,
    context: ServiceContext
  ): Promise<any> {
    // Validate input
    const validation = StudentOperations.validateCreateStudentInput(studentData);
    if (!validation.valid) {
      throw new ValidationError('Invalid student data', context.config.correlationId, { errors: validation.errors });
    }

    const studentId = studentData.studentId;
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };

    // Check if student already exists
    const existingStudent = await context.dataAccess.get(studentKey);
    if (existingStudent) {
      throw new BusinessLogicError('Student already exists', context.config.correlationId, { studentId });
    }

    const now = new Date().toISOString();
    
    // Create student PII record
    const studentPii: any = {
      ...studentKey,
      pksk: `${studentKey.pk}#${studentKey.sk}`,
      studentId,
      tsk: 'P',
      license: studentData.license,
      lpk: `${studentData.license}#S`,
      lsk: `P#${studentId}`,
      firstName: studentData.firstName,
      lastName: studentData.lastName,
      nickname: studentData.nickname,
      behaviorLookup: [],
      responseLookup: [],
      servicesLookup: [],
      milestones: studentData.milestones || [],
      tags: studentData.tags || [],
      abc: studentData.abc || { name: undefined, antecedents: [], consequences: [], tags: [] },
      lastTracked: undefined,
      lastUpdatedDate: now,
      version: 1
    };

    // Create student config record
    const studentConfig: any = {
      ...studentKey,
      pksk: `${studentKey.pk}#${studentKey.sk}`,
      studentId,
      tsk: 'P',
      license: studentData.license,
      lpk: `${studentData.license}#S`,
      lsk: `P#${studentId}`,
      licenseDetails: studentData.licenseDetails || {
        fullYear: false,
        flexible: false,
        services: false,
        expiration: ''
      },
      behaviors: [],
      responses: [],
      services: [],
      documents: [],
      dashboard: studentData.dashboard,
      abc: studentData.abc || { name: undefined, antecedents: [], consequences: [], tags: [] },
      absences: [],
      lastTracked: undefined,
      lastUpdatedDate: now,
      lastActive: now,
      version: 1
    };

    // Save student data
    await Promise.all([
      context.dataAccess.put(studentPii),
      context.dataAccess.put(studentConfig)
    ]);

    // Publish student created event
    await context.messageBroker.publish('student.created', {
      studentId,
      license: studentData.license,
      firstName: studentData.firstName,
      lastName: studentData.lastName,
      timestamp: now
    });

    context.logger.info('Student created successfully', { studentId, license: studentData.license });

    return StudentOperations.getStudentById(studentId, context);
  }

  /**
   * Get student by ID
   */
  static async getStudentById(
    studentId: string,
    context: ServiceContext,
    userId?: string
  ): Promise<any | null> {
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    
    const [config, pii] = await Promise.all([
      context.dataAccess.get(studentKey),
      context.dataAccess.get(studentKey)
    ]);

    if (!config || !pii) {
      return null;
    }

    const student: any = {
      studentId,
      license: (config as any).license,
      licenseDetails: (config as any).licenseDetails || {
        fullYear: false,
        flexible: false,
        services: false,
        expiration: ''
      },
      details: {
        firstName: (pii as any).firstName,
        lastName: (pii as any).lastName,
        nickname: (pii as any).nickname
      },
      abc: (pii as any).abc,
      behaviors: (config as any).behaviors || [],
      responses: (config as any).responses || [],
      documents: (config as any).documents || [],
      services: (config as any).services || [],
      dashboard: (config as any).dashboard,
      milestones: (pii as any).milestones || [],
      tags: ((pii as any).tags || []).map((x: any) => x.tag || x),
      lastTracked: (config as any).lastTracked,
      lastUpdateDate: (config as any).lastUpdatedDate,
      absences: (config as any).absences || [],
      version: 1
    };

    return student;
  }

  /**
   * Update student's last tracked time
   */
  static async updateLastTracked(
    studentId: string,
    lastTracked: string,
    context: ServiceContext
  ): Promise<void> {
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    
    if (!lastTracked) {
      await Promise.all([
        context.dataAccess.update({
          key: studentKey,
          updateExpression: 'REMOVE lastTracked'
        }),
        context.dataAccess.update({
          key: studentKey,
          updateExpression: 'REMOVE lastTracked'
        })
      ]);
    } else {
      await Promise.all([
        context.dataAccess.update({
          key: studentKey,
          updateExpression: 'SET lastTracked = :lastTracked',
          attributeValues: { ':lastTracked': lastTracked }
        }),
        context.dataAccess.update({
          key: studentKey,
          updateExpression: 'SET lastTracked = :lastTracked',
          attributeValues: { ':lastTracked': lastTracked }
        })
      ]);
    }

    context.logger.info('Student last tracked updated', { studentId, lastTracked });
  }

  /**
   * Save student documents
   */
  static async saveDocuments(
    studentId: string,
    documents: any[],
    context: ServiceContext
  ): Promise<void> {
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    
    await context.dataAccess.update({
      key: studentKey,
      updateExpression: 'SET documents = :documents',
      attributeValues: { ':documents': documents }
    });

    // Publish event
    await context.messageBroker.publish('student.documents.updated', {
      studentId,
      documentCount: documents.length,
      timestamp: new Date().toISOString()
    });

    context.logger.info('Student documents saved', { studentId, count: documents.length });
  }

  /**
   * Get students by license
   */
  static async getStudentsByLicense(
    license: string,
    context: ServiceContext
  ): Promise<any[]> {
    const [piis, configs] = await Promise.all([
      context.dataAccess.query({
        keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
        attributeValues: { 
          ':lpk': `${license}#S`,
          ':lsk': 'P'
        },
        indexName: 'license-index',
        projectionExpression: 'studentId, firstName, lastName, nickname, behaviorLookup, responseLookup, tags'
      }),
      context.dataAccess.query({
        keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
        attributeValues: { 
          ':lpk': `${license}#S`,
          ':lsk': 'P'
        },
        indexName: 'license-index',
        projectionExpression: 'studentId, licenseDetails, behaviors, responses, archived'
      })
    ]);

    const results = piis.map((pii: any) => {
      const config = configs.find((c: any) => c.studentId === pii.studentId);
      if (!config) return null;
      
      return {
        studentId: pii.studentId,
        details: {
          firstName: pii.firstName,
          lastName: pii.lastName,
          nickname: pii.nickname
        },
        behaviors: (config as any).behaviors || [],
        responses: (config as any).responses || [],
        license: license,
        licenseDetails: (config as any).licenseDetails || {
          fullYear: false,
          flexible: false,
          features: undefined
        },
        tags: (pii.tags || []).map((t: any) => t.tag || t),
        restrictions: undefined,
        milestones: undefined,
        version: 1,
        lastTracked: undefined,
        lastUpdateDate: undefined,
        partial: true,
        archived: (config as any).archived
      };
    }).filter((x: any) => x !== null);

    return results;
  }

  /**
   * Validate create student input
   */
  private static validateCreateStudentInput(input: CreateStudentInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.studentId) {
      errors.push({ field: 'studentId', message: 'Student ID is required', code: 'REQUIRED' });
    }

    if (!input.firstName && !input.lastName) {
      errors.push({ field: 'name', message: 'At least first or last name is required', code: 'MISSING_NAME' });
    }

    if (!input.license) {
      errors.push({ field: 'license', message: 'License is required', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors };
  }
}

// Input/Output types
export interface CreateStudentInput {
  studentId: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  license: string;
  licenseDetails?: any;
  tags?: string[];
  milestones?: any[];
  abc?: any;
  dashboard?: any;
}