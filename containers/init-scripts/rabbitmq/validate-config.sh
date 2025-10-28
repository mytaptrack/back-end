#!/bin/bash

# RabbitMQ Configuration Validation Script
# Validates configuration files without requiring a running RabbitMQ instance

set -e

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

echo -e "${BLUE}RabbitMQ Configuration Validation${NC}"
echo "=================================="

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Test 1: Check if all required files exist
echo "Checking required files..."
required_files=(
  "rabbitmq.conf"
  "definitions.json"
  "dev-definitions.json"
  "test-definitions.json"
  "init-rabbitmq.sh"
  "health-check.sh"
  "monitoring-setup.sh"
  "connection-recovery.sh"
  "docker-entrypoint.sh"
  "test-setup.sh"
)

for file in "${required_files[@]}"; do
  if [ -f "$SCRIPT_DIR/$file" ]; then
    add_test_result "PASS" "File Check" "$file exists"
  else
    add_test_result "FAIL" "File Check" "$file is missing"
  fi
done

# Test 2: Check if shell scripts are executable
echo "Checking script permissions..."
shell_scripts=(
  "init-rabbitmq.sh"
  "health-check.sh"
  "monitoring-setup.sh"
  "connection-recovery.sh"
  "docker-entrypoint.sh"
  "test-setup.sh"
)

for script in "${shell_scripts[@]}"; do
  if [ -x "$SCRIPT_DIR/$script" ]; then
    add_test_result "PASS" "Permissions" "$script is executable"
  else
    add_test_result "FAIL" "Permissions" "$script is not executable"
  fi
done

# Test 3: Validate JSON configuration files
echo "Validating JSON configuration files..."
json_files=(
  "definitions.json"
  "dev-definitions.json"
  "test-definitions.json"
)

for json_file in "${json_files[@]}"; do
  if [ -f "$SCRIPT_DIR/$json_file" ]; then
    if jq empty "$SCRIPT_DIR/$json_file" 2>/dev/null; then
      add_test_result "PASS" "JSON Validation" "$json_file is valid JSON"
    else
      add_test_result "FAIL" "JSON Validation" "$json_file contains invalid JSON"
    fi
  fi
done

# Test 4: Check critical exchanges in definitions
echo "Checking exchange definitions..."
if [ -f "$SCRIPT_DIR/definitions.json" ]; then
  critical_exchanges=("mytaptrack.events" "mytaptrack.dlx" "mytaptrack.retry")
  
  for exchange in "${critical_exchanges[@]}"; do
    if jq -e ".exchanges[] | select(.name == \"$exchange\")" "$SCRIPT_DIR/definitions.json" > /dev/null 2>&1; then
      exchange_type=$(jq -r ".exchanges[] | select(.name == \"$exchange\") | .type" "$SCRIPT_DIR/definitions.json")
      add_test_result "PASS" "Exchange Definition" "$exchange defined with type: $exchange_type"
    else
      add_test_result "FAIL" "Exchange Definition" "$exchange not found in definitions"
    fi
  done
fi

# Test 5: Check critical queues in definitions
echo "Checking queue definitions..."
if [ -f "$SCRIPT_DIR/definitions.json" ]; then
  critical_queues=("user.events" "student.events" "license.events" "report.events" "app.events" "device.events")
  
  for queue in "${critical_queues[@]}"; do
    if jq -e ".queues[] | select(.name == \"$queue\")" "$SCRIPT_DIR/definitions.json" > /dev/null 2>&1; then
      durable=$(jq -r ".queues[] | select(.name == \"$queue\") | .durable" "$SCRIPT_DIR/definitions.json")
      add_test_result "PASS" "Queue Definition" "$queue defined (durable: $durable)"
    else
      add_test_result "FAIL" "Queue Definition" "$queue not found in definitions"
    fi
  done
fi

# Test 6: Check retry queues
echo "Checking retry queue definitions..."
if [ -f "$SCRIPT_DIR/definitions.json" ]; then
  retry_queues=("user.events.retry" "student.events.retry" "license.events.retry" "report.events.retry" "app.events.retry" "device.events.retry")
  
  for queue in "${retry_queues[@]}"; do
    if jq -e ".queues[] | select(.name == \"$queue\")" "$SCRIPT_DIR/definitions.json" > /dev/null 2>&1; then
      ttl=$(jq -r ".queues[] | select(.name == \"$queue\") | .arguments.\"x-message-ttl\" // \"none\"" "$SCRIPT_DIR/definitions.json")
      add_test_result "PASS" "Retry Queue Definition" "$queue defined (TTL: $ttl)"
    else
      add_test_result "FAIL" "Retry Queue Definition" "$queue not found in definitions"
    fi
  done
