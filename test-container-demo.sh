#!/bin/bash

# Demo script showing container testing workflow

echo "🚀 MyTapTrack Container Testing Demo"
echo "===================================="
echo ""

echo "1. Starting development containers..."
make docker-dev-start
echo ""

echo "2. Configuring system tests for container mode (dev environment)..."
cd system-tests && npm run configure:containers:dev
echo ""

echo "2b. Testing different environments..."
echo "   - Dev environment (mytaptrack_dev database):"
npm run configure:containers:dev | grep "Database:"
echo "   - Test environment (mytaptrack_test database):"
npm run configure:containers:test | grep "Database:"
echo "   - Prod environment (mytaptrack database):"
npm run configure:containers:prod | grep "Database:"
echo ""

echo "3. Running configuration validation tests..."
npm test -- --testNamePattern="System Test Configuration"
echo ""

echo "4. Running a quick health check..."
curl -s http://localhost:4500/health | jq '.' || echo "GraphQL API not ready"
curl -s http://localhost:4501/health | jq '.' || echo "REST API not ready"
curl -s http://localhost:4502/health | jq '.' || echo "Device API not ready"
echo ""

echo "5. Running basic system tests..."
npm test -- --testNamePattern="Basic Infrastructure"
echo ""

echo "✅ Container testing demo completed!"
echo ""
echo "To run tests against different container environments:"
echo "  make test-containers-dev     # Dev environment (mytaptrack_dev)"
echo "  make test-containers-test    # Test environment (mytaptrack_test)"
echo "  make test-containers-prod    # Prod environment (mytaptrack)"
echo ""
echo "To switch back to AWS mode:"
echo "  make test-aws-configure"
echo ""
echo "To stop containers:"
echo "  make docker-dev-stop"