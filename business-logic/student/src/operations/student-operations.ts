import { 
  ServiceContext, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError,
  AccessDeniedError
} from '@mytaptrack/business-logic-core';
import { v4 as uuid } from 'uuid';

/**
 * Student-specific business operations
 */
export class StudentOperations {
  
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
   * Update student service definition
   */
  static async updateStudentService(
    studentId: string,
    service: any,
    context: ServiceContext
  ): Promise<any> {
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    
    // Get current student data
    const student = await context.dataAccess.get(studentKey);
    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }

    // Create a copy of the service without certain fields for storage
    const serviceCopy = { ...service };
    delete serviceCopy.measurementUnit;
    delete serviceCopy.durationRounding;
    delete serviceCopy.target;
    delete serviceCopy.detailedTargets;

    const currentServices = (student as any).services || [];
    const existingIndex = currentServices.findIndex((s: any) => s.id === service.id);

    let updateExpression: string;
    let attributeValues: any;

    if (currentServices.length === 0) {
      // No services exist, create new array
      updateExpression = 'SET services = :service';
      attributeValues = { ':service': [serviceCopy] };
    } else if (existingIndex > -1) {
      // Update existing service
      updateExpression = `SET services[${existingIndex}] = :service`;
      attributeValues = { ':service': serviceCopy };
    } else {
      // Append new service to existing array
      updateExpression = 'SET services = list_append(services, :service)';
      attributeValues = { ':service': [serviceCopy] };
    }

    // Update student record
    await context.dataAccess.update({
      key: studentKey,
      updateExpression,
      attributeValues
    });

    // Publish event
    await context.messageBroker.publish('student.service.updated', {
      studentId,
      serviceId: service.id,
      action: existingIndex > -1 ? 'updated' : 'added',
      timestamp: new Date().toISOString()
    });

    context.logger.info('Student service updated', { 
      studentId, 
      serviceId: service.id,
      action: existingIndex > -1 ? 'updated' : 'added'
    });

