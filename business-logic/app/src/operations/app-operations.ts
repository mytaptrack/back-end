import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';
import * as moment from 'moment-timezone';

/**
 * App-specific business operations
 */
export class AppOperations implements IBusinessOperations {
  
  /**
   * Register a new app
   */
  static async registerApp(
    appData: RegisterAppInput,
    context: ServiceContext
  ): Promise<AppRegistration> {
    // Validate input
    const validation = AppOperations.validateRegisterAppInput(appData);
    if (!validation.valid) {
      throw new ValidationError('Invalid app data', context.config.correlationId, { errors: validation.errors });
    }

    const appKey = { pk: `A#${appData.appId}`, sk: 'P' };

    // Check if app already exists
    const existingApp = await context.dataAccess.get(appKey);
    if (existingApp) {
      throw new BusinessLogicError('App already registered', context.config.correlationId, { appId: appData.appId });
    }

    const now = moment().toISOString();
    
    // Create app registration record
    const appRegistration: any = {
      ...appKey,
      pksk: `${appKey.pk}#${appKey.sk}`,
      appId: appData.appId,
      deviceId: appData.deviceId,
      studentId: appData.studentId,
      license: appData.license,
      lpk: `${appData.license}#A`,
      lsk: `P#${appData.appId}`,
      appType: appData.appType || 'mobile',
      platform: appData.platform,
      version: appData.version,
      registeredAt: now,
      lastActive: now,
      status: 'active',
      settings: appData.settings || {},
      version: 1
    };

    // Save app registration
    await context.dataAccess.put(appRegistration);

    // Publish app registered event
    await context.messageBroker.publish('app.registered', {
      appId: appData.appId,
      deviceId: appData.deviceId,
      studentId: appData.studentId,
      license: appData.license,
      timestamp: now
    });

    context.logger.info('App registered successfully', { 
      appId: appData.appId, 
      deviceId: appData.deviceId,
      studentId: appData.studentId 
    });

    return {
      appId: appData.appId,
      deviceId: appData.deviceId,
      studentId: appData.studentId,
      license: appData.license,
      status: 'active',
      registeredAt: now
    };
  }

  /**
   * Update app status
   */
  static async updateAppStatus(
    appId: string,
    status: AppStatus,
    context: ServiceContext
  ): Promise<void> {
    const appKey = { pk: `A#${appId}`, sk: 'P' };
    
    // Check if app exists
    const existingApp = await context.dataAccess.get(appKey);
    if (!existingApp) {
      throw new NotFoundError('App not found', context.config.correlationId, { appId });
    }

    const now = moment().toISOString();

    // Update app status
    await context.dataAccess.update({
      key: appKey,
      updateExpression: 'SET #status = :status, lastActive = :lastActive',
      attributeNames: { '#status': 'status' },
      attributeValues: { 
        ':status': status,
        ':lastActive': now
      }
    });

    // Publish app status updated event
    await context.messageBroker.publish('app.status.updated', {
      appId,
      status,
      timestamp: now
    });

    context.logger.info('App status updated', { appId, status });
  }

  /**
   * Record app activity
   */
  static async recordActivity(
    appId: string,
    activityData: AppActivityInput,
    context: ServiceContext
  ): Promise<void> {
    // Validate input
    const validation = AppOperations.validateActivityInput(activityData);
    if (!validation.valid) {
      throw new ValidationError('Invalid activity data', context.config.correlationId, { errors: validation.errors });
    }

    const now = moment().toISOString();
    const activityKey = { 
      pk: `AAD#${appId}`, 
      sk: `T#${activityData.timestamp || now}#${Date.now()}` 
    };

    // Create activity record
    const activityRecord: any = {
      ...activityKey,
      pksk: `${activityKey.pk}#${activityKey.sk}`,
      appId,
      studentId: activityData.studentId,
      activityType: activityData.activityType,
      data: activityData.data,
      timestamp: activityData.timestamp || now,
      version: 1
    };

    // Save activity record
    await context.dataAccess.put(activityRecord);

    // Update app last active time
    await AppOperations.updateLastActive(appId, context);

    // Publish app activity event
    await context.messageBroker.publish('app.activity.recorded', {
      appId,
      studentId: activityData.studentId,
      activityType: activityData.activityType,
      timestamp: activityData.timestamp || now
    });

    context.logger.info('App activity recorded', { 
      appId, 
      activityType: activityData.activityType,
      studentId: activityData.studentId 
    });
  }

  /**
   * Get app registration
   */
  static async getAppRegistration(
    appId: string,
    context: ServiceContext
  ): Promise<AppRegistration | null> {
    const appKey = { pk: `A#${appId}`, sk: 'P' };
    
    const appRecord = await context.dataAccess.get(appKey);
    
    if (!appRecord) {
      return null;
    }

    return {
      appId: appRecord.appId,
      deviceId: appRecord.deviceId,
      studentId: appRecord.studentId,
      license: appRecord.license,
      status: appRecord.status,
      registeredAt: appRecord.registeredAt,
      lastActive: appRecord.lastActive,
      platform: appRecord.platform,
      version: appRecord.version,
      settings: appRecord.settings
    };
  }

