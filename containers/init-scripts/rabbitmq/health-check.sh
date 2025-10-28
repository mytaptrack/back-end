#!/bin/bash

# RabbitMQ Health Check Script
# Performs comprehensive health checks for RabbitMQ broker

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
NC='\033[0m' # No Color

# Health check results
HEALTH_STATUS=0
HEALTH_REPORT=""

# Function to add to health report
add_to_report() {
  local status=$1
  local message=$2
  HEALTH_REPORT="$HEALTH_REPORT\n$message"
  if [ "$status" != "OK" ]; then
    HEALTH_STATUS=1
  fi
}

# Function to make API calls
api_call() {
  local endpoint=$1
  curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api$endpoint" 2>/dev/null
}

echo "Starting RabbitMQ Health Check..."
echo "======================================="

# 1. Check if RabbitMQ Management API is accessible
echo "Checking RabbitMQ Management API..."
if api_call "/overview" > /dev/null; then
  add_to_report "OK" "${GREEN}✓${NC} Management API is accessible"
else
  add_to_report "ERROR" "${RED}✗${NC} Management API is not accessible"
fi

# 2. Check cluster status
echo "Checking cluster status..."
cluster_status=$(api_call "/cluster-name")
if [ $? -eq 0 ]; then
  cluster_name=$(echo "$cluster_status" | jq -r '.name' 2>/dev/null || echo "unknown")
  add_to_report "OK" "${GREEN}✓${NC} Cluster is healthy (name: $cluster_name)"
else
  add_to_report "ERROR" "${RED}✗${NC} Cluster status check failed"
fi

# 3. Check node health
echo "Checking node health..."
nodes=$(api_call "/nodes")
if [ $? -eq 0 ]; then
  node_count=$(echo "$nodes" | jq '. | length' 2>/dev/null || echo "0")
  running_nodes=$(echo "$nodes" | jq '[.[] | select(.running == true)] | length' 2>/dev/null || echo "0")
  
  if [ "$node_count" -gt 0 ] && [ "$running_nodes" -eq "$node_count" ]; then
    add_to_report "OK" "${GREEN}✓${NC} All $node_count nodes are running"
  else
    add_to_report "WARNING" "${YELLOW}⚠${NC} $running_nodes/$node_count nodes are running"
  fi
else
  add_to_report "ERROR" "${RED}✗${NC} Node health check failed"
fi

# 4. Check vhost existence and health
echo "Checking vhost: $VHOST..."
vhost_info=$(api_call "/vhosts/$VHOST")
if [ $? -eq 0 ]; then
  add_to_report "OK" "${GREEN}✓${NC} VHost '$VHOST' exists and is accessible"
else
  add_to_report "ERROR" "${RED}✗${NC} VHost '$VHOST' is not accessible"
fi

# 5. Check critical exchanges
echo "Checking critical exchanges..."
exchanges=$(api_call "/exchanges/$VHOST")
if [ $? -eq 0 ]; then
  critical_exchanges=("mytaptrack.events" "mytaptrack.dlx" "mytaptrack.retry")
  
  for exchange in "${critical_exchanges[@]}"; do
    if echo "$exchanges" | jq -e ".[] | select(.name == \"$exchange\")" > /dev/null 2>&1; then
      add_to_report "OK" "${GREEN}✓${NC} Exchange '$exchange' exists"
    else
      add_to_report "ERROR" "${RED}✗${NC} Exchange '$exchange' is missing"
    fi
  done
else
  add_to_report "ERROR" "${RED}✗${NC} Cannot retrieve exchange information"
fi

# 6. Check critical queues
echo "Checking critical queues..."
queues=$(api_call "/queues/$VHOST")
if [ $? -eq 0 ]; then
  critical_queues=("user.events" "student.events" "license.events" "report.events" "app.events" "device.events")
  
  for queue in "${critical_queues[@]}"; do
    queue_info=$(echo "$queues" | jq -e ".[] | select(.name == \"$queue\")" 2>/dev/null)
    if [ $? -eq 0 ]; then
      # Check queue health metrics
      messages=$(echo "$queue_info" | jq -r '.messages // 0')
      consumers=$(echo "$queue_info" | jq -r '.consumers // 0')
      
      if [ "$messages" -lt 10000 ]; then
        add_to_report "OK" "${GREEN}✓${NC} Queue '$queue' is healthy (messages: $messages, consumers: $consumers)"
      else
        add_to_report "WARNING" "${YELLOW}⚠${NC} Queue '$queue' has high message count: $messages"
      fi
    else
      add_to_report "ERROR" "${RED}✗${NC} Queue '$queue' is missing"
    fi
  done
