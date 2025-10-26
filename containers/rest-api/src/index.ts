import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const port = process.env.PORT || 4501;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'rest-api', timestamp: new Date().toISOString() });
});

// API v2 routes
app.get('/api/v2/status', (req, res) => {
  res.json({ 
    message: 'MyTapTrack REST API v2 is running',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Users endpoint (mock)
app.get('/api/v2/users', (req, res) => {
  res.json({
    users: [
      { id: '1', email: 'user1@example.com', name: 'User One' },
      { id: '2', email: 'user2@example.com', name: 'User Two' }
    ],
    total: 2
  });
});

// Students endpoint (mock)
app.get('/api/v2/students', (req, res) => {
  res.json({
    students: [
      { id: '1', name: 'Student One', userId: '1' },
      { id: '2', name: 'Student Two', userId: '1' }
    ],
    total: 2
  });
});

// Apps endpoint (mock)
app.get('/api/v2/apps', (req, res) => {
  res.json({
    apps: [
      { id: '1', name: 'Math App', userId: '1' },
      { id: '2', name: 'Reading App', userId: '2' }
    ],
    total: 2
  });
});

// Reports endpoint (mock)
app.get('/api/v2/reports', (req, res) => {
  res.json({
    reports: [
      { id: '1', title: 'Weekly Progress', type: 'progress', userId: '1' },
      { id: '2', title: 'Monthly Summary', type: 'summary', userId: '2' }
    ],
    total: 2
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(port, () => {
  console.log(`REST API service listening on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});