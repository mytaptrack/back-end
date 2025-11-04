import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';
import moment from 'moment-timezone';

/**
 * Device-specific business operations
 */
export class DeviceOperations implements IBusinessOperations {
  
  /**
   * Register a new device
   */
  static async registerDevice(
    deviceData: RegisterDeviceInput,
    context: ServiceContext
  ): Promise<DeviceRegistration> {
    // Validate input
    const validation = DeviceOperations.validateRegisterDeviceInput(deviceData);
    if (!validation.valid) {
      throw new ValidationError('Invalid device data', context.config.correlationId, { errors: validation.errors });
    }

    const deviceKey = { pk: `D#${deviceData.deviceId}`, sk: 'P' };

    // Check if device already exists
    const existingDevice = await context.dataAccess.get(deviceKey);
    if (existingDevice) {
      throw new BusinessLogicError('Device already registered', context.config.correlationId, { deviceId: deviceData.deviceId });
    }

    const now = moment().toISOString();
    
    // Create device registration record
    const deviceRegistration: any = {
      ...deviceKey,
      pksk: `${deviceKey.pk}#${deviceKey.sk}`,
      deviceId: deviceData.deviceId,
      studentId: deviceData.studentId,
      license: deviceData.license,
      lpk: `${deviceData.license}#D`,
      lsk: `P#${deviceData.deviceId}`,
      deviceType: deviceData.deviceType,
      manufacturer: deviceData.manufacturer,
      model: deviceData.model,
      serialNumber: deviceData.serialNumber,
      firmwareVersion: deviceData.firmwareVersion,
      registeredAt: now,
      lastSeen: now,
      status: 'active',
      batteryLevel: deviceData.batteryLevel || 100,
      settings: deviceData.settings || {},
      version: 1
    };

    // Save device registration
    await context.dataAccess.put(deviceRegistration);

    // Publish device registered event
    await context.messageBroker.publish('device.registered', {
      deviceId: deviceData.deviceId,
      studentId: deviceData.studentId,
      license: deviceData.license,
      deviceType: deviceData.deviceType,
      timestamp: now
    });

    context.logger.info('Device registered successfully', { 
      deviceId: deviceData.deviceId, 
      studentId: deviceData.studentId,
      deviceType: deviceData.deviceType 
    });

    return {
      deviceId: deviceData.deviceId,
      studentId: deviceData.studentId,
      license: deviceData.license,
      deviceType: deviceData.deviceType,
      status: 'active',
      registeredAt: now
    };
  }

  /**
   * Update device status
   */
  static async updateDeviceStatus(
    deviceId: string,
    status: DeviceStatus,
    context: ServiceContext
  ): Promise<void> {
    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    
    // Check if device exists
    const existingDevice = await context.dataAccess.get(deviceKey) as any;
    if (!existingDevice) {
      throw new NotFoundError('Device not found', context.config.correlationId, { deviceId });
    }

    const now = moment().toISOString();

    // Update device status
    await context.dataAccess.update({
      key: deviceKey,
      updateExpression: 'SET #status = :status, lastSeen = :lastSeen',
      attributeNames: { '#status': 'status' },
      attributeValues: { 
        ':status': status,
        ':lastSeen': now
      }
    });

    // Publish device status updated event
    await context.messageBroker.publish('device.status.updated', {
      deviceId,
      status,
      timestamp: now
    });

    context.logger.info('Device status updated', { deviceId, status });
  }

  /**
   * Update device battery level
   */
  static async updateBatteryLevel(
    deviceId: string,
    batteryLevel: number,
    context: ServiceContext
  ): Promise<void> {
    // Validate battery level
    if (batteryLevel < 0 || batteryLevel > 100) {
      throw new ValidationError('Invalid battery level', context.config.correlationId, { batteryLevel });
    }

    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    
    // Check if device exists
    const existingDevice = await context.dataAccess.get(deviceKey) as any;
    if (!existingDevice) {
      throw new NotFoundError('Device not found', context.config.correlationId, { deviceId });
    }

    const now = moment().toISOString();

    // Update battery level
    await context.dataAccess.update({
      key: deviceKey,
      updateExpression: 'SET batteryLevel = :batteryLevel, lastSeen = :lastSeen',
      attributeValues: { 
        ':batteryLevel': batteryLevel,
        ':lastSeen': now
      }
    });

    // Publish battery level updated event
    await context.messageBroker.publish('device.battery.updated', {
      deviceId,
      batteryLevel,
      timestamp: now
    });

    // Check for low battery warning
    if (batteryLevel <= 20) {
      await context.messageBroker.publish('device.battery.low', {
        deviceId,
        studentId: existingDevice.studentId,
        batteryLevel,
        timestamp: now
      });
    }

    context.logger.info('Device battery level updated', { deviceId, batteryLevel });
  }

