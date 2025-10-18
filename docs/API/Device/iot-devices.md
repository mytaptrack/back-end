# IoT Device Integration Guide

This guide provides detailed information for integrating IoT devices (Track 2.0) with the MyTapTrack system.

## Table of Contents

- [Device Overview](#device-overview)
- [Hardware Requirements](#hardware-requirements)
- [Authentication Setup](#authentication-setup)
- [Communication Protocol](#communication-protocol)
- [Event Data Format](#event-data-format)
- [Error Handling](#error-handling)
- [Firmware Updates](#firmware-updates)
- [Sample Implementation](#sample-implementation)

## Device Overview

Track 2.0 devices are WiFi-enabled button devices designed for behavior tracking in educational and therapeutic settings. Each device can be configured with up to 10 different button events, allowing for flexible behavior monitoring.

### Key Features

- **WiFi Connectivity**: 802.11 b/g/n support
- **Battery Powered**: Long-lasting battery with level reporting
- **Multiple Button Events**: Up to 10 configurable button patterns
- **Offline Storage**: Buffer events when connectivity is lost
- **Secure Communication**: Encrypted data transmission
- **Firmware Updates**: Over-the-air update capability

### Device Specifications

- **Processor**: ESP32-based microcontroller
- **Memory**: 4MB Flash, 520KB RAM
- **Battery**: 3.7V Li-ion, 1000mAh capacity
- **Connectivity**: WiFi 802.11 b/g/n (2.4GHz)
- **Operating Temperature**: -10°C to 60°C
- **Dimensions**: 85mm x 55mm x 20mm
- **Weight**: 120g

## Hardware Requirements

### Minimum System Requirements

- **WiFi Network**: 2.4GHz WiFi with internet access
- **Network Security**: WPA2 or WPA3 encryption supported
- **Bandwidth**: Minimum 1Kbps per device
- **Latency**: Maximum 5 seconds for event transmission

### Network Configuration

```json
{
  "ssid": "MyTapTrack-Network",
  "password": "secure-wifi-password",
  "security": "WPA2",
  "dhcp": true,
  "dns_primary": "8.8.8.8",
  "dns_secondary": "8.8.4.4"
}
```

### Firewall Requirements

Allow outbound HTTPS connections to:
- `device-api.mytaptrack.com:443`
- `firmware.mytaptrack.com:443`
- `time.mytaptrack.com:443`

## Authentication Setup

### Device Registration

Each Track 2.0 device must be registered in the MyTapTrack system before use:

1. **Device Serial Number (DSN)**: 16-character unique identifier
2. **Identity Token**: Device-specific authentication credential
3. **Student Assignment**: Link device to specific student
4. **Button Configuration**: Map button patterns to behaviors

### DSN Format

```
M2[A-Z0-9]{10}[0-4]
```

- `M2`: Device type identifier
- `[A-Z0-9]{10}`: Unique device identifier
- `[0-4]`: Hardware revision number

Example: `M2ABC1234567890`

### Identity Token

The identity token is a 32-character alphanumeric string generated during device registration:

```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

## Communication Protocol

### Base URL
```
https://device-api.mytaptrack.com
```

### Request Headers
```http
Content-Type: application/json
User-Agent: Track2.0/1.0
```

### Event Transmission

#### Single Event
```http
POST /api/device/data
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "identity": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "pressType": "click",
  "clickCount": 1,
  "remainingLife": 85,
  "eventDate": "2024-01-15T10:30:00.000Z",
  "complete": true
}
```

#### Multi-Segment Event
For complex events that require multiple data points:

```http
POST /api/device/data
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "identity": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "pressType": "hold",
  "clickCount": 3,
  "remainingLife": 85,
  "eventDate": "2024-01-15T10:30:00.000Z",
  "segment": 1,
  "complete": false
}
```

### Time Synchronization

Devices should synchronize with server time regularly:

```http
GET /api/device/time
```

Response:
```
1642248600
```

### Connectivity Check

Test API connectivity:

```http
POST /api/device/ping
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "signal_strength": -45
}
```

## Event Data Format

### Button Press Types

#### Click Events
Short button presses (< 1 second):

```json
{
  "pressType": "click",
  "clickCount": 1,
  "eventDate": "2024-01-15T10:30:00.000Z"
}
```

#### Hold Events
Long button presses (≥ 1 second):

```json
{
  "pressType": "hold",
  "clickCount": 1,
  "eventDate": "2024-01-15T10:30:00.000Z"
}
```

### Button Count Mapping

| Click Count | Typical Use Case |
|-------------|------------------|
| 1 | Primary behavior |
| 2 | Secondary behavior |
| 3 | Tertiary behavior |
| 4-10 | Additional behaviors |

### Event Timing

#### Timestamp Format
All timestamps must be in ISO 8601 format with millisecond precision:

```
YYYY-MM-DDTHH:MM:SS.sssZ
```

Example: `2024-01-15T10:30:00.000Z`

#### Time Zones
All device events are transmitted in UTC. The server handles timezone conversion based on device configuration.

### Battery Reporting

Battery level is reported as a percentage (0-100):

```json
{
  "remainingLife": 85
}
```

**Battery Level Thresholds:**
- 100-75%: Good
- 74-25%: Fair  
- 24-10%: Low (warning notifications)
- 9-0%: Critical (urgent replacement needed)

## Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Continue normal operation |
| 400 | Bad Request | Check request format |
| 401 | Unauthorized | Verify DSN and identity |
| 406 | Not Acceptable | Device not validated |
| 429 | Too Many Requests | Implement backoff |
| 499 | Invalid Event | Check button configuration |
| 500 | Server Error | Retry with exponential backoff |

### Error Response Format

```json
{
  "error": "dsn/identity was not supplied",
  "statusCode": 400,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Retry Logic

Implement exponential backoff for failed requests:

```c
int retry_delay = 1; // Start with 1 second
int max_retries = 5;
int retry_count = 0;

while (retry_count < max_retries) {
    if (send_event() == SUCCESS) {
        break;
    }
    
    delay(retry_delay * 1000); // Convert to milliseconds
    retry_delay *= 2; // Double the delay
    retry_count++;
    
    if (retry_delay > 60) {
        retry_delay = 60; // Cap at 60 seconds
    }
}
```

### Offline Event Storage

Store events locally when connectivity is lost:

```c
typedef struct {
    char dsn[17];
    char identity[33];
    char press_type[6];
    int click_count;
    int remaining_life;
    char event_date[25];
    bool transmitted;
} stored_event_t;

#define MAX_STORED_EVENTS 100
stored_event_t event_buffer[MAX_STORED_EVENTS];
int event_count = 0;

void store_event_offline(stored_event_t* event) {
    if (event_count < MAX_STORED_EVENTS) {
        memcpy(&event_buffer[event_count], event, sizeof(stored_event_t));
        event_buffer[event_count].transmitted = false;
        event_count++;
    }
}

void sync_offline_events() {
    for (int i = 0; i < event_count; i++) {
        if (!event_buffer[i].transmitted) {
            if (send_stored_event(&event_buffer[i]) == SUCCESS) {
                event_buffer[i].transmitted = true;
            }
        }
    }
    
    // Remove transmitted events
    compact_event_buffer();
}
```

## Firmware Updates

### Update Check

Devices should check for firmware updates periodically:

```http
POST /api/device/firmware
Content-Type: application/json

{
  "dsn": "M2ABC1234567890",
  "identity": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "firmware": {
    "lastUpdate": "2024-01-01T00:00:00Z"
  }
}
```

### Update Response

If an update is available:

```json
{
  "url": "https://firmware.mytaptrack.com/v2.1.0/firmware.bin",
  "certificate": "-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----",
  "identity": "new-identity-token-if-changed"
}
```

If no update is available:

```json
{}
```

### Update Process

1. **Download Firmware**: Securely download from provided URL
2. **Verify Signature**: Validate firmware using provided certificate
3. **Install Update**: Flash new firmware to device
4. **Verify Installation**: Confirm successful update
5. **Update Identity**: Use new identity token if provided

## Sample Implementation

### Arduino/ESP32 Implementation

```c
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <EEPROM.h>

// Device configuration
const char* DEVICE_DSN = "M2ABC1234567890";
const char* DEVICE_IDENTITY = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
const char* API_ENDPOINT = "https://device-api.mytaptrack.com/api/device/data";
const char* TIME_ENDPOINT = "https://device-api.mytaptrack.com/api/device/time";

// WiFi credentials
const char* WIFI_SSID = "MyTapTrack-Network";
const char* WIFI_PASSWORD = "secure-wifi-password";

// Button pins
const int BUTTON_PIN = 2;
const int LED_PIN = 13;

// Global variables
unsigned long last_button_press = 0;
int button_press_count = 0;
bool button_held = false;

void setup() {
    Serial.begin(115200);
    
    // Initialize pins
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    
    // Connect to WiFi
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(1000);
        Serial.println("Connecting to WiFi...");
    }
    Serial.println("WiFi connected");
    
    // Synchronize time
    sync_time();
    
    // Initialize EEPROM for offline storage
    EEPROM.begin(4096);
    
    Serial.println("Device initialized");
}

void loop() {
    // Check button state
    handle_button_input();
    
    // Sync offline events periodically
    static unsigned long last_sync = 0;
    if (millis() - last_sync > 60000) { // Every minute
        sync_offline_events();
        last_sync = millis();
    }
    
    // Check for firmware updates daily
    static unsigned long last_update_check = 0;
    if (millis() - last_update_check > 86400000) { // Every 24 hours
        check_firmware_update();
        last_update_check = millis();
    }
    
    delay(50);
}

void handle_button_input() {
    static bool last_button_state = HIGH;
    static unsigned long button_press_start = 0;
    
    bool current_button_state = digitalRead(BUTTON_PIN);
    
    // Button pressed (falling edge)
    if (last_button_state == HIGH && current_button_state == LOW) {
        button_press_start = millis();
        button_press_count++;
        
        // Reset count if too much time has passed
        if (millis() - last_button_press > 2000) {
            button_press_count = 1;
        }
        
        last_button_press = millis();
        
        // Visual feedback
        digitalWrite(LED_PIN, HIGH);
    }
    
    // Button released (rising edge)
    if (last_button_state == LOW && current_button_state == HIGH) {
        unsigned long press_duration = millis() - button_press_start;
        
        // Determine press type
        bool is_hold = press_duration >= 1000;
        
        // Send event after short delay to allow for multiple presses
        delay(500);
        
        if (millis() - last_button_press >= 500) {
            send_button_event(button_press_count, is_hold);
            button_press_count = 0;
        }
        
        digitalWrite(LED_PIN, LOW);
    }
    
    last_button_state = current_button_state;
}

void send_button_event(int click_count, bool is_hold) {
    // Get current timestamp
    String timestamp = get_current_timestamp();
    
    // Get battery level
    int battery_level = get_battery_level();
    
    // Create JSON payload
    DynamicJsonDocument doc(1024);
    doc["dsn"] = DEVICE_DSN;
    doc["identity"] = DEVICE_IDENTITY;
    doc["pressType"] = is_hold ? "hold" : "click";
    doc["clickCount"] = click_count;
    doc["remainingLife"] = battery_level;
    doc["eventDate"] = timestamp;
    doc["complete"] = true;
    
    String json_string;
    serializeJson(doc, json_string);
    
    // Send HTTP request
    HTTPClient http;
    http.begin(API_ENDPOINT);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("User-Agent", "Track2.0/1.0");
    
    int response_code = http.POST(json_string);
    
    if (response_code == 200) {
        Serial.println("Event sent successfully");
        
        // Flash LED to indicate success
        for (int i = 0; i < 3; i++) {
            digitalWrite(LED_PIN, HIGH);
            delay(100);
            digitalWrite(LED_PIN, LOW);
            delay(100);
        }
    } else {
        Serial.printf("Error sending event: %d\n", response_code);
        
        // Store event for later transmission
        store_event_offline(json_string);
        
        // Flash LED to indicate error
        for (int i = 0; i < 5; i++) {
            digitalWrite(LED_PIN, HIGH);
            delay(50);
            digitalWrite(LED_PIN, LOW);
            delay(50);
        }
    }
    
    http.end();
}

String get_current_timestamp() {
    time_t now = time(0);
    struct tm* timeinfo = gmtime(&now);
    
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%S.000Z", timeinfo);
    
    return String(timestamp);
}

int get_battery_level() {
    // Read battery voltage and convert to percentage
    int adc_value = analogRead(A0);
    float voltage = (adc_value / 4095.0) * 3.3 * 2; // Voltage divider
    
    // Convert voltage to percentage (3.0V = 0%, 4.2V = 100%)
    int percentage = (int)((voltage - 3.0) / 1.2 * 100);
    
    // Clamp to valid range
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    
    return percentage;
}

void sync_time() {
    HTTPClient http;
    http.begin(TIME_ENDPOINT);
    
    int response_code = http.GET();
    
    if (response_code == 200) {
        String response = http.getString();
        time_t server_time = response.toInt();
        
        struct timeval tv;
        tv.tv_sec = server_time;
        tv.tv_usec = 0;
        
        settimeofday(&tv, NULL);
        
        Serial.println("Time synchronized");
    }
    
    http.end();
}

void store_event_offline(String json_data) {
    // Implementation for storing events in EEPROM
    // This is a simplified version - production code should handle
    // circular buffer, data integrity, etc.
    
    int address = 0;
    EEPROM.writeString(address, json_data);
    EEPROM.commit();
}

void sync_offline_events() {
    // Implementation for syncing stored events
    // Read from EEPROM and attempt to send
    
    String stored_event = EEPROM.readString(0);
    if (stored_event.length() > 0) {
        // Attempt to send stored event
        HTTPClient http;
        http.begin(API_ENDPOINT);
        http.addHeader("Content-Type", "application/json");
        
        int response_code = http.POST(stored_event);
        
        if (response_code == 200) {
            // Clear stored event
            EEPROM.writeString(0, "");
            EEPROM.commit();
        }
        
        http.end();
    }
}

void check_firmware_update() {
    HTTPClient http;
    http.begin("https://device-api.mytaptrack.com/api/device/firmware");
    http.addHeader("Content-Type", "application/json");
    
    DynamicJsonDocument doc(512);
    doc["dsn"] = DEVICE_DSN;
    doc["identity"] = DEVICE_IDENTITY;
    doc["firmware"]["lastUpdate"] = "2024-01-01T00:00:00Z";
    
    String json_string;
    serializeJson(doc, json_string);
    
    int response_code = http.POST(json_string);
    
    if (response_code == 200) {
        String response = http.getString();
        
        DynamicJsonDocument response_doc(1024);
        deserializeJson(response_doc, response);
        
        if (response_doc.containsKey("url")) {
            String firmware_url = response_doc["url"];
            Serial.println("Firmware update available: " + firmware_url);
            
            // Implement firmware download and update logic here
            // This would involve downloading the firmware, verifying it,
            // and flashing it to the device
        }
    }
    
    http.end();
}
```

This implementation provides a complete foundation for Track 2.0 device integration, including button handling, event transmission, offline storage, time synchronization, and firmware updates.