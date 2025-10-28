#!/bin/bash

# RabbitMQ Monitoring Setup Script
# Configures monitoring, alerting, and operational visibility

set -e

# Configuration
RABBITMQ_HOST=${RABBITMQ_HOST:-localhost}
RABBITMQ_PORT=${RABBITMQ_PORT:-15672}
RABBITMQ_USER=${RABBITMQ_DEFAULT_USER:-admin}
RABBITMQ_PASS=${RABBITMQ_DEFAULT_PASS:-password}
VHOST=${RABBITMQ_VHOST:-mytaptrack}

# Base URL for RabbitMQ Management API
BASE_URL="http://$RABBITMQ_HOST:$RABBITMQ_PORT/api"
AUTH="-u $RABBITMQ_USER:$RABBITMQ_PASS"

echo "Setting up RabbitMQ monitoring and alerting..."

# Function to make API calls with error handling
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -n "$data" ]; then
    curl -s -X "$method" $AUTH -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint"
  else
    curl -s -X "$method" $AUTH "$BASE_URL$endpoint"
  fi
  
  if [ $? -ne 0 ]; then
    echo "Error: API call failed for $endpoint"
    exit 1
  fi
}

# 1. Enable detailed statistics collection
echo "Enabling detailed statistics collection..."
api_call PUT "/parameters/component/rabbitmq_management/%" '{
  "value": {
    "rates_mode": "detailed",
    "sample_retention_policies": {
      "global": [600, 3600, 28800, 86400],
      "basic": [600, 3600],
      "detailed": [600]
    }
  }
}'

# 2. Set up monitoring policies for performance optimization
echo "Setting up monitoring policies..."

# Policy for monitoring queue lengths and preventing memory issues
api_call PUT "/policies/$VHOST/monitoring-limits" '{
  "pattern": "^(user|student|license|report|app|device)\\.",
  "definition": {
    "max-length": 50000,
    "max-length-bytes": 104857600,
    "overflow": "drop-head",
    "message-ttl": 7200000
  },
  "priority": 10,
  "apply-to": "queues"
}'

# Policy for failed queues with stricter limits
api_call PUT "/policies/$VHOST/failed-queue-limits" '{
  "pattern": "\\.failed$",
  "definition": {
    "max-length": 10000,
    "max-length-bytes": 52428800,
    "overflow": "reject-publish"
  },
  "priority": 15,
  "apply-to": "queues"
}'

# Policy for retry queues with TTL
api_call PUT "/policies/$VHOST/retry-queue-config" '{
  "pattern": "\\.retry$",
  "definition": {
    "max-length": 5000,
    "message-ttl": 30000,
    "expires": 3600000
  },
  "priority": 12,
  "apply-to": "queues"
}'

# 3. Create monitoring queues for metrics collection
echo "Creating monitoring queues..."

# Queue for collecting queue statistics
api_call PUT "/queues/$VHOST/monitoring.queue.stats" '{
  "durable": true,
  "auto_delete": false,
  "arguments": {
    "x-message-ttl": 300000,
    "x-max-length": 1000,
    "x-overflow": "drop-head"
  }
}'

# Queue for collecting connection statistics
api_call PUT "/queues/$VHOST/monitoring.connection.stats" '{
  "durable": true,
  "auto_delete": false,
  "arguments": {
    "x-message-ttl": 300000,
    "x-max-length": 1000,
    "x-overflow": "drop-head"
  }
}'

# Queue for collecting performance metrics
api_call PUT "/queues/$VHOST/monitoring.performance.metrics" '{
  "durable": true,
  "auto_delete": false,
  "arguments": {
    "x-message-ttl": 600000,
    "x-max-length": 2000,
    "x-overflow": "drop-head"
  }
}'

# Exchange for monitoring events
api_call PUT "/exchanges/$VHOST/monitoring.events" '{
  "type": "topic",
  "durable": true,
  "auto_delete": false,
  "arguments": {}
}'

