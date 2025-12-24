#!/bin/bash

echo "Starting Device API server..."
npm run device:start > /tmp/device-api.log 2>&1 &
SERVER_PID=$!

echo "Waiting for server to start..."
sleep 3

echo ""
echo "Testing endpoints:"
echo "=================="

echo ""
echo "1. Health check:"
curl -s http://localhost:3001/health | jq .

echo ""
echo "2. Get time:"
curl -s http://localhost:3001/time

echo ""
echo ""
echo "Server is running with PID: $SERVER_PID"
echo "View logs: tail -f /tmp/device-api.log"
echo "Stop server: kill $SERVER_PID"
echo ""
echo "Press Ctrl+C to stop the server and exit"

# Wait for Ctrl+C
trap "kill $SERVER_PID 2>/dev/null; echo 'Server stopped'; exit 0" INT
wait $SERVER_PID
