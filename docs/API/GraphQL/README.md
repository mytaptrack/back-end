# GraphQL API Documentation

The MyTapTrack GraphQL API provides a comprehensive interface for managing students, behaviors, services, devices, and reporting data. Built on AWS AppSync, it supports real-time subscriptions and fine-grained authorization.

## Table of Contents

- [Schema Overview](#schema-overview)
- [Authentication](#authentication)
- [Queries](#queries)
- [Mutations](#mutations)
- [Subscriptions](#subscriptions)
- [Types](#types)
- [Examples](#examples)
- [Error Handling](#error-handling)

## Schema Overview

The GraphQL schema is organized into several main domains:

- **Students**: Student management, behaviors, and services
- **Devices**: Mobile apps and IoT device management
- **Licenses**: License management and features
- **Reports**: Data reporting and analytics
- **Users**: User management and permissions
- **Notifications**: Real-time notifications and subscriptions

## Authentication

The GraphQL API supports two authentication methods:

### Cognito User Pools
For user-facing applications:
```graphql
# All user operations require @aws_cognito_user_pools
query GetStudent($studentId: String!) {
  getStudent(studentId: $studentId) {
    studentId
    details {
      firstName
      lastName
    }
  }
}
```

### IAM Authentication
For service-to-service communication:
```graphql
# Service operations can use @aws_iam
query GetStudentForService($studentId: String!, $userId: String) {
  getStudent(studentId: $studentId, userId: $userId) {
    studentId
    behaviors {
      id
      name
    }
  }
}
```

## Queries

### Student Queries

#### getStudents
Retrieve a list of students with optional filtering.

```graphql
query GetStudents($params: getStudentsParams) {
  getStudents(params: $params) {
    studentId
    details {
      firstName
      lastName
      nickname
      schoolId
    }
    tracking {
      service
      behavior
    }
    lastTracked
  }
}
```

**Parameters:**
- `params.behavior` (Boolean): Filter students with behavior tracking
- `params.service` (Boolean): Filter students with service tracking  
- `params.trackable` (Boolean): Filter students with any tracking

**Example:**
```graphql
query {
  getStudents(params: { behavior: true, service: true }) {
    studentId
    details {
      firstName
      lastName
    }
    behaviors {
      id
      name
      isDuration
    }
  }
}
```

#### getStudent
Retrieve detailed information for a specific student.

```graphql
query GetStudent($studentId: String!, $userId: String) {
  getStudent(studentId: $studentId, userId: $userId) {
    studentId
    license
    licenseDetails {
      fullYear
      flexible
      services
      transferable
      expiration
    }
    details {
      firstName
      lastName
      nickname
      schoolId
      tags {
        tag
        type
      }
    }
    behaviors {
      id
      name
      desc
      isDuration
      intensity
      targets {
        measurement
        target
        progress
        targetType
      }
    }
    services {
      id
      name
      startDate
      endDate
      target
      currentBalance
    }
    milestones {
      date
      title
      description
    }
    restrictions {
      info
      data
      behavior
      service
    }
  }
}
```

#### findStudent
Search for students by name and license.

```graphql
query FindStudent($license: String, $firstName: String, $lastName: String) {
  findStudent(license: $license, firstName: $firstName, lastName: $lastName) {
    studentId
    details {
      firstName
      lastName
      schoolId
    }
  }
}
```

### Device Queries

#### getAppList
Retrieve list of mobile apps for a license.

```graphql
query GetAppList($license: String!, $studentId: String) {
  getAppList(license: $license, studentId: $studentId) {
    deviceId
    name
    tags
    studentName
    behaviors {
      id
      name
      abc
      order
      intensity
      maxIntensity
    }
    responses {
      id
      name
      abc
      order
    }
    services {
      id
      name
      order
    }
    textAlerts
  }
}
```

#### getApp
Retrieve detailed configuration for a specific mobile app.

```graphql
query GetApp($license: String!, $deviceId: String!) {
  getApp(license: $license, deviceId: $deviceId) {
    deviceId
    license
    name
    textAlerts
    timezone
    qrExpiration
    tags {
      tag
      type
    }
    studentConfigs {
      studentId
      studentName
      groups
      behaviors {
        id
        abc
        order
        intensity
      }
      responses {
        id
        order
      }
      services {
        id
        order
      }
    }
    students {
      studentId
      nickname
      abcAvailable
      restrictions {
        behavior
        service
        data
      }
      behaviors {
        id
        name
        baseline
        abc
        isDuration
        notStopped
        order
      }
      responses {
        id
        name
        baseline
        abc
        isDuration
        notStopped
        order
      }
      services {
        id
        name
        notStopped
        order
        percentage
        trackedItems
        modifications
      }
    }
  }
}
```

#### getAppToken
Generate authentication token for mobile app access.

```graphql
query GetAppToken($license: String!, $deviceId: String!, $expiration: Long) {
  getAppToken(license: $license, deviceId: $deviceId, expiration: $expiration) {
    token
    qrExpiration
  }
}
```

### License Queries

#### getLicenses
Retrieve license information for multiple licenses.

```graphql
query GetLicenses($licenses: [String]) {
  getLicenses(licenses: $licenses) {
    license
    customer
    expiration
    features {
      abc
      behaviorTracking
      serviceTracking
      devices
      dashboard
      notifications
      manage
    }
    admins
    singleCount
    singleUsed
    multiCount
  }
}
```

#### getLicenseStats
Get usage statistics for a license.

```graphql
query GetLicenseStats($license: String!) {
  getLicenseStats(license: $license) {
    license {
      license
      customer
      singleCount
      singleUsed
      multiCount
    }
    stats {
      single
      flexible {
        date
        count
      }
    }
  }
}
```

### Data and Reporting Queries

#### getData
Retrieve behavior and service data for reporting.

```graphql
query GetData($studentId: String!, $startDate: String!, $endDate: String!, $scope: ReportScope!) {
  getData(studentId: $studentId, startDate: $startDate, endDate: $endDate, scope: $scope) {
    data {
      dateEpoc
      behavior
      reported
      notStopped
      score
      isManual
      source {
        device
        rater
      }
      abc {
        a
        c
      }
      duration
      intensity
    }
    services {
      dateEpoc
      service
      duration
      reported
      isManual
      notStopped
      source {
        device
        rater
      }
      modifications
      serviceProgress {
        progress
        measurements {
          name
          value
        }
      }
    }
    raters {
      rater
      name
    }
    startMillis
    endMillis
    schedules {
      date
      schedule
    }
    excludeDays
    includeDays
    excludedIntervals
  }
}
```

#### getNotes
Retrieve notes for a student within a date range.

```graphql
query GetNotes($studentId: String!, $startDate: String!, $endDate: String!) {
  getNotes(studentId: $studentId, startDate: $startDate, endDate: $endDate) {
    studentId
    product
    noteDate
    noteId
    dateEpoc
    date
    source {
      id
      name
      type
    }
    note
  }
}
```

### Snapshot Queries

#### listSnapshots
List available snapshot reports for a student.

```graphql
query ListSnapshots($studentId: String!) {
  listSnapshots(studentId: $studentId) {
    reports {
      date
      type
    }
    latest {
      studentId
      date
      type
      message
      published
      behaviors {
        show
        behaviorId
        isDuration
        displayText
        faces {
          face
          overwrite
        }
        targets {
          frequency {
            target
            progress
            measurement
          }
        }
      }
    }
  }
}
```

#### getSnapshot
Retrieve a specific snapshot report.

```graphql
query GetSnapshot($studentId: String!, $date: String!, $reportType: String!, $timezone: String, $userId: String) {
  getSnapshot(studentId: $studentId, date: $date, reportType: $reportType, timezone: $timezone, userId: $userId) {
    studentId
    date
    type
    message
    published
    lastModified {
      userId
      date
    }
    behaviors {
      show
      behaviorId
      isDuration
      displayText
      faces {
        face
        overwrite
      }
      targets {
        frequency {
          target
          progress
          measurement
          measurements {
            name
            value
          }
        }
        sum {
          target
          progress
          measurement
        }
        avg {
          target
          progress
          measurement
        }
        max {
          target
          progress
          measurement
        }
        min {
          target
          progress
          measurement
        }
      }
      stats {
        week {
          count
          delta
          modifier
        }
        day {
          count
          delta
          modifier
        }
      }
    }
    legend {
      behavior
      measurement
      target
      progress
      measurements {
        name
        value
        color
        order
      }
    }
  }
}
```

### User Queries

#### getUser
Retrieve current user information.

```graphql
query GetUser {
  getUser {
    id
    firstName
    lastName
    name
    email
    state
    zip
    terms
    majorFeatures {
      license
      behaviorTracking
      serviceTracking
      tracking
      manage
    }
    invites {
      name
      studentId
      status
    }
  }
}
```

#### getUsersForLicense
Get all users associated with a license.

```graphql
query GetUsersForLicense($license: String!) {
  getUsersForLicense(license: $license) {
    users {
      id
      firstName
      lastName
      name
      email
      students {
        studentId
        restrictions {
          info
          data
          behavior
          service
        }
        behaviors
        services
        teamStatus
      }
    }
    students {
      id
      name
      firstName
      lastName
      schoolId
      behaviors {
        name
        id
      }
      services {
        name
        id
      }
      licenseDetails {
        fullYear
        flexible
        services
        transferable
        expiration
      }
    }
  }
}
```

## Mutations

### Student Mutations

#### updateStudent
Create or update a student record.

```graphql
mutation UpdateStudent($student: StudentInput!) {
  updateStudent(student: $student) {
    studentId
    license
    details {
      firstName
      lastName
      nickname
      schoolId
    }
    behaviors {
      id
      name
      desc
      isDuration
      intensity
      targets {
        measurement
        target
        progress
      }
    }
    services {
      id
      name
      startDate
      endDate
      target
    }
    milestones {
      date
      title
      description
    }
  }
}
```

**Example:**
```graphql
mutation {
  updateStudent(student: {
    license: "LICENSE123"
    details: {
      firstName: "John"
      lastName: "Doe"
      nickname: "Johnny"
      schoolId: "STU001"
    }
    behaviors: [{
      name: "On Task Behavior"
      desc: "Student remains focused on assigned task"
      isDuration: true
      daytime: true
      baseline: false
      targets: [{
        measurement: "frequency"
        target: 80
        targetType: "increase"
      }]
    }]
    services: [{
      name: "Speech Therapy"
      startDate: 1640995200000
      endDate: 1672531200000
      target: 30
    }]
  }) {
    studentId
    details {
      firstName
      lastName
    }
  }
}
```

#### deleteStudent
Delete one or more students.

```graphql
mutation DeleteStudent($studentIds: [String], $license: String) {
  deleteStudent(studentIds: $studentIds, license: $license)
}
```

### Service Mutations

#### updateService
Update a service definition for a student.

```graphql
mutation UpdateService($studentId: String!, $service: ServiceInput) {
  updateService(studentId: $studentId, service: $service) {
    id
    name
    startDate
    endDate
    desc
    target
    currentBalance
    goals {
      trackGoalPercent
      goalTargets {
        name
        startAt
        goal
      }
    }
    detailedTargets {
      date
      target
      groupId
      type
    }
    modifications
  }
}
```

#### updateServiceDefinition
Update a global service definition.

```graphql
mutation UpdateServiceDefinition($service: ServiceInput!) {
  updateServiceDefinition(service: $service) {
    id
    name
    desc
    isDuration
    target
    modifications
  }
}
```

#### deleteServiceDefinition
Delete a service definition.

```graphql
mutation DeleteServiceDefinition($serviceId: String!) {
  deleteServiceDefinition(serviceId: $serviceId) {
    id
    name
    isArchived
  }
}
```

### Device Mutations

#### updateApp
Create or update a mobile app configuration.

```graphql
mutation UpdateApp($appConfig: AppDefinitionInput!) {
  updateApp(appConfig: $appConfig) {
    deviceId
  }
}
```

**Example:**
```graphql
mutation {
  updateApp(appConfig: {
    license: "LICENSE123"
    name: "Classroom App"
    textAlerts: true
    timezone: "America/New_York"
    tags: [{
      tag: "classroom"
      type: "location"
    }]
    studentConfigs: [{
      studentId: "STUDENT123"
      studentName: "John Doe"
      groups: ["Group A"]
      behaviors: [{
        id: "BEHAVIOR123"
        abc: true
        order: 1
        intensity: true
      }]
      responses: [{
        id: "RESPONSE123"
        order: 1
      }]
      services: [{
        id: "SERVICE123"
        order: 1
      }]
    }]
  }) {
    deviceId
  }
}
```

### Data Mutations

#### updateDataInReport
Add or update behavior/service data.

```graphql
mutation UpdateDataInReport($studentId: String!, $data: ReportDataInput!) {
  updateDataInReport(studentId: $studentId, data: $data) {
    dateEpoc
    behavior
    service
    reported
    score
    isManual
    source {
      device
      rater
    }
    duration
    intensity
  }
}
```

#### studentDataChange
Real-time data change event (triggers subscription).

```graphql
mutation StudentDataChange($input: ReportEventDataInput) {
  studentDataChange(input: $input) {
    studentId
    userId
    dateEpoc
    behavior
    service
    reported
    score
    source {
      device
      rater
    }
    duration
    intensity
  }
}
```

### User Mutations

#### updateUser
Update user profile information.

```graphql
mutation UpdateUser($user: UserUpdateInput!) {
  updateUser(user: $user) {
    id
    firstName
    lastName
    name
    email
    students {
      studentId
      restrictions {
        info
        data
        behavior
        service
      }
      behaviors
      services
      teamStatus
    }
  }
}
```

#### changeLicense
Change user's license association.

```graphql
mutation ChangeLicense($input: LicenseUpdateInput) {
  changeLicense(input: $input) {
    license
    customer
    features {
      behaviorTracking
      serviceTracking
      manage
    }
    userId
  }
}
```

### Notification Mutations

#### deleteNotifications
Delete student notifications.

```graphql
mutation DeleteNotifications($notifications: QLDeleteNotificationInput!) {
  deleteNotifications(notifications: $notifications) {
    epoch
    behaviorId
  }
}
```

#### studentNotificationChange
Trigger notification change event.

```graphql
mutation StudentNotificationChange($studentId: String!, $userId: String!) {
  studentNotificationChange(studentId: $studentId, userId: $userId) {
    epoch
    behaviorId
  }
}
```

### Notes Mutations

#### updateNotes
Add or update student notes.

```graphql
mutation UpdateNotes($input: StudentNoteInput!) {
  updateNotes(input: $input) {
    studentId
    product
    noteDate
    noteId
    dateEpoc
    date
    source {
      id
      name
      type
    }
    note
  }
}
```

### Snapshot Mutations

#### updateSnapshot
Create or update a snapshot report.

```graphql
mutation UpdateSnapshot($studentId: String!, $date: String!, $reportType: String!, $snapshot: SnapshotReportInput!) {
  updateSnapshot(studentId: $studentId, date: $date, reportType: $reportType, snapshot: $snapshot) {
    studentId
    date
    type
    message
    published
    behaviors {
      show
      behaviorId
      displayText
      faces {
        face
        overwrite
      }
    }
  }
}
```

## Subscriptions

GraphQL subscriptions provide real-time updates for critical data changes.

### onStudentDataChange
Subscribe to real-time data changes for a specific student.

```graphql
subscription OnStudentDataChange($userId: String!, $studentId: String!) {
  onStudentDataChange(userId: $userId, studentId: $studentId) {
    studentId
    userId
    dateEpoc
    behavior
    service
    reported
    score
    source {
      device
      rater
    }
    duration
    intensity
  }
}
```

**Usage Example:**
```typescript
import { gql } from '@apollo/client';

const STUDENT_DATA_SUBSCRIPTION = gql`
  subscription OnStudentDataChange($userId: String!, $studentId: String!) {
    onStudentDataChange(userId: $userId, studentId: $studentId) {
      studentId
      dateEpoc
      behavior
      service
      score
      duration
    }
  }
`;

// Subscribe to changes
const { data, loading, error } = useSubscription(STUDENT_DATA_SUBSCRIPTION, {
  variables: { userId: 'USER123', studentId: 'STUDENT123' }
});
```

### onStudentNotificationChange
Subscribe to notification changes.

```graphql
subscription OnStudentNotificationChange {
  onStudentNotificationChange {
    epoch
    behaviorId
  }
}
```

### onUserLicenseChange
Subscribe to license changes for a user.

```graphql
subscription OnUserLicenseChange($userId: String!) {
  onUserLicenseChange(userId: $userId) {
    license
    customer
    features {
      behaviorTracking
      serviceTracking
      manage
    }
    userId
  }
}
```

### onStudentNote
Subscribe to new notes for a student.

```graphql
subscription OnStudentNote($studentId: String!) {
  onStudentNote(studentId: $studentId) {
    studentId
    noteDate
    note
    source {
      name
      type
    }
  }
}
```

## Error Handling

GraphQL errors follow the standard GraphQL error format:

```json
{
  "errors": [
    {
      "message": "Student not found",
      "locations": [
        {
          "line": 2,
          "column": 3
        }
      ],
      "path": ["getStudent"],
      "extensions": {
        "code": "STUDENT_NOT_FOUND",
        "studentId": "INVALID123"
      }
    }
  ],
  "data": null
}
```

### Common Error Codes

- `UNAUTHORIZED`: User lacks permission for the operation
- `STUDENT_NOT_FOUND`: Requested student does not exist
- `LICENSE_EXPIRED`: User's license has expired
- `VALIDATION_ERROR`: Input validation failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server-side error

### Error Handling Example

```typescript
import { useQuery } from '@apollo/client';

const { data, loading, error } = useQuery(GET_STUDENT, {
  variables: { studentId: 'STUDENT123' },
  errorPolicy: 'all'
});

if (error) {
  error.graphQLErrors.forEach(({ message, extensions }) => {
    console.error(`GraphQL error: ${message}`, extensions);
  });
  
  if (error.networkError) {
    console.error('Network error:', error.networkError);
  }
}
```

## Best Practices

### Query Optimization

1. **Use Fragments** for reusable field selections:
```graphql
fragment StudentBasics on Student {
  studentId
  details {
    firstName
    lastName
    nickname
  }
}

query GetStudents {
  getStudents {
    ...StudentBasics
    lastTracked
  }
}
```

2. **Request Only Needed Fields** to minimize payload:
```graphql
# Good - specific fields
query GetStudentName($studentId: String!) {
  getStudent(studentId: $studentId) {
    details {
      firstName
      lastName
    }
  }
}

# Avoid - requesting all fields
query GetStudent($studentId: String!) {
  getStudent(studentId: $studentId) {
    # ... all fields
  }
}
```

3. **Use Variables** instead of inline values:
```graphql
# Good
query GetStudent($studentId: String!) {
  getStudent(studentId: $studentId) {
    studentId
  }
}

# Avoid
query {
  getStudent(studentId: "STUDENT123") {
    studentId
  }
}
```

### Subscription Management

1. **Unsubscribe** when components unmount:
```typescript
useEffect(() => {
  const subscription = client.subscribe({
    query: STUDENT_DATA_SUBSCRIPTION,
    variables: { userId, studentId }
  }).subscribe({
    next: (data) => {
      // Handle data
    }
  });

  return () => subscription.unsubscribe();
}, [userId, studentId]);
```

2. **Handle Connection States**:
```typescript
const { data, loading, error } = useSubscription(SUBSCRIPTION, {
  onSubscriptionData: ({ subscriptionData }) => {
    // Handle new data
  },
  onSubscriptionComplete: () => {
    // Handle completion
  }
});
```

### Caching Strategy

1. **Use Apollo Cache** effectively:
```typescript
const client = new ApolloClient({
  cache: new InMemoryCache({
    typePolicies: {
      Student: {
        keyFields: ["studentId"],
      },
      Service: {
        keyFields: ["id"],
      }
    }
  })
});
```

2. **Update Cache** after mutations:
```typescript
const [updateStudent] = useMutation(UPDATE_STUDENT, {
  update(cache, { data: { updateStudent } }) {
    cache.modify({
      fields: {
        getStudents(existingStudents = []) {
          const newStudentRef = cache.writeFragment({
            data: updateStudent,
            fragment: gql`
              fragment NewStudent on Student {
                studentId
                details {
                  firstName
                  lastName
                }
              }
            `
          });
          return [...existingStudents, newStudentRef];
        }
      }
    });
  }
});
```