  /**
   * Record device data
   */
  static async recordDeviceData(
    deviceId: string,
    dataInput: DeviceDataInput,
    context: ServiceContext
  ): Promise<void> {
    // Validate input
    const validation = DeviceOperations.validateDeviceDataInput(dataInput);
    if (!validation.valid) {
      throw new ValidationError('Invalid device data', context.config.correlationId, { errors: validation.errors });
    }

    const now = moment().toISOString();
    const dataKey = { 
      pk: `DDD#${deviceId}`, 
      sk: `T#${dataInput.timestamp || now}#${Date.now()}` 
    };

    // Create device data record
    const dataRecord: any = {
      ...dataKey,
      pksk: `${dataKey.pk}#${dataKey.sk}`,
      deviceId,
      studentId: dataInput.studentId,
      dataType: dataInput.dataType,
      data: dataInput.data,
      timestamp: dataInput.timestamp || now,
      version: 1
    };

    // Save device data record
    await context.dataAccess.put(dataRecord);

    // Update device last seen time
    await DeviceOperations.updateLastSeen(deviceId, context);

    // Publish device data recorded event
    await context.messageBroker.publish('device.data.recorded', {
      deviceId,
      studentId: dataInput.studentId,
      dataType: dataInput.dataType,
      timestamp: dataInput.timestamp || now
    });

    context.logger.info('Device data recorded', { 
      deviceId, 
      dataType: dataInput.dataType,
      studentId: dataInput.studentId 
    });
  }

  /**
   * Get device registration
   */
  static async getDeviceRegistration(
    deviceId: string,
    context: ServiceContext
  ): Promise<DeviceRegistration | null> {
    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    
    const deviceRecord = await context.dataAccess.get(deviceKey) as any;
    
    if (!deviceRecord) {
      return null;
    }

    return {
      deviceId: deviceRecord.deviceId,
      studentId: deviceRecord.studentId,
      license: deviceRecord.license,
      deviceType: deviceRecord.deviceType,
      status: deviceRecord.status,
      registeredAt: deviceRecord.registeredAt,
      lastSeen: deviceRecord.lastSeen,
      manufacturer: deviceRecord.manufacturer,
      model: deviceRecord.model,
      serialNumber: deviceRecord.serialNumber,
      firmwareVersion: deviceRecord.firmwareVersion,
      batteryLevel: deviceRecord.batteryLevel,
      settings: deviceRecord.settings
    };
  }

  /**
   * Get devices by student
   */
  static async getDevicesByStudent(
    studentId: string,
    context: ServiceContext
  ): Promise<DeviceRegistration[]> {
    const devices = await context.dataAccess.query({
      keyExpression: 'studentId = :studentId',
      attributeValues: { ':studentId': studentId },
      indexName: 'student-index'
    }) as any[];

    return devices.map((device: any) => ({
      deviceId: device.deviceId,
      studentId: device.studentId,
      license: device.license,
      deviceType: device.deviceType,
      status: device.status,
      registeredAt: device.registeredAt,
      lastSeen: device.lastSeen,
      manufacturer: device.manufacturer,
      model: device.model,
      serialNumber: device.serialNumber,
      firmwareVersion: device.firmwareVersion,
      batteryLevel: device.batteryLevel,
      settings: device.settings
    }));
  }

  /**
   * Get devices by license
   */
  static async getDevicesByLicense(
    license: string,
    context: ServiceContext
  ): Promise<DeviceRegistration[]> {
    const devices = await context.dataAccess.query({
      keyExpression: 'lpk = :lpk and begins_with(lsk, :lsk)',
      attributeValues: { 
        ':lpk': `${license}#D`,
        ':lsk': 'P#'
      },
      indexName: 'license-index'
    }) as any[];

    return devices.map((device: any) => ({
      deviceId: device.deviceId,
      studentId: device.studentId,
      license: device.license,
      deviceType: device.deviceType,
      status: device.status,
      registeredAt: device.registeredAt,
      lastSeen: device.lastSeen,
      manufacturer: device.manufacturer,
      model: device.model,
      serialNumber: device.serialNumber,
      firmwareVersion: device.firmwareVersion,
      batteryLevel: device.batteryLevel,
      settings: device.settings
    }));
  }