else
  add_to_report "ERROR" "${RED}✗${NC} Cannot retrieve queue information"
fi

# 7. Check connections and channels
echo "Checking connections and channels..."
connections=$(api_call "/connections")
if [ $? -eq 0 ]; then
  connection_count=$(echo "$connections" | jq '. | length' 2>/dev/null || echo "0")
  
  if [ "$connection_count" -gt 0 ]; then
    add_to_report "OK" "${GREEN}✓${NC} Active connections: $connection_count"
    
    # Check for any connection issues
    blocked_connections=$(echo "$connections" | jq '[.[] | select(.state != "running")] | length' 2>/dev/null || echo "0")
    if [ "$blocked_connections" -gt 0 ]; then
      add_to_report "WARNING" "${YELLOW}⚠${NC} $blocked_connections connections are not in running state"
    fi
  else
    add_to_report "WARNING" "${YELLOW}⚠${NC} No active connections (this may be normal if no services are running)"
  fi
else
  add_to_report "ERROR" "${RED}✗${NC} Cannot retrieve connection information"
fi

# 8. Check memory and disk usage
echo "Checking resource usage..."
overview=$(api_call "/overview")
if [ $? -eq 0 ]; then
  # Memory usage
  memory_used=$(echo "$overview" | jq -r '.queue_totals.messages_ram // 0')
  memory_limit=$(echo "$overview" | jq -r '.memory_limit // 0')
  
  if [ "$memory_limit" -gt 0 ]; then
    memory_percent=$((memory_used * 100 / memory_limit))
    if [ "$memory_percent" -lt 80 ]; then
      add_to_report "OK" "${GREEN}✓${NC} Memory usage is healthy ($memory_percent%)"
    else
      add_to_report "WARNING" "${YELLOW}⚠${NC} High memory usage: $memory_percent%"
    fi
  fi
  
  # Disk usage
  disk_free=$(echo "$overview" | jq -r '.disk_free // 0')
  disk_limit=$(echo "$overview" | jq -r '.disk_free_limit // 0')
  
  if [ "$disk_limit" -gt 0 ] && [ "$disk_free" -gt "$disk_limit" ]; then
    add_to_report "OK" "${GREEN}✓${NC} Disk space is sufficient"
  elif [ "$disk_limit" -gt 0 ]; then
    add_to_report "WARNING" "${YELLOW}⚠${NC} Low disk space warning"
  fi
else
  add_to_report "ERROR" "${RED}✗${NC} Cannot retrieve resource usage information"
fi

# 9. Test message publishing and consuming (health check message)
echo "Testing message flow..."
health_message="{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"source\":\"health-check\",\"test\":true}"

# Publish test message
publish_result=$(curl -s -u "$RABBITMQ_USER:$RABBITMQ_PASS" \
  -H "Content-Type: application/json" \
  -d "{\"properties\":{},\"routing_key\":\"system.health\",\"payload\":\"$health_message\",\"payload_encoding\":\"string\"}" \
  "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/exchanges/$VHOST/mytaptrack.events/publish" 2>/dev/null)

if echo "$publish_result" | jq -e '.routed == true' > /dev/null 2>&1; then
  add_to_report "OK" "${GREEN}✓${NC} Message publishing test successful"
else
  add_to_report "ERROR" "${RED}✗${NC} Message publishing test failed"
fi

# 10. Check for any alarms
echo "Checking for alarms..."
alarms=$(api_call "/health/checks/alarms")
if [ $? -eq 0 ]; then
  alarm_status=$(echo "$alarms" | jq -r '.status // "unknown"')
  if [ "$alarm_status" = "ok" ]; then
    add_to_report "OK" "${GREEN}✓${NC} No active alarms"
  else
    add_to_report "WARNING" "${YELLOW}⚠${NC} Alarms detected: $alarm_status"
  fi
else
  add_to_report "WARNING" "${YELLOW}⚠${NC} Cannot check alarm status"
fi

# Output results
echo ""
echo "======================================="
echo "Health Check Results:"
echo "======================================="
echo -e "$HEALTH_REPORT"
echo ""

if [ $HEALTH_STATUS -eq 0 ]; then
  echo -e "${GREEN}Overall Status: HEALTHY${NC}"
  exit 0
else
  echo -e "${RED}Overall Status: UNHEALTHY${NC}"
  exit 1
fi