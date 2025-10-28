#!/bin/bash

# RabbitMQ Initialization Script for MyTapTrack
# This script sets up exchanges, queues, and routing rules that match EventBridge patterns

set -e

# Configuration
RABBITMQ_HOST=${RABBITMQ_HOST:-localhost}
RABBITMQ_PORT=${RABBITMQ_PORT:-15672}
RABBITMQ_USER=${RABBITMQ_DEFAULT_USER:-admin}
RABBITMQ_PASS=${RABBITMQ_DEFAULT_PASS:-password}
VHOST=${RABBITMQ_VHOST:-mytaptrack}
ENVIRONMENT=${ENVIRONMENT:-production}

# Wait for RabbitMQ to be ready
echo "Waiting for RabbitMQ to be ready..."
until curl -f -u "$RABBITMQ_USER:$RABBITMQ_PASS" "http://$RABBITMQ_HOST:$RABBITMQ_PORT/api/overview" > /dev/null 2>&1; do
  echo "RabbitMQ is not ready yet. Waiting..."
  sleep 5
done

echo "RabbitMQ is ready. Starting initialization..."

# Base URL for RabbitMQ Management API
BASE_URL="http://$RABBITMQ_HOST:$RABBITMQ_PORT/api"
AUTH="-u $RABBITMQ_USER:$RABBITMQ_PASS"

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

# Create vhost if it doesn't exist
echo "Creating vhost: $VHOST"
api_call PUT "/vhosts/$VHOST" '{}'

# Create application user for services
echo "Creating application user..."
api_call PUT "/users/mytaptrack_app" '{
  "password": "'"${MYTAPTRACK_APP_PASSWORD:-app_secure_password}"'",
  "tags": ""
}'

# Set permissions for application user
echo "Setting permissions for application user..."
api_call PUT "/permissions/$VHOST/mytaptrack_app" '{
  "configure": ".*",
  "write": ".*",
  "read": ".*"
}'

# Create main event exchange (topic exchange for flexible routing)
echo "Creating main event exchange..."
api_call PUT "/exchanges/$VHOST/mytaptrack.events" '{
  "type": "topic",
  "durable": true,
  "auto_delete": false,
  "arguments": {}
}'

# Create dead letter exchange
echo "Creating dead letter exchange..."
api_call PUT "/exchanges/$VHOST/mytaptrack.dlx" '{
  "type": "direct",
  "durable": true,
  "auto_delete": false,
  "arguments": {}
}'

# Create retry exchange with TTL
echo "Creating retry exchange..."
api_call PUT "/exchanges/$VHOST/mytaptrack.retry" '{
  "type": "direct",
  "durable": true,
  "auto_delete": false,
  "arguments": {}
}'

# Define event types based on EventBridge patterns found in codebase
declare -a EVENT_TYPES=(
  "user"
  "student" 
  "license"
  "report"
  "app"
  "device"
)

# Create queues for each event type with retry and DLQ configuration
for event_type in "${EVENT_TYPES[@]}"; do
  echo "Creating queues for $event_type events..."
  
  # Main event queue with DLQ and retry configuration
  api_call PUT "/queues/$VHOST/$event_type.events" '{
    "durable": true,
    "auto_delete": false,
    "arguments": {
      "x-dead-letter-exchange": "mytaptrack.retry",
      "x-dead-letter-routing-key": "'"$event_type"'.retry",
      "x-message-ttl": 3600000
    }
  }'
  
  # Retry queue with limited retries
  api_call PUT "/queues/$VHOST/$event_type.retry" '{
    "durable": true,
    "auto_delete": false,
    "arguments": {
      "x-dead-letter-exchange": "mytaptrack.events",
      "x-dead-letter-routing-key": "'"$event_type"'.retry.requeue",
      "x-message-ttl": 30000,
      "x-max-length": 1000
    }
  }'
  
  # Final dead letter queue for failed messages
  api_call PUT "/queues/$VHOST/$event_type.failed" '{
    "durable": true,
    "auto_delete": false,
    "arguments": {
      "x-max-length": 10000,
      "x-overflow": "reject-publish"
    }
  }'
  
  # Bind main queue to events exchange
  api_call POST "/bindings/$VHOST/e/mytaptrack.events/q/$event_type.events" '{
    "routing_key": "'"$event_type"'.*",
    "arguments": {}
  }'
  
  # Bind retry queue to retry exchange
  api_call POST "/bindings/$VHOST/e/mytaptrack.retry/q/$event_type.retry" '{
    "routing_key": "'"$event_type"'.retry",
    "arguments": {}
  }'
  
  # Bind failed queue to DLX
  api_call POST "/bindings/$VHOST/e/mytaptrack.dlx/q/$event_type.failed" '{
    "routing_key": "'"$event_type"'.failed",
    "arguments": {}
  }'
  
  # Bind retry requeue to main exchange
  api_call POST "/bindings/$VHOST/e/mytaptrack.events/q/$event_type.events" '{
    "routing_key": "'"$event_type"'.retry.requeue",
    "arguments": {}
  }'