  /**
   * Unregister device
   */
  static async unregisterDevice(
    deviceId: string,
    context: ServiceContext
  ): Promise<void> {
    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    
    // Check if device exists
    const existingDevice = await context.dataAccess.get(deviceKey) as any;
    if (!existingDevice) {
      throw new NotFoundError('Device not found', context.config.correlationId, { deviceId });
    }

    // Delete device registration
    await context.dataAccess.delete(deviceKey);

    // Publish device unregistered event
    await context.messageBroker.publish('device.unregistered', {
      deviceId,
      studentId: existingDevice.studentId,
      timestamp: moment().toISOString()
    });

    context.logger.info('Device unregistered', { deviceId });
  }

  /**
   * Process tracking data from device (handles the complex business logic from dataPut Lambda)
   */
  static async processTrackingData(
    trackingData: ProcessTrackingDataInput,
    context: ServiceContext
  ): Promise<void> {
    // Validate and normalize input
    const validation = DeviceOperations.validateTrackingDataInput(trackingData);
    if (!validation.valid) {
      throw new ValidationError('Invalid tracking data', context.config.correlationId, { errors: validation.errors });
    }

    let { dsn, identity, pressType, clickCount, eventDate, currentTime, remainingLife, isDebug } = trackingData;

    // Debug mode adjustments
    if (isDebug && dsn === '') {
      dsn = 'M200000000000001';
    }
    if (isDebug) {
      dsn = dsn.padEnd(16, '0');
    }

    // Normalize DSN length
    if (dsn.length > 16) {
      dsn = dsn.slice(0, 16);
    }

    context.logger.info('Processing tracking data', { dsn, clickCount, pressType });

    // Parse and validate event date
    let parsedEventDate = new Date(eventDate.trimRight().replace('\u0012', ''));
    if (isNaN(parsedEventDate.getTime())) {
      throw new ValidationError('Invalid event date', context.config.correlationId, { eventDate });
    }

    // Handle epoch time adjustment for old dates
    if (parsedEventDate.getTime() < 31536000000 /*1971*/) {
      const diffEpoc = moment(parsedEventDate).diff(moment(currentTime), 'milliseconds');
      parsedEventDate = new Date(new Date().getTime() - diffEpoc);
    }

    // Get device information (this would typically use a GraphQL query or direct data access)
    const deviceInfo = await DeviceOperations.getTrackingDeviceInfo(dsn, identity, context);
    
    if (!deviceInfo) {
      throw new NotFoundError('Device not found', context.config.correlationId, { dsn });
    }

    // Handle device validation
    if (!deviceInfo.validated) {
      await DeviceOperations.setDeviceValidated(dsn, context);
      context.logger.info('Device validated', { dsn });
      return;
    }

    // Find the button event configuration
    const buttonEvent = deviceInfo.events.find((x: any) => x.presses === clickCount);
    if (!buttonEvent) {
      throw new BusinessLogicError(
        `Invalid button event for device ${dsn} with click count ${clickCount}`, 
        context.config.correlationId, 
        { dsn, clickCount }
      );
    }

    // Create tracking event data
    const trackingEventData = {
      serialNumber: dsn,
      remainingLife,
      clickType: 'clickCount', // IoTClickType.clickCount
      clickCount,
      studentId: deviceInfo.studentId,
      behaviorId: buttonEvent.eventId,
      dateEpoc: parsedEventDate.getTime(),
      notStopped: buttonEvent.notStopped,
      isDuration: buttonEvent.isDuration,
      source: {
        device: 'Track 2.0',
        rater: dsn
      },
      remove: false,
      redoDurations: true
    };

    // Send tracking event through message broker
    await context.messageBroker.publish('device.tracking.event', {
      type: 'trackEvent',
      data: trackingEventData,
      timestamp: moment().toISOString()
    });

    context.logger.info('Tracking event processed successfully', { 
      dsn, 
      clickCount, 
      studentId: deviceInfo.studentId,
      behaviorId: buttonEvent.eventId 
    });
  }

  /**
   * Get tracking device information (replaces GraphQL query)
   */
  private static async getTrackingDeviceInfo(
    dsn: string,
    identity: string,
    context: ServiceContext
  ): Promise<any> {
    // This would typically query the device configuration
    // For now, we'll implement a basic lookup
    const deviceKey = { pk: `TD#${dsn}`, sk: 'P' }; // Tracking Device
    
    const deviceInfo = await context.dataAccess.get(deviceKey) as any;
    
    if (!deviceInfo) {
      return null;
    }

    return {
      deviceName: deviceInfo.deviceName,
      dsn: deviceInfo.dsn,
      events: deviceInfo.events || [],
      license: deviceInfo.license,
      studentId: deviceInfo.studentId,
      validated: deviceInfo.validated || false,
      timezone: deviceInfo.timezone
    };
  }

