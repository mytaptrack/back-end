import { EventProcessor } from '../event-processor';
import { BrokerMessage, ServiceContext } from '../../interfaces/service-context';
// import { StudentOperations } from '@mytaptrack/business-logic-student';
import { ServiceUnavailableError } from '../../errors/service-errors';

/**
 * Student to S3 event handler
 * Ports the functionality from data-prop/src/functions/student/prop/studentToS3.ts
 */
export class StudentToS3Processor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    if (!payload.data) {
      this.context.logger.warn('No data in student event payload');
      return;
    }

    const student = payload.data.new || payload.data.old;
    if (!student) {
      this.context.logger.warn('No student data in event payload');
      return;
    }

    if (!student.license) {
      this.context.logger.warn('Student has no license, skipping S3 export', { studentId: student.studentId });
      return;
    }

    this.context.logger.info('Processing student to S3 event', {
      studentId: student.studentId,
      license: student.license
    });

    try {
      await this.writeStudentToStorage(student);
    } catch (error) {
      this.context.logger.error('Error processing student to S3 event', { error });
      throw new ServiceUnavailableError('Student to S3 processing failed', message.metadata.correlationId, { error });
    }
  }

  private async writeStudentToStorage(student: any): Promise<void> {
    try {
      const studentData = {
        studentId: student.studentId,
        license: student.license,
        licenseDetails: JSON.stringify(student.licenseDetails),
        behaviors: JSON.stringify(student.behaviors),
        responses: JSON.stringify(student.responses),
        lastUpdatedDate: student.lastUpdatedDate,
        lastTracked: student.lastTracked,
        lastActive: student.lastActive,
        archived: student.archived ? true : false
      };

      // In Docker environment, this could write to a mounted volume
      // or use an S3-compatible service like MinIO
      const storageKey = `students/plicense=${student.license}/pstudent=${student.studentId}/info.json`;
      
      this.context.logger.info('Student data prepared for storage', {
        studentId: student.studentId,
        license: student.license,
        storageKey,
        dataSize: JSON.stringify(studentData).length
      });

      // TODO: Implement actual storage write based on configuration
      // This could be S3, MinIO, local file system, etc.
      
    } catch (error) {
      this.context.logger.error('Error writing student to storage', { 
        error, 
        studentId: student.studentId,
        license: student.license 
      });
      throw error;
    }
  }

  /**
   * Reprocess all students (for manual triggers)
   */
  async reprocess(): Promise<void> {
    this.context.logger.info('Starting student reprocessing');

    try {
      let token: any = undefined;
      let totalProcessed = 0;

      do {
        // Scan for student records
        const result = await this.context.dataAccess.scan({
          filterExpression: 'sk = :sk and begins_with(pk, :pk)',
          attributeValues: {
            ':sk': 'P',
            ':pk': 'S#'
          },
          projectionExpression: 'pk, sk, studentId, license, licenseDetails, behaviors, responses, lastUpdatedDate, lastTracked, lastActive, archived'
        });

        const students = result as any[];
        
        // Process each student
        for (const student of students) {
          if (student.pk?.match(/^S#[0-9|a-z|\-]+$/)) {
            await this.writeStudentToStorage(student);
            totalProcessed++;
          }
        }

        // Note: In a real implementation, you'd handle pagination tokens
        token = undefined; // For now, process all in one batch
        
      } while (token);

      this.context.logger.info('Student reprocessing completed', { totalProcessed });
      
    } catch (error) {
      this.context.logger.error('Error during student reprocessing', { error });
      throw error;
    }
  }
}

/**
 * App to S3 event handler
 * Ports the functionality from data-prop/src/functions/student/prop/appToS3.ts
 */
