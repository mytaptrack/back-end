#!/bin/bash

# RabbitMQ Setup Test Script
# Validates that all RabbitMQ configuration and setup is working correctly

set -e

# Configuration
RABBITMQ_HOST=${RABBITMQ_HOST:-localhost}
RABBITMQ_PORT=${RABBITMQ_PORT:-15672}
RABBITMQ_USER=${RABBITMQ_DEFAULT_USER:-admin}
RABBITMQ_PASS=${RABBITMQ_DEFAULT_PASS:-password}
VHOST=${RABBITMQ_VHOST:-mytaptrack}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=""

# Function to add test result
add_test_result() {
  local status=$1
  local test_name=$2
  local message=$3
  
  if [ "$status" = "PASS" ]; then
    TESTS_PASSED=$((TESTS_PASSED + 1))
    TEST_RESULTS="$TEST_RESULTS\n${GREEN}✓ PASS${NC} $test_name: $message"
  else
    TESTS_FAILED=$((TESTS_FAILED + 1))
    TEST_RESULTS="$TEST_RESULTS\n${RED}✗ FAIL${NC} $test_name: $message"
  fi
}

# Function to make API calls
api_call() {
  local endpoint=$1
  curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api$endpoint" 2>/dev/null
}

echo -e "${BLUE}Starting RabbitMQ Setup Validation Tests${NC}"
echo "========================================"

# Test 1: Basic connectivity
echo "Testing basic connectivity..."
if api_call "/overview" > /dev/null; then
  add_test_result "PASS" "Basic Connectivity" "Management API is accessible"
else
  add_test_result "FAIL" "Basic Connectivity" "Cannot access Management API"
fi

# Test 2: VHost existence
echo "Testing vhost configuration..."
vhost_info=$(api_call "/vhosts/$VHOST")
if [ $? -eq 0 ]; then
  add_test_result "PASS" "VHost Configuration" "VHost '$VHOST' exists and is accessible"
else
  add_test_result "FAIL" "VHost Configuration" "VHost '$VHOST' is not accessible"
fi

# Test 3: Critical exchanges
echo "Testing exchange configuration..."
exchanges=$(api_call "/exchanges/$VHOST")
critical_exchanges=("mytaptrack.events" "mytaptrack.dlx" "mytaptrack.retry")

for exchange in "${critical_exchanges[@]}"; do
  if echo "$exchanges" | jq -e ".[] | select(.name == \"$exchange\")" > /dev/null 2>&1; then
    exchange_type=$(echo "$exchanges" | jq -r ".[] | select(.name == \"$exchange\") | .type")
    add_test_result "PASS" "Exchange $exchange" "Exists with type: $exchange_type"
  else
    add_test_result "FAIL" "Exchange $exchange" "Missing or inaccessible"
  fi
done

# Test 4: Critical queues
echo "Testing queue configuration..."
queues=$(api_call "/queues/$VHOST")
critical_queues=("user.events" "student.events" "license.events" "report.events" "app.events" "device.events")

for queue in "${critical_queues[@]}"; do
  queue_info=$(echo "$queues" | jq -e ".[] | select(.name == \"$queue\")" 2>/dev/null)
  if [ $? -eq 0 ]; then
    durable=$(echo "$queue_info" | jq -r '.durable')
    dlx=$(echo "$queue_info" | jq -r '.arguments."x-dead-letter-exchange" // "none"')
    add_test_result "PASS" "Queue $queue" "Exists (durable: $durable, DLX: $dlx)"
  else
    add_test_result "FAIL" "Queue $queue" "Missing or inaccessible"
  fi
done

# Test 5: Retry queues
echo "Testing retry queue configuration..."
retry_queues=("user.events.retry" "student.events.retry" "license.events.retry" "report.events.retry" "app.events.retry" "device.events.retry")

for queue in "${retry_queues[@]}"; do
  queue_info=$(echo "$queues" | jq -e ".[] | select(.name == \"$queue\")" 2>/dev/null)
  if [ $? -eq 0 ]; then
    ttl=$(echo "$queue_info" | jq -r '.arguments."x-message-ttl" // "none"')
    dlx=$(echo "$queue_info" | jq -r '.arguments."x-dead-letter-exchange" // "none"')
    add_test_result "PASS" "Retry Queue $queue" "Exists (TTL: $ttl, DLX: $dlx)"
  else
    add_test_result "FAIL" "Retry Queue $queue" "Missing or inaccessible"
  fi
done

# Test 6: Failed queues
echo "Testing failed queue configuration..."
failed_queues=("user.events.failed" "student.events.failed" "license.events.failed" "report.events.failed" "app.events.failed" "device.events.failed")

for queue in "${failed_queues[@]}"; do
  queue_info=$(echo "$queues" | jq -e ".[] | select(.name == \"$queue\")" 2>/dev/null)
  if [ $? -eq 0 ]; then
    durable=$(echo "$queue_info" | jq -r '.durable')
    add_test_result "PASS" "Failed Queue $queue" "Exists (durable: $durable)"
  else
    add_test_result "FAIL" "Failed Queue $queue" "Missing or inaccessible"
  fi
