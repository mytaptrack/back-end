# GraphQL Types Reference

This document provides detailed information about all GraphQL types used in the MyTapTrack API.

## Core Types

### Student

The `Student` type represents a student in the system with all associated data.

```graphql
type Student {
  studentId: String!
  license: String!
  licenseDetails: LicenseSummary!
  schoolStudentId: String
  details: StudentDetails!
  lastTracked: String
  lastUpdateDate: String
  archived: Boolean
  milestones: [Milestone]!
  abc: AbcCollection
  absences: [StudentAbsence]!
  behaviors: [Trackable]!
  responses: [Trackable]!
  services: [Service]!
  futureExclusions: [Int]
  restrictions: StudentRestrictions!
  dashboard: StudentDashboardSettings!
  studentDashboard: StudentDashboardSettings
  scheduleCategories: [StudentScheduleCategory]
  features: LicenseFeatures
  notifications: [StudentNotification]
}
```

**Key Fields:**
- `studentId`: Unique identifier for the student
- `license`: License ID this student belongs to
- `details`: Basic student information (name, school ID, etc.)
- `behaviors`: List of behaviors being tracked
- `services`: List of services being provided
- `restrictions`: Permission restrictions for this student
- `dashboard`: Dashboard display settings

### StudentDetails

Basic information about a student.

```graphql
type StudentDetails {
  firstName: String!
  lastName: String!
  nickname: String
  schoolId: String
  tags: [Tag]
}
```

### Trackable

Represents a behavior or response that can be tracked.

```graphql
type Trackable {
  baseline: Boolean
  daytime: Boolean
  desc: String
  id: String!
  trackAbc: Boolean
  intensity: Int
  isArchived: Boolean
  isDuration: Boolean
  name: String!
  managed: Boolean
  requireResponse: Boolean
  targets: [TrackableTarget]
  tags: [Tag]
}
```

**Key Fields:**
- `id`: Unique identifier for the trackable item
- `name`: Display name for the behavior/response
- `isDuration`: Whether this tracks duration or frequency
- `intensity`: Intensity level (1-10 scale)
- `targets`: Performance targets and goals
- `baseline`: Whether this is used for baseline measurement

### TrackableTarget

Performance targets for behaviors and responses.

```graphql
type TrackableTarget {
  measurement: String
  measurements: [TrackableTargetMeasurement]
  progress: Int
  target: Int
  targetType: String
  intensity: Int
}
```

**Measurement Types:**
- `frequency`: Count of occurrences
- `duration`: Total time duration
- `average`: Average duration per occurrence
- `percentage`: Percentage of time/opportunities

### Service

Represents a service being provided to a student.

```graphql
type Service {
  id: String!
  name: String!
  startDate: Long!
  endDate: Long!
  desc: String
  measurementUnit: String
  period: String
  durationRounding: Int
  isDuration: Boolean
  isArchived: Boolean
  target: Int
  goals: ServiceGoal
  detailedTargets: [ServiceDetailedMinuteTarget]!
  modifications: [String]!
  currentBalance: Int
  lastUpdateDate: Int
}
```

**Key Fields:**
- `id`: Unique service identifier
- `name`: Service name (e.g., "Speech Therapy")
- `startDate`/`endDate`: Service period (Unix timestamps)
- `target`: Target minutes per period
- `currentBalance`: Current balance of service minutes
- `modifications`: List of service modifications

## Device Types

### AppDefinition

Configuration for a mobile app device.

```graphql
type AppDefinition {
  deviceId: String
  license: String!
  name: String!
  textAlerts: Boolean
  timezone: String
  studentConfigs: [AppDefinitionStudent]!
  students: [AppStudentSummary]!
  qrExpiration: Long
  tags: [Tag]!
}
```

### AppDefinitionStudent

Student configuration within a mobile app.

```graphql
type AppDefinitionStudent {
  studentId: String!
  studentName: String!
  groups: [String]
  behaviors: [AppBehaviorItem]!
  responses: [AppBehaviorItem]!
  services: [AppServiceItem]!
}
```

### AppBehaviorItem

Behavior configuration for mobile apps.

```graphql
type AppBehaviorItem {
  id: String!
  name: String!
  abc: Boolean
  order: Int!
  intensity: Boolean
  maxIntensity: Int
}
```

**Key Fields:**
- `id`: Behavior ID reference
- `name`: Display name in the app
- `abc`: Whether ABC data collection is enabled
- `order`: Display order in the app
- `intensity`: Whether intensity tracking is enabled
- `maxIntensity`: Maximum intensity level (1-10)

### Track20

IoT device (Track 2.0) configuration.

```graphql
type Track20 {
  dsn: String!
  studentId: String!
  license: String!
  deviceName: String!
  events: [IoTDeviceEvent]
  timezone: String!
  validated: Boolean
}
```

### IoTDeviceEvent

Event configuration for IoT devices.

```graphql
type IoTDeviceEvent {
  eventId: String!
  presses: Int!
  order: Int
  isDuration: Boolean
  notStopped: Boolean
  lastStart: Long
}
```

## License Types

### LicenseDetails

