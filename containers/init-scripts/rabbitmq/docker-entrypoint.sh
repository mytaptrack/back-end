#!/bin/bash

# Docker entrypoint script for RabbitMQ with MyTapTrack configuration
# This script runs initialization and monitoring setup after RabbitMQ starts

set -e

# Configuration
RABBITMQ_HOST=${RABBITMQ_HOST:-localhost}
RABBITMQ_PORT=${RABBITMQ_PORT:-15672}
RABBITMQ_USER=${RABBITMQ_DEFAULT_USER:-admin}
RABBITMQ_PASS=${RABBITMQ_DEFAULT_PASS:-password}
ENVIRONMENT=${ENVIRONMENT:-production}

echo "Starting RabbitMQ with MyTapTrack configuration..."
echo "Environment: $ENVIRONMENT"

# Start RabbitMQ in the background
rabbitmq-server &
RABBITMQ_PID=$!

# Function to cleanup on exit
cleanup() {
  echo "Shutting down RabbitMQ..."
  kill $RABBITMQ_PID 2>/dev/null || true
  wait $RABBITMQ_PID 2>/dev/null || true
}

trap cleanup SIGTERM SIGINT

# Wait for RabbitMQ to be ready
echo "Waiting for RabbitMQ to start..."
timeout=60
counter=0

while ! rabbitmqctl status > /dev/null 2>&1; do
  if [ $counter -ge $timeout ]; then
    echo "ERROR: RabbitMQ failed to start within $timeout seconds"
    exit 1
  fi
  
  echo "RabbitMQ not ready yet, waiting... ($counter/$timeout)"
  sleep 1
  counter=$((counter + 1))
done

echo "RabbitMQ is running, starting initialization..."

# Enable management plugin
rabbitmq-plugins enable rabbitmq_management
rabbitmq-plugins enable rabbitmq_shovel
rabbitmq-plugins enable rabbitmq_shovel_management
rabbitmq-plugins enable rabbitmq_federation
rabbitmq-plugins enable rabbitmq_federation_management

# Wait for management API to be ready
echo "Waiting for management API..."
timeout=30
counter=0

while ! curl -f -u "$RABBITMQ_USER:$RABBITMQ_PASS" "http://localhost:15672/api/overview" > /dev/null 2>&1; do
  if [ $counter -ge $timeout ]; then
    echo "ERROR: Management API failed to start within $timeout seconds"
    exit 1
  fi
  
  echo "Management API not ready yet, waiting... ($counter/$timeout)"
  sleep 1
  counter=$((counter + 1))
done

echo "Management API is ready, running initialization scripts..."

# Run initialization script
if [ -f "/etc/rabbitmq/init-rabbitmq.sh" ]; then
  echo "Running RabbitMQ initialization..."
  bash /etc/rabbitmq/init-rabbitmq.sh
else
  echo "WARNING: Initialization script not found, using definitions file only"
fi

# Run monitoring setup
if [ -f "/etc/rabbitmq/monitoring-setup.sh" ]; then
  echo "Setting up monitoring..."
  bash /etc/rabbitmq/monitoring-setup.sh
else
  echo "WARNING: Monitoring setup script not found"
fi

# Start connection recovery service in background
if [ -f "/etc/rabbitmq/connection-recovery.sh" ]; then
  echo "Starting connection recovery service..."
  bash /etc/rabbitmq/connection-recovery.sh --daemon &
  RECOVERY_PID=$!
  
  # Update cleanup function to include recovery service
  cleanup() {
    echo "Shutting down services..."
    kill $RECOVERY_PID 2>/dev/null || true
    kill $RABBITMQ_PID 2>/dev/null || true
    wait $RECOVERY_PID 2>/dev/null || true
    wait $RABBITMQ_PID 2>/dev/null || true
  }
  
  trap cleanup SIGTERM SIGINT
else
  echo "WARNING: Connection recovery script not found"
fi

echo "RabbitMQ initialization completed successfully!"
echo "Management UI available at: http://localhost:15672"
echo "Username: $RABBITMQ_USER"

# Keep the container running
wait $RABBITMQ_PID