# Bind monitoring queues to monitoring exchange
api_call POST "/bindings/$VHOST/e/monitoring.events/q/monitoring.queue.stats" '{
  "routing_key": "stats.queue.*",
  "arguments": {}
}'

api_call POST "/bindings/$VHOST/e/monitoring.events/q/monitoring.connection.stats" '{
  "routing_key": "stats.connection.*",
  "arguments": {}
}'

api_call POST "/bindings/$VHOST/e/monitoring.events/q/monitoring.performance.metrics" '{
  "routing_key": "metrics.*",
  "arguments": {}
}'

# 4. Set up federation for monitoring (if needed for multi-node setup)
echo "Configuring federation policies..."

# Federation policy for monitoring data replication
api_call PUT "/policies/$VHOST/monitoring-federation" '{
  "pattern": "^monitoring\\.",
  "definition": {
    "federation-upstream-set": "all"
  },
  "priority": 20,
  "apply-to": "exchanges"
}'

# 5. Configure shovel for metrics forwarding (optional)
echo "Setting up shovel for metrics forwarding..."

# Create shovel for forwarding critical metrics to external systems
api_call PUT "/parameters/shovel/$VHOST/metrics-forwarder" '{
  "value": {
    "src-protocol": "amqp091",
    "src-uri": "amqp://'"$RABBITMQ_USER"':'"$RABBITMQ_PASS"'@'"$RABBITMQ_HOST"':5672/'"$VHOST"'",
    "src-queue": "monitoring.performance.metrics",
    "dest-protocol": "amqp091",
    "dest-uri": "amqp://'"$RABBITMQ_USER"':'"$RABBITMQ_PASS"'@'"$RABBITMQ_HOST"':5672/'"$VHOST"'",
    "dest-exchange": "monitoring.events",
    "dest-exchange-key": "metrics.forwarded",
    "ack-mode": "on-confirm",
    "delete-after": "never"
  }
}'

# 6. Create alerting configuration
echo "Setting up alerting configuration..."

# Create alert queue for critical events
api_call PUT "/queues/$VHOST/alerts.critical" '{
  "durable": true,
  "auto_delete": false,
  "arguments": {
    "x-message-ttl": 86400000,
    "x-max-length": 500,
    "x-overflow": "drop-head"
  }
}'

# Create alert queue for warnings
api_call PUT "/queues/$VHOST/alerts.warning" '{
  "durable": true,
  "auto_delete": false,
  "arguments": {
    "x-message-ttl": 3600000,
    "x-max-length": 1000,
    "x-overflow": "drop-head"
  }
}'

# Exchange for alerts
api_call PUT "/exchanges/$VHOST/alerts" '{
  "type": "direct",
  "durable": true,
  "auto_delete": false,
  "arguments": {}
}'

# Bind alert queues
api_call POST "/bindings/$VHOST/e/alerts/q/alerts.critical" '{
  "routing_key": "critical",
  "arguments": {}
}'

api_call POST "/bindings/$VHOST/e/alerts/q/alerts.warning" '{
  "routing_key": "warning",
  "arguments": {}
}'

# 7. Set up trace logging (for debugging)
echo "Configuring trace logging..."

# Create trace file for debugging
api_call PUT "/traces/%2f/debug-trace" '{
  "format": "json",
  "pattern": "#"
}'

echo "Monitoring setup completed successfully!"
echo ""
echo "Monitoring Features Configured:"
echo "- Detailed statistics collection enabled"
echo "- Queue length and memory limits set"
echo "- Monitoring queues created for metrics collection"
echo "- Federation policies configured"
echo "- Shovel set up for metrics forwarding"
echo "- Alerting queues and exchanges created"
echo "- Trace logging enabled for debugging"
echo ""
echo "Access RabbitMQ Management UI at: http://$RABBITMQ_HOST:$RABBITMQ_PORT"
echo "Username: $RABBITMQ_USER"
echo "VHost: $VHOST"