Complete license information.

```graphql
type LicenseDetails {
  abcCollections: [AbcCollection]!
  admins: [String]!
  customer: String!
  emailDomain: String
  expiration: String!
  features: LicenseFeatures!
  license: String
  mobileTemplates: [LicenseAppTemplate]!
  multiCount: Int
  appLimit: Int
  serviceCount: Int
  serviceUsed: Int
  singleCount: Int
  singleUsed: Int
  start: String
  studentTemplates: [LicenseStudentTemplate]!
  tags: LicenseTags
}
```

### LicenseFeatures

Feature flags for license capabilities.

```graphql
type LicenseFeatures {
  abc: Boolean
  appGroups: Boolean
  behaviorTargets: Boolean
  behaviorTracking: Boolean
  browserTracking: Boolean
  dashboard: Boolean
  devices: Boolean
  duration: Boolean
  displayTags: [LicenseDisplayTags]
  documents: Boolean
  download: Boolean
  emailTextNotifications: Boolean
  free: Boolean
  intervalWBaseline: Boolean
  manageResponses: Boolean
  manageStudentTemplates: Boolean
  manage: Boolean!
  notifications: Boolean
  personal: String
  response: Boolean
  supportChanges: Boolean
  schedule: Boolean
  serviceProgress: Boolean
  serviceTracking: Boolean
  snapshot: Boolean
  snapshotConfig: SnapshotConfig
  intensity: Int
}
```

**Key Features:**
- `behaviorTracking`: Can track behaviors
- `serviceTracking`: Can track services
- `devices`: Can use mobile apps and IoT devices
- `dashboard`: Can access dashboard features
- `manage`: Can manage other users
- `abc`: Can collect ABC data
- `notifications`: Can receive notifications

## Reporting Types

### ReportData

Individual behavior data point.

```graphql
type ReportData {
  dateEpoc: Long!
  behavior: String!
  reported: Boolean
  notStopped: Boolean
  score: Int
  isManual: Boolean
  source: ReportDataSource!
  deleted: DeleteDetails
  abc: ReportDataAbc
  duration: Int
  intensity: Int
}
```

### ReportServiceData

Individual service data point.

```graphql
type ReportServiceData {
  dateEpoc: Long!
  service: String!
  duration: Int
  reported: Boolean
  isManual: Boolean
  notStopped: Boolean
  source: ReportDataSource!
  deleted: DeleteDetails
  modifications: [String]
  serviceProgress: ReportDataProgress
}
```

### ReportDataSource

Source information for data points.

```graphql
type ReportDataSource {
  device: String!
  rater: String!
}
```

**Source Types:**
- Device: Mobile app device ID or IoT device serial number
- Rater: User ID who recorded the data

### ReportDetails

Complete report data for a date range.

```graphql
type ReportDetails {
  data: [ReportData]!
  services: [ReportServiceData]!
  raters: [RaterName]
  startMillis: Long!
  endMillis: Long
  schedules: [ReportDetailsSchedule]
  excludeDays: [String]
  includeDays: [String]
  excludedIntervals: [String]
}
```

## User Types

### User

User account information.

```graphql
type User {
  id: String
  firstName: String
  lastName: String
  name: String
  email: String
  state: String
  zip: String
  terms: String
  majorFeatures: UserMajorFeatures
  invites: [UserInvite]
}
```

### UserMajorFeatures

User's major feature access.

```graphql
type UserMajorFeatures {
  license: String
  behaviorTracking: Boolean
  serviceTracking: Boolean
  tracking: Boolean
  manage: Boolean
}
```

### UserSummary

Summary user information for lists.

```graphql
type UserSummary {
  id: String!
  firstName: String
  lastName: String
  name: String!
  email: String!
  students: [UserSummaryStudent]!
}
```

## Snapshot Types

### SnapshotReport

Snapshot report for a specific date and type.

```graphql
type SnapshotReport {
  studentId: String
  lastModified: SnapshotReportModified
  message: String
  date: String
  type: String
  behaviors: [StudentSummaryReportBehavior]
  legend: [StudentSummaryReportLegend]
  published: Boolean
}
```

### StudentSummaryReportBehavior

Behavior configuration in snapshot reports.

```graphql
type StudentSummaryReportBehavior {
  show: Boolean
  behaviorId: String
  isDuration: Boolean
  displayText: String
  faces: [StudentSummaryReportBehaviorFace]
  targets: StudentSummaryReportBehaviorTargets
  stats: StudentSummaryReportBehaviorStats
}
```

## Notification Types

### StudentNotification

Student notification record.

```graphql
type StudentNotification {
  epoch: Long!
  behaviorId: String!
}
```

### QLStudentSubscriptionConfig

Notification subscription configuration.

```graphql
type QLStudentSubscriptionConfig {
  studentId: String!
  name: String!
  behaviors: [QLStudentSubscriptionConfigNameId]!
  responses: [QLStudentSubscriptionConfigNameId]!
  notifyUntilResponse: Boolean
  users: [QLStudentSubscriptionConfigNameId]!
  emails: [String]!
  mobiles: [String]!
  devices: [QLStudentSubscriptionConfigNameId]!
  messages: QLStudentSubscriptionConfigMessages
}
```

