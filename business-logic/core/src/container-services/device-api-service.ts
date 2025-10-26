import express, { Request, Response, NextFunction } from 'express';
import { ContainerService } from './container-service';
import { ServerConfig, RequestContext } from './interfaces';
import { ServiceContext } from '../interfaces/service-context';
import { DeviceOperations, RegisterDeviceInput, DeviceDataInput } from '@mytaptrack/business-logic-device';
import { BusinessLogicError, ValidationError, NotFoundError } from '../errors/service-errors';
import moment from 'moment-timezone';

/**
 * Device API container service for IoT device communication
 */
export class DeviceAPIService extends ContainerService {
  
  constructor(config: ServerConfig) {
    super(config);
  }

  /**
   * Get service name
   */
  protected getServiceName(): string {
    return 'device-api';
  }

  /**
   * Setup device-specific routes
   */
  protected async setupRoutes(): Promise<void> {
    if (!this.serviceContext) {
      throw new Error('Service context not available');
    }

    // Device registration routes
    this.setupDeviceRegistrationRoutes();
    
    // Device data routes
    this.setupDeviceDataRoutes();
    
    // Device status routes
    this.setupDeviceStatusRoutes();
    
    // Legacy device API routes (Track 2.0 compatibility)
    this.setupLegacyDeviceRoutes();
    
    // App API routes
    this.setupAppApiRoutes();
    
    // IoT device routes
    this.setupIoTRoutes();
  }

