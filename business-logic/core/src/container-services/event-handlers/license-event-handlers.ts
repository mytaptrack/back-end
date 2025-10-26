import { EventProcessor } from '../event-processor';
import { BrokerMessage, ServiceContext } from '../../interfaces/service-context';
import { UserOperations } from '@mytaptrack/business-logic-user';
import { ServiceUnavailableError } from '../../errors/service-errors';

/**
 * License to User event handler
 * Ports the functionality from data-prop/src/functions/licenses/licenseToUser.ts
 */
export class LicenseToUserProcessor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    if (!payload.data) {
      this.context.logger.warn('No data in license event payload');
      return;
    }

    const oldLicense = payload.data.old;
    const newLicense = payload.data.new;

    this.context.logger.info('Processing license to user event', {
      license: newLicense?.license || oldLicense?.license,
      hasOld: !!oldLicense,
      hasNew: !!newLicense
    });

    try {
      const actions = await this.getActions(oldLicense, newLicense);

      // Add users to license
      this.context.logger.info('Adding users to license', { count: actions.addIds.length });
      for (const userId of actions.addIds) {
        await this.modifyUser(newLicense, userId, true);
      }

      // Remove users from license
      this.context.logger.info('Removing users from license', { count: actions.removeIds.length });
      for (const userId of actions.removeIds) {
        await this.modifyUser(oldLicense, userId, false);
      }

    } catch (error) {
      this.context.logger.error('Error processing license to user event', { error });
      throw new ServiceUnavailableError('License to user processing failed', message.metadata.correlationId, { error });
    }
  }

  private async getActions(oldLicense: any, newLicense: any): Promise<{ removeIds: string[]; addIds: string[] }> {
    let removeEmails: string[] = [];
    let addEmails: string[] = [];
    
    const licenseId = newLicense?.license || oldLicense?.license;
    if (!licenseId) {
      return { removeIds: [], addIds: [] };
    }

    // Get current admins for the license
    const currentAdmins = await this.getAdminsForLicense(licenseId);

    if (oldLicense?.details?.admins && newLicense?.details?.admins) {
      this.context.logger.debug('Diffing admins for removal');
      removeEmails = oldLicense.details.admins.filter((old: string) => {
        return currentAdmins.find(admin => admin.email === old) &&
               !newLicense.details.admins.find((newAdmin: string) => newAdmin === old);
      });

      this.context.logger.debug('Diffing admins for addition');
      addEmails = newLicense.details.admins.filter((email: string) => {
        return !currentAdmins.find(admin => admin.email === email);
      });
    } else if (oldLicense?.details?.admins) {
      this.context.logger.debug('Removing old admins');
      removeEmails = oldLicense.details.admins.filter((email: string) => {
        return !newLicense?.details?.admins?.find((admin: string) => admin === email);
      });
    } else if (newLicense?.details?.admins) {
      this.context.logger.debug('Adding new admins');
      addEmails = newLicense.details.admins.filter((email: string) => {
        return !currentAdmins.find(admin => admin.email === email);
      });
    }

    // Convert emails to user IDs
    const addUserIds: string[] = [];
    for (const email of addEmails) {
      const userIds = await this.getUserIdsByEmail(email);
      addUserIds.push(...userIds);
    }

    const removeIds = removeEmails.map(email => {
      const existing = currentAdmins.find(admin => admin.email === email);
      return existing?.username;
    }).filter(id => id) as string[];

    const result = {
      removeIds,
      addIds: addUserIds.filter(id => !!id)
    };

    this.context.logger.debug('License admin actions determined', result);
    return result;
  }

  private async modifyUser(license: any, userId: string, addLicense: boolean): Promise<void> {
    try {
      if (addLicense) {
        this.context.logger.debug('Adding user to license', { userId, license: license.license });
        await UserOperations.addUserToLicense(userId, license.license, this.context);
      } else {
        this.context.logger.debug('Removing user from license', { userId, license: license.license });
        await this.removeUserFromLicense(userId, license.license);
      }
    } catch (error) {
      this.context.logger.error('Error modifying user license', { error, userId, license: license.license, addLicense });
      throw error;
    }
  }

  private async getAdminsForLicense(license: string): Promise<Array<{ email: string; username: string }>> {
    try {
      // Query users with this license
      const users = await this.context.dataAccess.query({
        keyExpression: 'license = :license',
        attributeValues: { ':license': license },
        indexName: 'license-index',
        projectionExpression: 'userId, details.email'
      });

      return users.map((user: any) => ({
        email: user.details?.email || '',
        username: user.userId
      })).filter(admin => admin.email);
    } catch (error) {
      this.context.logger.error('Error getting admins for license', { error, license });
      return [];
    }
  }

  private async getUserIdsByEmail(email: string): Promise<string[]> {
    try {
      // Look up user by email
      const user = await UserOperations.getUserByEmail(email, this.context);
      return user ? [user.userId] : [];
    } catch (error) {
      this.context.logger.error('Error getting user IDs by email', { error, email });
      return [];
    }
  }

  private async removeUserFromLicense(userId: string, license: string): Promise<void> {
    try {
      // Update user to remove license
      const userKey = { pk: `U#${userId}`, sk: 'P' };
      await this.context.dataAccess.update({
        key: userKey,
        updateExpression: 'REMOVE license',
        attributeNames: { '#license': 'license' }
      });

      // Publish event
      await this.context.messageBroker.publish('user.license.removed', {
        userId,
        license,
        timestamp: new Date().toISOString()
      });

      this.context.logger.info('User removed from license', { userId, license });
    } catch (error) {
      this.context.logger.error('Error removing user from license', { error, userId, license });
      throw error;
    }
  }
}