  /**
   * Set device as validated
   */
  private static async setDeviceValidated(
    dsn: string,
    context: ServiceContext
  ): Promise<void> {
    const deviceKey = { pk: `TD#${dsn}`, sk: 'P' };
    
    await context.dataAccess.update({
      key: deviceKey,
      updateExpression: 'SET validated = :validated',
      attributeValues: { ':validated': true }
    });

    await context.messageBroker.publish('device.validated', {
      dsn,
      timestamp: moment().toISOString()
    });

    context.logger.info('Device set as validated', { dsn });
  }

  /**
   * Generate QR code for device app token
   */
  static async generateDeviceQRCode(
    deviceId: string,
    studentId: string,
    context: ServiceContext
  ): Promise<DeviceQRCodeResult> {
    // Validate access permissions - check if user has access to the student
    const hasAccess = await DeviceOperations.validateDeviceAccess(deviceId, studentId, context);
    if (!hasAccess) {
      throw new BusinessLogicError('Access denied', context.config.correlationId, { deviceId, studentId });
    }

    // Get student information to retrieve license
    const studentKey = { pk: `S#${studentId}`, sk: 'P' };
    const student = await context.dataAccess.get(studentKey) as any;
    if (!student) {
      throw new NotFoundError('Student not found', context.config.correlationId, { studentId });
    }

    // Generate app token with 2-day expiration
    const expiration = moment().add(2, 'days').toDate().getTime();
    const appToken = await DeviceOperations.generateAppToken(
      student.license,
      deviceId,
      expiration,
      context
    );

    context.logger.info('Device QR code generated', { deviceId, studentId });

    return {
      appId: deviceId,
      token: appToken.token,
      qrExpiration: expiration
    };
  }

  /**
   * Generate app token for device
   */
  private static async generateAppToken(
    license: string,
    deviceId: string,
    expiration: number,
    context: ServiceContext
  ): Promise<{ token: string }> {
    // This would typically generate a JWT token or call an external service
    // For now, we'll create a simple token structure
    const tokenData = {
      license,
      deviceId,
      expiration,
      timestamp: moment().toISOString()
    };

    // In a real implementation, this would be a proper JWT token
    // For now, we'll use a base64 encoded token
    const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

    // Store token for validation if needed
    const tokenKey = { pk: `AT#${deviceId}`, sk: `T#${expiration}` };
    await context.dataAccess.put({
      ...tokenKey,
      pksk: `${tokenKey.pk}#${tokenKey.sk}`,
      license,
      deviceId,
      token,
      expiration,
      createdAt: moment().toISOString(),
      version: 1
    });

    return { token };
  }

  /**
   * Validate device access for user
   */
  private static async validateDeviceAccess(
    deviceId: string,
    studentId: string,
    context: ServiceContext
  ): Promise<boolean> {
    // Check if device exists and belongs to the student
    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    const device = await context.dataAccess.get(deviceKey) as any;
    
    if (!device) {
      return false;
    }

    // Verify device belongs to the student
    if (device.studentId !== studentId) {
      return false;
    }

    // Additional access validation could be added here
    // (e.g., team member permissions, license admin permissions)
    
    return true;
  }

  /**
   * Get device track term status
   */
  static async getDeviceTrackTermStatus(
    deviceId: string,
    studentId: string,
    context: ServiceContext
  ): Promise<DeviceTrackTermStatus | null> {
    // Check if user has access to the student
    const hasAccess = await DeviceOperations.validateDeviceAccess(deviceId, studentId, context);
    if (!hasAccess) {
      throw new BusinessLogicError('Access denied', context.config.correlationId, { deviceId, studentId });
    }

    // Get device global information
    const deviceKey = { pk: `DG#${deviceId}`, sk: 'P' }; // Device Global
    const deviceInfo = await context.dataAccess.get(deviceKey) as any;

    if (!deviceInfo) {
      return null;
    }

    // Find the command for the specific student
    const studentCommand = deviceInfo.commands?.find((cmd: any) => cmd.studentId === studentId);

    context.logger.info('Retrieved device track term status', { deviceId, studentId });

    return {
      termSet: deviceInfo.termSetup || false,
      term: studentCommand?.term || ''
    };
  }

