# GraphQL Mutations Business Logic Migration

This document summarizes the migration of GraphQL mutations from embedded business logic to centralized business logic layer packages.

## Overview

GraphQL mutations previously contained complex business logic directly in their resolver functions. This has been refactored to delegate all business logic to dedicated business logic layer packages, making the resolvers thin orchestration layers.

## Migrated Mutations

### 1. App Update Mutation (Device Configuration)
**File**: `api/src/graphql/resolver/mutations/app/update.ts`
**Business Logic Package**: `@mytaptrack/business-logic-app`
**Operation**: `AppOperations.updateAppConfiguration()`

**Changes Made**:
- Removed embedded device creation/update logic
- Removed embedded student configuration management
- Removed embedded PII handling logic
- Removed embedded device reassignment logic
- Removed embedded transaction management
- Removed embedded device deletion logic
- Delegated all business logic to `AppOperations.updateAppConfiguration()`

**Business Logic Added**:
- `AppOperations.updateAppConfiguration()` - Main orchestration for device configuration updates
- `AppOperations.deleteAppDevice()` - Device deletion with proper cleanup
- `AppOperations.reassignAppDevice()` - Device reassignment with new ID generation
- `AppOperations.createOrUpdateAppDevice()` - Device creation and updates
- `AppOperations.processStudentConfigurations()` - Student assignment management
- `AppOperations.buildDevicePiiData()` - PII data construction
- `AppOperations.buildDeviceConfigData()` - Configuration data construction

### 2. License Change Mutation
**File**: `api/src/graphql/resolver/mutations/license/change-license.ts`
**Business Logic Package**: `@mytaptrack/business-logic-license`
**Operation**: `LicenseOperations.changeLicense()`

**Changes Made**:
- Removed embedded Stripe subscription cancellation logic
- Removed embedded license data deletion logic
- Removed embedded license downgrade logic
- Removed embedded transaction management logic
- Delegated all business logic to `LicenseOperations.changeLicense()`

**Business Logic Added**:
- `LicenseOperations.changeLicense()` - Main license change orchestration
- `LicenseOperations.performFullCancellation()` - Full license cancellation logic
- `LicenseOperations.performCancellation()` - License downgrade to free tier
- `LicenseOperations.cancelStripeSubscription()` - Stripe integration handling

### 3. License Updated Mutation
**File**: `api/src/graphql/resolver/mutations/license/license-updated.ts`
**Business Logic Package**: `@mytaptrack/business-logic-license`
**Operation**: `LicenseOperations.getLicenseForUser()`

**Changes Made**:
- Removed embedded user lookup logic
- Removed embedded license retrieval logic
- Removed embedded permission checking logic
- Delegated all business logic to `LicenseOperations.getLicenseForUser()`

**Business Logic Added**:
- `LicenseOperations.getLicenseForUser()` - User license retrieval with permission checking
- User configuration validation
- License access permission validation
- Proper error handling for missing users/licenses

### 4. Report Data Submission Mutation
**File**: `api/src/graphql/resolver/mutations/report/data.ts`
**Business Logic Package**: `@mytaptrack/business-logic-report`
**Operation**: `ReportOperations.submitReportData()`

**Changes Made**:
- Removed embedded student configuration retrieval logic
- Removed embedded behavior/service validation logic
- Removed embedded event message construction logic
- Removed embedded SQS event publishing logic
- Delegated all business logic to `ReportOperations.submitReportData()`

**Business Logic Added**:
- `ReportOperations.submitReportData()` - Report data submission orchestration
- Student configuration validation
- Behavior/service lookup and validation
- Event message construction and publishing

### 5. Report Date Inclusion Mutation
**File**: `api/src/graphql/resolver/mutations/report/date-inclusion.ts`
**Business Logic Package**: `@mytaptrack/business-logic-report`
**Operation**: `ReportOperations.updateDateInclusions()`

**Changes Made**:
- Removed embedded date parsing and validation logic
- Removed embedded report existence checking logic
- Removed embedded empty report creation logic
- Removed embedded week-by-week processing logic
- Removed embedded database update operations
- Delegated all business logic to `ReportOperations.updateDateInclusions()`

**Business Logic Added**:
- `ReportOperations.updateDateInclusions()` - Main orchestration for date inclusion/exclusion updates
- `ReportOperations.checkReportExists()` - Report existence validation
- `ReportOperations.createEmptyReport()` - Empty report creation for missing weeks
- `ReportOperations.updateReportDateSettings()` - Database update operations
- Date validation and parsing logic
- Week-by-week processing with proper error handling

