import { RestAPIService } from '../container-services/rest-api-service';
import { ServerConfig } from '../container-services/interfaces';

/**
 * Example usage of REST API Service
 */
async function main() {
  // Configuration for REST API service
  const config: ServerConfig = {
    port: 3001,
    host: '0.0.0.0',
    cors: {
      origin: ['http://localhost:3000', 'https://app.mytaptrack.com'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true
    },
    middleware: {
      requestLogging: true,
      compression: true,
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 1000, // limit each IP to 1000 requests per windowMs
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      },
      bodyParser: {
        json: {
          limit: '10mb',
          strict: true
        },
        urlencoded: {
          limit: '10mb',
          extended: true
        }
      }
    },
    security: {
      helmet: true,
      trustProxy: true,
      hidePoweredBy: true
    }
  };

  // Create and initialize REST API service
  const restApiService = new RestAPIService(config);

  try {
    console.log('Starting REST API service...');
    await restApiService.initialize();
    console.log('REST API service started successfully');
    console.log(`Server listening on http://${config.host}:${config.port}`);
    console.log('Available endpoints:');
    console.log('  GET  /health - Health check');
    console.log('  GET  /ready - Readiness check');
    console.log('  GET  /live - Liveness check');
    console.log('  POST /api/user/error - Browser error reporting');
    console.log('  GET  /api/v2/user - Get current user');
    console.log('  PUT  /api/v2/user - Update user');
    console.log('  GET  /api/v2/user/alerts - Get user alerts');
    console.log('  GET  /api/v2/student - Get student');
    console.log('  PUT  /api/v2/student - Create/update student');
    console.log('  GET  /api/v2/student/document - Get student document');
    console.log('  PUT  /api/v2/student/document - Upload student document');
    console.log('  DELETE /api/v2/student/document - Delete student document');
    console.log('  GET  /api/v2/student/subscriptions - Get student subscriptions');
    console.log('  PUT  /api/v2/student/subscriptions - Update student subscriptions');
    console.log('  GET  /api/v2/student/notification - Get student notifications');
    console.log('  DELETE /api/v2/student/notification - Delete student notification');
    console.log('  PUT  /api/v2/student/behavior - Update student behavior');
    console.log('  DELETE /api/v2/student/behavior - Delete student behavior');
    console.log('  PUT  /api/v2/student/response - Update student response');
    console.log('  DELETE /api/v2/student/response - Delete student response');
    console.log('  PUT  /api/v2/student/abc - Update student ABC');
    console.log('  DELETE /api/v2/student/abc - Delete student ABC');
    console.log('  GET  /api/v2/student/team - Get student team');
    console.log('  PUT  /api/v2/student/team - Update student team');
    console.log('  POST /api/v2/student/team - Create student team');
    console.log('  DELETE /api/v2/student/team - Delete student team');
    console.log('  GET  /api/v2/student/schedules - Get student schedules');
    console.log('  PUT  /api/v2/student/schedule - Update student schedule');
    console.log('  DELETE /api/v2/student/schedule - Delete student schedule');

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await restApiService.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('Received SIGINT, shutting down gracefully...');
      await restApiService.shutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start REST API service:', error);
    process.exit(1);
  }
}

/**
 * Example of making requests to the REST API service
 */
async function exampleRequests() {
  const baseUrl = 'http://localhost:3001';
  
  try {
    // Health check
    console.log('Testing health check...');
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('Health check response:', healthData);

    // Example authenticated request (would need valid JWT token)
    const authToken = 'your-jwt-token-here';
    
    console.log('Testing user endpoint...');
    const userResponse = await fetch(`${baseUrl}/api/v2/user`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (userResponse.ok) {
      const userData = await userResponse.json();
      console.log('User data:', userData);
    } else {
      console.log('User request failed:', userResponse.status, userResponse.statusText);
    }

    // Example student creation
    console.log('Testing student creation...');
    const studentData = {
      studentId: 'student-123',
      firstName: 'John',
      lastName: 'Doe',
      license: 'license-456'
    };

    const createStudentResponse = await fetch(`${baseUrl}/api/v2/student`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(studentData)
    });

    if (createStudentResponse.ok) {
      const createdStudent = await createStudentResponse.json();
      console.log('Created student:', createdStudent);
    } else {
      console.log('Student creation failed:', createStudentResponse.status, createStudentResponse.statusText);
    }

  } catch (error) {
    console.error('Request failed:', error);
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

export { main as startRestApiService, exampleRequests };