    return service;
  }

  /**
   * Delete student and all associated data
   */
  static async deleteStudent(
    studentId: string,
    license: string,
    context: ServiceContext
  ): Promise<void> {
    // Verify student exists and belongs to the license
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey);
    
    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }
    
    if ((student as any).license !== license) {
      throw new AccessDeniedError('Access denied - student does not belong to license', context.config.correlationId, { studentId, license });
    }

    context.logger.info('Starting student deletion process', { studentId, license });

    try {
      // Get all PII data to delete (primary table)
      const piiQueries = await Promise.all([
        context.dataAccess.query({
          keyExpression: 'pk = :pk',
          attributeValues: { ':pk': `S#${studentId}` },
          projectionExpression: 'pk, sk'
        }),
        context.dataAccess.query({
          keyExpression: 'pk = :pk',
          attributeValues: { ':pk': `S#${studentId}#SCH` },
          projectionExpression: 'pk, sk'
        }),
        context.dataAccess.query({
          keyExpression: 'pk = :pk',
          attributeValues: { ':pk': `S#${studentId}#BS` },
          projectionExpression: 'pk, sk'
        })
      ]);

      const piiObjects = piiQueries.flat();
      context.logger.info('Found PII objects to delete', { studentId, count: piiObjects.length });

      // Delete PII data in batches
      const batchSize = 20;
      for (let i = 0; i < piiObjects.length; i += batchSize) {
        const batch = piiObjects.slice(i, i + batchSize);
        await Promise.all(batch.map(obj => context.dataAccess.delete(obj)));
      }

      // Get all config data to delete (data table)
      const configObjects = await context.dataAccess.query({
        keyExpression: 'studentId = :studentId',
        attributeValues: { ':studentId': studentId },
        indexName: 'student-index',
        projectionExpression: 'pk, sk'
      });

      context.logger.info('Found config objects to delete', { studentId, count: configObjects.length });

      // Delete config data in batches
      for (let i = 0; i < configObjects.length; i += batchSize) {
        const batch = configObjects.slice(i, i + batchSize);
        await Promise.all(batch.map(obj => context.dataAccess.delete(obj)));
      }

      // Publish student deleted event
      await context.messageBroker.publish('student.deleted', {
        studentId,
        license,
        timestamp: new Date().toISOString()
      });

      context.logger.info('Student deletion completed successfully', { studentId, license });

    } catch (error) {
      context.logger.error('Error deleting student', { studentId, license, error });
      throw error;
    }
  }

  /**
   * Delete multiple students and update license count
   */
  static async deleteStudents(
    studentIds: string[],
    license: string,
    context: ServiceContext
  ): Promise<boolean> {
    context.logger.info('Starting bulk student deletion', { studentIds, license, count: studentIds.length });

    // Delete each student
    await Promise.all(studentIds.map(studentId => 
      StudentOperations.deleteStudent(studentId, license, context)
    ));

    // Update license single used count
    const remainingStudents = await context.dataAccess.query({
      keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
      indexName: 'license-index',
      attributeValues: {
        ':lpk': `L#${license}`,
        ':lsk': 'S#'
      },
      projectionExpression: 'pk, sk'
    });

    const singleUsed = remainingStudents.length;

    // Update license record
    const licenseKey = { pk: `L#${license}`, sk: 'P' };
    await context.dataAccess.update({
      key: licenseKey,
      updateExpression: 'SET #details.#singleUsed = :singleUsed',
      attributeNames: {
        '#details': 'details',
        '#singleUsed': 'singleUsed'
      },
      attributeValues: {
        ':singleUsed': singleUsed
      }
    });

    // Publish bulk deletion event
    await context.messageBroker.publish('students.bulk.deleted', {
      studentIds,
      license,
      deletedCount: studentIds.length,
      remainingCount: singleUsed,
      timestamp: new Date().toISOString()
    });

    context.logger.info('Bulk student deletion completed', { 
      license, 
      deletedCount: studentIds.length, 
      remainingCount: singleUsed 
    });

    return true;
  }

  /**
   * Delete student notifications
   */
  static async deleteStudentNotifications(
    input: DeleteStudentNotificationsInput,
    context: ServiceContext
  ): Promise<any[]> {
    const { studentId, userId, events } = input;
    
    let notificationsToDelete = events;
    
    // If no specific events provided, get all notifications for the student
    if (events.length === 0) {
      const results = await context.dataAccess.query({
        keyExpression: 'pk = :pk and begins_with(sk, :sk)',
        attributeValues: {
          ':pk': `USN#${userId}`,
          ':sk': `S#${studentId}#T#`
        },
        projectionExpression: 'event'
      });

      notificationsToDelete = results.map((x: any) => ({ 
        behaviorId: '', 
        epoch: x.event.date 
      }));
    }

    // Delete each notification
    await Promise.all(notificationsToDelete.map(async (event: any) => {
      await context.dataAccess.delete({ 
        pk: `USN#${userId}`, 
        sk: `S#${studentId}#T#${event.epoch}#TP#behavior`
      });
    }));

    // Publish event
    await context.messageBroker.publish('student.notifications.deleted', {
      studentId,
      userId,
      deletedCount: notificationsToDelete.length,
      timestamp: new Date().toISOString()
    });

    context.logger.info('Student notifications deleted', { 
      studentId, 
      userId, 
      count: notificationsToDelete.length 
    });

    return [];
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
   * Update student data with comprehensive field updates
   */
  static async updateStudentData(
    input: UpdateStudentDataInput,
    context: ServiceContext
  ): Promise<any> {
    const { student, copyStudentId, userContext } = input;
    const studentId = student.studentId;
    const userId = userContext.userId;

    if (!studentId) {
      // Create new student if no ID provided
      return await StudentOperations.createStudent({
        studentId: student.studentId || '',
        firstName: student.details?.firstName || '',
        lastName: student.details?.lastName || '',
        nickname: student.details?.nickname,
        license: student.license || '',
        licenseDetails: student.licenseDetails,
        tags: student.details?.tags?.map(t => t.tag || t),
        milestones: student.milestones,
        abc: student.abc,
        dashboard: student.dashboard
      }, context);
    }

    context.logger.info('Processing student data update', { studentId, userId });

    // Get existing student data
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    const [config, pii] = await Promise.all([
      context.dataAccess.get(studentKey),
      context.dataAccess.get(studentKey)
    ]);

    if (!config || !pii) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }

    const sourceStudent = { config: config as any, pii: pii as any };
    let updated = false;
    const dataUpdates: any = {};
    const primaryUpdates: any = {};

    // Process milestones updates
    if (student.milestones) {
      context.logger.info('Processing milestones', { studentId });
      primaryUpdates.milestones = student.milestones.map((x: any) => ({
        date: x.date,
        title: x.title,
        description: x.description
      }));
      updated = true;
    }

    // Process ABC updates
    if (student.abc) {
      context.logger.info('Processing ABC data', { studentId });
      if (!student.abc.remove) {
        primaryUpdates.abc = student.abc;
      } else {
        context.logger.info('Removing ABC collection', { studentId });
        primaryUpdates.abc = undefined;
        // Note: License-based ABC collection logic would need to be implemented here
      }
      updated = true;
    }

    // Process student info updates
    if (student.details) {
      context.logger.info('Processing student details', { studentId });
      
      if (sourceStudent.pii.firstName !== student.details.firstName) {
        primaryUpdates.firstName = student.details.firstName;
        updated = true;
      }
      
      if (sourceStudent.pii.lastName !== student.details.lastName) {
        primaryUpdates.lastName = student.details.lastName;
        updated = true;
      }
      
      if (sourceStudent.pii.nickname !== student.details.nickname) {
        primaryUpdates.nickname = student.details.nickname;
        if (sourceStudent.pii.subtext) {
          primaryUpdates.subtext = null;
        }
        updated = true;
      }
      
      if (sourceStudent.pii.schoolStudentId !== student.details.schoolId) {
        primaryUpdates.schoolStudentId = student.details.schoolId;
        dataUpdates.schoolStudentId = student.details.schoolId;
        updated = true;
      }
    }

    // Process license details updates
    if (student.licenseDetails) {
      context.logger.info('Processing license details', { studentId });
      let updatedLicense = false;
      
      if (sourceStudent.config.licenseDetails?.flexible !== student.licenseDetails.flexible) {
        sourceStudent.config.licenseDetails.flexible = student.licenseDetails.flexible ?? sourceStudent.config.licenseDetails.flexible;
        updated = true;
        updatedLicense = true;
      }
      
      if (sourceStudent.config.licenseDetails?.fullYear !== student.licenseDetails.fullYear) {
        sourceStudent.config.licenseDetails.fullYear = student.licenseDetails.fullYear ?? sourceStudent.config.licenseDetails.fullYear;
        updated = true;
        updatedLicense = true;
      }
      
      if (sourceStudent.config.licenseDetails?.services !== student.licenseDetails.services) {
        sourceStudent.config.licenseDetails.services = student.licenseDetails.services ?? sourceStudent.config.licenseDetails.services;
        updated = true;
        updatedLicense = true;
      }

      if (updatedLicense) {
        dataUpdates.licenseDetails = sourceStudent.config.licenseDetails;
      }
    }

    // Process behaviors updates
    if (student.behaviors) {
      context.logger.info('Processing behaviors', { studentId });
      const results = StudentOperations.mergeTrackables(
        student.behaviors,
        sourceStudent.config.behaviors || [],
        sourceStudent.pii.behaviorLookup || []
      );

      if (results.updated) {
        dataUpdates.behaviors = results.data;
        primaryUpdates.behaviorLookup = results.primary;
        updated = true;
      }
    }

    // Process responses updates
    if (student.responses) {
      context.logger.info('Processing responses', { studentId });
      const results = StudentOperations.mergeTrackables(
        student.responses,
        sourceStudent.config.responses || [],
        sourceStudent.pii.responseLookup || []
      );

      if (results.updated) {
        dataUpdates.responses = results.data;
        primaryUpdates.responseLookup = results.primary;
        updated = true;
      }
    }

    // Process dashboard updates
    if (student.dashboard) {
      context.logger.info('Processing dashboard', { studentId });
      student.dashboard.behaviors?.forEach((b: any) => {
        if (!b.duration) {
          b.duration = {};
        }
      });

      if (student.dashboard.user) {
        // Save user-specific dashboard
        const dashboardKey = { pk: `USD#${studentId}`, sk: `U#${userId}` };
        await context.dataAccess.put({
          ...dashboardKey,
          pksk: `${dashboardKey.pk}#${dashboardKey.sk}`,
          license: sourceStudent.config.license,
          lpk: `${sourceStudent.config.license}#S`,
          lsk: `DA#${studentId}`,
          studentId: studentId,
          tsk: `U#${userId}`,
          userId: userId,
          usk: `S#${studentId}#DA`,
          version: 1,
          dashboard: student.dashboard,
          settings: undefined
        });
      } else {
        dataUpdates.dashboard = student.dashboard;
        updated = true;
      }
    }

    // Process services updates
    if (student.services) {
      context.logger.info('Processing services', { studentId });
      const sourceServices = sourceStudent.config.services || [];
      const sourcePii = sourceStudent.pii.servicesLookup || [];
      let servicesUpdated = false;

      student.services.forEach((service: any) => {
        if (!service.id) {
          service.id = StudentOperations.generateId();
        }

        const existing = sourceServices.find((x: any) => x.id === service.id);
        const existingPii = sourcePii.find((x: any) => x.id === service.id);
        
        let modificationPiiList: { id: string; name: string }[] = [];
        if (existingPii) {
          modificationPiiList = existingPii.modifications?.filter((x: any) => 
            service.modifications.find((bx: any) => bx === x.name)
          ) || [];
        }

        const newItems = service.modifications?.filter((bm: any) => 
          !modificationPiiList.find((x: any) => x.name === bm)
        ) || [];

        newItems.forEach((x: any) => {
          modificationPiiList.push({
            id: StudentOperations.generateId(),
            name: x
          });
        });

        const modificationIdList = modificationPiiList.map((x: any) => x.id);

        if (!existing) {
          context.logger.info('Adding new service', { studentId, serviceId: service.id });
          sourceServices.push({
            id: service.id,
            startDate: service.startDate,
            endDate: service.endDate,
            durationRounding: service.durationRounding || 0,
            isDuration: true,
            target: service.target || 0,
            detailedTargets: service.detailedTargets || [],
            modifications: modificationIdList,
            goals: service.goals,
            provided: 0,
            projected: 0,
            excluded: 0,
            lastUpdateDate: 0,
            weeklyServiceSummary: {}
          });
          servicesUpdated = true;
        } else {
          context.logger.info('Updating existing service', { studentId, serviceId: service.id });
          existing.durationRounding = service.durationRounding || 0;
          existing.isArchived = service.isArchived;
          existing.startDate = service.startDate;
          existing.endDate = service.endDate;
          existing.target = service.target || 0;
          existing.detailedTargets = service.detailedTargets || [];
          existing.modifications = modificationIdList;
          existing.goals = service.goals;
          servicesUpdated = true;
        }

        if (existingPii) {
          if (existingPii.name !== service.name || 
              existingPii.desc !== service.desc ||
              !StudentOperations.arraysEqual(
                existingPii.modifications.map((a: any) => a.name), 
                service.modifications
              )) {
            existingPii.name = service.name;
            existingPii.desc = service.desc;
            existingPii.modifications = modificationPiiList;
            servicesUpdated = true;
          }
        } else {
          sourcePii.push({
            id: service.id,
            name: service.name,
            desc: service.desc,
            modifications: modificationPiiList,
            tags: []
          });
          servicesUpdated = true;
        }
      });

      if (servicesUpdated) {
        dataUpdates.services = sourceServices;
        primaryUpdates.servicesLookup = sourcePii;
        updated = true;
      }
    }

    // Update database if there are changes
    if (updated) {
      context.logger.info('Updating student data in database', { studentId });
      
      const updatePromises = [];
      
      if (Object.keys(dataUpdates).length > 0) {
        updatePromises.push(
          context.dataAccess.update({
            key: studentKey,
            updateExpression: StudentOperations.buildUpdateExpression(dataUpdates),
            attributeValues: StudentOperations.buildAttributeValues(dataUpdates)
          })
        );
      }
      
      if (Object.keys(primaryUpdates).length > 0) {
        updatePromises.push(
          context.dataAccess.update({
            key: studentKey,
            updateExpression: StudentOperations.buildUpdateExpression(primaryUpdates, true),
            attributeValues: StudentOperations.buildAttributeValues(primaryUpdates, true)
          })
        );
      }

      await Promise.all(updatePromises);

      // Publish update event
      await context.messageBroker.publish('student.data.updated', {
        studentId,
        userId,
        updatedFields: [...Object.keys(dataUpdates), ...Object.keys(primaryUpdates)],
        timestamp: new Date().toISOString()
      });
    }

    context.logger.info('Student data update completed', { studentId, updated });

    // Return updated student
    return await StudentOperations.getStudentById(studentId, context, userId);
  }

  /**
   * Merge trackable items (behaviors/responses)
   */
  private static mergeTrackables(
    updates: any[],
    source: any[],
    sourcePii: any[]
  ): { updated: boolean; data: any[]; primary: any[] } {
    let updated = false;

    updates.forEach((item: any) => {
      if (!item.id) {
        item.id = StudentOperations.generateId();
      }

      const existing = source.find((x: any) => x.id === item.id);

      if (!existing) {
        updated = true;
        source.push({
          id: item.id,
          isArchived: item.isArchived,
          isDuration: item.isDuration,
          trackAbc: item.trackAbc,
          intensity: item.intensity,
          baseline: item.baseline,
          managed: item.managed || false,
          daytime: item.daytime || false,
          requireResponse: item.requireResponse || false,
          targets: item.targets?.map((t: any) => ({
            targetType: t.targetType,
            target: t.target,
            progress: t.progress,
            measurements: t.measurements?.map((m: any) => ({
              name: m.name,
              value: m.value
            })) || [],
            measurement: t.measurement
          })) || []
        });

        sourcePii.push({
          id: item.id,
          name: item.name,
          desc: item.desc,
          tags: []
        });
      } else {
        existing.daytime = item.daytime;
        existing.isArchived = item.isArchived;
        existing.isDuration = item.isDuration;
        existing.trackAbc = item.trackAbc;
        existing.baseline = item.baseline;
        existing.intensity = item.intensity;
        updated = true;

        // Update targets
        item.targets?.forEach((t: any) => {
          const et = existing.targets.find((x: any) => x.targetType === t.targetType);
          if (!et) {
            existing.targets.push(t);
          } else {
            if (et.progress !== t.progress) { et.progress = t.progress; updated = true; }
            if (et.target !== t.target) { et.target = t.target; updated = true; }
            if (et.measurement !== t.measurement) { et.measurement = t.measurement; updated = true; }
          }
        });

        const existingPii = sourcePii.find((x: any) => x.id === item.id);
        if (existingPii) {
          if (existingPii.name !== item.name) { existingPii.name = item.name; updated = true; }
          if (existingPii.desc !== item.desc) { existingPii.desc = item.desc; updated = true; }
        } else {
          updated = true;
          sourcePii.push({
            id: item.id,
            name: item.name,
            desc: item.desc,
            tags: []
          });
        }
      }
    });

    return { updated, data: source, primary: sourcePii };
  }

  /**
   * Build update expression for DynamoDB
   */
  private static buildUpdateExpression(updateObj: any, allowRemove: boolean = false): string {
    const setParts: string[] = [];
    const removeParts: string[] = [];

    Object.keys(updateObj).forEach(key => {
      if (updateObj[key] !== undefined) {
        setParts.push(`#${key} = :${key}`);
      } else if (allowRemove) {
        removeParts.push(`#${key}`);
      }
    });

    const setClause = setParts.length > 0 ? `SET ${setParts.join(', ')}` : '';
    const removeClause = removeParts.length > 0 ? `REMOVE ${removeParts.join(', ')}` : '';

    if (setClause && removeClause) {
      return `${setClause} ${removeClause}`;
    } else if (setClause) {
      return setClause;
    } else if (removeClause) {
      return removeClause;
    }

    return '';
  }

  /**
   * Build attribute values for DynamoDB update
   */
  private static buildAttributeValues(updateObj: any, allowRemove: boolean = false): Record<string, any> {
    const values: Record<string, any> = {};
    const names: Record<string, string> = {};

    Object.keys(updateObj).forEach(key => {
      names[`#${key}`] = key;
      if (updateObj[key] !== undefined) {
        values[`:${key}`] = updateObj[key];
      }
    });

    return Object.keys(values).length > 0 ? values : {};
  }

  /**
   * Generate unique ID
   */
  private static generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Compare arrays for equality
   */
  private static arraysEqual<T>(a: T[], b: T[]): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  }

  /**
   * Process student schedules
   */
  static async processSchedules(
    studentId: string,
    license: string,
    scheduleCategories: any[],
    context: ServiceContext
  ): Promise<void> {
    context.logger.info('Getting existing schedules', { studentId });
    
    // Get existing schedules
    const existingSchedules = await StudentOperations.getStudentSchedules(studentId, context);
    
    context.logger.info('Processing schedule deletes', { studentId });
    
    // Delete schedules that are no longer in the input
    const deletePromises = existingSchedules
      .filter(existing => !scheduleCategories.find(input => input.name === existing.name && input.schedules.length > 0))
      .map(async schedule => {
        const key = StudentOperations.getStudentSchedulePrimaryKey(studentId, schedule.name);
        await Promise.all([
          context.dataAccess.delete(key),
          context.dataAccess.delete(key) // Delete from both tables
        ]);
      });

    context.logger.info('Processing schedule updates', { studentId });
    
    // Update or create schedules
    const updatePromises = scheduleCategories.map(async scheduleCategory => {
      const scheduleKey = StudentOperations.getStudentSchedulePrimaryKey(studentId, scheduleCategory.name);
      
      // Get existing PII data for name mapping
      const existingPii = await context.dataAccess.get(scheduleKey);
      const names: { name: string, id: string }[] = (existingPii as any)?.names ?? [];
      
      // Process each schedule version in the category
      for (const version of scheduleCategory.schedules) {
        StudentOperations.constructPiiNames(version, names);
      }

      context.logger.info('Processing existing schedule', { studentId, scheduleName: scheduleCategory.name });

      // Convert schedules to storage format with timestamps
      const schedules = scheduleCategory.schedules.map((version: any) => ({
        ...version,
        time: new Date(version.startDate!).getTime()
      }));
      
      // Sort by time
      schedules.sort((a: any, b: any) => a.time - b.time);

      // Save schedule data and PII data
      await Promise.all([
        // Save schedule data
        context.dataAccess.put({
          ...scheduleKey,
          pksk: `${scheduleKey.pk}#${scheduleKey.sk}`,
          studentId,
          tsk: scheduleKey.sk,
          license,
          schedules,
          latest: schedules[schedules.length - 1],
          version: 1
        }),
        // Save PII data
        context.dataAccess.put({
          ...scheduleKey,
          pksk: `${scheduleKey.pk}#${scheduleKey.sk}`,
          studentId,
          tsk: scheduleKey.sk,
          license,
          names,
          version: 1
        })
      ]);
    });

    // Execute all operations
    await Promise.all([...updatePromises, ...deletePromises]);

    // Publish schedule updated event
    await context.messageBroker.publish('student.schedules.updated', {
      studentId,
      license,
      scheduleCount: scheduleCategories.length,
      timestamp: new Date().toISOString()
    });

    context.logger.info('Student schedules processed successfully', { 
      studentId, 
      scheduleCount: scheduleCategories.length 
    });
  }

  /**
   * Get student schedules
   */
  static async getStudentSchedules(
    studentId: string,
    context: ServiceContext,
    time: number = 0
  ): Promise<any[]> {
    const key = StudentOperations.getStudentSchedulePrimaryKey(studentId, ' ');
    
    const [categories, piis] = await Promise.all([
      context.dataAccess.query({
        keyExpression: 'pk = :pk',
        filterExpression: 'attribute_not_exists(deleted)',
        attributeValues: {
          ':pk': key.pk
        }
      }),
      context.dataAccess.query({
        keyExpression: 'pk = :pk',
        filterExpression: 'attribute_not_exists(deleted)',
        attributeValues: {
          ':pk': key.pk
        }
      })
    ]);

    const results = (categories as any[])
      .filter(cat => cat.schedules?.find((sch: any) => !sch.deleted))
      .map(cat => {
        const sch = cat.latest || cat.schedules.find((sch: any) => !sch.deleted);
        const pii = (piis as any[]).find(p => p.sk === cat.sk);
        
        return {
          name: sch.name,
          schedules: cat.schedules.map((version: any) => ({
            name: version.name,
            activities: version.activities.map((a: any) => ({
              ...a,
              title: pii?.names.find((x: any) => x.id === a.title)?.name || version.name,
            })),
            applyDays: version.applyDays,
            startDate: version.startDate
          }))
        };
      });

    return results;
  }

  /**
   * Generate student schedule primary key
   */
  private static getStudentSchedulePrimaryKey(studentId: string, name: string): { pk: string; sk: string } {
    return { pk: `S#${studentId}#SCH`, sk: `${name}#P` };
  }

  /**
   * Construct PII name mapping
   */
  private static constructPiiName(name: string, names: { name: string, id: string }[]): string {
    let item = names.find(x => x.name === name);
    if (!item) {
      item = {
        name,
        id: uuid().replace(/-/g, '').substring(0, 22) // Generate short UUID similar to shortUUID
      };
      names.push(item);
    }
    return item.id;
  }

  /**
   * Construct PII names for schedule activities
   */
  private static constructPiiNames(schedule: any, names: { name: string, id: string }[]): void {
    schedule.activities.forEach((activity: any) => {
      activity.title = StudentOperations.constructPiiName(activity.title, names);
    });
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

export interface DeleteStudentNotificationsInput {
  studentId: string;
  userId: string;
  events: {
    behaviorId: string;
    epoch: number;
  }[];
}

export interface UpdateStudentDataInput {
  student: {
    studentId?: string;
    license?: string;
    licenseDetails?: any;
    details?: {
      firstName?: string;
      lastName?: string;
      nickname?: string;
      schoolId?: string;
      tags?: any[];
    };
    milestones?: any[];
    abc?: any;
    behaviors?: any[];
    responses?: any[];
    services?: any[];
    dashboard?: any;
    scheduleCategories?: any[];
  };
  copyStudentId?: string;
  userContext: {
    userId: string;
    groups?: string[];
  };
}

export interface ProcessSchedulesInput {
  studentId: string;
  license: string;
  scheduleCategories: any[];
}