fi

# Test 7: Check failed queues
echo "Checking failed queue definitions..."
if [ -f "$SCRIPT_DIR/definitions.json" ]; then
  failed_queues=("user.events.failed" "student.events.failed" "license.events.failed" "report.events.failed" "app.events.failed" "device.events.failed")
  
  for queue in "${failed_queues[@]}"; do
    if jq -e ".queues[] | select(.name == \"$queue\")" "$SCRIPT_DIR/definitions.json" > /dev/null 2>&1; then
      add_test_result "PASS" "Failed Queue Definition" "$queue defined"
    else
      add_test_result "FAIL" "Failed Queue Definition" "$queue not found in definitions"
    fi
  done
fi

# Test 8: Check bindings
echo "Checking binding definitions..."
if [ -f "$SCRIPT_DIR/definitions.json" ]; then
  event_types=("user" "student" "license" "report" "app" "device")
  
  for event_type in "${event_types[@]}"; do
    if jq -e ".bindings[] | select(.source == \"mytaptrack.events\" and .destination == \"$event_type.events\")" "$SCRIPT_DIR/definitions.json" > /dev/null 2>&1; then
      routing_key=$(jq -r ".bindings[] | select(.source == \"mytaptrack.events\" and .destination == \"$event_type.events\") | .routing_key" "$SCRIPT_DIR/definitions.json")
      add_test_result "PASS" "Binding Definition" "$event_type.events bound with key: $routing_key"
    else
      add_test_result "FAIL" "Binding Definition" "$event_type.events binding not found"
    fi
  done
fi

# Test 9: Check policies
echo "Checking policy definitions..."
if [ -f "$SCRIPT_DIR/definitions.json" ]; then
  critical_policies=("ha-all" "retry-policy" "failed-queue-policy")
  
  for policy in "${critical_policies[@]}"; do
    if jq -e ".policies[] | select(.name == \"$policy\")" "$SCRIPT_DIR/definitions.json" > /dev/null 2>&1; then
      pattern=$(jq -r ".policies[] | select(.name == \"$policy\") | .pattern" "$SCRIPT_DIR/definitions.json")
      add_test_result "PASS" "Policy Definition" "$policy defined with pattern: $pattern"
    else
      add_test_result "FAIL" "Policy Definition" "$policy not found in definitions"
    fi
  done
fi

# Test 10: Check RabbitMQ configuration file
echo "Checking RabbitMQ configuration..."
if [ -f "$SCRIPT_DIR/rabbitmq.conf" ]; then
  # Check for critical configuration settings
  critical_settings=(
    "listeners.tcp.default"
    "management.tcp.port"
    "vm_memory_high_watermark.relative"
    "heartbeat"
  )
  
  for setting in "${critical_settings[@]}"; do
    if grep -q "^$setting" "$SCRIPT_DIR/rabbitmq.conf"; then
      value=$(grep "^$setting" "$SCRIPT_DIR/rabbitmq.conf" | cut -d'=' -f2 | tr -d ' ')
      add_test_result "PASS" "Config Setting" "$setting = $value"
    else
      add_test_result "FAIL" "Config Setting" "$setting not found in rabbitmq.conf"
    fi
  done
fi

# Test 11: Check script syntax
echo "Checking script syntax..."
shell_scripts_to_check=(
  "init-rabbitmq.sh"
  "health-check.sh"
  "monitoring-setup.sh"
  "connection-recovery.sh"
  "docker-entrypoint.sh"
)

for script in "${shell_scripts_to_check[@]}"; do
  if [ -f "$SCRIPT_DIR/$script" ]; then
    if bash -n "$SCRIPT_DIR/$script" 2>/dev/null; then
      add_test_result "PASS" "Script Syntax" "$script has valid syntax"
    else
      add_test_result "FAIL" "Script Syntax" "$script has syntax errors"
    fi
  fi
done

# Output results
echo ""
echo "========================================"
echo -e "${BLUE}Validation Results Summary${NC}"
echo "========================================"
echo -e "$TEST_RESULTS"
echo ""
echo "========================================"

total_tests=$((TESTS_PASSED + TESTS_FAILED))
if [ $total_tests -gt 0 ]; then
  pass_rate=$((TESTS_PASSED * 100 / total_tests))
else
  pass_rate=0
fi

echo -e "Total Tests: $total_tests"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo -e "Pass Rate: $pass_rate%"

if [ $TESTS_FAILED -eq 0 ]; then
  echo ""
  echo -e "${GREEN}🎉 All validation tests passed! Configuration is ready for deployment.${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some validation tests failed. Please check the configuration.${NC}"
  exit 1
fi