### 6. Report Notes Mutation
**File**: `api/src/graphql/resolver/mutations/report/notes.ts`
**Business Logic Package**: `@mytaptrack/business-logic-report`
**Operation**: `ReportOperations.processStudentNote()`

**Changes Made**:
- Removed embedded note data preparation logic
- Removed embedded source name resolution logic
- Removed embedded note creation/update/deletion logic
- Removed embedded database operations
- Delegated all business logic to `ReportOperations.processStudentNote()`

**Business Logic Added**:
- `ReportOperations.processStudentNote()` - Main orchestration for note processing
- `ReportOperations.prepareNoteData()` - Note data preparation and validation
- `ReportOperations.deleteStudentNote()` - Note deletion with proper cleanup
- `ReportOperations.saveStudentNote()` - Note creation and updates
- `ReportOperations.resolveSourceName()` - Source name resolution based on type
- Note ID generation and validation logic

### 7. Report Schedule Mutation
**File**: `api/src/graphql/resolver/mutations/report/schedule.ts`
**Business Logic Package**: `@mytaptrack/business-logic-report`
**Operation**: `ReportOperations.updateReportSchedule()`

**Changes Made**:
- Removed embedded date validation and parsing logic
- Removed embedded report creation/update logic
- Removed embedded schedule array normalization logic
- Removed embedded database operations
- Delegated all business logic to `ReportOperations.updateReportSchedule()`

**Business Logic Added**:
- `ReportOperations.updateReportSchedule()` - Main orchestration for schedule updates
- `ReportOperations.updateExistingReportSchedule()` - Update existing report schedules
- `ReportOperations.createNewReportWithSchedule()` - Create new reports with schedules
- Schedule array normalization and legacy format conversion
- Date validation and week calculation logic

## Pattern Applied

All migrated mutations now follow this consistent pattern:

```typescript
export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<ResponseType> {
    const serviceContext = await createLambdaServiceContext();
    try {
        // Extract parameters
        const params = context.arguments;
        const userId = context.identity.username;
        const userLicenses = context.identity.groups?.filter(x => x.startsWith('licenses/')).map(x => x.substring('licenses/'.length)) || [];
        
        // Log request
        serviceContext.logger.info('Processing request', { params, userId });
        
        // Delegate to business logic
        const result = await BusinessOperations.operationMethod({
            ...params,
            userId,
            userLicenses
        }, serviceContext);
        
        // Transform and return result
        return transformToGraphQLResponse(result);
    } catch (error) {
        // Handle errors consistently
        serviceContext.logger.error('Operation failed', { error: error.message });
        if (error instanceof ValidationError || error instanceof NotFoundError || 
            error instanceof AccessDeniedError || error instanceof BusinessLogicError) {
            throw new WebError(error.message);
        }
        throw new WebError('Operation failed');
    }
}
```

## Benefits Achieved

1. **Separation of Concerns**: GraphQL resolvers are now thin orchestration layers
2. **Reusability**: Business logic can be reused across different interfaces (GraphQL, REST, Lambda)
3. **Testability**: Business logic can be unit tested independently
4. **Maintainability**: Complex logic is centralized and easier to maintain
5. **Consistency**: Error handling and logging are standardized
6. **Type Safety**: Strong typing throughout the business logic layer

## Remaining Work

The following mutations still contain embedded business logic and should be migrated:

1. **Student Service Update**: `api/src/graphql/resolver/mutations/student/service/update-definition/`
2. **User Info Update**: `api/src/graphql/resolver/mutations/user/info.ts`
3. **Report Processing**: `api/src/graphql/resolver/mutations/report/process.ts`
4. **Report Schedule**: `api/src/graphql/resolver/mutations/report/schedule.ts`
5. **Support Email**: `api/src/graphql/resolver/mutations/support/email.ts`
6. **Student Notifications**: `api/src/graphql/resolver/mutations/student/notifications/`

## Next Steps

1. Continue migrating remaining GraphQL mutations
2. Apply the same pattern to GraphQL queries
3. Migrate Lambda function handlers to use business logic layer
4. Update REST API endpoints to use business logic layer
5. Create comprehensive integration tests for business logic operations

## Testing Strategy

Each migrated mutation should be tested at multiple levels:

1. **Unit Tests**: Test business logic operations in isolation
2. **Integration Tests**: Test GraphQL resolvers with business logic
3. **End-to-End Tests**: Test complete GraphQL operations
4. **Error Handling Tests**: Verify proper error propagation and handling

## Performance Considerations

- Business logic operations are designed to be efficient with minimal database calls
- Caching is implemented at the business logic layer where appropriate
- Event publishing is asynchronous to avoid blocking operations
- Service context provides connection pooling and resource management