export class AppToS3Processor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    if (!payload.data) {
      this.context.logger.warn('No data in app event payload');
      return;
    }

    const app = payload.data.new || payload.data.old;
    if (!app) {
      this.context.logger.warn('No app data in event payload');
      return;
    }

    this.context.logger.info('Processing app to S3 event', {
      appId: app.appId || app.pk,
      studentId: app.studentId
    });

    try {
      await this.writeAppToStorage(app);
    } catch (error) {
      this.context.logger.error('Error processing app to S3 event', { error });
      throw new ServiceUnavailableError('App to S3 processing failed', message.metadata.correlationId, { error });
    }
  }

  private async writeAppToStorage(app: any): Promise<void> {
    try {
      // Extract app information
      const appData = {
        appId: app.appId || this.extractAppIdFromPk(app.pk),
        studentId: app.studentId,
        license: app.license,
        appDetails: app.details || {},
        lastUpdated: new Date().toISOString()
      };

      // In Docker environment, this could write to a mounted volume
      const storageKey = `apps/plicense=${app.license}/pstudent=${app.studentId}/app=${appData.appId}/info.json`;
      
      this.context.logger.info('App data prepared for storage', {
        appId: appData.appId,
        studentId: app.studentId,
        license: app.license,
        storageKey,
        dataSize: JSON.stringify(appData).length
      });

      // TODO: Implement actual storage write based on configuration
      
    } catch (error) {
      this.context.logger.error('Error writing app to storage', { 
        error, 
        appId: app.appId,
        studentId: app.studentId 
      });
      throw error;
    }
  }

  private extractAppIdFromPk(pk: string): string {
    // Extract app ID from partition key format
    const match = pk.match(/A#([^#]+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Reprocess all apps (for manual triggers)
   */
  async reprocess(): Promise<void> {
    this.context.logger.info('Starting app reprocessing');

    try {
      let totalProcessed = 0;

      // Scan for app records
      const result = await this.context.dataAccess.scan({
        filterExpression: 'sk = :sk and contains(pk, :appPrefix)',
        attributeValues: {
          ':sk': 'P',
          ':appPrefix': '#A#'
        }
      });

      const apps = result as any[];
      
      // Process each app
      for (const app of apps) {
        await this.writeAppToStorage(app);
        totalProcessed++;
      }

      this.context.logger.info('App reprocessing completed', { totalProcessed });
      
    } catch (error) {
      this.context.logger.error('Error during app reprocessing', { error });
      throw error;
    }
  }
}

/**
 * Student removal processor
 * Ports the functionality from data-prop/src/functions/student/removeFinal/studentRemoveFinal.ts
 */
export class StudentRemovalProcessor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    if (!payload.studentId) {
      this.context.logger.warn('No student ID in removal event payload');
      return;
    }

    this.context.logger.info('Processing student removal event', {
      studentId: payload.studentId
    });

    try {
      await this.removeStudentFinal(payload);
    } catch (error) {
      this.context.logger.error('Error processing student removal event', { error });
      throw new ServiceUnavailableError('Student removal processing failed', message.metadata.correlationId, { error });
    }
  }

  private async removeStudentFinal(input: any): Promise<void> {
    const { studentId, license } = input;

    try {
      // Get all student-related records
      const studentRecords = await this.context.dataAccess.query({
        keyExpression: 'pk = :pk',
        attributeValues: { ':pk': `S#${studentId}` }
      });

      this.context.logger.info('Found student records for removal', {
        studentId,
        recordCount: studentRecords.length
      });

      // Delete all student records
      const deletePromises = studentRecords.map((record: any) => 
        this.context.dataAccess.delete({ pk: record.pk, sk: record.sk })
      );

      await Promise.all(deletePromises);

      // Remove student data from storage
      await this.removeStudentFromStorage(studentId, license);

      // Publish student removed event
      await this.context.messageBroker.publish('student.removed', {
        studentId,
        license,
        timestamp: new Date().toISOString()
      });

      this.context.logger.info('Student removal completed', { studentId, license });
      
    } catch (error) {
      this.context.logger.error('Error during student removal', { error, studentId });
      throw error;
    }
  }

  private async removeStudentFromStorage(studentId: string, license: string): Promise<void> {
    try {
      // In Docker environment, this would remove files from mounted storage
      const storagePrefix = `students/plicense=${license}/pstudent=${studentId}/`;
      
      this.context.logger.info('Student storage removal requested', {
        studentId,
        license,
        storagePrefix
      });

      // TODO: Implement actual storage removal based on configuration
      
    } catch (error) {
      this.context.logger.error('Error removing student from storage', { 
        error, 
        studentId,
        license 
      });
      throw error;
    }
  }
}

