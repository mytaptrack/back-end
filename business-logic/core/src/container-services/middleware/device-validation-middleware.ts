import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';
import { ValidationError } from '../../errors/service-errors';

/**
 * Device data validation middleware
 */
export class DeviceValidationMiddleware {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Create Track 2.0 data validation middleware
   */
  createTrack20Validation() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.validateTrack20Data(req.body);
        next();
      } catch (error) {
        this.serviceContext.logger.error('Track 2.0 validation error', { error, body: req.body });
        res.status(400).json({
          success: false,
          error: (error as Error).message || 'Invalid Track 2.0 data format'
        });
      }
    };
  }

  /**
   * Create device registration validation middleware
   */
  createDeviceRegistrationValidation() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.validateDeviceRegistration(req.body);
        next();
      } catch (error) {
        this.serviceContext.logger.error('Device registration validation error', { error, body: req.body });
        res.status(400).json({
          success: false,
          error: (error as Error).message || 'Invalid device registration data'
        });
      }
    };
  }

  /**
   * Create app data validation middleware
   */
  createAppDataValidation() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.validateAppData(req.body);
        next();
      } catch (error) {
        this.serviceContext.logger.error('App data validation error', { error, body: req.body });
        res.status(400).json({
          success: false,
          error: (error as Error).message || 'Invalid app data format'
        });
      }
    };
  }

  /**
   * Create IoT data validation middleware
   */
  createIoTDataValidation() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.validateIoTData(req.body);
        next();
      } catch (error) {
        this.serviceContext.logger.error('IoT data validation error', { error, body: req.body });
        res.status(400).json({
          success: false,
          error: (error as Error).message || 'Invalid IoT data format'
        });
      }
    };
  }

  /**
   * Create audio data validation middleware
   */
  createAudioDataValidation() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.validateAudioData(req);
        next();
      } catch (error) {
        this.serviceContext.logger.error('Audio data validation error', { error });
        res.status(400).json({
          success: false,
          error: (error as Error).message || 'Invalid audio data format'
        });
      }
    };
  }

  /**
   * Create firmware data validation middleware
   */
  createFirmwareDataValidation() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.validateFirmwareData(req.body);
        next();
      } catch (error) {
        this.serviceContext.logger.error('Firmware data validation error', { error, body: req.body });
        res.status(400).json({
          success: false,
          error: (error as Error).message || 'Invalid firmware data format'
        });
      }
    };
  }

  /**
   * Validate Track 2.0 data
   */
  private validateTrack20Data(data: any): void {
    if (!data) {
      throw new ValidationError('Request body is required');
    }

    // Validate DSN
    if (!data.dsn) {
      throw new ValidationError('DSN is required');
    }

    if (!data.dsn.match(/^M2[A-Z0-9]{10}/)) {
      throw new ValidationError('Invalid DSN format. Must match M2[A-Z0-9]{10} pattern');
    }

    if (data.dsn.length > 16) {
      throw new ValidationError('DSN cannot be longer than 16 characters');
    }

    // Validate identity
    if (!data.identity) {
      throw new ValidationError('Identity is required');
    }

    // Validate press type for track data
    if (data.pressType !== undefined) {
      const validPressTypes = ['click', 'hold'];
      if (!validPressTypes.includes(data.pressType)) {
        throw new ValidationError(`Invalid press type. Must be one of: ${validPressTypes.join(', ')}`);
      }
    }

    // Validate click count
    if (data.clickCount !== undefined) {
      if (!Number.isInteger(data.clickCount) || data.clickCount < 1 || data.clickCount > 10) {
        throw new ValidationError('Click count must be an integer between 1 and 10');
      }
    }

    // Validate remaining life
    if (data.remainingLife !== undefined) {
      if (!Number.isInteger(data.remainingLife) || data.remainingLife < 0 || data.remainingLife > 100) {
        throw new ValidationError('Remaining life must be an integer between 0 and 100');
      }
    }

    // Validate event date
    if (data.eventDate !== undefined) {
      const eventDate = new Date(data.eventDate.trimRight().replace('\u0012', ''));
      if (isNaN(eventDate.getTime())) {
        throw new ValidationError('Invalid event date format');
      }
    }

    // Validate segment for audio data
    if (data.segment !== undefined) {
      if (!Number.isInteger(data.segment) || data.segment < 0) {
        throw new ValidationError('Segment must be a non-negative integer');
      }
    }

    // Validate complete flag for audio data
    if (data.complete !== undefined) {
      if (typeof data.complete !== 'boolean') {
        throw new ValidationError('Complete flag must be a boolean');
      }
    }
  }

  /**
   * Validate device registration data
   */
  private validateDeviceRegistration(data: any): void {
    if (!data) {
      throw new ValidationError('Request body is required');
    }

    // Required fields
    const requiredFields = ['deviceId', 'studentId', 'license', 'deviceType'];
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new ValidationError(`${field} is required`);
      }
    }

    // Validate device ID format
    if (typeof data.deviceId !== 'string' || data.deviceId.length < 3) {
      throw new ValidationError('Device ID must be a string with at least 3 characters');
    }

    // Validate student ID format
    if (typeof data.studentId !== 'string' || data.studentId.length < 3) {
      throw new ValidationError('Student ID must be a string with at least 3 characters');
    }

    // Validate license format
    if (typeof data.license !== 'string' || data.license.length < 3) {
      throw new ValidationError('License must be a string with at least 3 characters');
    }

    // Validate device type
    const validDeviceTypes = ['track20', 'track30', 'mobile', 'tablet', 'iot'];
    if (!validDeviceTypes.includes(data.deviceType)) {
      throw new ValidationError(`Invalid device type. Must be one of: ${validDeviceTypes.join(', ')}`);
    }

    // Validate optional battery level
    if (data.batteryLevel !== undefined) {
      if (!Number.isInteger(data.batteryLevel) || data.batteryLevel < 0 || data.batteryLevel > 100) {
        throw new ValidationError('Battery level must be an integer between 0 and 100');
      }
    }

    // Validate optional firmware version
    if (data.firmwareVersion !== undefined && typeof data.firmwareVersion !== 'string') {
      throw new ValidationError('Firmware version must be a string');
    }

    // Validate optional settings
    if (data.settings !== undefined && typeof data.settings !== 'object') {
      throw new ValidationError('Settings must be an object');
    }
  }

  /**
   * Validate app data
   */
  private validateAppData(data: any): void {
    if (!data) {
      throw new ValidationError('Request body is required');
    }

    // Validate device info
    if (data.device) {
      if (!data.device.id) {
        throw new ValidationError('Device ID is required in device object');
      }
    }

    // Validate tokens array
    if (data.tokens) {
      if (!Array.isArray(data.tokens)) {
        throw new ValidationError('Tokens must be an array');
      }
    }

    // Validate notifications object
    if (data.notifications) {
      if (data.notifications.token && typeof data.notifications.token !== 'string') {
        throw new ValidationError('Notification token must be a string');
      }
      
      if (data.notifications.os) {
        const validOs = ['ios', 'android'];
        if (!validOs.includes(data.notifications.os)) {
          throw new ValidationError(`Invalid OS. Must be one of: ${validOs.join(', ')}`);
        }
      }
    }

    // Validate track data if present
    if (data.behaviorId !== undefined) {
      if (typeof data.behaviorId !== 'string') {
        throw new ValidationError('Behavior ID must be a string');
      }
    }

    if (data.intensity !== undefined) {
      if (!Number.isInteger(data.intensity) || data.intensity < 1 || data.intensity > 10) {
        throw new ValidationError('Intensity must be an integer between 1 and 10');
      }
    }
  }

  /**
   * Validate IoT data
   */
  private validateIoTData(data: any): void {
    if (!data) {
      throw new ValidationError('Request body is required');
    }

    // Validate message type
    if (data.messageType && typeof data.messageType !== 'string') {
      throw new ValidationError('Message type must be a string');
    }

    // Validate payload
    if (data.payload && typeof data.payload !== 'object') {
      throw new ValidationError('Payload must be an object');
    }

    // Validate device info for IoT registration
    if (data.thingName && typeof data.thingName !== 'string') {
      throw new ValidationError('Thing name must be a string');
    }

    if (data.thingType && typeof data.thingType !== 'string') {
      throw new ValidationError('Thing type must be a string');
    }
  }

  /**
   * Validate audio data
   */
  private validateAudioData(req: Request): void {
    // Validate DSN header for audio data
    if (!req.headers.dsn) {
      throw new ValidationError('DSN header is required for audio data');
    }

    const dsn = req.headers.dsn as string;
    if (!dsn.match(/^M2[A-Z0-9]{10}/)) {
      throw new ValidationError('Invalid DSN format in header');
    }

    // Validate content type for audio
    const contentType = req.headers['content-type'];
    if (contentType && !contentType.includes('application/octet-stream') && !contentType.includes('audio/')) {
      throw new ValidationError('Invalid content type for audio data');
    }

    // Validate content length
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength === 0) {
      throw new ValidationError('Audio data cannot be empty');
    }

    if (contentLength > 10 * 1024 * 1024) { // 10MB limit
      throw new ValidationError('Audio data too large (max 10MB)');
    }
  }

  /**
   * Validate firmware data
   */
  private validateFirmwareData(data: any): void {
    if (!data) {
      throw new ValidationError('Request body is required');
    }

    // Validate DSN
    if (!data.dsn) {
      throw new ValidationError('DSN is required');
    }

    if (!data.dsn.match(/^M2[A-Z0-9]{10}/)) {
      throw new ValidationError('Invalid DSN format');
    }

    // Validate identity
    if (!data.identity) {
      throw new ValidationError('Identity is required');
    }

    // Validate firmware info
    if (data.firmware) {
      if (!data.firmware.lastUpdate) {
        throw new ValidationError('Firmware last update is required');
      }

      const lastUpdate = new Date(data.firmware.lastUpdate);
      if (isNaN(lastUpdate.getTime())) {
        throw new ValidationError('Invalid firmware last update date');
      }
    }
  }
}