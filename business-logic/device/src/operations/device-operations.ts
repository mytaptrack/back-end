import { 
  ServiceContext, 
  IBusinessOperations, 
  BusinessLogicError, 
  ValidationError, 
  NotFoundError 
} from '@mytaptrack/business-logic-core';
import * as moment from 'moment-timezone';

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
    const existingDevice = await context.dataAccess.get(deviceKey);
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
    const existingDevice = await context.dataAccess.get(deviceKey);
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
    
    const deviceRecord = await context.dataAccess.get(deviceKey);
    
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
    });

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
    });

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
    const existingDevice = await context.dataAccess.get(deviceKey);
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
   * Update device settings
   */
  static async updateDeviceSettings(
    deviceId: string,
    settings: any,
    context: ServiceContext
  ): Promise<void> {
    const deviceKey = { pk: `D#${deviceId}`, sk: 'P' };
    
    // Check if device exists
    const existingDevice = await context.dataAccess.get(deviceKey);
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