import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';

/**
 * Device response formatting middleware
 */
export class DeviceResponseMiddleware {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Create Track 2.0 response formatter
   */
  createTrack20ResponseFormatter() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to format Track 2.0 responses
      res.json = (data: any) => {
        const formattedResponse = this.formatTrack20Response(data, req);
        return originalJson(formattedResponse);
      };
      
      next();
    };
  }

  /**
   * Create IoT response formatter
   */
  createIoTResponseFormatter() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to format IoT responses
      res.json = (data: any) => {
        const formattedResponse = this.formatIoTResponse(data, req);
        return originalJson(formattedResponse);
      };
      
      next();
    };
  }

  /**
   * Create app response formatter
   */
  createAppResponseFormatter() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to format app responses
      res.json = (data: any) => {
        const formattedResponse = this.formatAppResponse(data, req);
        return originalJson(formattedResponse);
      };
      
      next();
    };
  }

  /**
   * Create firmware response formatter
   */
  createFirmwareResponseFormatter() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to format firmware responses
      res.json = (data: any) => {
        const formattedResponse = this.formatFirmwareResponse(data, req);
        return originalJson(formattedResponse);
      };
      
      next();
    };
  }

  /**
   * Create audio response formatter
   */
  createAudioResponseFormatter() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Store original json method
      const originalJson = res.json.bind(res);
      
      // Override json method to format audio responses
      res.json = (data: any) => {
        const formattedResponse = this.formatAudioResponse(data, req);
        return originalJson(formattedResponse);
      };
      
      next();
    };
  }

  /**
   * Create device error formatter
   */
  createDeviceErrorFormatter() {
    return (error: any, req: Request, res: Response, next: NextFunction) => {
      // Format error response based on device type
      const deviceType = this.getDeviceType(req);
      const formattedError = this.formatDeviceError(error, deviceType, req);
      
      // Set appropriate status code
      const statusCode = this.getErrorStatusCode(error);
      
      res.status(statusCode).json(formattedError);
    };
  }

  /**
   * Format Track 2.0 response
   */
  private formatTrack20Response(data: any, req: Request): any {
    // Track 2.0 devices expect simple success/failure responses
    if (data && typeof data === 'object') {
      // Standard Track 2.0 response format
      const response: any = {
        success: data.success !== false
      };

      // Add URL for firmware updates or audio uploads
      if (data.url) {
        response.url = data.url;
      }

      // Add certificate for device registration
      if (data.certificate) {
        response.certificate = data.certificate;
      }

      // Add identity for device registration
      if (data.identity) {
        response.identity = data.identity;
      }

      // Add any additional data
      if (data.data) {
        Object.assign(response, data.data);
      }

      return response;
    }

    return { success: true };
  }

  /**
   * Format IoT response
   */
  private formatIoTResponse(data: any, req: Request): any {
    // IoT devices expect structured responses with metadata
    const response: any = {
      success: data.success !== false,
      timestamp: new Date().toISOString()
    };

    // Add correlation ID for tracking
    if (req.headers['x-correlation-id']) {
      response.correlationId = req.headers['x-correlation-id'];
    }

    // Add device-specific data
    if (data.data) {
      response.data = data.data;
    }

    // Add message for status updates
    if (data.message) {
      response.message = data.message;
    }

    // Add registration info for IoT registration
    if (data.thingName) {
      response.thingName = data.thingName;
    }

    if (data.policyName) {
      response.policyName = data.policyName;
    }

    return response;
  }

  /**
   * Format app response
   */
  private formatAppResponse(data: any, req: Request): any {
    // Mobile apps expect rich response data
    const response: any = {
      success: data.success !== false
    };

    // Add app-specific data
    if (data.targets) {
      response.targets = data.targets;
    }

    if (data.tokenUpdate) {
      response.tokenUpdate = data.tokenUpdate;
    }

    if (data.name) {
      response.name = data.name;
    }

    // Add message for operations
    if (data.message) {
      response.message = data.message;
    }

    // Add data payload
    if (data.data) {
      response.data = data.data;
    }

    // Add version info if available
    const appVersion = req.headers['app-version'];
    if (appVersion) {
      response.apiVersion = '2.0';
    }

    return response;
  }

  /**
   * Format firmware response
   */
  private formatFirmwareResponse(data: any, req: Request): any {
    // Firmware responses need specific format for device updates
    const response: any = {
      success: data.success !== false
    };

    // Add update availability
    if (data.updateAvailable !== undefined) {
      response.updateAvailable = data.updateAvailable;
    }

    // Add firmware URL if update is available
    if (data.firmwareUrl) {
      response.url = data.firmwareUrl;
    }

    // Add version info
    if (data.version) {
      response.version = data.version;
    }

    // Add checksum for verification
    if (data.checksum) {
      response.checksum = data.checksum;
    }

    // Add size info
    if (data.size) {
      response.size = data.size;
    }

    return response;
  }

  /**
   * Format audio response
   */
  private formatAudioResponse(data: any, req: Request): any {
    // Audio responses for Track 2.0 devices
    const response: any = {
      success: data.success !== false
    };

    // Add upload URL for segmented audio
    if (data.url) {
      response.url = data.url;
    }

    // Add processing status
    if (data.processed !== undefined) {
      response.processed = data.processed;
    }

    // Add transcription result
    if (data.transcription) {
      response.transcription = data.transcription;
    }

    // Add command result
    if (data.commandResult) {
      response.commandResult = data.commandResult;
    }

    return response;
  }

  /**
   * Format device error
   */
  private formatDeviceError(error: any, deviceType: string, req: Request): any {
    const baseError: any = {
      success: false,
      error: error.message || 'An error occurred',
      timestamp: new Date().toISOString()
    };

    // Add correlation ID if available
    if (req.headers['x-correlation-id']) {
      baseError.correlationId = req.headers['x-correlation-id'];
    }

    // Format based on device type
    switch (deviceType) {
      case 'track20':
        // Track 2.0 devices expect minimal error info
        return {
          success: false,
          error: error.message || 'Request failed'
        };

      case 'iot':
        // IoT devices expect structured error responses
        return {
          ...baseError,
          errorCode: error.code || 'UNKNOWN_ERROR',
          retryable: error.retryable || false
        };

      case 'app':
        // Mobile apps expect detailed error info
        return {
          ...baseError,
          errorCode: error.code || 'UNKNOWN_ERROR',
          details: error.details || null,
          retryable: error.retryable || false
        };

      default:
        return baseError;
    }
  }

  /**
   * Get device type from request
   */
  private getDeviceType(req: Request): string {
    // Try to determine device type from various sources
    if (req.deviceInfo?.deviceType) {
      return req.deviceInfo.deviceType;
    }

    if (req.headers.dsn || req.body?.dsn) {
      return 'track20';
    }

    if (req.headers['device-type']) {
      return req.headers['device-type'] as string;
    }

    if (req.body?.device?.id) {
      return 'app';
    }

    if (req.path.includes('/iot/')) {
      return 'iot';
    }

    return 'unknown';
  }

  /**
   * Get error status code
   */
  private getErrorStatusCode(error: any): number {
    if (error.statusCode) {
      return error.statusCode;
    }

    if (error.name === 'ValidationError') {
      return 400;
    }

    if (error.name === 'NotFoundError') {
      return 404;
    }

    if (error.name === 'BusinessLogicError') {
      return 422;
    }

    if (error.name === 'AuthenticationError') {
      return 401;
    }

    if (error.name === 'AuthorizationError') {
      return 403;
    }

    return 500;
  }
}