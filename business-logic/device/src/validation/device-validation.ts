import { ValidationResult, ValidationError } from '@mytaptrack/business-logic-core';

/**
 * Device validation functions
 */
export class DeviceValidation {
  
  /**
   * Validate device ID format
   */
  static validateDeviceId(deviceId: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!deviceId) {
      errors.push({
        field: 'deviceId',
        message: 'Device ID is required',
        code: 'REQUIRED'
      });
    } else if (deviceId.length < 3) {
      errors.push({
        field: 'deviceId',
        message: 'Device ID is too short',
        code: 'TOO_SHORT'
      });
    } else if (deviceId.length > 128) {
      errors.push({
        field: 'deviceId',
        message: 'Device ID is too long',
        code: 'TOO_LONG'
      });
    } else if (!/^[a-zA-Z0-9\-_:]+$/.test(deviceId)) {
      errors.push({
        field: 'deviceId',
        message: 'Device ID contains invalid characters',
        code: 'INVALID_FORMAT'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate device type
   */
  static validateDeviceType(deviceType: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validDeviceTypes = [
      'wearable',
      'sensor',
      'beacon',
      'mobile',
      'tablet',
      'iot_device',
      'tracking_device'
    ];
    
    if (!deviceType) {
      errors.push({
        field: 'deviceType',
        message: 'Device type is required',
        code: 'REQUIRED'
      });
    } else if (!validDeviceTypes.includes(deviceType.toLowerCase())) {
      errors.push({
        field: 'deviceType',
        message: `Invalid device type. Must be one of: ${validDeviceTypes.join(', ')}`,
        code: 'INVALID_VALUE'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate manufacturer name
   */
  static validateManufacturer(manufacturer?: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (manufacturer) {
      if (manufacturer.length > 100) {
        errors.push({
          field: 'manufacturer',
          message: 'Manufacturer name is too long',
          code: 'TOO_LONG'
        });
      } else if (manufacturer.length < 2) {
        errors.push({
          field: 'manufacturer',
          message: 'Manufacturer name is too short',
          code: 'TOO_SHORT'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate device model
   */
  static validateModel(model?: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (model) {
      if (model.length > 100) {
        errors.push({
          field: 'model',
          message: 'Model name is too long',
          code: 'TOO_LONG'
        });
      } else if (model.length < 1) {
        errors.push({
          field: 'model',
          message: 'Model name cannot be empty',
          code: 'EMPTY'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate serial number
   */
  static validateSerialNumber(serialNumber?: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (serialNumber) {
      if (serialNumber.length > 50) {
        errors.push({
          field: 'serialNumber',
          message: 'Serial number is too long',
          code: 'TOO_LONG'
        });
      } else if (serialNumber.length < 3) {
        errors.push({
          field: 'serialNumber',
          message: 'Serial number is too short',
          code: 'TOO_SHORT'
        });
      } else if (!/^[a-zA-Z0-9\-_]+$/.test(serialNumber)) {
        errors.push({
          field: 'serialNumber',
          message: 'Serial number contains invalid characters',
          code: 'INVALID_FORMAT'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate firmware version
   */
  static validateFirmwareVersion(firmwareVersion?: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (firmwareVersion) {
      if (firmwareVersion.length > 20) {
        errors.push({
          field: 'firmwareVersion',
          message: 'Firmware version is too long',
          code: 'TOO_LONG'
        });
      } else if (!/^\d+\.\d+/.test(firmwareVersion)) {
        errors.push({
          field: 'firmwareVersion',
          message: 'Invalid firmware version format. Expected format: x.y or x.y.z',
          code: 'INVALID_FORMAT'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate battery level
   */
  static validateBatteryLevel(batteryLevel?: number): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (batteryLevel !== undefined) {
      if (typeof batteryLevel !== 'number') {
        errors.push({
          field: 'batteryLevel',
          message: 'Battery level must be a number',
          code: 'INVALID_TYPE'
        });
      } else if (batteryLevel < 0 || batteryLevel > 100) {
        errors.push({
          field: 'batteryLevel',
          message: 'Battery level must be between 0 and 100',
          code: 'OUT_OF_RANGE'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate device status
   */
  static validateDeviceStatus(status: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validStatuses = ['active', 'inactive', 'offline', 'maintenance'];
    
    if (!status) {
      errors.push({
        field: 'status',
        message: 'Status is required',
        code: 'REQUIRED'
      });
    } else if (!validStatuses.includes(status)) {
      errors.push({
        field: 'status',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        code: 'INVALID_VALUE'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate device data type
   */
  static validateDataType(dataType: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validDataTypes = [
      'sensor_reading',
      'location_update',
      'battery_status',
      'heartbeat',
      'behavior_event',
      'system_status',
      'error_report'
    ];
    
    if (!dataType) {
      errors.push({
        field: 'dataType',
        message: 'Data type is required',
        code: 'REQUIRED'
      });
    } else if (!validDataTypes.includes(dataType)) {
      errors.push({
        field: 'dataType',
        message: `Invalid data type. Must be one of: ${validDataTypes.join(', ')}`,
        code: 'INVALID_VALUE'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate device settings
   */
  static validateDeviceSettings(settings?: any): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (settings) {
      if (typeof settings !== 'object') {
        errors.push({
          field: 'settings',
          message: 'Settings must be an object',
          code: 'INVALID_TYPE'
        });
      } else {
        // Check for reasonable size limit
        const settingsString = JSON.stringify(settings);
        if (settingsString.length > 5000) {
          errors.push({
            field: 'settings',
            message: 'Settings object is too large',
            code: 'TOO_LARGE'
          });
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate complete device registration data
   */
  static validateDeviceRegistrationData(deviceData: {
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
  }): ValidationResult {
    const allErrors: ValidationError[] = [];
    
    // Validate individual fields
    const deviceIdValidation = DeviceValidation.validateDeviceId(deviceData.deviceId);
    const deviceTypeValidation = DeviceValidation.validateDeviceType(deviceData.deviceType);
    const manufacturerValidation = DeviceValidation.validateManufacturer(deviceData.manufacturer);
    const modelValidation = DeviceValidation.validateModel(deviceData.model);
    const serialNumberValidation = DeviceValidation.validateSerialNumber(deviceData.serialNumber);
    const firmwareVersionValidation = DeviceValidation.validateFirmwareVersion(deviceData.firmwareVersion);
    const batteryLevelValidation = DeviceValidation.validateBatteryLevel(deviceData.batteryLevel);
    const settingsValidation = DeviceValidation.validateDeviceSettings(deviceData.settings);
    
    allErrors.push(...deviceIdValidation.errors);
    allErrors.push(...deviceTypeValidation.errors);
    allErrors.push(...manufacturerValidation.errors);
    allErrors.push(...modelValidation.errors);
    allErrors.push(...serialNumberValidation.errors);
    allErrors.push(...firmwareVersionValidation.errors);
    allErrors.push(...batteryLevelValidation.errors);
    allErrors.push(...settingsValidation.errors);
    
    // Validate required fields that don't have specific validators
    if (!deviceData.studentId) {
      allErrors.push({
        field: 'studentId',
        message: 'Student ID is required',
        code: 'REQUIRED'
      });
    }
    
    if (!deviceData.license) {
      allErrors.push({
        field: 'license',
        message: 'License is required',
        code: 'REQUIRED'
      });
    }
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }

  /**
   * Validate device data input
   */
  static validateDeviceDataInput(dataInput: {
    studentId: string;
    dataType: string;
    data: any;
    timestamp?: string;
  }): ValidationResult {
    const allErrors: ValidationError[] = [];
    
    // Validate individual fields
    const dataTypeValidation = DeviceValidation.validateDataType(dataInput.dataType);
    
    allErrors.push(...dataTypeValidation.errors);
    
    // Validate required fields
    if (!dataInput.studentId) {
      allErrors.push({
        field: 'studentId',
        message: 'Student ID is required',
        code: 'REQUIRED'
      });
    }
    
    if (dataInput.data === undefined || dataInput.data === null) {
      allErrors.push({
        field: 'data',
        message: 'Data is required',
        code: 'REQUIRED'
      });
    }
    
    // Validate timestamp if provided
    if (dataInput.timestamp) {
      const timestamp = new Date(dataInput.timestamp);
      if (isNaN(timestamp.getTime())) {
        allErrors.push({
          field: 'timestamp',
          message: 'Invalid timestamp format',
          code: 'INVALID_FORMAT'
        });
      }
    }
    
    return {
      valid: allErrors.length === 0,
      errors: allErrors
    };
  }
}