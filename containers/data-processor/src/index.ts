import express from 'express';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'data-processor', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({ 
    service: 'data-processor',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Process data endpoint (mock)
app.post('/process', (req, res) => {
  console.log('Processing data:', req.body);
  res.json({ 
    message: 'Data processed successfully', 
    processedAt: new Date().toISOString(),
    data: req.body 
  });
});

app.listen(port, () => {
  console.log(`Data processor service listening on port ${port}`);
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