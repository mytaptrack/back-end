# REST API Documentation

The MyTapTrack REST API provides traditional HTTP endpoints for integrating with the MyTapTrack system. These APIs are designed for third-party integrations, mobile applications, and scenarios where GraphQL is not suitable.

## Table of Contents

- [Base URL and Authentication](#base-url-and-authentication)
- [Common Headers](#common-headers)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [API Endpoints](#api-endpoints)
- [Examples](#examples)

## Base URL and Authentication

### Base URL
```
https://api.mytaptrack.com
```

### Authentication
All REST API endpoints require authentication using AWS Cognito JWT tokens:

```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Getting a JWT Token
```typescript
import { Auth } from 'aws-amplify';

// Configure Amplify with your Cognito settings
Auth.configure({
  region: 'us-east-1',
  userPoolId: 'us-east-1_xxxxxxxxx',
  userPoolWebClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx'
});

// Sign in and get token
const user = await Auth.signIn(username, password);
const session = await Auth.currentSession();
const jwtToken = session.getIdToken().getJwtToken();
```

## Common Headers

All requests should include these headers:

```http
Authorization: Bearer <jwt-token>
Content-Type: application/json
Accept: application/json
User-Agent: MyApp/1.0
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid student ID provided",
    "details": {
      "field": "studentId",
      "value": "invalid-id"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Error Handling

### HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required or invalid
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### Error Codes

- `VALIDATION_ERROR` - Request validation failed
- `UNAUTHORIZED` - Authentication failed
- `ACCESS_DENIED` - Insufficient permissions
- `STUDENT_NOT_FOUND` - Student does not exist
- `LICENSE_EXPIRED` - User's license has expired
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_ERROR` - Server-side error

## Rate Limiting

- **Standard endpoints**: 500 requests per minute per user
- **Data collection endpoints**: 1000 requests per minute per user
- **Bulk operations**: 100 requests per minute per user

Rate limit headers are included in responses:
```http
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 1642248600
```

## API Endpoints

### Student Management

#### Get Student Information
```http
GET /api/v2/student?studentId={studentId}
```

**Parameters:**
- `studentId` (required): Student identifier

**Response:**
```json
{
  "success": true,
  "data": {
    "studentId": "student-123",
    "license": "license-456",
    "details": {
      "firstName": "John",
      "lastName": "Doe",
      "nickname": "Johnny",
      "schoolId": "STU001"
    },
    "behaviors": [
      {
        "id": "behavior-789",
        "name": "On Task Behavior",
        "desc": "Student remains focused on assigned task",
        "isDuration": true,
        "intensity": 5,
        "targets": [
          {
            "measurement": "duration",
            "target": 80,
            "progress": 65,
            "targetType": "increase"
          }
        ]
      }
    ],
    "services": [
      {
        "id": "service-101",
        "name": "Speech Therapy",
        "startDate": 1640995200000,
        "endDate": 1672531200000,
        "target": 30,
        "currentBalance": 120
      }
    ],
    "restrictions": {
      "info": "edit",
      "data": "edit",
      "behavior": "edit",
      "service": "edit"
    }
  }
}
```

#### Create/Update Student
```http
PUT /api/v2/student
```

**Request Body:**
```json
{
  "studentId": "student-123", // Optional for new students
  "firstName": "John",
  "lastName": "Doe",
  "subtext": "Johnny",
  "archived": false,
  "tags": [
    {
      "tag": "Grade 3",
      "type": "grade"
    }
  ],
  "milestones": [
    {
      "date": "2024-01-15",
      "title": "IEP Review",
      "description": "Annual IEP review meeting"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "studentId": "student-123",
    "details": {
      "firstName": "John",
      "lastName": "Doe",
      "nickname": "Johnny"
    },
    "license": "license-456",
    "lastUpdateDate": "2024-01-15T10:30:00Z"
  }
}
```

### Behavior Management

#### Add/Update Behavior
```http
PUT /api/v2/student/behavior
```

**Request Body:**
```json
{
  "studentId": "student-123",
  "behavior": {
    "id": "behavior-789", // Optional for new behaviors
    "name": "On Task Behavior",
    "desc": "Student remains focused on assigned task",
    "isDuration": true,
    "daytime": true,
    "baseline": false,
    "intensity": 5,
    "targets": [
      {
        "measurement": "duration",
        "target": 80,
        "targetType": "increase",
        "progress": 0
      }
    ],
    "tags": [
      {
        "tag": "Academic",
        "type": "category"
      }
    ]
  }
}
```

#### Delete Behavior
```http
DELETE /api/v2/student/behavior?studentId={studentId}&behaviorId={behaviorId}
```

### Service Management

#### Add/Update Response
```http
PUT /api/v2/student/response
```

**Request Body:**
```json
{
  "studentId": "student-123",
  "response": {
    "id": "response-456", // Optional for new responses
    "name": "Verbal Prompt Response",
    "desc": "Student responds to verbal prompts",
    "isDuration": false,
    "requireResponse": true,
    "targets": [
      {
        "measurement": "frequency",
        "target": 90,
        "targetType": "increase"
      }
    ]
  }
}
```

### Device Management

#### Get Device List
```http
GET /api/v2/student/devices?studentId={studentId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "apps": [
      {
        "deviceId": "app-123",
        "name": "Classroom App",
        "studentName": "John Doe",
        "behaviors": [
          {
            "id": "behavior-789",
            "name": "On Task Behavior",
            "order": 1,
            "abc": true,
            "intensity": true,
            "maxIntensity": 10
          }
        ],
        "textAlerts": true
      }
    ],
    "track20Devices": [
      {
        "dsn": "TRK001234",
        "deviceName": "Track Device 1",
        "validated": true,
        "events": [
          {
            "eventId": "behavior-789",
            "presses": 1,
            "order": 1,
            "isDuration": true
          }
        ]
      }
    ]
  }
}
```

#### Create/Update Mobile App
```http
PUT /api/v2/student/devices/app
```

**Request Body:**
```json
{
  "studentId": "student-123",
  "app": {
    "deviceId": "app-123", // Optional for new apps
    "name": "Classroom App",
    "textAlerts": true,
    "timezone": "America/New_York",
    "tags": [
      {
        "tag": "classroom",
        "type": "location"
      }
    ],
    "behaviors": [
      {
        "id": "behavior-789",
        "order": 1,
        "abc": true,
        "intensity": true
      }
    ],
    "responses": [
      {
        "id": "response-456",
        "order": 1
      }
    ],
    "services": [
      {
        "id": "service-101",
        "order": 1
      }
    ]
  }
}
```

#### Get App Token
```http
GET /api/v2/student/devices/app/token?deviceId={deviceId}&expiration={timestamp}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "qrExpiration": 1642248600000
  }
}
```

#### Get QR Code
```http
GET /api/v2/student/devices/app/qrcode?deviceId={deviceId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deviceId": "app-123",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "expirationDate": "2024-01-16T10:30:00Z"
  }
}
```

### Data Collection

#### Get Report Data
```http
GET /api/v2/reports/data?studentId={studentId}&startDate={date}&endDate={date}&scope={scope}
```

**Parameters:**
- `studentId` (required): Student identifier
- `startDate` (required): Start date (YYYY-MM-DD)
- `endDate` (required): End date (YYYY-MM-DD)
- `scope` (required): Data scope ("behavior", "service", or "both")

**Response:**
```json
{
  "success": true,
  "data": {
    "behaviors": [
      {
        "dateEpoc": 1642248600000,
        "behavior": "behavior-789",
        "reported": true,
        "score": 7,
        "duration": 300000,
        "intensity": 7,
        "source": {
          "device": "app-123",
          "rater": "user-456"
        },
        "abc": {
          "a": "Teacher instruction given",
          "c": "Verbal praise provided"
        }
      }
    ],
    "services": [
      {
        "dateEpoc": 1642248600000,
        "service": "service-101",
        "duration": 1800000,
        "reported": true,
        "source": {
          "device": "web-app",
          "rater": "user-789"
        },
        "modifications": ["Individual", "Quiet Environment"],
        "serviceProgress": {
          "progress": 75,
          "measurements": [
            {
              "name": "Goal 1",
              "value": 80
            }
          ]
        }
      }
    ],
    "startMillis": 1642204800000,
    "endMillis": 1642291200000
  }
}
```

#### Add Data Point
```http
PUT /api/v2/reports/data
```

**Request Body:**
```json
{
  "studentId": "student-123",
  "data": {
    "dateEpoc": 1642248600000,
    "behavior": "behavior-789", // For behavior data
    "service": "service-101",   // For service data
    "reported": true,
    "score": 7,
    "isManual": true,
    "source": {
      "device": "web-app",
      "rater": "user-456"
    },
    "abc": {
      "a": "Teacher instruction given",
      "c": "Verbal praise provided"
    },
    "duration": 300000,
    "intensity": 7,
    "modifications": ["Individual"], // For service data
    "serviceProgress": {             // For service data
      "progress": 75,
      "measurements": [
        {
          "name": "Goal 1",
          "value": 80
        }
      ]
    }
  }
}
```

#### Delete Data Point
```http
DELETE /api/v2/reports/data?studentId={studentId}&dateEpoc={timestamp}&behavior={behaviorId}
```

### User Management

#### Get User Information
```http
GET /api/v2/user
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "details": {
      "email": "user@example.com",
      "name": "Jane Smith",
      "firstName": "Jane",
      "lastName": "Smith",
      "state": "CA",
      "zip": "90210"
    },
    "license": "license-456",
    "licenseDetails": {
      "customer": "Example School District",
      "expiration": "2024-12-31",
      "features": {
        "behaviorTracking": true,
        "serviceTracking": true,
        "devices": true,
        "manage": true
      }
    },
    "students": [
      {
        "studentId": "student-123",
        "restrictions": {
          "info": "edit",
          "data": "edit",
          "behavior": "edit",
          "service": "edit"
        },
        "behaviors": true,
        "services": true,
        "teamStatus": "Verified"
      }
    ]
  }
}
```

#### Update User Information
```http
PUT /api/v2/user
```

**Request Body:**
```json
{
  "userId": "user-123",
  "details": {
    "firstName": "Jane",
    "lastName": "Smith",
    "state": "CA",
    "zip": "90210"
  }
}
```

### Team Management

#### Get Team Members
```http
GET /api/v2/student/team?studentId={studentId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "members": [
      {
        "userId": "user-123",
        "details": {
          "email": "teacher@example.com",
          "name": "Jane Smith"
        },
        "status": "Verified",
        "restrictions": {
          "info": "edit",
          "data": "edit",
          "behavior": "edit",
          "service": "view"
        }
      }
    ],
    "invites": [
      {
        "email": "parent@example.com",
        "status": "Pending",
        "restrictions": {
          "info": "view",
          "data": "view",
          "behavior": "view",
          "service": "none"
        }
      }
    ]
  }
}
```

#### Add Team Member
```http
PUT /api/v2/student/team
```

**Request Body:**
```json
{
  "studentId": "student-123",
  "email": "newmember@example.com",
  "restrictions": {
    "info": "view",
    "data": "view",
    "behavior": "edit",
    "service": "view",
    "team": "none",
    "comments": "edit",
    "abc": "edit",
    "milestones": "view",
    "reports": "view",
    "notifications": "edit",
    "documents": "view",
    "serviceData": "view",
    "serviceGoals": "none",
    "serviceSchedule": "view"
  }
}
```

### License Management

#### Get License Information
```http
GET /api/v2/license?license={licenseId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "license": "license-456",
    "customer": "Example School District",
    "expiration": "2024-12-31",
    "features": {
      "abc": true,
      "behaviorTracking": true,
      "serviceTracking": true,
      "devices": true,
      "dashboard": true,
      "notifications": true,
      "manage": true,
      "intensity": 10
    },
    "admins": ["admin@example.com"],
    "singleCount": 50,
    "singleUsed": 23,
    "multiCount": 10,
    "studentTemplates": [
      {
        "name": "Elementary Template",
        "desc": "Template for elementary students",
        "behaviors": [
          {
            "name": "On Task",
            "desc": "Student remains on task",
            "isDuration": true,
            "targets": [
              {
                "targetType": "increase",
                "target": 80,
                "measurement": "Event"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### Management APIs

#### Get License Statistics
```http
GET /api/v2/manage/stats?license={licenseId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "license": {
      "license": "license-456",
      "customer": "Example School District",
      "singleCount": 50,
      "singleUsed": 23,
      "multiCount": 10
    },
    "stats": {
      "single": 23,
      "flexible": [
        {
          "date": "2024-01",
          "count": 15
        }
      ]
    }
  }
}
```

#### Get Managed Students
```http
GET /api/v2/manage/students?license={licenseId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "students": [
      {
        "studentId": "student-123",
        "details": {
          "firstName": "John",
          "lastName": "Doe",
          "schoolId": "STU001"
        },
        "behaviors": [
          {
            "id": "behavior-789",
            "name": "On Task Behavior"
          }
        ],
        "services": [
          {
            "id": "service-101",
            "name": "Speech Therapy"
          }
        ],
        "lastTracked": "2024-01-15T10:30:00Z"
      }
    ],
    "totalCount": 23,
    "activeCount": 18
  }
}
```

## Examples

### Complete Student Creation Workflow

```typescript
// 1. Create a new student
const createStudentResponse = await fetch('/api/v2/student', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    firstName: 'John',
    lastName: 'Doe',
    subtext: 'Johnny',
    tags: [
      { tag: 'Grade 3', type: 'grade' },
      { tag: 'Special Education', type: 'program' }
    ]
  })
});

const student = await createStudentResponse.json();
const studentId = student.data.studentId;

// 2. Add a behavior
await fetch('/api/v2/student/behavior', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    studentId,
    behavior: {
      name: 'On Task Behavior',
      desc: 'Student remains focused on assigned task',
      isDuration: true,
      intensity: 5,
      targets: [{
        measurement: 'duration',
        target: 80,
        targetType: 'increase'
      }]
    }
  })
});

// 3. Create a mobile app
await fetch('/api/v2/student/devices/app', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    studentId,
    app: {
      name: 'Classroom App',
      textAlerts: true,
      timezone: 'America/New_York',
      behaviors: [{
        id: 'behavior-789',
        order: 1,
        abc: true,
        intensity: true
      }]
    }
  })
});
```

### Data Collection Example

```typescript
// Record behavior data
await fetch('/api/v2/reports/data', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    studentId: 'student-123',
    data: {
      dateEpoc: Date.now(),
      behavior: 'behavior-789',
      reported: true,
      score: 7,
      isManual: true,
      source: {
        device: 'web-app',
        rater: 'user-456'
      },
      abc: {
        a: 'Teacher instruction given',
        c: 'Verbal praise provided'
      },
      duration: 300000, // 5 minutes
      intensity: 7
    }
  })
});

// Get report data
const reportResponse = await fetch(
  `/api/v2/reports/data?studentId=student-123&startDate=2024-01-01&endDate=2024-01-31&scope=both`,
  {
    headers: {
      'Authorization': `Bearer ${jwtToken}`
    }
  }
);

const reportData = await reportResponse.json();
console.log('Behavior events:', reportData.data.behaviors.length);
console.log('Service events:', reportData.data.services.length);
```

### Error Handling Example

```typescript
async function apiCall(endpoint, options) {
  try {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.error?.message || 'Unknown error'}`);
    }

    if (!data.success) {
      throw new Error(data.error?.message || 'API call failed');
    }

    return data.data;
  } catch (error) {
    console.error('API call failed:', error);
    
    // Handle specific error types
    if (error.message.includes('401')) {
      // Refresh token or redirect to login
      await refreshAuthToken();
    } else if (error.message.includes('429')) {
      // Rate limit exceeded - wait and retry
      await new Promise(resolve => setTimeout(resolve, 60000));
      return apiCall(endpoint, options);
    }
    
    throw error;
  }
}
```

## Best Practices

### Request Optimization

1. **Use appropriate HTTP methods**:
   - `GET` for retrieving data
   - `PUT` for creating/updating resources
   - `DELETE` for removing resources
   - `POST` for operations that don't fit CRUD patterns

2. **Include only necessary data** in request bodies

3. **Use query parameters** for filtering and pagination

4. **Implement proper error handling** with retry logic

### Security

1. **Always use HTTPS** in production
2. **Store JWT tokens securely** (not in localStorage for web apps)
3. **Implement token refresh** logic
4. **Validate all input** on the client side
5. **Don't log sensitive data**

### Performance

1. **Cache responses** when appropriate
2. **Implement request debouncing** for user input
3. **Use bulk operations** when available
4. **Monitor rate limits** and implement backoff strategies
5. **Compress request/response bodies** when possible