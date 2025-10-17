# Device Connection and Management Issues

This guide helps resolve issues with IoT device connectivity, registration, and data transmission in MyTapTrack.

## Device Connection Problems

### Device Not Connecting

**Symptoms:**
- Device shows as "Offline" in dashboard
- No recent data from device
- Device LED indicators show connection issues

**Basic Troubleshooting:**
1. **Check Power Supply**
   - Verify device is powered on
   - Check battery level (should be above 20%)
   - Ensure power adapter is properly connected
   - Try a different power outlet

2. **Check Network Connectivity**
   - Verify WiFi network is working
   - Check signal strength at device location
   - Ensure network password hasn't changed
   - Try moving device closer to router temporarily

3. **Device Reset**
   - Hold reset button for 10 seconds
   - Wait for device to restart (LED will cycle)
   - Device will attempt to reconnect automatically
   - Allow 2-3 minutes for full reconnection

### Device Registration Issues

**Symptoms:**
- Cannot add new device to account
- "Device already registered" error
- QR code scanning not working

**Solution for New Device Registration:**
1. **Prepare Device**
   - Ensure device is powered on and in setup mode
   - Device LED should be blinking blue (setup mode)
   - If not blinking blue, hold setup button for 5 seconds

2. **Registration Process**
   - Open MyTapTrack app/website
   - Navigate to "Add Device" section
   - Scan QR code on device label
   - If QR code won't scan, manually enter device ID
   - Follow on-screen setup instructions

3. **Network Configuration**
   - Select your WiFi network from the list
   - Enter network password carefully
   - Wait for "Connected" confirmation
   - Device LED should turn solid green when successful

**If Device Already Registered Error:**
- Contact previous owner to remove device from their account
- If you are the original owner, contact support with proof of purchase
- Device may need to be factory reset by support team

### Data Transmission Problems

**Symptoms:**
- Device connected but no data appearing
- Data delayed by hours
- Partial data missing

**Troubleshooting Steps:**
1. **Check Data Collection Settings**
   - Verify device is configured to collect desired data types
   - Check sampling frequency settings
   - Ensure data collection is enabled (not paused)

2. **Network Quality Check**
   - Test internet speed at device location
   - Check for network interruptions
   - Verify firewall isn't blocking device communication
   - Required ports: 443 (HTTPS), 8883 (MQTT over SSL)

3. **Device Memory Check**
   - Device can store 48 hours of data offline
   - If offline longer, oldest data may be overwritten
   - Check device storage status in settings

### Battery and Power Issues

**Symptoms:**
- Device shutting down unexpectedly
- Low battery warnings
- Inconsistent operation

**Battery Troubleshooting:**
1. **Check Battery Level**
   - View current battery percentage in app
   - Normal operation requires >20% battery
   - Replace batteries when level drops below 10%

2. **Power Management**
   - Adjust data collection frequency to conserve battery
   - Enable power saving mode for extended operation
   - Check for power-hungry features that can be disabled

3. **Charging Issues (Rechargeable Devices)**
   - Use only provided charging cable
   - Ensure charging port is clean and dry
   - Charging LED should indicate charging status
   - Full charge typically takes 2-4 hours

### Signal Strength and Range Issues

**Symptoms:**
- Intermittent connectivity
- Data transmission failures
- "Weak signal" warnings

**Signal Optimization:**
1. **Check Signal Strength**
   - Minimum required: -85 dBm
   - Optimal range: -30 to -70 dBm
   - View signal strength in device settings

2. **Improve Signal Quality**
   - Move device closer to WiFi router
   - Remove physical obstructions (walls, metal objects)
   - Avoid interference from other devices (microwaves, baby monitors)
   - Consider WiFi extender for distant locations

3. **Network Optimization**
   - Use 2.4GHz network for better range
   - Avoid overcrowded WiFi channels
   - Update router firmware
   - Consider dedicated IoT network