done

# Test 7: Bindings
echo "Testing binding configuration..."
bindings=$(api_call "/bindings/$VHOST")

# Test main event bindings
for event_type in "user" "student" "license" "report" "app" "device"; do
  binding_exists=$(echo "$bindings" | jq -e ".[] | select(.source == \"mytaptrack.events\" and .destination == \"$event_type.events\" and .routing_key == \"$event_type.*\")" 2>/dev/null)
  if [ $? -eq 0 ]; then
    add_test_result "PASS" "Binding $event_type.events" "Correctly bound to mytaptrack.events"
  else
    add_test_result "FAIL" "Binding $event_type.events" "Missing binding to mytaptrack.events"
  fi
done

# Test 8: Policies
echo "Testing policy configuration..."
policies=$(api_call "/policies/$VHOST")

critical_policies=("ha-all" "retry-policy" "failed-queue-policy")
for policy in "${critical_policies[@]}"; do
  policy_info=$(echo "$policies" | jq -e ".[] | select(.name == \"$policy\")" 2>/dev/null)
  if [ $? -eq 0 ]; then
    pattern=$(echo "$policy_info" | jq -r '.pattern')
    add_test_result "PASS" "Policy $policy" "Exists with pattern: $pattern"
  else
    add_test_result "FAIL" "Policy $policy" "Missing or inaccessible"
  fi
done

# Test 9: User permissions
echo "Testing user permissions..."
permissions=$(api_call "/permissions/$VHOST/mytaptrack_app")
if [ $? -eq 0 ]; then
  configure=$(echo "$permissions" | jq -r '.configure // "none"')
  write=$(echo "$permissions" | jq -r '.write // "none"')
  read=$(echo "$permissions" | jq -r '.read // "none"')
  add_test_result "PASS" "App User Permissions" "Configure: $configure, Write: $write, Read: $read"
else
  add_test_result "FAIL" "App User Permissions" "Cannot retrieve permissions for mytaptrack_app user"
fi

# Test 10: Message publishing test
echo "Testing message publishing..."
test_message='{"test": true, "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'", "source": "setup-test"}'

publish_result=$(curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
  -H "Content-Type: application/json" \
  -d '{"properties":{},"routing_key":"user.created","payload":"'"$test_message"'","payload_encoding":"string"}' \
  "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/exchanges/$VHOST/mytaptrack.events/publish" 2>/dev/null)

if echo "$publish_result" | jq -e '.routed == true' > /dev/null 2>&1; then
  add_test_result "PASS" "Message Publishing" "Test message successfully published and routed"
else
  add_test_result "FAIL" "Message Publishing" "Failed to publish or route test message"
fi

# Test 11: Queue message consumption test
echo "Testing message consumption..."
sleep 2  # Wait for message to be processed

# Check if message appeared in user.events queue
queue_messages=$(api_call "/queues/$VHOST/user.events")
message_count=$(echo "$queue_messages" | jq -r '.messages // 0')

if [ "$message_count" -gt 0 ]; then
  add_test_result "PASS" "Message Consumption" "Message successfully delivered to user.events queue"
  
  # Get and acknowledge the message to clean up
  get_result=$(curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
    -H "Content-Type: application/json" \
    -d '{"count":1,"ackmode":"ack_requeue_false","encoding":"auto"}' \
    "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/queues/$VHOST/user.events/get" 2>/dev/null)
else
  add_test_result "FAIL" "Message Consumption" "Message not delivered to user.events queue"
fi

# Test 12: Health check endpoint
echo "Testing health check functionality..."
if [ -f "/etc/rabbitmq/health-check.sh" ]; then
  health_result=$(bash /etc/rabbitmq/health-check.sh 2>/dev/null)
  if [ $? -eq 0 ]; then
    add_test_result "PASS" "Health Check Script" "Health check script executed successfully"
  else
    add_test_result "FAIL" "Health Check Script" "Health check script failed"
  fi
else
  add_test_result "FAIL" "Health Check Script" "Health check script not found"
fi

# Output results
echo ""
echo "========================================"
echo -e "${BLUE}Test Results Summary${NC}"
echo "========================================"
echo -e "$TEST_RESULTS"
echo ""
echo "========================================"

total_tests=$((TESTS_PASSED + TESTS_FAILED))
pass_rate=$((TESTS_PASSED * 100 / total_tests))

echo -e "Total Tests: $total_tests"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo -e "Pass Rate: $pass_rate%"

if [ $TESTS_FAILED -eq 0 ]; then
  echo ""
  echo -e "${GREEN}🎉 All tests passed! RabbitMQ setup is working correctly.${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some tests failed. Please check the configuration.${NC}"
  exit 1
fi