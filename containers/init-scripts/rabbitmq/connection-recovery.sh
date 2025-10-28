#!/bin/bash

# RabbitMQ Connection Recovery Script
# Handles connection recovery, failover, and reconnection logic

set -e

# Configuration
RABBITMQ_HOST=${RABBITMQ_HOST:-localhost}
RABBITMQ_PORT=${RABBITMQ_PORT:-15672}
RABBITMQ_USER=${RABBITMQ_DEFAULT_USER:-admin}
RABBITMQ_PASS=${RABBITMQ_DEFAULT_PASS:-password}
VHOST=${RABBITMQ_VHOST:-mytaptrack}
MAX_RETRIES=${MAX_RETRIES:-10}
RETRY_DELAY=${RETRY_DELAY:-5}
HEALTH_CHECK_INTERVAL=${HEALTH_CHECK_INTERVAL:-30}

# Logging
LOG_FILE="/var/log/rabbitmq-recovery.log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check RabbitMQ health
check_rabbitmq_health() {
  local host=$1
  local port=$2
  local user=$3
  local pass=$4
  
  curl -s -f -u "$user:$pass" "http://$host:$port/api/overview" > /dev/null 2>&1
  return $?
}

# Function to check specific vhost health
check_vhost_health() {
  local host=$1
  local port=$2
  local user=$3
  local pass=$4
  local vhost=$5
  
  curl -s -f -u "$user:$pass" "http://$host:$port/api/vhosts/$vhost" > /dev/null 2>&1
  return $?
}

# Function to check queue health
check_queue_health() {
  local host=$1
  local port=$2
  local user=$3
  local pass=$4
  local vhost=$5
  local queue=$6
  
  local queue_info
  queue_info=$(curl -s -u "$user:$pass" "http://$host:$port/api/queues/$vhost/$queue" 2>/dev/null)
  
  if [ $? -ne 0 ]; then
    return 1
  fi
  
  # Check if queue is in a healthy state
  local state
  state=$(echo "$queue_info" | jq -r '.state // "unknown"' 2>/dev/null)
  
  if [ "$state" = "running" ] || [ "$state" = "idle" ]; then
    return 0
  else
    return 1
  fi
}

# Function to restart stuck consumers
restart_stuck_consumers() {
  local host=$1
  local port=$2
  local user=$3
  local pass=$4
  local vhost=$5
  
  log "Checking for stuck consumers..."
  
  # Get all connections
  local connections
  connections=$(curl -s -u "$user:$pass" "http://$host:$port/api/connections" 2>/dev/null)
  
  if [ $? -ne 0 ]; then
    log "ERROR: Cannot retrieve connection information"
    return 1
  fi
  
  # Check for blocked or stuck connections
  local blocked_connections
  blocked_connections=$(echo "$connections" | jq -r '.[] | select(.state != "running") | .name' 2>/dev/null)
  
  if [ -n "$blocked_connections" ]; then
    log "Found blocked connections, attempting to close them..."
    
    while IFS= read -r connection_name; do
      if [ -n "$connection_name" ]; then
        log "Closing blocked connection: $connection_name"
        curl -s -X DELETE -u "$user:$pass" "http://$host:$port/api/connections/$connection_name" > /dev/null 2>&1
      fi
    done <<< "$blocked_connections"
  fi
}

# Function to clear problematic queues
clear_problematic_queues() {
  local host=$1
  local port=$2
  local user=$3
  local pass=$4
  local vhost=$5
  
  log "Checking for problematic queues..."
  
  # Get all queues
  local queues
  queues=$(curl -s -u "$user:$pass" "http://$host:$port/api/queues/$vhost" 2>/dev/null)
  
  if [ $? -ne 0 ]; then
    log "ERROR: Cannot retrieve queue information"
    return 1
  fi
  
  # Check for queues with excessive message buildup
  local problematic_queues
  problematic_queues=$(echo "$queues" | jq -r '.[] | select(.messages > 10000) | .name' 2>/dev/null)
  
  if [ -n "$problematic_queues" ]; then
    log "Found queues with excessive messages, considering purge..."
    
    while IFS= read -r queue_name; do
      if [ -n "$queue_name" ]; then
        local message_count
        message_count=$(echo "$queues" | jq -r ".[] | select(.name == \"$queue_name\") | .messages" 2>/dev/null)
        
        log "Queue $queue_name has $message_count messages"
        
        # Only purge non-critical queues or failed queues
        if [[ "$queue_name" == *.failed ]] || [[ "$queue_name" == *.retry ]]; then
          log "Purging problematic queue: $queue_name"
          curl -s -X DELETE -u "$user:$pass" "http://$host:$port/api/queues/$vhost/$queue_name/contents" > /dev/null 2>&1
        else
          log "WARNING: Critical queue $queue_name has high message count but will not be purged"
        fi
      fi
    done <<< "$problematic_queues"
  fi
}