  /**
   * Get apps by student
   */
  static async getAppsByStudent(
    studentId: string,
    context: ServiceContext
  ): Promise<AppRegistration[]> {
    const apps = await context.dataAccess.query({
      keyExpression: 'studentId = :studentId',
      attributeValues: { ':studentId': studentId },
      indexName: 'student-index'
    });

    return apps.map((app: any) => ({
      appId: app.appId,
      deviceId: app.deviceId,
      studentId: app.studentId,
      license: app.license,
      status: app.status,
      registeredAt: app.registeredAt,
      lastActive: app.lastActive,
      platform: app.platform,
      version: app.version,
      settings: app.settings
    }));
  }

  /**
   * Get apps by license
   */
  static async getAppsByLicense(
    license: string,
    context: ServiceContext
  ): Promise<AppRegistration[]> {
    const apps = await context.dataAccess.query({
      keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
      attributeValues: { 
        ':lpk': `${license}#A`,
        ':lsk': 'P#'
      },
      indexName: 'license-index'
    });

    return apps.map((app: any) => ({
      appId: app.appId,
      deviceId: app.deviceId,
      studentId: app.studentId,
      license: app.license,
      status: app.status,
      registeredAt: app.registeredAt,
      lastActive: app.lastActive,
      platform: app.platform,
      version: app.version,
      settings: app.settings
    }));
  }

  /**
   * Unregister app
   */
  static async unregisterApp(
    appId: string,
    context: ServiceContext
  ): Promise<void> {
    const appKey = { pk: `A#${appId}`, sk: 'P' };
    
    // Check if app exists
    const existingApp = await context.dataAccess.get(appKey);
    if (!existingApp) {
      throw new NotFoundError('App not found', context.config.correlationId, { appId });
    }

    // Delete app registration
    await context.dataAccess.delete(appKey);

    // Publish app unregistered event
    await context.messageBroker.publish('app.unregistered', {
      appId,
      studentId: existingApp.studentId,
      timestamp: moment().toISOString()
    });

    context.logger.info('App unregistered', { appId });
  }

  /**
   * Update app settings
   */
  static async updateAppSettings(
    appId: string,
    settings: any,
    context: ServiceContext
  ): Promise<void> {
    const appKey = { pk: `A#${appId}`, sk: 'P' };
    
    // Check if app exists
    const existingApp = await context.dataAccess.get(appKey);
    if (!existingApp) {
      throw new NotFoundError('App not found', context.config.correlationId, { appId });
    }

    // Update app settings
    await context.dataAccess.update({
      key: appKey,
      updateExpression: 'SET settings = :settings, lastActive = :lastActive',
      attributeValues: { 
        ':settings': settings,
        ':lastActive': moment().toISOString()
      }
    });

    // Publish app settings updated event
    await context.messageBroker.publish('app.settings.updated', {
      appId,
      timestamp: moment().toISOString()
    });

    context.logger.info('App settings updated', { appId });
  }

  /**
   * Update last active time
   */
  private static async updateLastActive(
    appId: string,
    context: ServiceContext
  ): Promise<void> {
    const appKey = { pk: `A#${appId}`, sk: 'P' };
    
    await context.dataAccess.update({
      key: appKey,
      updateExpression: 'SET lastActive = :lastActive',
      attributeValues: { ':lastActive': moment().toISOString() }
    });
  }

  /**
   * Validate register app input
   */
  private static validateRegisterAppInput(input: RegisterAppInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.appId) {
      errors.push({ field: 'appId', message: 'App ID is required', code: 'REQUIRED' });
    }

    if (!input.deviceId) {
      errors.push({ field: 'deviceId', message: 'Device ID is required', code: 'REQUIRED' });
    }

    if (!input.studentId) {
      errors.push({ field: 'studentId', message: 'Student ID is required', code: 'REQUIRED' });
    }

    if (!input.license) {
      errors.push({ field: 'license', message: 'License is required', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate activity input
   */
  private static validateActivityInput(input: AppActivityInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.studentId) {
      errors.push({ field: 'studentId', message: 'Student ID is required', code: 'REQUIRED' });
    }

    if (!input.activityType) {
      errors.push({ field: 'activityType', message: 'Activity type is required', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors };
  }
}

// Types
export type AppStatus = 'active' | 'inactive' | 'suspended';

export interface RegisterAppInput {
  appId: string;
  deviceId: string;
  studentId: string;
  license: string;
  appType?: string;
  platform?: string;
  version?: string;
  settings?: any;
}

export interface AppActivityInput {
  studentId: string;
  activityType: string;
  data?: any;
  timestamp?: string;
}

export interface AppRegistration {
  appId: string;
  deviceId: string;
  studentId: string;
  license: string;
  status: AppStatus;
  registeredAt: string;
  lastActive?: string;
  platform?: string;
  version?: string;
  settings?: any;
}