/**
 * License to S3 event handler
 * Ports the functionality from data-prop/src/functions/licenses/licenseToS3.ts
 */
export class LicenseToS3Processor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    if (!payload.data) {
      this.context.logger.warn('No data in license event payload');
      return;
    }

    const license = payload.data.new || payload.data.old;
    if (!license) {
      this.context.logger.warn('No license data in event payload');
      return;
    }

    this.context.logger.info('Processing license to S3 event', {
      license: license.license
    });

    try {
      // In a containerized environment, we might write to a file system mount
      // or use an S3-compatible storage service instead of direct S3
      await this.writeLicenseToStorage(license);
      
    } catch (error) {
      this.context.logger.error('Error processing license to S3 event', { error });
      throw new ServiceUnavailableError('License to S3 processing failed', message.metadata.correlationId, { error });
    }
  }

  private async writeLicenseToStorage(license: any): Promise<void> {
    try {
      const licenseData = {
        license: license.license,
        details: license.details,
        lastUpdated: new Date().toISOString()
      };

      // In Docker environment, this could write to a mounted volume
      // or use an S3-compatible service like MinIO
      const storageKey = `licenses/license=${license.license}/info.json`;
      
      // For now, we'll just log the operation
      // In a real implementation, this would write to the configured storage
      this.context.logger.info('License data prepared for storage', {
        license: license.license,
        storageKey,
        dataSize: JSON.stringify(licenseData).length
      });

      // TODO: Implement actual storage write based on configuration
      // This could be S3, MinIO, local file system, etc.
      
    } catch (error) {
      this.context.logger.error('Error writing license to storage', { error, license: license.license });
      throw error;
    }
  }
}

/**
 * License to Student event handler
 * Ports the functionality from data-prop/src/functions/licenses/licenseToStudent.ts
 */
export class LicenseToStudentProcessor extends EventProcessor {
  constructor(context: ServiceContext) {
    super(context);
  }

  async process(message: BrokerMessage): Promise<void> {
    const { payload } = message;
    
    if (!payload.data) {
      this.context.logger.warn('No data in license event payload');
      return;
    }

    const license = payload.data.new || payload.data.old;
    if (!license) {
      this.context.logger.warn('No license data in event payload');
      return;
    }

    this.context.logger.info('Processing license to student event', {
      license: license.license
    });

    try {
      // Update all students associated with this license
      await this.updateStudentsForLicense(license);
      
    } catch (error) {
      this.context.logger.error('Error processing license to student event', { error });
      throw new ServiceUnavailableError('License to student processing failed', message.metadata.correlationId, { error });
    }
  }

  private async updateStudentsForLicense(license: any): Promise<void> {
    try {
      // Get all students for this license
      const students = await this.context.dataAccess.query({
        keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
        attributeValues: { 
          ':lpk': `${license.license}#S`,
          ':lsk': 'P'
        },
        indexName: 'license-index',
        projectionExpression: 'studentId'
      });

      this.context.logger.info('Updating students for license', {
        license: license.license,
        studentCount: students.length
      });

      // Update license details for each student
      const updatePromises = students.map(async (student: any) => {
        const studentKey = { pk: `S#${student.studentId}`, sk: 'P' };
        
        return this.context.dataAccess.update({
          key: studentKey,
          updateExpression: 'SET licenseDetails = :licenseDetails',
          attributeValues: { ':licenseDetails': license.details }
        });
      });

      await Promise.all(updatePromises);

      // Publish events for each student update
      const eventPromises = students.map((student: any) =>
        this.context.messageBroker.publish('student.license.updated', {
          studentId: student.studentId,
          license: license.license,
          licenseDetails: license.details,
          timestamp: new Date().toISOString()
        })
      );

      await Promise.all(eventPromises);

      this.context.logger.info('Students updated for license', {
        license: license.license,
        updatedCount: students.length
      });
      
    } catch (error) {
      this.context.logger.error('Error updating students for license', { error, license: license.license });
      throw error;
    }
  }
}