  /**
   * Setup device registration routes
   */
  private setupDeviceRegistrationRoutes(): void {
    // Register new device
    this.app.post('/device/register', 
      this.getAuthMiddleware().createOptional(),
      this.createDeviceValidationMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const deviceData = req.body as RegisterDeviceInput;
          
          const registration = await DeviceOperations.registerDevice(deviceData, context.serviceContext);
          
          res.status(201).json({
            success: true,
            data: registration
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Get device registration
    this.app.get('/device/:deviceId/registration',
      this.getAuthMiddleware().createOptional(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const { deviceId } = req.params;
          
          const registration = await DeviceOperations.getDeviceRegistration(deviceId, context.serviceContext);
          
          if (!registration) {
            return res.status(404).json({
              success: false,
              error: 'Device not found'
            });
          }
          
          res.json({
            success: true,
            data: registration
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Unregister device
    this.app.delete('/device/:deviceId/registration',
      this.getAuthMiddleware().create(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const { deviceId } = req.params;
          
          await DeviceOperations.unregisterDevice(deviceId, context.serviceContext);
          
          res.json({
            success: true,
            message: 'Device unregistered successfully'
          });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  /**
   * Setup device data routes
   */
  private setupDeviceDataRoutes(): void {
    // Record device data
    this.app.put('/device/:deviceId/data',
      this.createDeviceAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const { deviceId } = req.params;
          const dataInput = req.body as DeviceDataInput;
          
          await DeviceOperations.recordDeviceData(deviceId, dataInput, context.serviceContext);
          
          res.json({
            success: true,
            message: 'Device data recorded successfully'
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Update device battery level
    this.app.put('/device/:deviceId/battery',
      this.createDeviceAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const { deviceId } = req.params;
          const { batteryLevel } = req.body;
          
          await DeviceOperations.updateBatteryLevel(deviceId, batteryLevel, context.serviceContext);
          
          res.json({
            success: true,
            message: 'Battery level updated successfully'
          });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  /**
   * Setup device status routes
   */
  private setupDeviceStatusRoutes(): void {
    // Update device status
    this.app.put('/device/:deviceId/status',
      this.createDeviceAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const { deviceId } = req.params;
          const { status } = req.body;
          
          await DeviceOperations.updateDeviceStatus(deviceId, status, context.serviceContext);
          
          res.json({
            success: true,
            message: 'Device status updated successfully'
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Update device settings
    this.app.put('/device/:deviceId/settings',
      this.getAuthMiddleware().create(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const { deviceId } = req.params;
          const settings = req.body;
          
          await DeviceOperations.updateDeviceSettings(deviceId, settings, context.serviceContext);
          
          res.json({
            success: true,
            message: 'Device settings updated successfully'
          });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  /**
   * Setup legacy device routes for Track 2.0 compatibility
   */
  private setupLegacyDeviceRoutes(): void {
    // Time endpoint (unauthenticated)
    this.app.get('/time', (req: Request, res: Response) => {
      res.json({
        time: moment().toISOString(),
        timestamp: Date.now()
      });
    });

    // Ping endpoint (unauthenticated)
    this.app.get('/ping', (req: Request, res: Response) => {
      res.json({
        success: true,
        timestamp: moment().toISOString(),
        message: 'pong'
      });
    });

    // Data endpoint (legacy Track 2.0 format)
    this.app.put('/data',
      this.createLegacyDeviceAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const trackData = this.parseLegacyTrackData(req.body);
          
          // Convert legacy format to new format
          const dataInput: DeviceDataInput = {
            studentId: trackData.studentId,
            dataType: 'track_event',
            data: {
              dsn: trackData.dsn,
              pressType: trackData.pressType,
              clickCount: trackData.clickCount,
              remainingLife: trackData.remainingLife,
              eventDate: trackData.eventDate
            },
            timestamp: trackData.eventDate
          };
          
          await DeviceOperations.recordDeviceData(trackData.dsn, dataInput, context.serviceContext);
          
          // Publish track event for downstream processing
          await context.serviceContext.messageBroker.publish('device.track.event', {
            deviceId: trackData.dsn,
            studentId: trackData.studentId,
            clickType: trackData.pressType,
            clickCount: trackData.clickCount,
            eventDate: trackData.eventDate,
            timestamp: moment().toISOString()
          });
          
          res.json({
            success: true
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Audio endpoint (legacy Track 2.0 format)
    this.app.put('/audio',
      this.createLegacyDeviceAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const audioData = this.parseLegacyAudioData(req);
          
          // Convert legacy format to new format
          const dataInput: DeviceDataInput = {
            studentId: audioData.studentId,
            dataType: 'audio_event',
            data: {
              dsn: audioData.dsn,
              audioLength: audioData.audioLength,
              eventDate: audioData.eventDate
            },
            timestamp: audioData.eventDate
          };
          
          await DeviceOperations.recordDeviceData(audioData.dsn, dataInput, context.serviceContext);
          
          // Publish audio event for downstream processing
          await context.serviceContext.messageBroker.publish('device.audio.event', {
            deviceId: audioData.dsn,
            studentId: audioData.studentId,
            audioLength: audioData.audioLength,
            eventDate: audioData.eventDate,
            timestamp: moment().toISOString()
          });
          
          res.json({
            success: true
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Firmware check endpoint
    this.app.post('/firmware',
      this.createLegacyDeviceAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          const { dsn, identity, firmware } = req.body;
          
          // Check firmware version and return update URL if needed
          // This is a simplified implementation - in production, you'd check against
          // actual firmware versions and generate signed URLs
          
          res.json({
            success: true,
            updateAvailable: false
          });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  /**
   * Setup app API routes
   */
  private setupAppApiRoutes(): void {
    // App token retrieve
    this.app.post('/app',
      this.createAppAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          
          // Publish app token request event for downstream processing
          await context.serviceContext.messageBroker.publish('app.token.requested', {
            deviceId: req.body.device?.id,
            tokens: req.body.tokens,
            timestamp: moment().toISOString()
          });
          
          // Return success - actual token processing handled by event handlers
          res.json({
            success: true,
            message: 'Token request processed'
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // App token track
    this.app.put('/app',
      this.createAppAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          
          // Publish app track event for downstream processing
          await context.serviceContext.messageBroker.publish('app.track.event', {
            deviceId: req.body.device?.id,
            trackData: req.body,
            timestamp: moment().toISOString()
          });
          
          res.json({
            success: true
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // App notes
    this.app.put('/app/notes',
      this.createAppAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          
          // Publish app notes event for downstream processing
          await context.serviceContext.messageBroker.publish('app.notes.created', {
            deviceId: req.body.device?.id,
            notes: req.body.notes,
            timestamp: moment().toISOString()
          });
          
          res.json({
            success: true
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Delete app
    this.app.delete('/app',
      this.createAppAuthMiddleware(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          
          // Publish app delete event for downstream processing
          await context.serviceContext.messageBroker.publish('app.deleted', {
            deviceId: req.body.device?.id,
            timestamp: moment().toISOString()
          });
          
          res.json({
            success: true
          });
        } catch (error) {
          next(error);
        }
      }
    );
  }

  /**
   * Setup IoT device routes
   */
  private setupIoTRoutes(): void {
    // IoT device registration
    this.app.put('/iot/register',
      this.getAuthMiddleware().create(),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const context = this.getRequestContext(req);
          
          // Publish IoT registration event for downstream processing
          await context.serviceContext.messageBroker.publish('iot.device.register', {
            deviceData: req.body,
            timestamp: moment().toISOString()
          });
          
          res.json({
            success: true,
            message: 'IoT device registration initiated'
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Auth config endpoint
    this.app.get('/auth/config', (req: Request, res: Response) => {
      // Return authentication configuration for devices
      res.json({
        authType: 'jwt',
        issuer: process.env.JWT_ISSUER || 'mytaptrack-device-api',
        audience: process.env.JWT_AUDIENCE || 'mytaptrack-devices'
      });
    });
  }

  /**
   * Create device validation middleware
   */
  private createDeviceValidationMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const { deviceId, studentId, license, deviceType } = req.body;
      
      if (!deviceId) {
        return res.status(400).json({
          success: false,
          error: 'Device ID is required'
        });
      }
      
      if (!studentId) {
        return res.status(400).json({
          success: false,
          error: 'Student ID is required'
        });
      }
      
      if (!license) {
        return res.status(400).json({
          success: false,
          error: 'License is required'
        });
      }
      
      if (!deviceType) {
        return res.status(400).json({
          success: false,
          error: 'Device type is required'
        });
      }
      
      next();
    };
  }

  /**
   * Create device authentication middleware
   */
  private createDeviceAuthMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const deviceId = req.params.deviceId || req.headers['device-id'] || req.body.deviceId;
        const identity = req.headers['device-identity'] || req.body.identity;
        
        if (!deviceId || !identity) {
          return res.status(401).json({
            success: false,
            error: 'Device authentication required'
          });
        }
        
        // Validate device identity
        const context = this.getRequestContext(req);
        const registration = await DeviceOperations.getDeviceRegistration(deviceId, context.serviceContext);
        
        if (!registration) {
          return res.status(404).json({
            success: false,
            error: 'Device not found'
          });
        }
        
        // Add device info to request context
        req.device = {
          deviceId,
          identity,
          registration
        };
        
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Create legacy device authentication middleware
   */
  private createLegacyDeviceAuthMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { dsn, identity } = req.body;
        
        if (!dsn || !identity) {
          return res.status(400).json({
            success: false,
            error: 'DSN and identity are required'
          });
        }
        
        // Validate DSN format (Track 2.0 format)
        if (!dsn.match(/^M2[A-Z0-9]{10}/)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid DSN format'
          });
        }
        
        // Add device info to request context
        req.device = {
          dsn,
          identity
        };
        
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Create app authentication middleware
   */
  private createAppAuthMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // App authentication is handled by token validation in the request body
      // This is a simplified implementation
      next();
    };
  }

  /**
   * Parse legacy track data format
   */
  private parseLegacyTrackData(body: any): any {
    // Clean up body data
    if (typeof body === 'string') {
      body = body.replace('\u0001', '');
      body = JSON.parse(body);
    }
    
    // Validate required fields
    if (!body.dsn || !body.identity || !body.pressType || !body.clickCount || !body.eventDate) {
      throw new ValidationError('Missing required track data fields');
    }
    
    // Parse event date
    let eventDate = new Date(body.eventDate.trimRight().replace('\u0012', ''));
    if (isNaN(eventDate.getTime())) {
      throw new ValidationError('Invalid event date');
    }
    
    // Handle epoch time adjustment
    if (eventDate.getTime() < 31536000000) { // Before 1971
      const diffEpoc = moment(eventDate).diff(moment(body.currentTime), 'milliseconds');
      eventDate = new Date(new Date().getTime() - diffEpoc);
    }
    
    return {
      dsn: body.dsn,
      identity: body.identity,
      pressType: body.pressType,
      clickCount: body.clickCount,
      remainingLife: body.remainingLife,
      eventDate: eventDate.toISOString(),
      studentId: body.studentId // This would be resolved from device registration
    };
  }

  /**
   * Parse legacy audio data format
   */
  private parseLegacyAudioData(req: Request): any {
    const dsn = req.headers.dsn as string;
    
    if (!dsn) {
      throw new ValidationError('DSN header is required for audio data');
    }
    
    // Handle base64 encoded audio data
    let audioLength = 0;
    if (req.body && req.headers['content-type'] === 'application/octet-stream') {
      const buffer = Buffer.from(req.body, 'base64');
      if (buffer.length >= 4) {
        audioLength = (buffer as any).readInt32LE(buffer.length - 4);
      }
    }
    
    return {
      dsn: dsn.slice(0, 16),
      audioLength,
      eventDate: moment().toISOString(),
      studentId: null // This would be resolved from device registration
    };
  }

  /**
   * Get request context
   */
  private getRequestContext(req: Request): RequestContext {
    return (req as any).context as RequestContext;
  }
}

// Extend Request interface to include device info
declare global {
  namespace Express {
    interface Request {
      device?: {
        deviceId?: string;
        dsn?: string;
        identity: string;
        registration?: any;
      };
    }
  }
}