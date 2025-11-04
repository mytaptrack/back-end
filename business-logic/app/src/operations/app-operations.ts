import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError,
  AccessDeniedError 
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
   * Update app with comprehensive business logic (for GraphQL mutations)
   */
  static async updateApp(
    request: UpdateAppRequest,
    context: ServiceContext
  ): Promise<AppDetails> {
    const { appId, updateData, userId, userLicenses } = request;
    
    // Validate required fields
    if (!appId) {
      throw new ValidationError('App ID is required', context.config.correlationId);
    }
    
    // Get existing app to verify ownership/permissions
    const existingApp = await AppOperations.getAppDetails(appId, context);
    if (!existingApp) {
      throw new NotFoundError('App not found', context.config.correlationId, { appId });
    }
    
    // Check if user has permission to update this app
    if (!userLicenses.includes(existingApp.license) && existingApp.createdBy !== userId) {
      throw new AccessDeniedError('Insufficient permissions to update this app', context.config.correlationId, { appId, userId });
    }
    
    // Validate app configuration if provided
    if (updateData.configuration) {
      AppOperations.validateAppConfiguration(updateData.configuration);
    }
    
    // Update app in database
    const appKey = { pk: `APP#${appId}`, sk: 'DETAILS' };
    let updateExpression = 'SET updatedAt = :updatedAt, updatedBy = :updatedBy';
    const attributeValues: any = {
      ':updatedAt': moment().toISOString(),
      ':updatedBy': userId
    };
    const attributeNames: any = {};
    
    if (updateData.name) {
      updateExpression += ', #name = :name';
      attributeValues[':name'] = updateData.name;
      attributeNames['#name'] = 'name';
    }
    if (updateData.description !== undefined) {
      updateExpression += ', description = :description';
      attributeValues[':description'] = updateData.description;
    }
    if (updateData.status) {
      updateExpression += ', #status = :status';
      attributeValues[':status'] = updateData.status;
      attributeNames['#status'] = 'status';
    }
    if (updateData.configuration) {
      updateExpression += ', configuration = :configuration';
      attributeValues[':configuration'] = updateData.configuration;
    }
    
    await context.dataAccess.update({
      key: appKey,
      updateExpression,
      attributeValues,
      attributeNames: Object.keys(attributeNames).length > 0 ? attributeNames : undefined
    });
    
    // Get updated app
    const updatedApp = await AppOperations.getAppDetails(appId, context);
    if (!updatedApp) {
      throw new BusinessLogicError('Failed to retrieve updated app', context.config.correlationId);
    }
    
    // Handle app activation
    if (updateData.status === 'active' && existingApp.status !== 'active') {
      await AppOperations.handleAppActivation(appId, updateData.configuration, userId, existingApp.license, context);
    }
    
    // Handle configuration changes
    if (updateData.configuration && JSON.stringify(updateData.configuration) !== JSON.stringify(existingApp.configuration)) {
      await AppOperations.updateAssociatedDevices(appId, updateData.configuration, context);
    }
    
    // Log the update
    const changes = AppOperations.getChangedFields(existingApp, updateData);
    await context.messageBroker.publish('app.updated', {
      appId,
      userId,
      license: existingApp.license,
      changes,
      timestamp: moment().toISOString()
    });
    
    context.logger.info('App updated successfully', { appId, changes });
    return updatedApp;
  }

  /**
   * Get app details
   */
  static async getAppDetails(
    appId: string,
    context: ServiceContext
  ): Promise<AppDetails | null> {
    const appKey = { pk: `APP#${appId}`, sk: 'DETAILS' };
    const app = await context.dataAccess.get(appKey);
    
    if (!app) {
      return null;
    }
    
    return {
      id: app.id || appId,
      name: app.name,
      description: app.description,
      status: app.status,
      configuration: app.configuration,
      license: app.license,
      createdAt: app.createdAt,
      createdBy: app.createdBy,
      updatedAt: app.updatedAt,
      updatedBy: app.updatedBy,
      deviceCount: app.deviceCount || 0,
      studentCount: app.studentCount || 0
    };
  }

  /**
   * Handle app activation
   */
  private static async handleAppActivation(
    appId: string,
    configuration: any,
    userId: string,
    license: string,
    context: ServiceContext
  ): Promise<void> {
    // Create default device configurations
    if (configuration?.events) {
      const deviceConfigs = configuration.events.map((event: any) => ({
        appId,
        eventId: event.eventId,
        buttonMapping: event.presses,
        settings: {
          vibration: event.vibration || false,
          led: event.led || false,
          sound: event.sound || false
        }
      }));
      
      for (const config of deviceConfigs) {
        await context.dataAccess.put({
          pk: `DEVICE_CONFIG#${appId}`,
          sk: `EVENT#${config.eventId}`,
          ...config,
          createdAt: moment().toISOString()
        });
      }
    }
    
    // Send activation notification
    await context.messageBroker.publish('app.activated', {
      appId,
      userId,
      license,
      message: 'Your app has been successfully activated and is ready for use.',
      timestamp: moment().toISOString()
    });
  }

  /**
   * Update associated devices
   */
  private static async updateAssociatedDevices(
    appId: string,
    configuration: any,
    context: ServiceContext
  ): Promise<void> {
    // Get all devices associated with this app
    const devices = await context.dataAccess.query({
      keyExpression: 'appId = :appId',
      attributeValues: { ':appId': appId },
      indexName: 'app-devices-index'
    });
    
    // Update each device with new configuration
    const updatePromises = devices.map(device => 
      context.dataAccess.update({
        key: { pk: `DEVICE#${device.deviceId}`, sk: 'CONFIG' },
        updateExpression: 'SET appConfiguration = :config, updatedAt = :updatedAt',
        attributeValues: {
          ':config': configuration,
          ':updatedAt': moment().toISOString()
        }
      })
    );
    
    await Promise.all(updatePromises);
  }

  /**
   * Get changed fields
   */
  private static getChangedFields(original: any, updated: any): string[] {
    const changes: string[] = [];
    for (const key in updated) {
      if (updated[key] !== undefined && JSON.stringify(updated[key]) !== JSON.stringify(original[key])) {
        changes.push(key);
      }
    }
    return changes;
  }

  /**
   * Update app configuration (for device/student management)
   */
  static async updateAppConfiguration(
    request: UpdateAppConfigurationRequest,
    context: ServiceContext
  ): Promise<AppConfigurationResult> {
    const { appConfig, userId, userLicenses } = request;
    
    // Validate license access
    if (!userLicenses.includes(appConfig.license)) {
      throw new AccessDeniedError('Insufficient permissions for this license', context.config.correlationId, { 
        license: appConfig.license, 
        userId 
      });
    }
    
    // Handle device deletion
    if (appConfig.deleted) {
      return await AppOperations.deleteAppDevice(appConfig.deviceId, appConfig.license, userId, context);
    }
    
    // Handle device reassignment
    if (appConfig.reassign && appConfig.deviceId) {
      return await AppOperations.reassignAppDevice(appConfig, userId, context);
    }
    
    // Handle device creation or update
    return await AppOperations.createOrUpdateAppDevice(appConfig, userId, context);
  }

  /**
   * Delete app device
   */
  private static async deleteAppDevice(
    deviceId: string,
    license: string,
    userId: string,
    context: ServiceContext
  ): Promise<AppConfigurationResult> {
    const deviceKey = { pk: `L#${license}#AG`, sk: `P#${deviceId}` };
    const deletionData = {
      by: userId,
      date: moment().toISOString(),
      client: 'Web'
    };
    
    // Mark device as deleted in both tables
    await Promise.all([
      context.dataAccess.update({
        key: deviceKey,
        updateExpression: 'SET deleted = :deleted',
        attributeValues: { ':deleted': deletionData }
      }),
      // Also update in data table
      context.dataAccess.update({
        key: deviceKey,
        updateExpression: 'SET deleted = :deleted',
        attributeValues: { ':deleted': deletionData }
      })
    ]);
    
    // Publish device deleted event
    await context.messageBroker.publish('app.device.deleted', {
      deviceId,
      license,
      deletedBy: userId,
      timestamp: deletionData.date
    });
    
    context.logger.info('App device deleted', { deviceId, license, userId });
    return { deviceId };
  }

  /**
   * Reassign app device (create new device ID)
   */
  private static async reassignAppDevice(
    appConfig: any,
    userId: string,
    context: ServiceContext
  ): Promise<AppConfigurationResult> {
    const originalDeviceId = appConfig.deviceId;
    const newDeviceId = `MLC-${AppOperations.generateShortId()}`;
    
    // Get existing device data
    const originalKey = { pk: `L#${appConfig.license}#AG`, sk: `P#${originalDeviceId}` };
    const [devicePii, deviceConfig] = await Promise.all([
      context.dataAccess.get(originalKey),
      context.dataAccess.get(originalKey)
    ]);
    
    if (!devicePii || !deviceConfig) {
      throw new NotFoundError('Device not found for reassignment', context.config.correlationId, { 
        deviceId: originalDeviceId 
      });
    }
    
    // Create new device with new ID
    const newKey = { pk: `L#${appConfig.license}#AG`, sk: `P#${newDeviceId}` };
    const newDevicePii = {
      ...devicePii,
      ...newKey,
      deviceId: newDeviceId,
      pksk: `${newKey.pk}#${newKey.sk}`,
      lsk: newDeviceId
    };
    
    const newDeviceConfig = {
      ...deviceConfig,
      ...newKey,
      deviceId: newDeviceId,
      pksk: `${newKey.pk}#${newKey.sk}`
    };
    
    // Save new device and mark old one as deleted
    await Promise.all([
      context.dataAccess.put(newDevicePii),
      context.dataAccess.put(newDeviceConfig),
      AppOperations.deleteAppDevice(originalDeviceId, appConfig.license, userId, context)
    ]);
    
    // Publish device reassigned event
    await context.messageBroker.publish('app.device.reassigned', {
      originalDeviceId,
      newDeviceId,
      license: appConfig.license,
      reassignedBy: userId,
      timestamp: moment().toISOString()
    });
    
    context.logger.info('App device reassigned', { originalDeviceId, newDeviceId, userId });
    return { deviceId: newDeviceId };
  }

  /**
   * Create or update app device
   */
  private static async createOrUpdateAppDevice(
    appConfig: any,
    userId: string,
    context: ServiceContext
  ): Promise<AppConfigurationResult> {
    let deviceId = appConfig.deviceId;
    let isNew = false;
    
    // Generate device ID if not provided
    if (!deviceId) {
      deviceId = `MLC-${AppOperations.generateShortId()}`;
      isNew = true;
    }
    
    // Set default tags if not provided
    if (!appConfig.tags) {
      appConfig.tags = [];
    }
    
    const deviceKey = { pk: `L#${appConfig.license}#AG`, sk: `P#${deviceId}` };
    
    // Get existing device data if not new
    const [existingPii, existingConfig] = isNew ? [null, null] : await Promise.all([
      context.dataAccess.get(deviceKey),
      context.dataAccess.get(deviceKey)
    ]);
    
    // Build device PII data
    const devicePii = AppOperations.buildDevicePiiData(
      deviceKey, appConfig, deviceId, existingPii, isNew
    );
    
    // Build device configuration data
    const deviceConfig = AppOperations.buildDeviceConfigData(
      deviceKey, appConfig, deviceId, existingConfig, isNew
    );
    
    // Process student configurations
    await AppOperations.processStudentConfigurations(
      appConfig.studentConfigs || [], deviceConfig, devicePii, context
    );
    
    // Save device data
    await Promise.all([
      context.dataAccess.put(devicePii),
      context.dataAccess.put(deviceConfig)
    ]);
    
    // Publish appropriate event
    const eventType = isNew ? 'app.device.created' : 'app.device.updated';
    await context.messageBroker.publish(eventType, {
      deviceId,
      license: appConfig.license,
      [isNew ? 'createdBy' : 'updatedBy']: userId,
      timestamp: moment().toISOString()
    });
    
    context.logger.info(`App device ${isNew ? 'created' : 'updated'}`, { deviceId, userId });
    return { deviceId };
  }

  /**
   * Build device PII data
   */
  private static buildDevicePiiData(
    deviceKey: any,
    appConfig: any,
    deviceId: string,
    existingPii: any,
    isNew: boolean
  ): any {
    const basePii = {
      ...deviceKey,
      pksk: `${deviceKey.pk}#${deviceKey.sk}`,
      license: appConfig.license,
      deviceId,
      deviceName: appConfig.name,
      dsk: 'GD',
      tags: appConfig.tags,
      lpk: `${appConfig.license}#AG`,
      lsk: deviceId,
      version: 1
    };
    
    if (isNew) {
      return {
        ...basePii,
        studentContextLookup: [],
        studentIds: (appConfig.studentConfigs || []).map((x: any) => x.studentId)
      };
    }
    
    return {
      ...existingPii,
      ...basePii,
      studentContextLookup: existingPii?.studentContextLookup || []
    };
  }

  /**
   * Build device configuration data
   */
  private static buildDeviceConfigData(
    deviceKey: any,
    appConfig: any,
    deviceId: string,
    existingConfig: any,
    isNew: boolean
  ): any {
    const baseConfig = {
      ...deviceKey,
      pksk: `${deviceKey.pk}#${deviceKey.sk}`,
      deviceId,
      license: appConfig.license,
      textAlerts: appConfig.textAlerts,
      timezone: appConfig.timezone
    };
    
    if (isNew) {
      return {
        ...baseConfig,
        dsk: deviceKey.pk,
        auth: [AppOperations.generateShortId()],
        students: [],
        studentIds: []
      };
    }
    
    return {
      ...existingConfig,
      ...baseConfig,
      students: existingConfig?.students || []
    };
  }

  /**
   * Process student configurations
   */
  private static async processStudentConfigurations(
    studentConfigs: any[],
    deviceConfig: any,
    devicePii: any,
    context: ServiceContext
  ): Promise<void> {
    for (const conf of studentConfigs) {
      const existingStudent = deviceConfig.students.find((s: any) => s.studentId === conf.studentId);
      const existingPii = devicePii.studentContextLookup?.find((x: any) => x.id === conf.studentId);
      
      // Handle student deletion
      if (conf.delete && existingStudent) {
        AppOperations.removeStudentFromDevice(conf.studentId, deviceConfig, devicePii);
        continue;
      }
      
      // Update or add student configuration
      if (existingStudent) {
        AppOperations.updateStudentConfiguration(existingStudent, conf);
      } else if (!conf.delete) {
        AppOperations.addStudentToDevice(conf, deviceConfig);
      }
      
      // Update or add student PII
      if (existingPii) {
        if (existingPii.name !== conf.studentName) {
          existingPii.name = conf.studentName;
        }
      } else if (!conf.delete) {
        if (!devicePii.studentContextLookup) {
          devicePii.studentContextLookup = [];
        }
        devicePii.studentContextLookup.push({
          id: conf.studentId,
          name: conf.studentName,
          groups: conf.groups
        });
      }
    }
    
    // Update student IDs arrays
    deviceConfig.studentIds = deviceConfig.students
      .filter((x: any) => !x.deleted)
      .map((x: any) => x.studentId);
    
    devicePii.studentIds = devicePii.studentContextLookup?.map((x: any) => x.id) || [];
  }

  /**
   * Remove student from device
   */
  private static removeStudentFromDevice(
    studentId: string,
    deviceConfig: any,
    devicePii: any
  ): void {
    // Remove from device config
    const configIndex = deviceConfig.students.findIndex((x: any) => x.studentId === studentId);
    if (configIndex >= 0) {
      deviceConfig.students.splice(configIndex, 1);
    }
    
    // Remove from PII
    const piiIndex = devicePii.studentContextLookup?.findIndex((x: any) => x.id === studentId);
    if (piiIndex >= 0) {
      devicePii.studentContextLookup.splice(piiIndex, 1);
    }
    
    // If device has no students and is auto-generated, mark for deletion
    if (deviceConfig.deviceId.startsWith('MLC-') && 
        deviceConfig.students.filter((x: any) => !x.deleted).length === 0) {
      deviceConfig.deleted = {
        by: 'system',
        date: moment().toISOString(),
        reason: 'No active students'
      };
    }
  }

  /**
   * Update student configuration
   */
  private static updateStudentConfiguration(existingStudent: any, conf: any): void {
    const behaviorList = [...(conf.behaviors || []), ...(conf.responses || [])];
    
    // Check if behaviors changed
    if (!AppOperations.arraysEqual(behaviorList, existingStudent.behaviors)) {
      existingStudent.behaviors = behaviorList.map((b: any) => ({
        id: b.id,
        abc: b.abc,
        intensity: b.intensity,
        order: b.order
      }));
    }
    
    // Check if services changed
    if (!AppOperations.arraysEqual(conf.services || [], existingStudent.services)) {
      existingStudent.services = (conf.services || []).map((s: any) => ({
        id: s.id,
        order: s.order
      }));
    }
  }

  /**
   * Add student to device
   */
  private static addStudentToDevice(conf: any, deviceConfig: any): void {
    deviceConfig.students.push({
      studentId: conf.studentId,
      behaviors: (conf.behaviors || []).map((b: any) => ({
        id: b.id,
        abc: b.abc,
        intensity: b.intensity,
        order: b.order
      })),
      services: (conf.services || []).map((s: any) => ({
        id: s.id,
        order: s.order
      }))
    });
  }

  /**
   * Generate short ID
   */
  private static generateShortId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  /**
   * Compare arrays for equality
   */
  private static arraysEqual(a: any[], b: any[]): boolean {
    if (a.length !== b.length) return false;
    return JSON.stringify(a.sort()) === JSON.stringify(b.sort());
  }

  /**
   * Validate app configuration
   */
  private static validateAppConfiguration(configuration: any): void {
    if (configuration.events) {
      for (const event of configuration.events) {
        if (!event.eventId || !event.name) {
          throw new ValidationError('Invalid event configuration: eventId and name are required');
        }
        if (event.presses && (event.presses < 1 || event.presses > 10)) {
          throw new ValidationError('Invalid event configuration: presses must be between 1 and 10');
        }
      }
    }
    
    if (configuration.deviceSettings) {
      const settings = configuration.deviceSettings;
      if (settings.batteryThreshold && (settings.batteryThreshold < 0 || settings.batteryThreshold > 100)) {
        throw new ValidationError('Invalid device settings: battery threshold must be between 0 and 100');
      }
      if (settings.dataInterval && settings.dataInterval < 1) {
        throw new ValidationError('Invalid device settings: data interval must be at least 1 minute');
      }
    }
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
   * Get app data for device (used by GraphQL resolver)
   */
  static async getAppForDevice(
    license: string,
    deviceId: string,
    userId: string,
    context: ServiceContext
  ): Promise<any> {
    context.logger.info('Getting app data for device', { license, deviceId, userId });
    
    const globalKey = { pk: `L#${license}#AG`, sk: `P#${deviceId}` };

    // Get device PII and config data
    const [devicePii, deviceConfig] = await Promise.all([
      context.dataAccess.get(globalKey),
      context.dataAccess.get(globalKey)
    ]);

    context.logger.debug('Device PII and config retrieved', { deviceConfig });

    if (!deviceConfig) {
      return null;
    }

    // Get student keys for batch operations
    const studentKeys: any[] = [];
    deviceConfig.students.forEach((sac: any) => {
      const key = { pk: `S#${sac.studentId}`, sk: 'P' };
      if (!studentKeys.find(x => x.pk === key.pk)) {
        studentKeys.push(key);
      }
    });

    context.logger.debug('Student keys', { studentKeys });

    // Get student data in parallel
    const [studentPiis, studentConfigs, userStudentSummaries] = await Promise.all([
      context.dataAccess.batchGet(studentKeys, 'studentId, behaviorLookup, responseLookup, servicesLookup,nickname, firstName, lastName'),
      context.dataAccess.batchGet(studentKeys, 'studentId, abc, behaviors, responses, services'),
      context.dataAccess.batchGet(
        deviceConfig.students.map((sk: any) => ({ pk: `UST#${sk.studentId}`, sk: `U#${userId}` })), 
        'studentId, restrictions'
      ),
    ]);

    context.logger.debug('Student data retrieved', { 
      studentPiis: studentPiis?.length, 
      studentConfigs: studentConfigs?.length,
      userStudentSummaries: userStudentSummaries?.length 
    });

    // Fix device PII if needed
    if (!devicePii.studentContextLookup) {
      context.logger.info('Fixing device PII student context lookup');
      const studentIds = studentConfigs.map((x: any) => ({ pk: `S#${x.studentId}`, sk: 'P' }));
      const students = await context.dataAccess.batchGet(studentIds, 'studentId, firstName, lastName');
      
      devicePii.studentContextLookup = students.map((s: any) => ({
        id: s.studentId,
        name: `${s.firstName} ${s.lastName}`,
        groups: [],
      }));
      devicePii.studentIds = studentConfigs.map((x: any) => x.studentId);

      await context.dataAccess.update({
        key: { pk: devicePii.pk, sk: devicePii.sk },
        updateExpression: 'SET studentContextLookup = :studentContextLookup',
        attributeValues: {
          ':studentContextLookup': devicePii.studentContextLookup
        }
      });
    }

    // Build the response
    const retval: any = {
      deviceId: deviceId,
      license: license,
      name: devicePii.deviceName,
      textAlerts: deviceConfig.textAlerts,
      timezone: deviceConfig.timezone,
      studentConfigs: AppOperations.buildStudentConfigs(
        deviceConfig.students, 
        devicePii.studentContextLookup, 
        studentConfigs, 
        studentPiis, 
        userStudentSummaries
      ),
      students: AppOperations.buildStudentSummaries(
        studentConfigs, 
        studentPiis, 
        userStudentSummaries
      ),
      qrExpiration: deviceConfig.qrExpiration,
      tags: devicePii.tags ?? []
    };

    // Sort results
    retval.studentConfigs.sort((a: any, b: any) => a.studentName.localeCompare(b.studentName));
    retval.studentConfigs.forEach((s: any) => {
      s.behaviors.sort((a: any, b: any) => a.order - b.order);
      s.responses.sort((a: any, b: any) => a.order - b.order);
      s.services.sort((a: any, b: any) => a.order - b.order);
    });

    context.logger.debug('App data built successfully', { deviceId, studentConfigsCount: retval.studentConfigs.length });
    return retval;
  }

  /**
   * Build student configurations for app response
   */
  private static buildStudentConfigs(
    deviceStudents: any[],
    studentContextLookup: any[],
    studentConfigs: any[],
    studentPiis: any[],
    userStudentSummaries: any[]
  ): any[] {
    return deviceStudents.map((sac: any) => {
      const studentAppPii = studentContextLookup?.find((x: any) => x.id === sac.studentId);
      const student = studentConfigs.find((x: any) => x.studentId === sac.studentId);
      const studentPii = studentPiis.find((x: any) => x.studentId === sac.studentId);
      const team = userStudentSummaries.find((x: any) => x.studentId === sac.studentId);
      
      if (!studentAppPii || !student) {
        return null;
      }
      
      // Check access restrictions
      if (!team || team?.restrictions?.devices === 'none') {
        return {
          studentId: "Restricted",
          studentName: "Restricted",
          restrictions: undefined,
          groups: [],
          behaviors: [],
          responses: [],
          services: []
        };
      }
      
      return {
        studentId: sac.studentId,
        studentName: studentAppPii.name,
        groups: studentAppPii.groups,
        behaviors: AppOperations.buildBehaviorItems(sac.behaviors, studentPii.behaviorLookup, team),
        responses: AppOperations.buildResponseItems(sac.behaviors, studentPii.responseLookup, team),
        services: AppOperations.buildServiceItems(sac.services, studentPii.servicesLookup, student.services, team)
      };
    }).filter((sac: any) => sac !== null);
  }

  /**
   * Build behavior items with access control
   */
  private static buildBehaviorItems(behaviors: any[], behaviorLookup: any[], team: any): any[] {
    if (!behaviors) return [];
    
    return behaviors.map((sacb: any) => {
      const behavior = behaviorLookup.find((x: any) => x.id === sacb.id);
      if (!behavior) return null;
      
      let showName = true;
      if (team.restrictions.behavior === 'none' || 
          (team.restrictions.behaviors && !team.restrictions.behaviors.find((x: any) => x === sacb.id))) {
        showName = false;
      }
      
      return {
        id: sacb.id,
        track: true,
        abc: sacb.abc,
        intensity: sacb.intensity ? true : undefined,
        order: sacb.order,
        name: showName ? behavior.name ?? '' : 'Restricted'
      };
    }).filter((x: any) => x !== null);
  }

  /**
   * Build response items with access control
   */
  private static buildResponseItems(behaviors: any[], responseLookup: any[], team: any): any[] {
    if (!behaviors) return [];
    
    return behaviors.map((sacb: any) => {
      const response = responseLookup.find((x: any) => x.id === sacb.id);
      if (!response) return null;
      
      let showName = true;
      if (team.restrictions.behavior === 'none' || 
          (team.restrictions.behaviors && !team.restrictions.behaviors.find((x: any) => x === sacb.id))) {
        showName = false;
      }
      
      return {
        id: sacb.id,
        track: true,
        abc: sacb.abc,
        order: sacb.order,
        name: showName ? response?.name ?? '' : 'Restricted'
      };
    }).filter((x: any) => x !== null);
  }

  /**
   * Build service items with access control
   */
  private static buildServiceItems(services: any[], servicesLookup: any[], studentServices: any[], team: any): any[] {
    if (!services) return [];
    
    return services.map((sacb: any) => {
      const service = servicesLookup.find((x: any) => x.id === sacb.id);
      const serviceConf = studentServices.find((x: any) => x.id === sacb.id);
      if (!service) return null;

      let showName = true;
      if (team.restrictions.service === 'none' || 
          (team.restrictions.services && !team.restrictions.services.find((x: any) => x === sacb.id))) {
        showName = false;
      }
      
      return {
        id: sacb.id,
        order: sacb.order,
        name: showName ? service?.name ?? '' : 'Restricted',
        percentage: serviceConf.goals.trackGoalPercent,
        trackedItems: serviceConf.goals.goalTargets.map((x: any) => x.name) ?? [],
        modifications: service.modifications.map((x: any) => x.name) ?? []
      };
    }).filter((x: any) => x !== null);
  }

  /**
   * Build student summaries with access control
   */
  private static buildStudentSummaries(
    studentConfigs: any[],
    studentPiis: any[],
    userStudentSummaries: any[]
  ): any[] {
    return studentConfigs?.map((studentConfig: any) => {
      const studentPii = studentPiis.find((x: any) => x.studentId === studentConfig.studentId);
      const team = userStudentSummaries.find((x: any) => x.studentId === studentConfig.studentId);
      
      if (!studentPii || !team) {
        return null;
      }
      
      if (!team || team?.restrictions?.devices === 'none') {
        return null;
      }
      
      return {
        studentId: studentConfig.studentId,
        nickname: studentPii.nickname ?? `${studentPii.firstName} ${studentPii.lastName}`,
        abcAvailable: studentConfig.abc && studentConfig.abc.antecedents?.length > 0 && studentConfig.abc.consequences?.length > 0,
        restrictions: {
          info: team?.restrictions?.info ?? 'none',
          data: team?.restrictions?.data ?? 'none',
          schedules: team?.restrictions?.schedules ?? 'none',
          devices: team?.restrictions?.devices ?? 'none',
          team: team?.restrictions?.team ?? 'none',
          comments: team?.restrictions?.comments ?? 'none',
          behavior: team?.restrictions?.behavior ?? 'none',
          behaviors: team?.restrictions?.behaviors,
          abc: team?.restrictions?.abc ?? 'none',
          service: team?.restrictions?.service ?? 'none',
          services: team?.restrictions?.services,
          milestones: team?.restrictions?.milestones ?? 'none',
          reports: team?.restrictions?.reports ?? 'none',
          notifications: team?.restrictions?.notifications ?? 'none',
          reportsOverride: team?.restrictions?.reportsOverride,
          transferLicense: team?.restrictions?.transferLicense,
          documents: team.restrictions.documents ?? 'none'
        },
        behaviors: AppOperations.buildStudentBehaviors(studentConfig.behaviors, studentPii.behaviorLookup, team),
        responses: AppOperations.buildStudentResponses(studentConfig.responses, studentPii.responseLookup, team),
        services: AppOperations.buildStudentServices(studentConfig.services, studentPii.servicesLookup, team)
      };
    }).filter((s: any) => s !== null) ?? [];
  }

  /**
   * Build student behaviors for summary
   */
  private static buildStudentBehaviors(behaviors: any[], behaviorLookup: any[], team: any): any[] {
    if (team.restrictions.behavior === 'none') return [];
    
    return behaviors?.filter((b: any) => !b.isArchived).map((b: any) => {
      const bPii = behaviorLookup.find((x: any) => x.id === b.id);
      if (!bPii) return null;
      
      if (team.restrictions.behavior === 'none' || 
          (team.restrictions.behaviors && !team.restrictions.behaviors.find((x: any) => x === b.id))) {
        return null;
      }
      
      return {
        id: b.id,
        name: bPii.name,
        baseline: b.baseline,
        isDuration: b.isDuration,
        trackAbc: b.trackAbc
      };
    }).filter((b: any) => b !== null) ?? [];
  }

  /**
   * Build student responses for summary
   */
  private static buildStudentResponses(responses: any[], responseLookup: any[], team: any): any[] {
    if (team.restrictions.behavior === 'none') return [];
    
    return responses?.filter((r: any) => !r.isArchived).map((r: any) => {
      const rPii = responseLookup?.find((x: any) => x.id === r.id);
      if (!rPii) return null;
      
      if (team.restrictions.behavior === 'none' || 
          (team.restrictions.behaviors && !team.restrictions.behaviors.find((x: any) => x === r.id))) {
        return null;
      }
      
      if (!r.id) {
        return null;
      }
      
      return {
        id: r.id,
        name: rPii.name,
        baseline: r.baseline,
        isDuration: r.isDuration,
        trackAbc: r.trackAbc
      };
    }).filter((b: any) => b !== null) ?? [];
  }

  /**
   * Build student services for summary
   */
  private static buildStudentServices(services: any[], servicesLookup: any[], team: any): any[] {
    if (team.restrictions.service === 'none') return [];
    
    return services?.filter((s: any) => !s.isArchived).map((s: any) => {
      const sPii = servicesLookup?.find((x: any) => x.id === s.id);
      if (!sPii) return null;
      
      if (team.restrictions.service === 'none' || 
          (team.restrictions.services && !team.restrictions.services.find((x: any) => x === s.id))) {
        return null;
      }
      
      return {
        id: s.id,
        name: sPii.name,
        isDuration: true
      };
    }).filter((b: any) => b !== null) ?? [];
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

export interface UpdateAppRequest {
  appId: string;
  updateData: {
    id?: string;
    name?: string;
    description?: string;
    status?: string;
    configuration?: any;
  };
  userId: string;
  userLicenses: string[];
}

export interface AppDetails {
  id: string;
  name: string;
  description?: string;
  status: string;
  configuration?: any;
  license: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
  deviceCount?: number;
  studentCount?: number;
}

export interface UpdateAppConfigurationRequest {
  appConfig: {
    deviceId?: string;
    license: string;
    name?: string;
    tags?: string[];
    deleted?: boolean;
    reassign?: boolean;
    textAlerts?: boolean;
    timezone?: string;
    studentConfigs?: Array<{
      studentId: string;
      studentName: string;
      behaviors: any[];
      responses: any[];
      services: any[];
      groups?: any[];
      delete?: boolean;
    }>;
  };
  userId: string;
  userLicenses: string[];
}

export interface AppConfigurationResult {
  deviceId: string;
}

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