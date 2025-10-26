import http from 'http';

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 4000,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    console.error(`Health check failed with status: ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (error) => {
  console.error('Health check request failed:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('Health check request timed out');
  req.destroy();
  process.exit(1);
});

req.end();