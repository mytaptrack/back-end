# Device API Documentation

The MyTapTrack Device API provides specialized endpoints for IoT device communication and mobile app integration. This API handles data collection from physical devices and mobile applications in real-time.

## Table of Contents

- [Overview](#overview)
- [Device Types](#device-types)
- [Authentication](#authentication)
- [IoT Device API](#iot-device-api)
- [Mobile App API](#mobile-app-api)
- [Data Formats](#data-formats)
- [Error Handling](#error-handling)
- [Integration Examples](#integration-examples)

## Overview

The Device API supports two main types of devices:

1. **IoT Devices (Track 2.0)**: Physical button devices for behavior tracking
2. **Mobile Apps**: iOS and Android applications for comprehensive data collection

Both device types use specialized authentication and communication protocols optimized for their respective environments.

## Device Types

### Track 2.0 IoT Devices

Physical button devices that communicate via WiFi to report behavior events:

- **Device Serial Number (DSN)**: 16-character identifier (format: `M2[A-Z0-9]{10}`)
- **Button Events**: Configurable button press patterns
- **Battery Monitoring**: Remaining battery life reporting
- **Offline Capability**: Store events when offline, sync when connected

### Mobile Applications

iOS and Android apps for comprehensive behavior and service tracking:

- **Token-based Authentication**: Secure JWT tokens for device access
- **Real-time Data Collection**: Immediate behavior and service tracking
- **ABC Data Collection**: Antecedent-Behavior-Consequence data
- **Notes and Documentation**: Text notes and media attachments
- **Offline Support**: Local storage with sync capabilities

## Authentication

### IoT Device Authentication

IoT devices use a two-factor authentication system:

1. **Device Serial Number (DSN)**: Hardware identifier
2. **Identity Token**: Device-specific authentication token

```http
POST /api/device/data
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "identity": "device-auth-token-here",
  "pressType": "click",
  "clickCount": 1,
  "eventDate": "2024-01-15T10:30:00Z",
  "remainingLife": 85
}
```

### Mobile App Authentication

Mobile apps use encrypted JWT tokens containing:

- **Student ID**: Target student identifier
- **Device ID**: Mobile app instance identifier
- **Authentication Key**: Encrypted access credentials

```http
POST /api/app/track
Content-Type: application/json
Authorization: Bearer <app-jwt-token>

{
  "token": "encrypted-student-device-token",
  "behaviorId": "behavior-123",
  "deviceId": "app-456",
  "date": "2024-01-15T10:30:00Z",
  "intensity": 7
}
```

## IoT Device API

### Base URL
```
https://device-api.mytaptrack.com
```

### Send Event Data

Record button press events from IoT devices.

```http
POST /api/device/data
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "identity": "device-auth-token",
  "pressType": "click",
  "clickCount": 1,
  "remainingLife": 85,
  "eventDate": "2024-01-15T10:30:00.000Z",
  "segment": 1,
  "complete": true
}
```

**Request Parameters:**

- `dsn` (required): Device serial number (16 characters, format: M2[A-Z0-9]{10})
- `identity` (required): Device authentication token
- `pressType` (required): Type of button press (`"click"` or `"hold"`)
- `clickCount` (required): Number of button presses (1-10)
- `remainingLife` (required): Battery percentage (0-100)
- `eventDate` (required): Event timestamp in ISO 8601 format
- `segment` (optional): Event segment number for multi-part events
- `complete` (optional): Whether this is the final segment

**Response:**
```json
{
  "success": true,
  "url": "https://device-api.mytaptrack.com"
}
```

### Get Server Time

Synchronize device clock with server time.

```http
GET /api/device/time
```

**Response:**
```
1642248600
```
*Returns Unix timestamp in seconds*

### WiFi Connectivity Check

Test device connectivity and API availability.

```http
POST /api/device/ping
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "signal_strength": -45
}
```

**Response:**
```json
{
  "success": true
}
```

### Firmware Update Check

Check for available firmware updates.

```http
POST /api/device/firmware
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "identity": "device-auth-token",
  "firmware": {
    "lastUpdate": "2024-01-01T00:00:00Z"
  }
}
```

**Response:**
```json
{
  "url": "https://firmware.mytaptrack.com/v2.1.0/firmware.bin",
  "certificate": "-----BEGIN CERTIFICATE-----\n...",
  "identity": "new-device-auth-token"
}
```

## Mobile App API

### Base URL
```
https://app-api.mytaptrack.com
```

### Retrieve App Configuration

Get student configurations and tracking setup for mobile app.

```http
POST /api/app/v3/retrieve
Content-Type: application/json

{
  "device": {
    "id": "app-device-123",
    "version": 3
  },
  "tokens": [
    "encrypted-token-1",
    "encrypted-token-2"
  ],
  "notifications": {
    "token": "fcm-push-token",
    "os": "ios"
  }
}
```

**Response:**
```json
{
  "tokenUpdate": "",
  "name": "Classroom App",
  "targets": [
    {
      "token": "updated-encrypted-token",
      "name": "John Doe",
      "groups": ["Group A"],
      "abc": {
        "name": "ABC Collection",
        "antecedents": ["Teacher instruction", "Peer interaction"],
        "consequences": ["Verbal praise", "Token reward"],
        "tags": ["academic"],
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
          "intensity": 10
        }
      ],
      "services": [
        {
          "title": "Speech Therapy",
          "id": "service-456",
          "order": 1,
          "trackedItems": ["Articulation", "Fluency"],
          "percent": true,
          "modifications": ["Individual", "Quiet Environment"]
        }
      ]
    }
  ]
}
```

### Track Behavior Event

Record behavior data from mobile app.

```http
POST /api/app/track
Content-Type: application/json

{
  "token": "encrypted-student-token",
  "behaviorId": "behavior-123",
  "deviceId": "app-device-123",
  "date": "2024-01-15T10:30:00Z",
  "endDate": "2024-01-15T10:35:00Z",
  "timezone": "America/New_York",
  "antecedent": "Teacher instruction given",
  "consequence": "Verbal praise provided",
  "intensity": 7
}
```

**Request Parameters:**

- `token` (required): Encrypted student access token
- `behaviorId` (required): Behavior identifier to track
- `deviceId` (required): Mobile app device identifier
- `date` (required): Event start time in ISO 8601 format
- `endDate` (optional): Event end time for duration tracking
- `timezone` (optional): Device timezone
- `antecedent` (optional): ABC data - what happened before
- `consequence` (optional): ABC data - what happened after
- `intensity` (optional): Intensity level (1-10)
- `remove` (optional): Set to true to delete this event

**Response:**
```json
{
  "success": true
}
```

### Track Service Event

Record service delivery data from mobile app.

```http
POST /api/app/track
Content-Type: application/json

{
  "token": "encrypted-student-token",
  "serviceId": "service-456",
  "deviceId": "app-device-123",
  "date": "2024-01-15T10:30:00Z",
  "endDate": "2024-01-15T11:00:00Z",
  "timezone": "America/New_York",
  "modifications": ["Individual", "Quiet Environment"],
  "progress": [
    {
      "name": "Goal 1",
      "value": 80
    },
    {
      "name": "Goal 2", 
      "value": 75
    }
  ]
}
```

**Request Parameters:**

- `token` (required): Encrypted student access token
- `serviceId` (required): Service identifier to track
- `deviceId` (required): Mobile app device identifier
- `date` (required): Service start time
- `endDate` (optional): Service end time
- `timezone` (optional): Device timezone
- `modifications` (required): Array of service modifications
- `progress` (required): Array of progress measurements
- `remove` (optional): Set to true to delete this event

### Add Notes

Submit text notes from mobile app.

```http
POST /api/app/track
Content-Type: application/json

{
  "token": "encrypted-student-token",
  "deviceId": "app-device-123",
  "date": "2024-01-15T10:30:00Z",
  "timezone": "America/New_York",
  "notes": "Student showed excellent focus during math lesson. Completed all assigned problems without prompting."
}
```

## Data Formats

### IoT Device Event Format

```typescript
interface TrackDataRequest {
  dsn: string;                    // Device serial number
  identity: string;               // Authentication token
  pressType: 'click' | 'hold';    // Button press type
  clickCount: number;             // Number of presses (1-10)
  remainingLife: number;          // Battery percentage (0-100)
  eventDate: string;              // ISO 8601 timestamp
  segment?: number;               // Multi-part event segment
  complete?: boolean;             // Final segment indicator
}
```

### Mobile App Behavior Event Format

```typescript
interface AppTrackRequest {
  token: string;                  // Encrypted student token
  behaviorId: string;             // Behavior identifier
  deviceId: string;               // App device identifier
  date: string;                   // Event start time (ISO 8601)
  endDate?: string;               // Event end time (ISO 8601)
  timezone?: string;              // Device timezone
  antecedent?: string;            // ABC data - antecedent
  consequence?: string;           // ABC data - consequence
  intensity?: number;             // Intensity level (1-10)
  remove?: boolean;               // Delete event flag
}
```

### Mobile App Service Event Format

```typescript
interface AppServiceTrackRequest {
  token: string;                  // Encrypted student token
  serviceId: string;              // Service identifier
  deviceId: string;               // App device identifier
  date: string;                   // Service start time
  endDate?: string;               // Service end time
  timezone?: string;              // Device timezone
  modifications: string[];        // Service modifications
  progress: Array<{               // Progress measurements
    name: string;
    value: number;
  }>;
  remove?: boolean;               // Delete event flag
}
```

### Mobile App Configuration Format

```typescript
interface AppRetrieveDataPostResponse {
  tokenUpdate: string;            // Updated authentication token
  name?: string;                  // App display name
  targets: Array<{
    token: string;                // Student access token
    name: string;                 // Student display name
    groups: string[];             // Student groups
    abc?: {                       // ABC data collection config
      name: string;
      antecedents: string[];
      consequences: string[];
      tags: string[];
      overwrite: boolean;
    };
    behaviors: Array<{            // Trackable behaviors
      title: string;
      id: string;
      isDuration: boolean;
      abc: boolean;
      durationOn: boolean;
      order: number;
      intensity?: number;         // Max intensity (1-10)
      track?: boolean;            // Response tracking flag
    }>;
    services?: Array<{            // Trackable services
      title: string;
      id: string;
      order: number;
      trackedItems: string[];
      percent: boolean;
      modifications: string[];
    }>;
  }>;
}
```

## Error Handling

### IoT Device Errors

```json
{
  "error": "dsn/identity was not supplied",
  "statusCode": 400
}
```

**Common Error Codes:**
- `400` - Invalid request parameters
- `406` - Device not found or not validated
- `499` - Invalid button event configuration

### Mobile App Errors

```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "Invalid or expired token"
  }
}
```

**Common Error Codes:**
- `ACCESS_DENIED` - Invalid authentication token
- `STUDENT_NOT_FOUND` - Student configuration not found
- `BEHAVIOR_NOT_FOUND` - Behavior not configured for student
- `SERVICE_NOT_FOUND` - Service not configured for student

## Integration Examples

### IoT Device Integration

```c
// C code for Track 2.0 device
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* deviceDSN = "M2ABC1234567890";
const char* deviceIdentity = "device-auth-token";
const char* apiEndpoint = "https://device-api.mytaptrack.com/api/device/data";

void sendButtonEvent(int buttonNumber, int batteryLevel) {
    HTTPClient http;
    http.begin(apiEndpoint);
    http.addHeader("Content-Type", "application/json");
    
    // Create JSON payload
    DynamicJsonDocument doc(1024);
    doc["dsn"] = deviceDSN;
    doc["identity"] = deviceIdentity;
    doc["pressType"] = "click";
    doc["clickCount"] = buttonNumber;
    doc["remainingLife"] = batteryLevel;
    doc["eventDate"] = getCurrentTimestamp();
    doc["complete"] = true;
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    int httpResponseCode = http.POST(jsonString);
    
    if (httpResponseCode == 200) {
        String response = http.getString();
        Serial.println("Event sent successfully");
    } else {
        Serial.printf("Error: %d\n", httpResponseCode);
    }
    
    http.end();
}

String getCurrentTimestamp() {
    // Get current time from RTC or NTP
    time_t now = time(0);
    struct tm* timeinfo = gmtime(&now);
    
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%S.000Z", timeinfo);
    
    return String(timestamp);
}
```

### iOS Mobile App Integration

```swift
import Foundation

class MyTapTrackAPI {
    private let baseURL = "https://app-api.mytaptrack.com"
    private var studentToken: String?
    private let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
    
    func trackBehavior(
        behaviorId: String,
        startTime: Date,
        endTime: Date? = nil,
        antecedent: String? = nil,
        consequence: String? = nil,
        intensity: Int? = nil
    ) async throws {
        guard let token = studentToken else {
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
            intensity: intensity
        )
        
        try await sendRequest(endpoint: "/api/app/track", data: request)
    }
    
    func trackService(
        serviceId: String,
        startTime: Date,
        endTime: Date,
        modifications: [String],
        progress: [ProgressMeasurement]
    ) async throws {
        guard let token = studentToken else {
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
            progress: progress
        )
        
        try await sendRequest(endpoint: "/api/app/track", data: request)
    }
    
    private func sendRequest<T: Codable>(endpoint: String, data: T) async throws {
        guard let url = URL(string: baseURL + endpoint) else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        request.httpBody = try JSONEncoder().encode(data)
        
        let (_, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.requestFailed
        }
    }
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
}

struct ProgressMeasurement: Codable {
    let name: String
    let value: Int
}

enum APIError: Error {
    case noToken
    case invalidURL
    case requestFailed
}
```

### Android Mobile App Integration

```kotlin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MyTapTrackAPI {
    private val baseUrl = "https://app-api.mytaptrack.com"
    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }
    private var studentToken: String? = null
    private val deviceId = android.provider.Settings.Secure.getString(
        context.contentResolver,
        android.provider.Settings.Secure.ANDROID_ID
    )
    
    suspend fun trackBehavior(
        behaviorId: String,
        startTime: Instant,
        endTime: Instant? = null,
        antecedent: String? = null,
        consequence: String? = null,
        intensity: Int? = null
    ) = withContext(Dispatchers.IO) {
        val token = studentToken ?: throw IllegalStateException("No token available")
        
        val request = BehaviorTrackRequest(
            token = token,
            behaviorId = behaviorId,
            deviceId = deviceId,
            date = startTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            endDate = endTime?.atZone(ZoneId.systemDefault())?.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            timezone = ZoneId.systemDefault().id,
            antecedent = antecedent,
            consequence = consequence,
            intensity = intensity
        )
        
        sendRequest("/api/app/track", request)
    }
    
    suspend fun trackService(
        serviceId: String,
        startTime: Instant,
        endTime: Instant,
        modifications: List<String>,
        progress: List<ProgressMeasurement>
    ) = withContext(Dispatchers.IO) {
        val token = studentToken ?: throw IllegalStateException("No token available")
        
        val request = ServiceTrackRequest(
            token = token,
            serviceId = serviceId,
            deviceId = deviceId,
            date = startTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            endDate = endTime.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
            timezone = ZoneId.systemDefault().id,
            modifications = modifications,
            progress = progress
        )
        
        sendRequest("/api/app/track", request)
    }
    
    private suspend fun sendRequest(endpoint: String, data: Any) {
        val jsonBody = json.encodeToString(data)
        val requestBody = jsonBody.toRequestBody("application/json".toMediaType())
        
        val request = Request.Builder()
            .url(baseUrl + endpoint)
            .post(requestBody)
            .build()
        
        val response = client.newCall(request).execute()
        
        if (!response.isSuccessful) {
            throw IOException("Request failed: ${response.code}")
        }
    }
}

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
    val intensity: Int? = null
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
    val progress: List<ProgressMeasurement>
)

@Serializable
data class ProgressMeasurement(
    val name: String,
    val value: Int
)
```

## Best Practices

### IoT Device Development

1. **Implement Retry Logic**: Handle network failures gracefully
2. **Buffer Events Offline**: Store events locally when connectivity is lost
3. **Battery Optimization**: Minimize API calls to preserve battery life
4. **Time Synchronization**: Regularly sync with server time
5. **Secure Storage**: Protect device identity tokens

### Mobile App Development

1. **Token Management**: Securely store and refresh authentication tokens
2. **Offline Support**: Cache data locally and sync when online
3. **User Experience**: Provide immediate feedback for user actions
4. **Error Handling**: Gracefully handle API failures and network issues
5. **Data Validation**: Validate data before sending to API

### Security Considerations

1. **Token Encryption**: Always encrypt authentication tokens
2. **Certificate Pinning**: Implement SSL certificate pinning
3. **Request Signing**: Consider signing requests for additional security
4. **Rate Limiting**: Implement client-side rate limiting
5. **Data Privacy**: Follow data privacy regulations and best practices