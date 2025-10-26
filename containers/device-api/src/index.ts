import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const app = express();
const port = process.env.PORT || 4502;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'device-api', timestamp: new Date().toISOString() });
});

// Device registration endpoint (mock)
app.post('/device/register', (req, res) => {
  const { deviceId, deviceType } = req.body;
  console.log(`Registering device: ${deviceId} of type: ${deviceType}`);
  
  res.json({
    message: 'Device registered successfully',
    deviceId,
    deviceType,
    registeredAt: new Date().toISOString()
  });
});

// Device data endpoint (mock)
app.post('/device/data', (req, res) => {
  const { deviceId, data } = req.body;
  console.log(`Received data from device ${deviceId}:`, data);
  
  res.json({
    message: 'Data received successfully',
    deviceId,
    processedAt: new Date().toISOString()
  });
});

// Device status endpoint (mock)
app.get('/device/:deviceId/status', (req, res) => {
  const { deviceId } = req.params;
  
  res.json({
    deviceId,
    status: 'online',
    lastSeen: new Date().toISOString(),
    batteryLevel: Math.floor(Math.random() * 100)
  });
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for real-time device communication
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log('Device connected via WebSocket');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received WebSocket message:', data);
      
      // Echo back with timestamp
      ws.send(JSON.stringify({
        type: 'ack',
        originalMessage: data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Device disconnected from WebSocket');
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to MyTapTrack Device API',
    timestamp: new Date().toISOString()
  }));
});

server.listen(port, () => {
  console.log(`Device API service listening on port ${port}`);
  console.log(`WebSocket server ready for device connections`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  wss.close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  wss.close();
  server.close();
  process.exit(0);
});