  /**
   * Update device settings
   */
  static async updateDeviceSettings(
    deviceId: string,
    settings: any,
    context: ServiceContext
  ): Promise<void> {
    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    
    // Check if device exists
    const existingDevice = await context.dataAccess.get(deviceKey) as any;
    if (!existingDevice) {
      throw new NotFoundError('Device not found', context.config.correlationId, { deviceId });
    }

    // Update device settings
    await context.dataAccess.update({
      key: deviceKey,
      updateExpression: 'SET settings = :settings, lastSeen = :lastSeen',
      attributeValues: { 
        ':settings': settings,
        ':lastSeen': moment().toISOString()
      }
    });

    // Publish device settings updated event
    await context.messageBroker.publish('device.settings.updated', {
      deviceId,
      timestamp: moment().toISOString()
    });

    context.logger.info('Device settings updated', { deviceId });
  }

  /**
   * Update last seen time
   */
  private static async updateLastSeen(
    deviceId: string,
    context: ServiceContext
  ): Promise<void> {
    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    
    await context.dataAccess.update({
      key: deviceKey,
      updateExpression: 'SET lastSeen = :lastSeen',
      attributeValues: { ':lastSeen': moment().toISOString() }
    });
  }

  /**
   * Validate register device input
   */
  private static validateRegisterDeviceInput(input: RegisterDeviceInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.deviceId) {
      errors.push({ field: 'deviceId', message: 'Device ID is required', code: 'REQUIRED' });
    }

    if (!input.studentId) {
      errors.push({ field: 'studentId', message: 'Student ID is required', code: 'REQUIRED' });
    }

    if (!input.license) {
      errors.push({ field: 'license', message: 'License is required', code: 'REQUIRED' });
    }

    if (!input.deviceType) {
      errors.push({ field: 'deviceType', message: 'Device type is required', code: 'REQUIRED' });
    }

    if (input.batteryLevel !== undefined && (input.batteryLevel < 0 || input.batteryLevel > 100)) {
      errors.push({ field: 'batteryLevel', message: 'Battery level must be between 0 and 100', code: 'OUT_OF_RANGE' });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate device data input
   */
  private static validateDeviceDataInput(input: DeviceDataInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.studentId) {
      errors.push({ field: 'studentId', message: 'Student ID is required', code: 'REQUIRED' });
    }

    if (!input.dataType) {
      errors.push({ field: 'dataType', message: 'Data type is required', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate tracking data input
   */
  private static validateTrackingDataInput(input: ProcessTrackingDataInput): { valid: boolean; errors: any[] } {
    const errors: any[] = [];

    if (!input.dsn || !input.dsn.match(/M2[A-Z0-9]{10}/)) {
      errors.push({ field: 'dsn', message: 'Valid DSN is required', code: 'INVALID_DSN' });
    }

    if (!input.identity) {
      errors.push({ field: 'identity', message: 'Identity is required', code: 'REQUIRED' });
    }

    if (!input.pressType) {
      errors.push({ field: 'pressType', message: 'Press type is required', code: 'REQUIRED' });
    }

    if (!input.clickCount) {
      errors.push({ field: 'clickCount', message: 'Click count is required', code: 'REQUIRED' });
    }

    if (!input.eventDate) {
      errors.push({ field: 'eventDate', message: 'Event date is required', code: 'REQUIRED' });
    }

    return { valid: errors.length === 0, errors };
  }
}

// Types
export type DeviceStatus = 'active' | 'inactive' | 'offline' | 'maintenance';

export interface RegisterDeviceInput {
  deviceId: string;
  studentId: string;
  license: string;
  deviceType: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  batteryLevel?: number;
  settings?: any;
}

export interface DeviceDataInput {
  studentId: string;
  dataType: string;
  data: any;
  timestamp?: string;
}

export interface DeviceRegistration {
  deviceId: string;
  studentId: string;
  license: string;
  deviceType: string;
  status: DeviceStatus;
  registeredAt: string;
  lastSeen?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  batteryLevel?: number;
  settings?: any;
}

export interface ProcessTrackingDataInput {
  dsn: string;
  identity: string;
  pressType: string;
  clickCount: number;
  eventDate: string;
  currentTime?: string;
  remainingLife?: number;
  isDebug?: boolean;
}

export interface DeviceQRCodeResult {
  appId: string;
  token: string;
  qrExpiration: number;
}

export interface DeviceTrackTermStatus {
  termSet: boolean;
  term: string;
}