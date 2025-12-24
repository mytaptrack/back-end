# Device API - Quick Start

## The server IS working correctly!

When you run `npm run device:start`, you'll see:
```
Device API server running on http://localhost:3001
```

**This is normal!** The server is now waiting for HTTP requests. It doesn't print anything else until it receives a request.

## How to Use

### Option 1: Run in Background
```bash
# Start server in background
npm run device:start &

# Test it
curl http://localhost:3001/health

# Stop it
pkill -f device-server
```

### Option 2: Use the Test Script
```bash
# Run the test script (starts server and tests it)
./test-device-api.sh

# Press Ctrl+C to stop
```

### Option 3: Run in Separate Terminal
```bash
# Terminal 1: Start server (leave this running)
npm run device:start

# Terminal 2: Test it
curl http://localhost:3001/health
curl http://localhost:3001/time
```

## Testing Endpoints

```bash
# Health check
curl http://localhost:3001/health

# Get server time
curl http://localhost:3001/time

# Test with data (requires valid device ID)
curl -X PUT http://localhost:3001/data \
  -H "Content-Type: application/json" \
  -d '{
    "dsn": "M200000000000001",
    "identity": "test-identity",
    "pressType": "click",
    "clickCount": 1,
    "remainingLife": 100,
    "eventDate": "2025-12-05T18:00:00Z",
    "segment": 0,
    "complete": true
  }'
```

## With Docker

```bash
# Start all services (includes device API)
make container-up

# Test
curl http://localhost:3001/health

# Stop
make container-down
```

## Troubleshooting

**"Nothing happens after starting"**
- This is correct! The server is waiting for requests
- Open another terminal and run `curl http://localhost:3001/health`

**"Port already in use"**
```bash
lsof -ti:3001 | xargs kill
```

**"Cannot connect"**
- Make sure you're testing in a different terminal
- Check if server is running: `lsof -i:3001`
