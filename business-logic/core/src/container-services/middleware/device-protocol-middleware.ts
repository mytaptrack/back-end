import { Request, Response, NextFunction } from 'express';
import { ServiceContext } from '../../interfaces/service-context';
import moment from 'moment-timezone';

/**
 * Device protocol handling middleware
 */
export class DeviceProtocolMiddleware {
  constructor(private serviceContext: ServiceContext) {}

  /**
   * Create Track 2.0 protocol middleware
   */
  createTrack20Protocol() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Handle Track 2.0 specific headers and data format
        this.processTrack20Headers(req);
        this.processTrack20Body(req);
        
        next();
      } catch (error) {
        this.serviceContext.logger.error('Track 2.0 protocol error', { error, path: req.path });
        res.status(400).json({
          success: false,
          error: 'Invalid Track 2.0 protocol format'
        });
      }
    };
  }

  /**
   * Create IoT device protocol middleware
   */
  createIoTProtocol() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Handle IoT device specific protocols
        this.processIoTHeaders(req);
        this.processIoTBody(req);
        
        next();
      } catch (error) {
        this.serviceContext.logger.error('IoT protocol error', { error, path: req.path });
        res.status(400).json({
          success: false,
          error: 'Invalid IoT protocol format'
        });
      }
    };
  }

  /**
   * Create app protocol middleware
   */
  createAppProtocol() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Handle mobile app specific protocols
        this.processAppHeaders(req);
        this.processAppBody(req);
        
        next();
      } catch (error) {
        this.serviceContext.logger.error('App protocol error', { error, path: req.path });
        res.status(400).json({
          success: false,
          error: 'Invalid app protocol format'
        });
      }
    };
  }

  /**
   * Create binary data handler middleware
   */
  createBinaryDataHandler() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Handle binary data (audio, firmware, etc.)
        if (req.headers['content-type']?.includes('application/octet-stream') ||
            req.headers['content-type']?.includes('audio/') ||
            req.is('application/octet-stream')) {
          
          this.processBinaryData(req);
        }
        
        next();
      } catch (error) {
        this.serviceContext.logger.error('Binary data processing error', { error });
        res.status(400).json({
          success: false,
          error: 'Invalid binary data format'
        });
      }
    };
  }

  /**
   * Create device identification middleware
   */
  createDeviceIdentification() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Extract device identification from various sources
        const deviceInfo = this.extractDeviceInfo(req);
        
        if (deviceInfo) {
          req.deviceInfo = deviceInfo;
        }
        
        next();
      } catch (error) {
        this.serviceContext.logger.error('Device identification error', { error });
        res.status(400).json({
          success: false,
          error: 'Could not identify device'
        });
      }
    };
  }

  /**
   * Process Track 2.0 headers
   */
  private processTrack20Headers(req: Request): void {
    // Handle Track 2.0 specific headers
    if (req.headers.dsn) {
      req.headers.dsn = (req.headers.dsn as string).slice(0, 16);
    }
    
    // Validate DSN format
    if (req.headers.dsn && !(req.headers.dsn as string).match(/^M2[A-Z0-9]{10}/)) {
      throw new Error('Invalid Track 2.0 DSN format');
    }
  }

  /**
   * Process Track 2.0 body
   */
  private processTrack20Body(req: Request): void {
    if (!req.body) return;
    
    // Clean up Track 2.0 specific characters
    if (typeof req.body === 'string') {
      req.body = req.body.replace('\u0001', '');
      try {
        req.body = JSON.parse(req.body);
      } catch (error) {
        throw new Error('Invalid JSON in Track 2.0 body');
      }
    }
    
    // Validate Track 2.0 data structure
    if (req.body.dsn) {
      // Ensure DSN is properly formatted
      if (req.body.dsn.length < 16) {
        req.body.dsn = req.body.dsn.padEnd(16, '0');
      }
      req.body.dsn = req.body.dsn.slice(0, 16);
    }
    
    // Process event date
    if (req.body.eventDate) {
      req.body.eventDate = this.normalizeEventDate(req.body.eventDate, req.body.currentTime);
    }
  }

  /**
   * Process IoT headers
   */
  private processIoTHeaders(req: Request): void {
    // Handle IoT device specific headers
    const deviceType = req.headers['device-type'] as string;
    const firmwareVersion = req.headers['firmware-version'] as string;
    
    if (deviceType) {
      req.iotInfo = {
        deviceType,
        firmwareVersion
      };
    }
  }

  /**
   * Process IoT body
   */
  private processIoTBody(req: Request): void {
    if (!req.body) return;
    
    // Validate IoT message structure
    if (req.body.messageType && req.body.payload) {
      // Structure is valid
      req.body.processedAt = moment().toISOString();
    }
  }

  /**
   * Process app headers
   */
  private processAppHeaders(req: Request): void {
    // Handle mobile app specific headers
    const appVersion = req.headers['app-version'] as string;
    const platform = req.headers['platform'] as string;
    const deviceOs = req.headers['device-os'] as string;
    
    if (appVersion || platform || deviceOs) {
      req.appInfo = {
        version: appVersion,
        platform,
        deviceOs
      };
    }
  }

  /**
   * Process app body
   */
  private processAppBody(req: Request): void {
    if (!req.body) return;
    
    // Validate app request structure
    if (req.body.device && req.body.device.id) {
      // Valid app request structure
      req.body.processedAt = moment().toISOString();
    }
  }

  /**
   * Process binary data
   */
  private processBinaryData(req: Request): void {
    // Handle binary data processing
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > 0) {
      req.binaryInfo = {
        contentLength,
        contentType: req.headers['content-type'],
        encoding: req.headers['content-encoding']
      };
    }
  }

  /**
   * Extract device information from request
   */
  private extractDeviceInfo(req: Request): any {
    // Try to extract device info from various sources
    let deviceId: string | undefined;
    let deviceType: string | undefined;
    let identity: string | undefined;
    
    // From URL parameters
    if (req.params.deviceId) {
      deviceId = req.params.deviceId;
    }
    
    // From headers
    if (req.headers.dsn) {
      deviceId = req.headers.dsn as string;
      deviceType = 'track20';
    }
    
    if (req.headers['device-id']) {
      deviceId = req.headers['device-id'] as string;
    }
    
    if (req.headers['device-identity']) {
      identity = req.headers['device-identity'] as string;
    }
    
    // From body
    if (req.body) {
      if (req.body.dsn) {
        deviceId = req.body.dsn;
        deviceType = 'track20';
      }
      
      if (req.body.deviceId) {
        deviceId = req.body.deviceId;
      }
      
      if (req.body.identity) {
        identity = req.body.identity;
      }
      
      if (req.body.device && req.body.device.id) {
        deviceId = req.body.device.id;
        deviceType = 'app';
      }
    }
    
    if (deviceId) {
      return {
        deviceId,
        deviceType,
        identity
      };
    }
    
    return null;
  }

  /**
   * Normalize event date
   */
  private normalizeEventDate(eventDate: string, currentTime?: string): string {
    // Clean up event date string
    const cleanDate = eventDate.trimRight().replace('\u0012', '');
    let date = new Date(cleanDate);
    
    if (isNaN(date.getTime())) {
      throw new Error('Invalid event date format');
    }
    
    // Handle epoch time adjustment for Track 2.0 devices
    if (date.getTime() < 31536000000) { // Before 1971
      if (currentTime) {
        const diffEpoc = moment(date).diff(moment(currentTime), 'milliseconds');
        date = new Date(new Date().getTime() - diffEpoc);
      } else {
        // Use current time if no reference time provided
        date = new Date();
      }
    }
    
    return date.toISOString();
  }
}

// Extend Request interface for device-specific info
declare global {
  namespace Express {
    interface Request {
      deviceInfo?: {
        deviceId: string;
        deviceType?: string;
        identity?: string;
      };
      iotInfo?: {
        deviceType?: string;
        firmwareVersion?: string;
      };
      appInfo?: {
        version?: string;
        platform?: string;
        deviceOs?: string;
      };
      binaryInfo?: {
        contentLength: number;
        contentType?: string;
        encoding?: string;
      };
    }
  }
}