# Function to recreate missing critical infrastructure
recreate_missing_infrastructure() {
  local host=$1
  local port=$2
  local user=$3
  local pass=$4
  local vhost=$5
  
  log "Checking for missing critical infrastructure..."
  
  # Check critical exchanges
  local critical_exchanges=("mytaptrack.events" "mytaptrack.dlx" "mytaptrack.retry")
  
  for exchange in "${critical_exchanges[@]}"; do
    if ! curl -s -f -u "$user:$pass" "http://$host:$port/api/exchanges/$vhost/$exchange" > /dev/null 2>&1; then
      log "ERROR: Critical exchange $exchange is missing"
      log "Attempting to recreate infrastructure..."
      
      # Run initialization script
      if [ -f "/etc/rabbitmq/init-rabbitmq.sh" ]; then
        bash /etc/rabbitmq/init-rabbitmq.sh
      else
        log "ERROR: Initialization script not found"
        return 1
      fi
      break
    fi
  done
  
  # Check critical queues
  local critical_queues=("user.events" "student.events" "license.events" "report.events" "app.events" "device.events")
  
  for queue in "${critical_queues[@]}"; do
    if ! check_queue_health "$host" "$port" "$user" "$pass" "$vhost" "$queue"; then
      log "ERROR: Critical queue $queue is missing or unhealthy"
      log "Attempting to recreate infrastructure..."
      
      # Run initialization script
      if [ -f "/etc/rabbitmq/init-rabbitmq.sh" ]; then
        bash /etc/rabbitmq/init-rabbitmq.sh
      else
        log "ERROR: Initialization script not found"
        return 1
      fi
      break
    fi
  done
}

# Function to perform connection recovery
perform_recovery() {
  local attempt=$1
  
  log "Starting recovery attempt $attempt/$MAX_RETRIES..."
  
  # Step 1: Check basic connectivity
  if ! check_rabbitmq_health "$RABBITMQ_HOST" "$RABBITMQ_PORT" "$RABBITMQ_USER" "$RABBITMQ_PASS"; then
    log "ERROR: RabbitMQ is not accessible"
    return 1
  fi
  
  # Step 2: Check vhost health
  if ! check_vhost_health "$RABBITMQ_HOST" "$RABBITMQ_PORT" "$RABBITMQ_USER" "$RABBITMQ_PASS" "$VHOST"; then
    log "ERROR: VHost $VHOST is not accessible"
    return 1
  fi
  
  # Step 3: Restart stuck consumers
  restart_stuck_consumers "$RABBITMQ_HOST" "$RABBITMQ_PORT" "$RABBITMQ_USER" "$RABBITMQ_PASS" "$VHOST"
  
  # Step 4: Clear problematic queues
  clear_problematic_queues "$RABBITMQ_HOST" "$RABBITMQ_PORT" "$RABBITMQ_USER" "$RABBITMQ_PASS" "$VHOST"
  
  # Step 5: Recreate missing infrastructure
  recreate_missing_infrastructure "$RABBITMQ_HOST" "$RABBITMQ_PORT" "$RABBITMQ_USER" "$RABBITMQ_PASS" "$VHOST"
  
  # Step 6: Final health check
  if check_rabbitmq_health "$RABBITMQ_HOST" "$RABBITMQ_PORT" "$RABBITMQ_USER" "$RABBITMQ_PASS"; then
    log "Recovery attempt $attempt completed successfully"
    return 0
  else
    log "Recovery attempt $attempt failed"
    return 1
  fi
}

# Main recovery loop
main() {
  log "Starting RabbitMQ connection recovery service..."
  log "Configuration: Host=$RABBITMQ_HOST, Port=$RABBITMQ_PORT, VHost=$VHOST"
  log "Max retries: $MAX_RETRIES, Retry delay: ${RETRY_DELAY}s, Health check interval: ${HEALTH_CHECK_INTERVAL}s"
  
  local consecutive_failures=0
  
  while true; do
    if check_rabbitmq_health "$RABBITMQ_HOST" "$RABBITMQ_PORT" "$RABBITMQ_USER" "$RABBITMQ_PASS"; then
      if [ $consecutive_failures -gt 0 ]; then
        log "RabbitMQ is healthy again after $consecutive_failures failures"
        consecutive_failures=0
      fi
    else
      consecutive_failures=$((consecutive_failures + 1))
      log "RabbitMQ health check failed (failure #$consecutive_failures)"
      
      if [ $consecutive_failures -ge 3 ]; then
        log "Multiple consecutive failures detected, starting recovery process..."
        
        local recovery_attempt=1
        local recovery_successful=false
        
        while [ $recovery_attempt -le $MAX_RETRIES ]; do
          if perform_recovery $recovery_attempt; then
            recovery_successful=true
            consecutive_failures=0
            break
          fi
          
          recovery_attempt=$((recovery_attempt + 1))
          
          if [ $recovery_attempt -le $MAX_RETRIES ]; then
            log "Recovery attempt failed, waiting ${RETRY_DELAY}s before retry..."
            sleep $RETRY_DELAY
          fi
        done
        
        if [ "$recovery_successful" = false ]; then
          log "ERROR: All recovery attempts failed. Manual intervention may be required."
          # Send alert or notification here
          sleep $((RETRY_DELAY * 5))  # Wait longer before trying again
        fi
      fi
    fi
    
    sleep $HEALTH_CHECK_INTERVAL
  done
}

# Handle signals for graceful shutdown
trap 'log "Received shutdown signal, exiting..."; exit 0' SIGTERM SIGINT

# Check if running as daemon or one-shot
if [ "$1" = "--daemon" ]; then
  main
elif [ "$1" = "--recover" ]; then
  log "Running one-shot recovery..."
  perform_recovery 1
else
  echo "Usage: $0 [--daemon|--recover]"
  echo "  --daemon: Run as continuous monitoring daemon"
  echo "  --recover: Perform one-shot recovery attempt"
  exit 1
fi