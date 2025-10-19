import { ValidationResult, ValidationError } from '@mytaptrack/business-logic-core';

/**
 * App validation functions
 */
export class AppValidation {
  
  /**
   * Validate app ID format
   */
  static validateAppId(appId: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (!appId) {
      errors.push({
        field: 'appId',
        message: 'App ID is required',
        code: 'REQUIRED'
      });
    } else if (appId.length < 3) {
      errors.push({
        field: 'appId',
        message: 'App ID is too short',
        code: 'TOO_SHORT'
      });
    } else if (appId.length > 128) {
      errors.push({
        field: 'appId',
        message: 'App ID is too long',
        code: 'TOO_LONG'
      });
    } else if (!/^[a-zA-Z0-9\-_]+$/.test(appId)) {
      errors.push({
        field: 'appId',
        message: 'App ID contains invalid characters',
        code: 'INVALID_FORMAT'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

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
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate app platform
   */
  static validatePlatform(platform?: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validPlatforms = ['ios', 'android', 'web', 'desktop'];
    
    if (platform && !validPlatforms.includes(platform.toLowerCase())) {
      errors.push({
        field: 'platform',
        message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`,
        code: 'INVALID_VALUE'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate app version
   */
  static validateVersion(version?: string): ValidationResult {
    const errors: ValidationError[] = [];
    
    if (version) {
      // Basic semantic version validation (x.y.z)
      if (!/^\d+\.\d+\.\d+/.test(version)) {
        errors.push({
          field: 'version',
          message: 'Invalid version format. Expected format: x.y.z',
          code: 'INVALID_FORMAT'
        });
      } else if (version.length > 20) {
        errors.push({
          field: 'version',
          message: 'Version string is too long',
          code: 'TOO_LONG'
        });
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate app type
   */
  static validateAppType(appType?: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validAppTypes = ['mobile', 'web', 'desktop', 'iot'];
    
    if (appType && !validAppTypes.includes(appType.toLowerCase())) {
      errors.push({
        field: 'appType',
        message: `Invalid app type. Must be one of: ${validAppTypes.join(', ')}`,
        code: 'INVALID_VALUE'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate activity type
   */
  static validateActivityType(activityType: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validActivityTypes = [
      'behavior_recorded',
      'response_recorded', 
      'session_started',
      'session_ended',
      'data_sync',
      'settings_changed',
      'error_occurred'
    ];
    
    if (!activityType) {
      errors.push({
        field: 'activityType',
        message: 'Activity type is required',
        code: 'REQUIRED'
      });
    } else if (!validActivityTypes.includes(activityType)) {
      errors.push({
        field: 'activityType',
        message: `Invalid activity type. Must be one of: ${validActivityTypes.join(', ')}`,
        code: 'INVALID_VALUE'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate app status
   */
  static validateAppStatus(status: string): ValidationResult {
    const errors: ValidationError[] = [];
    const validStatuses = ['active', 'inactive', 'suspended'];
    
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
   * Validate app settings
   */
  static validateAppSettings(settings?: any): ValidationResult {
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
        if (settingsString.length > 10000) {
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
   * Validate complete app registration data
   */
  static validateAppRegistrationData(appData: {
    appId: string;
    deviceId: string;
    studentId: string;
    license: string;
    appType?: string;
    platform?: string;
    version?: string;
    settings?: any;
  }): ValidationResult {
    const allErrors: ValidationError[] = [];
    
    // Validate individual fields
    const appIdValidation = AppValidation.validateAppId(appData.appId);
    const deviceIdValidation = AppValidation.validateDeviceId(appData.deviceId);
    const platformValidation = AppValidation.validatePlatform(appData.platform);
    const versionValidation = AppValidation.validateVersion(appData.version);
    const appTypeValidation = AppValidation.validateAppType(appData.appType);
    const settingsValidation = AppValidation.validateAppSettings(appData.settings);
    
    allErrors.push(...appIdValidation.errors);
    allErrors.push(...deviceIdValidation.errors);
    allErrors.push(...platformValidation.errors);
    allErrors.push(...versionValidation.errors);
    allErrors.push(...appTypeValidation.errors);
    allErrors.push(...settingsValidation.errors);
    
    // Validate required fields that don't have specific validators
    if (!appData.studentId) {
      allErrors.push({
        field: 'studentId',
        message: 'Student ID is required',
        code: 'REQUIRED'
      });
    }
    
    if (!appData.license) {
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
   * Validate app activity data
   */
  static validateAppActivityData(activityData: {
    studentId: string;
    activityType: string;
    data?: any;
    timestamp?: string;
  }): ValidationResult {
    const allErrors: ValidationError[] = [];
    
    // Validate individual fields
    const activityTypeValidation = AppValidation.validateActivityType(activityData.activityType);
    
    allErrors.push(...activityTypeValidation.errors);
    
    // Validate required fields
    if (!activityData.studentId) {
      allErrors.push({
        field: 'studentId',
        message: 'Student ID is required',
        code: 'REQUIRED'
      });
    }
    
    // Validate timestamp if provided
    if (activityData.timestamp) {
      const timestamp = new Date(activityData.timestamp);
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