## Input Types

### StudentInput

Input type for creating/updating students.

```graphql
input StudentInput {
  studentId: String
  license: String!
  licenseDetails: StudentLicenseSummary
  schoolStudentId: String
  details: StudentDetailsInput
  archived: Boolean
  milestones: [MilestoneInput]
  abc: AbcCollectionInput
  absences: [StudentAbsenceInput]
  behaviors: [TrackableInput]
  responses: [TrackableInput]
  services: [ServiceInput]
  futureExclusions: [Int]
  dashboard: StudentDashboardSettingsInput
  scheduleCategories: [StudentScheduleCategoryInput]
}
```

### TrackableInput

Input type for behaviors and responses.

```graphql
input TrackableInput {
  abbreviation: String
  baseline: Boolean
  daytime: Boolean
  desc: String
  id: String
  isArchived: Boolean
  isDuration: Boolean
  trackAbc: Boolean
  intensity: Int
  name: String!
  managed: Boolean
  requireResponse: Boolean
  tags: [TagInput]
  targets: [TrackableTargetInput]
}
```

### ServiceInput

Input type for services.

```graphql
input ServiceInput {
  id: String
  name: String!
  startDate: Long!
  endDate: Long!
  desc: String
  durationRounding: Int
  target: Int
  detailedTargets: [ServiceInputDetailedMinuteTarget]!
  goals: ServiceInputGoal
  modifications: [String]!
  isArchived: Boolean
}
```

### ReportDataInput

Input type for behavior/service data.

```graphql
input ReportDataInput {
  dateEpoc: Long!
  behavior: String
  service: String
  reported: Boolean
  score: Int
  isManual: Boolean
  source: ReportDataSourceInput
  deleted: DeleteDetailsInput
  abc: ReportDataAbcInput
  serviceProgress: ReportDataProgressInput
  duration: Int
  notStopped: Boolean
  modifications: [String]
  progress: ReportDataProgressInput
  redoDurations: Boolean
  intensity: Int
}
```

## Scalar Types

### Long
64-bit integer, typically used for timestamps.

```graphql
scalar Long
```

**Usage:**
- Unix timestamps in milliseconds
- Large numeric IDs
- Duration values in milliseconds

## Enums

### MeasurementType

Types of measurements for behavior targets.

```graphql
enum MeasurementType {
  Event
  Avg
  Sum
  Max
  Min
}
```

**Values:**
- `Event`: Count of occurrences
- `Avg`: Average duration
- `Sum`: Total duration
- `Max`: Maximum duration
- `Min`: Minimum duration

## Directives

### @aws_cognito_user_pools

Requires Cognito User Pool authentication.

```graphql
type Student @aws_cognito_user_pools {
  studentId: String!
  # ... other fields
}
```

### @aws_iam

Allows IAM-based authentication.

```graphql
type DeviceAppDefinition @aws_iam {
  deviceId: String!
  # ... other fields
}
```

### @aws_subscribe

Defines subscription triggers.

```graphql
type Subscription {
  onStudentDataChange(userId: String!, studentId: String!): ReportEventData 
    @aws_subscribe(mutations: ["studentDataChange"]) 
    @aws_cognito_user_pools
}
```

## Type Relationships

### Student → License
```
Student.license → LicenseDetails.license
Student.licenseDetails → LicenseSummary
Student.features → LicenseFeatures
```

### Student → Behaviors/Services
```
Student.behaviors → [Trackable]
Student.services → [Service]
Student.responses → [Trackable]
```

### App → Students
```
AppDefinition.studentConfigs → [AppDefinitionStudent]
AppDefinition.students → [AppStudentSummary]
AppDefinitionStudent.studentId → Student.studentId
```

### Data → Students
```
ReportData.behavior → Trackable.id
ReportServiceData.service → Service.id
ReportEventData.studentId → Student.studentId
```

### User → Students
```
User.majorFeatures.license → LicenseDetails.license
UserSummary.students → [UserSummaryStudent]
UserSummaryStudent.studentId → Student.studentId
```

## Validation Rules

### Required Fields
- All fields marked with `!` are required
- Input types must provide all required fields
- Mutations will fail if required fields are missing

### String Lengths
- `studentId`: 1-50 characters
- `license`: 1-50 characters  
- `firstName`/`lastName`: 1-100 characters
- `name`: 1-200 characters
- `desc`: 0-1000 characters

### Numeric Ranges
- `intensity`: 1-10
- `target`: 0-999999
- `progress`: 0-999999
- `score`: 0-10
- `duration`: 0-86400000 (24 hours in milliseconds)

### Date Formats
- `dateEpoc`: Unix timestamp in milliseconds
- `startDate`/`endDate`: Unix timestamp in milliseconds
- `date` (strings): ISO 8601 format (YYYY-MM-DD)

### Array Limits
- `behaviors`: Maximum 100 items
- `services`: Maximum 50 items
- `tags`: Maximum 20 items
- `modifications`: Maximum 10 items