done

# Create specific event queues for granular event handling
declare -A SPECIFIC_EVENTS=(
  ["user"]="created updated deleted"
  ["student"]="created updated deleted documents.updated license.updated note.updated"
  ["license"]="created updated deleted tags.updated"
  ["report"]="created updated deleted data.updated"
  ["app"]="created updated deleted notes.created track.event"
  ["device"]="created updated deleted status.updated battery.updated settings.updated track.event audio.event"
)

for event_type in "${!SPECIFIC_EVENTS[@]}"; do
  for specific_event in ${SPECIFIC_EVENTS[$event_type]}; do
    queue_name="$event_type.$specific_event"
    echo "Creating specific queue: $queue_name"
    
    # Create specific event queue
    api_call PUT "/queues/$VHOST/$queue_name" '{
      "durable": true,
      "auto_delete": false,
      "arguments": {
        "x-dead-letter-exchange": "mytaptrack.dlx",
        "x-dead-letter-routing-key": "'"$queue_name"'.failed",
        "x-message-ttl": 3600000
      }
    }'
    
    # Bind to main exchange with specific routing key
    api_call POST "/bindings/$VHOST/e/mytaptrack.events/q/$queue_name" '{
      "routing_key": "'"$event_type.$specific_event"'",
      "arguments": {}
    }'
    
    # Create corresponding failed queue
    api_call PUT "/queues/$VHOST/$queue_name.failed" '{
      "durable": true,
      "auto_delete": false,
      "arguments": {}
    }'
    
    # Bind failed queue to DLX
    api_call POST "/bindings/$VHOST/e/mytaptrack.dlx/q/$queue_name.failed" '{
      "routing_key": "'"$queue_name"'.failed",
      "arguments": {}
    }'
  done
done

# Create monitoring and health check queue
echo "Creating monitoring queue..."
api_call PUT "/queues/$VHOST/system.health" '{
  "durable": false,
  "auto_delete": true,
  "arguments": {
    "x-message-ttl": 60000
  }
}'

api_call POST "/bindings/$VHOST/e/mytaptrack.events/q/system.health" '{
  "routing_key": "system.health",
  "arguments": {}
}'

# Set up policies for high availability and performance
echo "Setting up policies..."

# HA policy for all queues
api_call PUT "/policies/$VHOST/ha-all" '{
  "pattern": ".*",
  "definition": {
    "ha-mode": "all",
    "ha-sync-mode": "automatic",
    "ha-sync-batch-size": 1
  },
  "priority": 0,
  "apply-to": "queues"
}'

# TTL policy for temporary queues
api_call PUT "/policies/$VHOST/temp-ttl" '{
  "pattern": "^temp\\.",
  "definition": {
    "message-ttl": 300000,
    "expires": 600000
  },
  "priority": 1,
  "apply-to": "queues"
}'

# Max length policy for failed queues to prevent unbounded growth
api_call PUT "/policies/$VHOST/failed-max-length" '{
  "pattern": "\\.failed$",
  "definition": {
    "max-length": 10000,
    "overflow": "reject-publish"
  },
  "priority": 2,
  "apply-to": "queues"
}'

echo "RabbitMQ initialization completed successfully!"
echo "Created exchanges: mytaptrack.events, mytaptrack.dlx, mytaptrack.retry"
echo "Created queues for event types: ${EVENT_TYPES[*]}"
echo "Set up retry mechanisms and dead letter queues"
echo "Applied high availability and performance policies"