## Device Configuration Issues

### Incorrect Time/Date Settings

**Symptoms:**
- Data timestamps are wrong
- Scheduled operations not working
- Time zone issues in reports

**Solution:**
1. Device automatically syncs time from internet
2. Check device time zone setting in app
3. Verify your account time zone is correct
4. If still incorrect, try device restart
5. Contact support if time sync fails repeatedly

### Sensor Calibration Problems

**Symptoms:**
- Readings seem inaccurate
- Sudden changes in sensor values
- Sensor values stuck at same reading

**Calibration Steps:**
1. **Environmental Check**
   - Ensure sensors are clean and unobstructed
   - Check for environmental factors affecting readings
   - Allow 15 minutes for sensors to stabilize after moving device

2. **Manual Calibration**
   - Access calibration mode in device settings
   - Follow on-screen calibration instructions
   - Use known reference values when available
   - Save calibration settings when complete

3. **Factory Reset Calibration**
   - If manual calibration fails, reset to factory defaults
   - Contact support for sensor-specific calibration procedures

### Firmware Update Issues

**Symptoms:**
- Update notification but update fails
- Device becomes unresponsive after update
- Features not working after update

**Update Troubleshooting:**
1. **Ensure Stable Connection**
   - Device must have strong WiFi signal during update
   - Don't power off device during update process
   - Update process typically takes 5-15 minutes

2. **Recovery from Failed Update**
   - Hold reset button for 30 seconds
   - Device will attempt automatic recovery
   - If unsuccessful, contact support for manual recovery

3. **Post-Update Issues**
   - Allow 5 minutes for device to fully restart
   - Check that all settings are preserved
   - Reconfigure any custom settings if needed

## Device-Specific Troubleshooting

### Environmental Sensors
- **Temperature**: Allow 10 minutes for accurate readings after placement
- **Humidity**: Keep away from direct moisture sources
- **Air Quality**: Requires 24-48 hours for initial calibration

### Motion Sensors
- **Sensitivity**: Adjust in settings if too sensitive/insensitive
- **False Triggers**: Check for vibrations, air currents, or pets
- **Range**: Optimal detection range is 5-20 feet

### Location Tracking Devices
- **GPS**: Requires clear view of sky, may take 2-5 minutes for first fix
- **Indoor Positioning**: Uses WiFi triangulation, less accurate than GPS
- **Battery Impact**: GPS significantly reduces battery life

## Error Codes and Messages

### Connection Error Codes
- **ERR_001**: Network timeout - Check internet connection
- **ERR_002**: Authentication failed - Verify device registration
- **ERR_003**: Server unreachable - Check system status
- **ERR_004**: Invalid configuration - Reset device settings

### Sensor Error Codes
- **SENS_001**: Sensor disconnected - Check physical connections
- **SENS_002**: Calibration required - Run calibration procedure
- **SENS_003**: Sensor malfunction - Contact support for replacement

### Power Error Codes
- **PWR_001**: Low battery - Replace or charge battery
- **PWR_002**: Power supply issue - Check power adapter
- **PWR_003**: Charging error - Clean charging contacts

## When to Contact Support

**Contact support immediately if:**
- Device shows signs of physical damage
- Sensor readings indicate safety concerns
- Device becomes completely unresponsive
- Multiple devices fail simultaneously
- Suspected security breach or unauthorized access

**Contact support within 24 hours if:**
- Troubleshooting steps don't resolve connectivity issues
- Data accuracy concerns persist after calibration
- Firmware updates repeatedly fail
- Device performance significantly degrades

**Information to provide to support:**
- Device model and serial number
- Current firmware version
- Error codes or messages
- Network configuration details
- Recent changes to setup or environment
- Screenshots of device status screens

**Support Channels:**
- Email: support@mytaptrack.com
- Emergency: +1-800-TAPTRACK
- Device replacement: warranty@mytaptrack.com