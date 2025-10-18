# Mobile App Integration Guide

This guide provides comprehensive information for integrating iOS and Android mobile applications with the MyTapTrack system for behavior and service tracking.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [App Configuration](#app-configuration)
- [Behavior Tracking](#behavior-tracking)
- [Service Tracking](#service-tracking)
- [Notes and Documentation](#notes-and-documentation)
- [Offline Support](#offline-support)
- [Push Notifications](#push-notifications)
- [Error Handling](#error-handling)
- [iOS Implementation](#ios-implementation)
- [Android Implementation](#android-implementation)
- [Best Practices](#best-practices)

## Overview

MyTapTrack mobile applications provide comprehensive data collection capabilities for educational and therapeutic settings. The apps support real-time behavior tracking, service delivery documentation, and ABC (Antecedent-Behavior-Consequence) data collection.

### Key Features

- **Real-time Tracking**: Immediate behavior and service event recording
- **ABC Data Collection**: Comprehensive antecedent-behavior-consequence tracking
- **Duration Tracking**: Start/stop timing for behaviors and services
- **Intensity Scaling**: 1-10 intensity levels for behaviors
- **Progress Tracking**: Percentage-based progress measurements for services
- **Notes Integration**: Text notes and media attachments
- **Offline Support**: Local storage with automatic sync
- **Multi-Student Support**: Single app can track multiple students
- **Push Notifications**: Reminders and alerts

### Supported Platforms

- **iOS**: iOS 14.0 and later
- **Android**: Android API level 24 (Android 7.0) and later
- **Cross-Platform**: React Native, Flutter, Xamarin compatible

## Authentication

### Token-Based Authentication

Mobile apps use encrypted JWT tokens containing student and device information:

```json
{
  "studentId": "student-123",
  "deviceId": "app-device-456",
  "permissions": ["track_behavior", "track_service", "add_notes"],
  "expires": "2024-12-31T23:59:59Z"
}
```

### Token Encryption

Tokens are encrypted using AES-256 encryption with device-specific keys:

```javascript
// Example token structure (before encryption)
const tokenData = {
  student: "student-123",
  device: "mobile-app-456",
  permissions: ["behavior", "service", "notes"],
  issued: "2024-01-15T10:00:00Z",
  expires: "2024-01-16T10:00:00Z"
};

// Encrypted token (what gets transmitted)
const encryptedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

### Device Registration

Each mobile app instance must be registered:

1. **Device ID**: Unique identifier for the app installation
2. **Platform**: iOS or Android
3. **App Version**: Current application version
4. **Push Token**: Firebase/APNs token for notifications

## App Configuration

### Retrieve Configuration

Get student configurations and tracking setup:

```http
POST /api/app/v3/retrieve
Content-Type: application/json

{
  "device": {
    "id": "mobile-app-456",
    "version": 3
  },
  "tokens": [
    "encrypted-token-1",
    "encrypted-token-2"
  ],
  "notifications": {
    "token": "fcm-push-token-here",
    "os": "ios"
  }
}
```

### Configuration Response

```json
{
  "tokenUpdate": "new-device-token-if-changed",
  "name": "Classroom Tracking App",
  "targets": [
    {
      "token": "updated-encrypted-student-token",
      "name": "John Doe",
      "groups": ["Group A", "Math Class"],
      "abc": {
        "name": "ABC Data Collection",
        "antecedents": [
          "Teacher instruction given",
          "Peer interaction",
          "Transition time",
          "Independent work time",
          "Group activity"
        ],
        "consequences": [
          "Verbal praise",
          "Token reward",
          "Break provided",
          "Redirection given",
          "Ignored"
        ],
        "tags": ["academic", "social", "behavioral"],
        "overwrite": false
      },
      "behaviors": [
        {
          "title": "On Task Behavior",
          "id": "behavior-123",
          "isDuration": true,
          "abc": true,
          "durationOn": false,
          "order": 1,
          "intensity": 10,
          "track": true
        },
        {
          "title": "Verbal Outburst",
          "id": "behavior-456",
          "isDuration": false,
          "abc": true,
          "durationOn": false,
          "order": 2,
          "intensity": 10,
          "track": false
        }
      ],
      "services": [
        {
          "title": "Speech Therapy",
          "id": "service-789",
          "order": 1,
          "trackedItems": [
            "Articulation Goals",
            "Language Comprehension",
            "Social Communication"
          ],
          "percent": true,
          "modifications": [
            "Individual Session",
            "Quiet Environment",
            "Visual Supports",
            "Extended Time"
          ]
        }
      ]
    }
  ]
}
```

### Configuration Fields

#### Student Configuration
- `token`: Encrypted access token for the student
- `name`: Student display name
- `groups`: Array of group/class assignments
- `abc`: ABC data collection configuration (optional)

#### Behavior Configuration
- `title`: Display name for the behavior
- `id`: Unique behavior identifier
- `isDuration`: Whether to track start/end times
- `abc`: Whether to collect ABC data
- `durationOn`: Default duration tracking state
- `order`: Display order in the app
- `intensity`: Maximum intensity level (1-10)
- `track`: Whether to show response tracking

#### Service Configuration
- `title`: Display name for the service
- `id`: Unique service identifier
- `order`: Display order in the app
- `trackedItems`: Array of progress items to track
- `percent`: Whether progress is percentage-based
- `modifications`: Available service modifications

## Behavior Tracking

### Track Behavior Event

Record behavior occurrences with optional ABC data:

```http
POST /api/app/track
Content-Type: application/json

{
  "token": "encrypted-student-token",
  "behaviorId": "behavior-123",
  "deviceId": "mobile-app-456",
  "date": "2024-01-15T10:30:00Z",
  "endDate": "2024-01-15T10:35:00Z",
  "timezone": "America/New_York",
  "antecedent": "Teacher instruction given",
  "consequence": "Verbal praise provided",
  "intensity": 7,
  "notes": "Student responded well to clear instructions"
}
```

### Behavior Event Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Encrypted student access token |
| `behaviorId` | string | Yes | Behavior identifier from configuration |
| `deviceId` | string | Yes | Mobile app device identifier |
| `date` | string | Yes | Event start time (ISO 8601) |
| `endDate` | string | No | Event end time for duration tracking |
| `timezone` | string | No | Device timezone (defaults to UTC) |
| `antecedent` | string | No | What happened before the behavior |
| `consequence` | string | No | What happened after the behavior |
| `intensity` | number | No | Intensity level (1-10) |
| `notes` | string | No | Additional notes about the event |
| `remove` | boolean | No | Set to true to delete this event |

### Duration Tracking

For behaviors configured with `isDuration: true`:

#### Start Tracking
```json
{
  "token": "encrypted-student-token",
  "behaviorId": "behavior-123",
  "deviceId": "mobile-app-456",
  "date": "2024-01-15T10:30:00Z",
  "timezone": "America/New_York"
}
```

#### Stop Tracking
```json
{
  "token": "encrypted-student-token",
  "behaviorId": "behavior-123",
  "deviceId": "mobile-app-456",
  "date": "2024-01-15T10:30:00Z",
  "endDate": "2024-01-15T10:35:00Z",
  "timezone": "America/New_York",
  "intensity": 5
}
```

### Frequency Tracking

For discrete behavior events:

```json
{
  "token": "encrypted-student-token",
  "behaviorId": "behavior-456",
  "deviceId": "mobile-app-456",
  "date": "2024-01-15T10:30:00Z",
  "timezone": "America/New_York",
  "antecedent": "Peer interaction",
  "consequence": "Redirection given",
  "intensity": 8
}
```

## Service Tracking

### Track Service Event

Record service delivery with progress measurements:

```http
POST /api/app/track
Content-Type: application/json

{
  "token": "encrypted-student-token",
  "serviceId": "service-789",
  "deviceId": "mobile-app-456",
  "date": "2024-01-15T10:30:00Z",
  "endDate": "2024-01-15T11:00:00Z",
  "timezone": "America/New_York",
  "modifications": ["Individual Session", "Visual Supports"],
  "progress": [
    {
      "name": "Articulation Goals",
      "value": 85
    },
    {
      "name": "Language Comprehension",
      "value": 78
    },
    {
      "name": "Social Communication",
      "value": 92
    }
  ],
  "notes": "Excellent session, student met all targets"
}
```

### Service Event Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Encrypted student access token |
| `serviceId` | string | Yes | Service identifier from configuration |
| `deviceId` | string | Yes | Mobile app device identifier |
| `date` | string | Yes | Service start time (ISO 8601) |
| `endDate` | string | No | Service end time |
| `timezone` | string | No | Device timezone |
| `modifications` | array | Yes | Applied service modifications |
| `progress` | array | Yes | Progress measurements |
| `notes` | string | No | Session notes |
| `remove` | boolean | No | Set to true to delete this event |

### Progress Measurements

Each progress item includes:

```json
{
  "name": "Goal Name",
  "value": 85
}
```

- `name`: Must match a `trackedItems` value from configuration
- `value`: Percentage (0-100) or other numeric measurement

## Notes and Documentation

### Add Text Notes

Submit standalone notes:

```http
POST /api/app/track
Content-Type: application/json

{
  "token": "encrypted-student-token",
  "deviceId": "mobile-app-456",
  "date": "2024-01-15T10:30:00Z",
  "timezone": "America/New_York",
  "notes": "Student showed excellent focus during math lesson. Completed all assigned problems without prompting. Consider increasing difficulty level."
}
```

### Notes with Media

For notes with attached media (photos, videos, audio):

```http
POST /api/app/track
Content-Type: application/json

{
  "token": "encrypted-student-token",
  "deviceId": "mobile-app-456",
  "date": "2024-01-15T10:30:00Z",
  "timezone": "America/New_York",
  "notes": "Student work sample attached",
  "media": [
    {
      "type": "image",
      "url": "https://media.mytaptrack.com/uploads/image-123.jpg",
      "caption": "Math worksheet completion"
    }
  ]
}
```

## Offline Support

### Local Storage

Apps should store data locally when offline:

```javascript
// Example offline storage structure
const offlineData = {
  behaviors: [
    {
      id: "offline-behavior-1",
      token: "encrypted-student-token",
      behaviorId: "behavior-123",
      deviceId: "mobile-app-456",
      date: "2024-01-15T10:30:00Z",
      intensity: 7,
      synced: false,
      timestamp: Date.now()
    }
  ],
  services: [
    {
      id: "offline-service-1",
      token: "encrypted-student-token",
      serviceId: "service-789",
      deviceId: "mobile-app-456",
      date: "2024-01-15T10:30:00Z",
      endDate: "2024-01-15T11:00:00Z",
      modifications: ["Individual Session"],
      progress: [{"name": "Goal 1", "value": 85}],
      synced: false,
      timestamp: Date.now()
    }
  ],
  notes: [
    {
      id: "offline-note-1",
      token: "encrypted-student-token",
      deviceId: "mobile-app-456",
      date: "2024-01-15T10:30:00Z",
      notes: "Offline note content",
      synced: false,
      timestamp: Date.now()
    }
  ]
};
```

### Sync Process

Sync offline data when connectivity is restored:

```javascript
async function syncOfflineData() {
  const offlineItems = getOfflineData();
  
  for (const item of offlineItems) {
    if (!item.synced) {
      try {
        await sendToAPI(item);
        markAsSynced(item.id);
      } catch (error) {
        console.error('Sync failed for item:', item.id, error);
        // Keep item for next sync attempt
      }
    }
  }
  
  // Clean up synced items
  removeSync edItems();
}

// Auto-sync when network becomes available
window.addEventListener('online', syncOfflineData);
```

## Push Notifications

### Notification Types

1. **Reminder Notifications**: Scheduled tracking reminders
2. **Alert Notifications**: Urgent behavior alerts
3. **Sync Notifications**: Data sync status updates
4. **Update Notifications**: App and configuration updates

### Register for Notifications

Include push token in configuration request:

```json
{
  "device": {
    "id": "mobile-app-456",
    "version": 3
  },
  "notifications": {
    "token": "fcm-push-token-or-apns-token",
    "os": "ios"
  }
}
```

### Notification Payload

```json
{
  "title": "Tracking Reminder",
  "body": "Time to track John's behavior data",
  "data": {
    "type": "reminder",
    "studentId": "student-123",
    "behaviorId": "behavior-456",
    "action": "track_behavior"
  }
}
```

## Error Handling

### API Error Responses

```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Invalid or expired token",
    "details": {
      "token": "Token expired at 2024-01-15T10:00:00Z",
      "action": "refresh_token"
    }
  }
}
```

### Common Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `ACCESS_DENIED` | Invalid/expired token | Refresh authentication |
| `STUDENT_NOT_FOUND` | Student not configured | Update configuration |
| `BEHAVIOR_NOT_FOUND` | Behavior not available | Check configuration |
| `SERVICE_NOT_FOUND` | Service not available | Check configuration |
| `INVALID_DATA` | Request data validation failed | Fix request format |
| `RATE_LIMITED` | Too many requests | Implement backoff |
| `OFFLINE_MODE` | Server maintenance | Store offline |

### Error Handling Strategy

```javascript
async function trackBehavior(data) {
  try {
    const response = await fetch('/api/app/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new APIError(error.error.code, error.error.message);
    }
    
    return await response.json();
    
  } catch (error) {
    if (error instanceof APIError) {
      switch (error.code) {
        case 'ACCESS_DENIED':
          await refreshToken();
          return trackBehavior(data); // Retry
          
        case 'RATE_LIMITED':
          await delay(5000);
          return trackBehavior(data); // Retry after delay
          
        case 'OFFLINE_MODE':
          storeOffline(data);
          return { success: true, offline: true };
          
        default:
          throw error;
      }
    } else {
      // Network error - store offline
      storeOffline(data);
      return { success: true, offline: true };
    }
  }
}
```

## iOS Implementation

### Swift Implementation Example

```swift
import Foundation
import UIKit

class MyTapTrackAPI {
    private let baseURL = "https://app-api.mytaptrack.com"
    private var studentTokens: [String: String] = [:]
    private let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
    
    // MARK: - Configuration
    
    func retrieveConfiguration(tokens: [String]) async throws -> AppConfiguration {
        let request = ConfigurationRequest(
            device: DeviceInfo(id: deviceId, version: 3),
            tokens: tokens,
            notifications: NotificationInfo(
                token: await getPushToken(),
                os: "ios"
            )
        )
        
        let response: ConfigurationResponse = try await sendRequest(
            endpoint: "/api/app/v3/retrieve",
            data: request
        )
        
        // Update stored tokens
        for target in response.targets {
            studentTokens[target.name] = target.token
        }
        
        return AppConfiguration(from: response)
    }
    
    // MARK: - Behavior Tracking
    
    func trackBehavior(
        studentName: String,
        behaviorId: String,
        startTime: Date,
        endTime: Date? = nil,
        antecedent: String? = nil,
        consequence: String? = nil,
        intensity: Int? = nil,
        notes: String? = nil
    ) async throws {
        guard let token = studentTokens[studentName] else {
            throw APIError.noToken
        }
        
        let request = BehaviorTrackRequest(
            token: token,
            behaviorId: behaviorId,
            deviceId: deviceId,
            date: ISO8601DateFormatter().string(from: startTime),
            endDate: endTime.map { ISO8601DateFormatter().string(from: $0) },
            timezone: TimeZone.current.identifier,
            antecedent: antecedent,
            consequence: consequence,
            intensity: intensity,
            notes: notes
        )
        
        try await sendRequest(endpoint: "/api/app/track", data: request)
    }
    
    // MARK: - Service Tracking
    
    func trackService(
        studentName: String,
        serviceId: String,
        startTime: Date,
        endTime: Date,
        modifications: [String],
        progress: [ProgressMeasurement],
        notes: String? = nil
    ) async throws {
        guard let token = studentTokens[studentName] else {
            throw APIError.noToken
        }
        
        let request = ServiceTrackRequest(
            token: token,
            serviceId: serviceId,
            deviceId: deviceId,
            date: ISO8601DateFormatter().string(from: startTime),
            endDate: ISO8601DateFormatter().string(from: endTime),
            timezone: TimeZone.current.identifier,
            modifications: modifications,
            progress: progress,
            notes: notes
        )
        
        try await sendRequest(endpoint: "/api/app/track", data: request)
    }
    
    // MARK: - Notes
    
    func addNote(
        studentName: String,
        content: String,
        timestamp: Date = Date()
    ) async throws {
        guard let token = studentTokens[studentName] else {
            throw APIError.noToken
        }
        
        let request = NotesRequest(
            token: token,
            deviceId: deviceId,
            date: ISO8601DateFormatter().string(from: timestamp),
            timezone: TimeZone.current.identifier,
            notes: content
        )
        
        try await sendRequest(endpoint: "/api/app/track", data: request)
    }
    
    // MARK: - Private Methods
    
    private func sendRequest<T: Codable, R: Codable>(
        endpoint: String,
        data: T
    ) async throws -> R {
        guard let url = URL(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        request.httpBody = try JSONEncoder().encode(data)
        
        let (responseData, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            return try JSONDecoder().decode(R.self, from: responseData)
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: responseData)
            throw APIError.serverError(
                code: errorResponse?.error.code ?? "UNKNOWN",
                message: errorResponse?.error.message ?? "Unknown error"
            )
        }
    }
    
    private func getPushToken() async -> String {
        // Implementation to get FCM or APNs token
        return "push-token-here"
    }
}

// MARK: - Data Models

struct ConfigurationRequest: Codable {
    let device: DeviceInfo
    let tokens: [String]
    let notifications: NotificationInfo
}

struct DeviceInfo: Codable {
    let id: String
    let version: Int
}

struct NotificationInfo: Codable {
    let token: String
    let os: String
}

struct BehaviorTrackRequest: Codable {
    let token: String
    let behaviorId: String
    let deviceId: String
    let date: String
    let endDate: String?
    let timezone: String
    let antecedent: String?
    let consequence: String?
    let intensity: Int?
    let notes: String?
}

struct ServiceTrackRequest: Codable {
    let token: String
    let serviceId: String
    let deviceId: String
    let date: String
    let endDate: String
    let timezone: String
    let modifications: [String]
    let progress: [ProgressMeasurement]
    let notes: String?
}

struct NotesRequest: Codable {
    let token: String
    let deviceId: String
    let date: String
    let timezone: String
    let notes: String
}

struct ProgressMeasurement: Codable {
    let name: String
    let value: Int
}

enum APIError: Error {
    case noToken
    case invalidURL
    case invalidResponse
    case serverError(code: String, message: String)
}
```

### Offline Storage (iOS)

```swift
import CoreData

class OfflineDataManager {
    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "OfflineData")
        container.loadPersistentStores { _, error in
            if let error = error {
                fatalError("Core Data error: \(error)")
            }
        }
        return container
    }()
    
    var context: NSManagedObjectContext {
        return persistentContainer.viewContext
    }
    
    func storeBehaviorOffline(_ request: BehaviorTrackRequest) {
        let entity = NSEntityDescription.entity(forEntityName: "OfflineBehavior", in: context)!
        let behavior = NSManagedObject(entity: entity, insertInto: context)
        
        behavior.setValue(request.token, forKey: "token")
        behavior.setValue(request.behaviorId, forKey: "behaviorId")
        behavior.setValue(request.deviceId, forKey: "deviceId")
        behavior.setValue(request.date, forKey: "date")
        behavior.setValue(request.endDate, forKey: "endDate")
        behavior.setValue(request.antecedent, forKey: "antecedent")
        behavior.setValue(request.consequence, forKey: "consequence")
        behavior.setValue(request.intensity, forKey: "intensity")
        behavior.setValue(request.notes, forKey: "notes")
        behavior.setValue(false, forKey: "synced")
        behavior.setValue(Date(), forKey: "timestamp")
        
        saveContext()
    }
    
    func getUnsyncedBehaviors() -> [BehaviorTrackRequest] {
        let request: NSFetchRequest<NSManagedObject> = NSFetchRequest(entityName: "OfflineBehavior")
        request.predicate = NSPredicate(format: "synced == %@", NSNumber(value: false))
        
        do {
            let results = try context.fetch(request)
            return results.compactMap { object in
                guard let token = object.value(forKey: "token") as? String,
                      let behaviorId = object.value(forKey: "behaviorId") as? String,
                      let deviceId = object.value(forKey: "deviceId") as? String,
                      let date = object.value(forKey: "date") as? String else {
                    return nil
                }
                
                return BehaviorTrackRequest(
                    token: token,
                    behaviorId: behaviorId,
                    deviceId: deviceId,
                    date: date,
                    endDate: object.value(forKey: "endDate") as? String,
                    timezone: TimeZone.current.identifier,
                    antecedent: object.value(forKey: "antecedent") as? String,
                    consequence: object.value(forKey: "consequence") as? String,
                    intensity: object.value(forKey: "intensity") as? Int,
                    notes: object.value(forKey: "notes") as? String
                )
            }
        } catch {
            print("Error fetching unsynced behaviors: \(error)")
            return []
        }
    }
    
    func markBehaviorAsSynced(token: String, behaviorId: String, date: String) {
        let request: NSFetchRequest<NSManagedObject> = NSFetchRequest(entityName: "OfflineBehavior")
        request.predicate = NSPredicate(format: "token == %@ AND behaviorId == %@ AND date == %@", token, behaviorId, date)
        
        do {
            let results = try context.fetch(request)
            for object in results {
                object.setValue(true, forKey: "synced")
            }
            saveContext()
        } catch {
            print("Error marking behavior as synced: \(error)")
        }
    }
    
    private func saveContext() {
        do {
            try context.save()
        } catch {
            print("Error saving context: \(error)")
        }
    }
}
```

## Android Implementation

### Kotlin Implementation Example

```kotlin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MyTapTrackAPI(private val context: Context) {
    private val baseUrl = "https://app-api.mytaptrack.com"
    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }
    private val studentTokens = mutableMapOf<String, String>()
    private val deviceId = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ANDROID_ID
    )
    
    // Configuration
    suspend fun retrieveConfiguration(tokens: List<String>): AppConfiguration = withContext(Dispatchers.IO) {
        val request = ConfigurationRequest(
            device = DeviceInfo(id = deviceId, version = 3),
            tokens = tokens,
            notifications = NotificationInfo(
                token = getPushToken(),
                os = "android"
            )
        )
        
        val response: ConfigurationResponse = sendRequest("/api/app/v3/retrieve", request)
        
        // Update stored tokens
        response.targets.forEach { target ->
            studentTokens[target.name] = target.token
        }
        
        AppConfiguration.from(response)
    }
    
    // Behavior Tracking
    suspend fun trackBehavior(
        studentName: String,
        behaviorId: String,
        startTime: Instant,
        endTime: Instant? = null,
        antecedent: String? = null,
        consequence: String? = null,
        intensity: Int? = null,
        notes: String? = null
    ) = withContext(Dispatchers.IO) {
        val token = studentTokens[studentName] ?: throw IllegalStateException("No token for student")
        
        val request = BehaviorTrackRequest(
            token = token,
            behaviorId = behaviorId,
            deviceId = deviceId,
            date = startTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            endDate = endTime?.atZone(ZoneId.systemDefault())?.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            timezone = ZoneId.systemDefault().id,
            antecedent = antecedent,
            consequence = consequence,
            intensity = intensity,
            notes = notes
        )
        
        sendRequest<BehaviorTrackRequest, Unit>("/api/app/track", request)
    }
    
    // Service Tracking
    suspend fun trackService(
        studentName: String,
        serviceId: String,
        startTime: Instant,
        endTime: Instant,
        modifications: List<String>,
        progress: List<ProgressMeasurement>,
        notes: String? = null
    ) = withContext(Dispatchers.IO) {
        val token = studentTokens[studentName] ?: throw IllegalStateException("No token for student")
        
        val request = ServiceTrackRequest(
            token = token,
            serviceId = serviceId,
            deviceId = deviceId,
            date = startTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            endDate = endTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            timezone = ZoneId.systemDefault().id,
            modifications = modifications,
            progress = progress,
            notes = notes
        )
        
        sendRequest<ServiceTrackRequest, Unit>("/api/app/track", request)
    }
    
    // Notes
    suspend fun addNote(
        studentName: String,
        content: String,
        timestamp: Instant = Instant.now()
    ) = withContext(Dispatchers.IO) {
        val token = studentTokens[studentName] ?: throw IllegalStateException("No token for student")
        
        val request = NotesRequest(
            token = token,
            deviceId = deviceId,
            date = timestamp.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            timezone = ZoneId.systemDefault().id,
            notes = content
        )
        
        sendRequest<NotesRequest, Unit>("/api/app/track", request)
    }
    
    // Private Methods
    private suspend inline fun <reified T, reified R> sendRequest(endpoint: String, data: T): R {
        val jsonBody = json.encodeToString(T::class.serializer(), data)
        val requestBody = jsonBody.toRequestBody("application/json".toMediaType())
        
        val request = Request.Builder()
            .url(baseUrl + endpoint)
            .post(requestBody)
            .build()
        
        val response = client.newCall(request).execute()
        
        if (response.isSuccessful) {
            val responseBody = response.body?.string() ?: ""
            return if (R::class == Unit::class) {
                Unit as R
            } else {
                json.decodeFromString(R::class.serializer(), responseBody)
            }
        } else {
            val errorBody = response.body?.string()
            val errorResponse = errorBody?.let { 
                json.decodeFromString<ErrorResponse>(it) 
            }
            throw APIException(
                code = errorResponse?.error?.code ?: "UNKNOWN",
                message = errorResponse?.error?.message ?: "Unknown error"
            )
        }
    }
    
    private fun getPushToken(): String {
        // Implementation to get FCM token
        return "fcm-token-here"
    }
}

// Data Models
@Serializable
data class ConfigurationRequest(
    val device: DeviceInfo,
    val tokens: List<String>,
    val notifications: NotificationInfo
)

@Serializable
data class DeviceInfo(
    val id: String,
    val version: Int
)

@Serializable
data class NotificationInfo(
    val token: String,
    val os: String
)

@Serializable
data class BehaviorTrackRequest(
    val token: String,
    val behaviorId: String,
    val deviceId: String,
    val date: String,
    val endDate: String? = null,
    val timezone: String,
    val antecedent: String? = null,
    val consequence: String? = null,
    val intensity: Int? = null,
    val notes: String? = null
)

@Serializable
data class ServiceTrackRequest(
    val token: String,
    val serviceId: String,
    val deviceId: String,
    val date: String,
    val endDate: String,
    val timezone: String,
    val modifications: List<String>,
    val progress: List<ProgressMeasurement>,
    val notes: String? = null
)

@Serializable
data class NotesRequest(
    val token: String,
    val deviceId: String,
    val date: String,
    val timezone: String,
    val notes: String
)

@Serializable
data class ProgressMeasurement(
    val name: String,
    val value: Int
)

class APIException(val code: String, message: String) : Exception(message)
```

### Offline Storage (Android)

```kotlin
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "offline_behaviors")
data class OfflineBehavior(
    @PrimaryKey val id: String,
    val token: String,
    val behaviorId: String,
    val deviceId: String,
    val date: String,
    val endDate: String?,
    val timezone: String,
    val antecedent: String?,
    val consequence: String?,
    val intensity: Int?,
    val notes: String?,
    val synced: Boolean = false,
    val timestamp: Long = System.currentTimeMillis()
)

@Dao
interface OfflineBehaviorDao {
    @Query("SELECT * FROM offline_behaviors WHERE synced = 0")
    suspend fun getUnsyncedBehaviors(): List<OfflineBehavior>
    
    @Insert
    suspend fun insertBehavior(behavior: OfflineBehavior)
    
    @Query("UPDATE offline_behaviors SET synced = 1 WHERE id = :id")
    suspend fun markAsSynced(id: String)
    
    @Query("DELETE FROM offline_behaviors WHERE synced = 1")
    suspend fun deleteSyncedBehaviors()
}

@Database(
    entities = [OfflineBehavior::class],
    version = 1,
    exportSchema = false
)
abstract class OfflineDatabase : RoomDatabase() {
    abstract fun behaviorDao(): OfflineBehaviorDao
    
    companion object {
        @Volatile
        private var INSTANCE: OfflineDatabase? = null
        
        fun getDatabase(context: Context): OfflineDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    OfflineDatabase::class.java,
                    "offline_database"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}

class OfflineDataManager(context: Context) {
    private val database = OfflineDatabase.getDatabase(context)
    private val behaviorDao = database.behaviorDao()
    
    suspend fun storeBehaviorOffline(request: BehaviorTrackRequest) {
        val offlineBehavior = OfflineBehavior(
            id = "${request.token}-${request.behaviorId}-${request.date}",
            token = request.token,
            behaviorId = request.behaviorId,
            deviceId = request.deviceId,
            date = request.date,
            endDate = request.endDate,
            timezone = request.timezone,
            antecedent = request.antecedent,
            consequence = request.consequence,
            intensity = request.intensity,
            notes = request.notes
        )
        
        behaviorDao.insertBehavior(offlineBehavior)
    }
    
    suspend fun syncOfflineData(api: MyTapTrackAPI) {
        val unsyncedBehaviors = behaviorDao.getUnsyncedBehaviors()
        
        for (behavior in unsyncedBehaviors) {
            try {
                val request = BehaviorTrackRequest(
                    token = behavior.token,
                    behaviorId = behavior.behaviorId,
                    deviceId = behavior.deviceId,
                    date = behavior.date,
                    endDate = behavior.endDate,
                    timezone = behavior.timezone,
                    antecedent = behavior.antecedent,
                    consequence = behavior.consequence,
                    intensity = behavior.intensity,
                    notes = behavior.notes
                )
                
                // Send to API (this would need to be adapted to work with the existing API)
                // api.sendBehaviorRequest(request)
                
                behaviorDao.markAsSynced(behavior.id)
            } catch (e: Exception) {
                // Log error and continue with next item
                println("Failed to sync behavior ${behavior.id}: ${e.message}")
            }
        }
        
        // Clean up synced items
        behaviorDao.deleteSyncedBehaviors()
    }
}
```

## Best Practices

### Security

1. **Token Management**
   - Store tokens securely using Keychain (iOS) or EncryptedSharedPreferences (Android)
   - Implement token refresh logic
   - Never log or expose tokens in debug output

2. **Data Encryption**
   - Encrypt sensitive data in local storage
   - Use HTTPS for all API communications
   - Implement certificate pinning

3. **Authentication**
   - Validate tokens before use
   - Handle token expiration gracefully
   - Implement proper logout functionality

### Performance

1. **Network Optimization**
   - Batch API requests when possible
   - Implement request caching
   - Use compression for large payloads

2. **Battery Optimization**
   - Minimize background network activity
   - Use efficient sync strategies
   - Implement smart retry logic

3. **Memory Management**
   - Limit offline storage size
   - Clean up old data regularly
   - Use efficient data structures

### User Experience

1. **Offline Support**
   - Provide clear offline indicators
   - Show sync status to users
   - Handle conflicts gracefully

2. **Error Handling**
   - Provide meaningful error messages
   - Implement retry mechanisms
   - Offer alternative actions when possible

3. **Performance Feedback**
   - Show loading states
   - Provide immediate feedback for user actions
   - Display progress for long operations

### Data Quality

1. **Validation**
   - Validate data before sending
   - Implement client-side validation rules
   - Provide real-time feedback

2. **Consistency**
   - Maintain data consistency across devices
   - Handle concurrent modifications
   - Implement conflict resolution

3. **Backup**
   - Regular data backups
   - Export capabilities
   - Data recovery procedures

This comprehensive mobile app integration guide provides everything needed to successfully integrate iOS and Android applications with the MyTapTrack system, including authentication, data tracking, offline support, and best practices for security and performance.