/**
 * Student orphan cleanup processor
 * Ports the functionality from data-prop/src/functions/student/clearOutOrphans/studentClearOutOrphans.ts
 */
export class StudentOrphanCleanupProcessor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    this.context.logger.info('Processing student orphan cleanup event');

    try {
      await this.clearOrphanedStudents();
    } catch (error) {
      this.context.logger.error('Error processing student orphan cleanup event', { error });
      throw new ServiceUnavailableError('Student orphan cleanup processing failed', message.metadata.correlationId, { error });
    }
  }

  private async clearOrphanedStudents(): Promise<void> {
    try {
      // Find students without valid licenses or users
      const orphanedStudents = await this.findOrphanedStudents();

      this.context.logger.info('Found orphaned students', { count: orphanedStudents.length });

      // Process each orphaned student
      for (const student of orphanedStudents) {
        await this.processOrphanedStudent(student);
      }

      this.context.logger.info('Orphaned student cleanup completed', { 
        processedCount: orphanedStudents.length 
      });
      
    } catch (error) {
      this.context.logger.error('Error during orphaned student cleanup', { error });
      throw error;
    }
  }

  private async findOrphanedStudents(): Promise<any[]> {
    try {
      // Get all students
      const students = await this.context.dataAccess.scan({
        filterExpression: 'sk = :sk and begins_with(pk, :pk)',
        attributeValues: {
          ':sk': 'P',
          ':pk': 'S#'
        },
        projectionExpression: 'studentId, license, pk, sk'
      });

      const orphaned: any[] = [];

      // Check each student for valid license and user associations
      for (const student of students as any[]) {
        const isOrphaned = await this.isStudentOrphaned(student);
        if (isOrphaned) {
          orphaned.push(student);
        }
      }

      return orphaned;
      
    } catch (error) {
      this.context.logger.error('Error finding orphaned students', { error });
      throw error;
    }
  }

  private async isStudentOrphaned(student: any): Promise<boolean> {
    try {
      // Check if license exists
      if (student.license) {
        const license = await this.context.dataAccess.get({
          pk: 'L',
          sk: `P#${student.license}`
        });

        if (!license) {
          this.context.logger.debug('Student has invalid license', {
            studentId: student.studentId,
            license: student.license
          });
          return true;
        }
      }

      // Check if student has any associated users
      const userAssociations = await this.context.dataAccess.query({
        keyExpression: 'begins_with(pk, :pk) and begins_with(sk, :sk)',
        attributeValues: {
          ':pk': 'U#',
          ':sk': `S#${student.studentId}#`
        }
      });

      if (userAssociations.length === 0) {
        this.context.logger.debug('Student has no user associations', {
          studentId: student.studentId
        });
        return true;
      }

      return false;
      
    } catch (error) {
      this.context.logger.error('Error checking if student is orphaned', { 
        error, 
        studentId: student.studentId 
      });
      return false;
    }
  }

  private async processOrphanedStudent(student: any): Promise<void> {
    try {
      this.context.logger.info('Processing orphaned student', {
        studentId: student.studentId,
        license: student.license
      });

      // Trigger student removal
      await this.context.messageBroker.publish('student.removal.requested', {
        studentId: student.studentId,
        license: student.license,
        reason: 'orphaned',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      this.context.logger.error('Error processing orphaned student', { 
        error, 
        studentId: student.studentId 
      });
      throw error;
    }
  }

  /**
   * Manual trigger for orphan cleanup
   */
  async reprocess(): Promise<void> {
    await this.clearOrphanedStudents();
  }
}