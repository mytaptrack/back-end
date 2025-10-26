import { DeviceAPIService } from '../container-services/device-api-service';
import { ServerConfig } from '../container-services/interfaces';

/**
 * Example usage of Device API Service
 */
async function main() {
  // Configure the Device API service
  const config: ServerConfig = {
    port: parseInt(process.env.DEVICE_API_PORT || '3003'),
    host: process.env.DEVICE_API_HOST || 'localhost',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'dsn', 'device-id', 'device-identity'],
      credentials: true
    },
    middleware: {
      requestLogging: true,
      compression: true,
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000 // per window
      },
      bodyParser: {
        json: {
          limit: '10mb' // For audio data
        }
      }
    },
    security: {
      helmet: true,
      trustProxy: true,
      hidePoweredBy: true
    }
  };

  // Create and initialize the service
  const deviceApiService = new DeviceAPIService(config);
  
  try {
    await deviceApiService.initialize();
    console.log('Device API Service started successfully');
    
    // The service will handle:
    // - Device registration and management
    // - Track 2.0 button press events
    // - Track 2.0 audio events
    // - IoT device communication
    // - Mobile app API endpoints
    // - Firmware update requests
    
    // Example endpoints available:
    console.log('Available endpoints:');
    console.log('POST   /device/register          - Register new device');
    console.log('GET    /device/:id/registration  - Get device registration');
    console.log('DELETE /device/:id/registration  - Unregister device');
    console.log('PUT    /device/:id/data          - Record device data');
    console.log('PUT    /device/:id/battery       - Update battery level');
    console.log('PUT    /device/:id/status        - Update device status');
    console.log('PUT    /device/:id/settings      - Update device settings');
    console.log('');
    console.log('Legacy Track 2.0 endpoints:');
    console.log('GET    /time                     - Get current time');
    console.log('GET    /ping                     - Ping endpoint');
    console.log('PUT    /data                     - Track button press data');
    console.log('PUT    /audio                    - Track audio data');
    console.log('POST   /firmware                 - Firmware update check');
    console.log('');
    console.log('App API endpoints:');
    console.log('POST   /app                      - App token retrieve');
    console.log('PUT    /app                      - App behavior tracking');
    console.log('PUT    /app/notes                - App notes');
    console.log('DELETE /app                      - Delete app');
    console.log('');
    console.log('IoT endpoints:');
    console.log('PUT    /iot/register             - IoT device registration');
    console.log('GET    /auth/config              - Authentication config');
    console.log('');
    console.log('Health endpoints:');
    console.log('GET    /health                   - Full health check');
    console.log('GET    /health/quick             - Quick health check');
    console.log('GET    /ready                    - Readiness check');
    console.log('GET    /live                     - Liveness check');
    
  } catch (error) {
    console.error('Failed to start Device API Service:', error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully');
    try {
      await deviceApiService.shutdown();
      console.log('Device API Service shut down successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully');
    try {
      await deviceApiService.shutdown();
      console.log('Device API Service shut down successfully');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
}

// Example of using the Device API service with Docker
async function dockerExample() {
  console.log('Docker Device API Service Example');
  console.log('================================');
  
  // Environment variables for Docker deployment
  const dockerConfig: ServerConfig = {
    port: parseInt(process.env.PORT || '3003'),
    host: '0.0.0.0', // Listen on all interfaces in container
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'dsn', 
        'device-id', 
        'device-identity',
        'x-correlation-id'
      ],
      credentials: true
    },
    middleware: {
      requestLogging: process.env.LOG_REQUESTS !== 'false',
      compression: true,
      rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000')
      },
      bodyParser: {
        json: {
          limit: process.env.MAX_JSON_SIZE || '10mb'
        }
      }
    },
    security: {
      helmet: true,
      trustProxy: true,
      hidePoweredBy: true
    }
  };

  const service = new DeviceAPIService(dockerConfig);
  
  try {
    await service.initialize();
    console.log(`Device API Service running on port ${dockerConfig.port}`);
    console.log('Service is ready to handle device communications');
    
    // Log configuration
    console.log('Configuration:');
    console.log(`- Port: ${dockerConfig.port}`);
    console.log(`- CORS Origin: ${JSON.stringify(dockerConfig.cors?.origin)}`);
    console.log(`- Rate Limiting: ${dockerConfig.middleware?.rateLimiting?.maxRequests} requests per ${dockerConfig.middleware?.rateLimiting?.windowMs}ms`);
    console.log(`- Request Logging: ${dockerConfig.middleware?.requestLogging}`);
    
  } catch (error) {
    console.error('Failed to start Docker Device API Service:', error);
    throw error;
  }
  
  return service;
}

// Example client requests
async function exampleClientRequests() {
  const baseUrl = 'http://localhost:3003';
  
  console.log('Example Device API Client Requests');
  console.log('=================================');
  
  // Example 1: Register a new device
  console.log('\n1. Register Device:');
  console.log(`POST ${baseUrl}/device/register`);
  console.log('Body:', JSON.stringify({
    deviceId: 'M200000000000001',
    studentId: 'student-123',
    license: 'license-456',
    deviceType: 'track20',
    manufacturer: 'MyTapTrack',
    model: 'Track 2.0',
    serialNumber: 'SN123456',
    firmwareVersion: '2.1.0',
    batteryLevel: 85
  }, null, 2));
  
  // Example 2: Track 2.0 button press
  console.log('\n2. Track Button Press:');
  console.log(`PUT ${baseUrl}/data`);
  console.log('Headers: { "dsn": "M200000000000001" }');
  console.log('Body:', JSON.stringify({
    dsn: 'M200000000000001',
    identity: 'device-identity-hash',
    pressType: 'click',
    clickCount: 3,
    remainingLife: 85,
    eventDate: new Date().toISOString()
  }, null, 2));
  
  // Example 3: App behavior tracking
  console.log('\n3. App Behavior Tracking:');
  console.log(`PUT ${baseUrl}/app`);
  console.log('Body:', JSON.stringify({
    device: { id: 'app-device-123' },
    token: 'encrypted-token',
    behaviorId: 'behavior-456',
    date: new Date().toISOString(),
    endDate: new Date().toISOString(),
    intensity: 7
  }, null, 2));
  
  // Example 4: IoT device registration
  console.log('\n4. IoT Device Registration:');
  console.log(`PUT ${baseUrl}/iot/register`);
  console.log('Headers: { "Authorization": "Bearer jwt-token" }');
  console.log('Body:', JSON.stringify({
    thingName: 'iot-device-789',
    thingType: 'Track20',
    deviceId: 'iot-789'
  }, null, 2));
  
  // Example 5: Health check
  console.log('\n5. Health Check:');
  console.log(`GET ${baseUrl}/health`);
  console.log('Response: { "healthy": true, "checks": {...}, "timestamp": "..." }');
}

// Run examples if this file is executed directly
if (require.main === module) {
  // Check if running in Docker
  if (process.env.DOCKER_CONTAINER) {
    dockerExample().catch(console.error);
  } else {
    main().catch(console.error);
  }
  
  // Show example requests
  setTimeout(() => {
    exampleClientRequests().catch(console.error);
  }, 2000);
}

export { main as runDeviceApiService, dockerExample as runDockerDeviceApiService };