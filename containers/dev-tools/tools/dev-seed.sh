#!/bin/bash

# MyTapTrack Development Data Seeding Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINERS_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
cd "$CONTAINERS_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Seed database with test data
seed_database() {
    local environment=$1
    local users=$2
    local students=$3
    local devices=$4
    local days=$5
    local clear_existing=$6
    
    print_status "Seeding database with test data..."
    print_status "Environment: $environment, Users: $users, Students: $students, Devices: $devices, Days: $days"
    
    local clear_flag=""
    if [[ "$clear_existing" == true ]]; then
        clear_flag="--clear"
    fi
    
    docker-compose -f docker-compose.dev.yml run --rm dev-tools \
        node scripts/seed-test-data.js \
        --environment "$environment" \
        --users "$users" \
        --students "$students" \
        --devices "$devices" \
        --days "$days" \
        $clear_flag
    
    print_success "Database seeding completed"
}

# Seed RabbitMQ with test messages
seed_rabbitmq() {
    local message_count=$1
    
    print_status "Seeding RabbitMQ with $message_count test messages..."
    
    # Create test messages for different event types
    local events=(
        "user.created"
        "user.updated"
        "student.created"
        "student.updated"
        "device.connected"
        "device.disconnected"
        "device.battery_low"
        "data.received"
        "report.generated"
        "alert.triggered"
    )
    
    for ((i=1; i<=message_count; i++)); do
        local event_type=${events[$((RANDOM % ${#events[@]}))]}
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
        local correlation_id=$(uuidgen)
        
        # Create sample payload based on event type
        local payload=""
        case $event_type in
            "user.created"|"user.updated")
                payload="{\"userId\":\"user$(printf "%03d" $((RANDOM % 100 + 1)))\",\"email\":\"user$i@example.com\",\"action\":\"${event_type#*.}\"}"
                ;;
            "student.created"|"student.updated")
                payload="{\"studentId\":\"student$(printf "%03d" $((RANDOM % 200 + 1)))\",\"grade\":\"$((RANDOM % 12 + 1))\",\"action\":\"${event_type#*.}\"}"
                ;;
            "device.connected"|"device.disconnected")
                payload="{\"deviceId\":\"device$(printf "%03d" $((RANDOM % 150 + 1)))\",\"status\":\"${event_type#*.}\",\"batteryLevel\":$((RANDOM % 100 + 1))}"
                ;;
            "device.battery_low")
                payload="{\"deviceId\":\"device$(printf "%03d" $((RANDOM % 150 + 1)))\",\"batteryLevel\":$((RANDOM % 20 + 1)),\"threshold\":20}"
                ;;
            "data.received")
                payload="{\"deviceId\":\"device$(printf "%03d" $((RANDOM % 150 + 1)))\",\"dataType\":\"telemetry\",\"recordCount\":$((RANDOM % 100 + 1))}"
                ;;
            "report.generated")
                payload="{\"reportId\":\"report_$i\",\"type\":\"daily\",\"studentCount\":$((RANDOM % 50 + 1))}"
                ;;
            "alert.triggered")
                payload="{\"alertId\":\"alert_$i\",\"type\":\"battery_low\",\"severity\":\"medium\",\"deviceId\":\"device$(printf "%03d" $((RANDOM % 150 + 1)))\"}"
                ;;
        esac
        
        # Publish message to RabbitMQ
        docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqadmin publish \
            exchange=mytaptrack.events \
            routing_key="${event_type//./_}" \
            payload="$payload" \
            properties="{\"correlation_id\":\"$correlation_id\",\"timestamp\":\"$timestamp\",\"content_type\":\"application/json\"}" \
            >/dev/null 2>&1
        
        if [[ $((i % 10)) -eq 0 ]]; then
            print_status "Published $i/$message_count messages..."
        fi
    done
    
    print_success "RabbitMQ seeding completed ($message_count messages published)"
}

# Seed Redis with test cache data
seed_redis() {
    local cache_entries=$1
    
    print_status "Seeding Redis with $cache_entries cache entries..."
    
    # Create various types of cache entries
    for ((i=1; i<=cache_entries; i++)); do
        local key_type=$((RANDOM % 4))
        local ttl=$((RANDOM % 3600 + 300)) # 5 minutes to 1 hour
        
        case $key_type in
            0) # User session
                local user_id="user$(printf "%03d" $((RANDOM % 100 + 1)))"
                local session_data="{\"userId\":\"$user_id\",\"loginTime\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\",\"permissions\":[\"read\",\"write\"]}"
                docker-compose -f docker-compose.dev.yml exec -T redis redis-cli SETEX "session:$user_id" $ttl "$session_data" >/dev/null
                ;;
            1) # API rate limit
                local api_key="api_key_$i"
                local rate_limit=$((RANDOM % 100 + 1))
                docker-compose -f docker-compose.dev.yml exec -T redis redis-cli SETEX "rate_limit:$api_key" $ttl "$rate_limit" >/dev/null
                ;;
            2) # Query cache
                local query_hash=$(echo "query_$i" | md5sum | cut -d' ' -f1)
                local query_result="{\"results\":[{\"id\":$i,\"name\":\"Test Result $i\"}],\"count\":1,\"cached\":true}"
                docker-compose -f docker-compose.dev.yml exec -T redis redis-cli SETEX "query:$query_hash" $ttl "$query_result" >/dev/null
                ;;
            3) # Device status
                local device_id="device$(printf "%03d" $((RANDOM % 150 + 1)))"
                local device_status="{\"deviceId\":\"$device_id\",\"status\":\"online\",\"lastSeen\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\",\"batteryLevel\":$((RANDOM % 100 + 1))}"
                docker-compose -f docker-compose.dev.yml exec -T redis redis-cli SETEX "device:status:$device_id" $ttl "$device_status" >/dev/null
                ;;
        esac
        
        if [[ $((i % 20)) -eq 0 ]]; then
            print_status "Created $i/$cache_entries cache entries..."
        fi
    done
    
    print_success "Redis seeding completed ($cache_entries cache entries created)"
}

# Generate realistic test scenarios
generate_scenarios() {
    print_status "Generating realistic test scenarios..."
    
    # Scenario 1: School day simulation
    print_status "Simulating school day events..."
    
    # Morning login events
    for hour in {7..8}; do
        for minute in {0..59..15}; do
            local timestamp=$(date -d "today $hour:$minute" -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
            local user_id="user$(printf "%03d" $((RANDOM % 20 + 1)))"
            local payload="{\"userId\":\"$user_id\",\"loginTime\":\"$timestamp\",\"location\":\"school\"}"
            
            docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqadmin publish \
                exchange=mytaptrack.events \
                routing_key="user_login" \
                payload="$payload" \
                >/dev/null 2>&1
        done
    done
    
    # Device connection events
    for i in {1..50}; do
        local device_id="device$(printf "%03d" $i)"
        local timestamp=$(date -d "today 8:$((RANDOM % 60))" -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
        local payload="{\"deviceId\":\"$device_id\",\"status\":\"connected\",\"batteryLevel\":$((RANDOM % 40 + 60))}"
        
        docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqadmin publish \
            exchange=mytaptrack.events \
            routing_key="device_connected" \
            payload="$payload" \
            >/dev/null 2>&1
    done
    
    # Lunch time activity spike
    for minute in {0..59..5}; do
        local timestamp=$(date -d "today 12:$minute" -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
        local student_id="student$(printf "%03d" $((RANDOM % 100 + 1)))"
        local payload="{\"studentId\":\"$student_id\",\"activityLevel\":$((RANDOM % 50 + 50)),\"location\":\"cafeteria\"}"
        
        docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqadmin publish \
            exchange=mytaptrack.events \
            routing_key="student_activity" \
            payload="$payload" \
            >/dev/null 2>&1
    done
    
    print_success "Test scenarios generated"
}

# Show seeding summary
show_summary() {
    print_status "Seeding Summary:"
    
    # Database summary
    echo "📊 Database:"
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --quiet --eval "
        var users = db.primary.countDocuments({pk: /^U#/});
        var students = db.primary.countDocuments({pk: /^S#/});
        var devices = db.primary.countDocuments({pk: /^D#/});
        var timeseries = db.data.countDocuments();
        print('  Users: ' + users);
        print('  Students: ' + students);
        print('  Devices: ' + devices);
        print('  Time-series records: ' + timeseries);
    "
    
    # RabbitMQ summary
    echo ""
    echo "🐰 RabbitMQ:"
    local queue_stats=$(docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_queues name messages 2>/dev/null | tail -n +2)
    if [[ -n "$queue_stats" ]]; then
        echo "$queue_stats" | while read -r queue messages; do
            if [[ -n "$queue" && "$queue" != "name" ]]; then
                echo "  $queue: $messages messages"
            fi
        done
    else
        echo "  No queues with messages"
    fi
    
    # Redis summary
    echo ""
    echo "🔴 Redis:"
    local redis_info=$(docker-compose -f docker-compose.dev.yml exec -T redis redis-cli INFO keyspace 2>/dev/null)
    if [[ -n "$redis_info" ]]; then
        echo "$redis_info" | grep "^db0:" | sed 's/db0:/  Database 0: /'
    else
        echo "  No keys in database"
    fi
}

# Show usage
show_usage() {
    echo "MyTapTrack Development Data Seeding Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --environment <env>     Environment (development|testing|staging) (default: development)"
    echo "  --users <count>         Number of users to create (default: 15)"
    echo "  --students <count>      Number of students to create (default: 50)"
    echo "  --devices <count>       Number of devices to create (default: 40)"
    echo "  --days <count>          Days of time-series data (default: 14)"
    echo "  --messages <count>      Number of RabbitMQ test messages (default: 100)"
    echo "  --cache-entries <count> Number of Redis cache entries (default: 50)"
    echo "  --clear                 Clear existing data before seeding"
    echo "  --db-only              Seed database only"
    echo "  --rabbitmq-only        Seed RabbitMQ only"
    echo "  --redis-only           Seed Redis only"
    echo "  --scenarios            Generate realistic test scenarios"
    echo "  --summary              Show seeding summary after completion"
    echo "  --help, -h             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Seed with default values"
    echo "  $0 --users 25 --students 100         # Seed with custom counts"
    echo "  $0 --clear --scenarios --summary     # Full reset with scenarios"
    echo "  $0 --rabbitmq-only --messages 500    # Seed RabbitMQ only"
}

# Main execution
main() {
    local environment="development"
    local users=15
    local students=50
    local devices=40
    local days=14
    local messages=100
    local cache_entries=50
    local clear_existing=false
    local db_only=false
    local rabbitmq_only=false
    local redis_only=false
    local scenarios=false
    local summary=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment)
                environment="$2"
                shift 2
                ;;
            --users)
                users="$2"
                shift 2
                ;;
            --students)
                students="$2"
                shift 2
                ;;
            --devices)
                devices="$2"
                shift 2
                ;;
            --days)
                days="$2"
                shift 2
                ;;
            --messages)
                messages="$2"
                shift 2
                ;;
            --cache-entries)
                cache_entries="$2"
                shift 2
                ;;
            --clear)
                clear_existing=true
                shift
                ;;
            --db-only)
                db_only=true
                shift
                ;;
            --rabbitmq-only)
                rabbitmq_only=true
                shift
                ;;
            --redis-only)
                redis_only=true
                shift
                ;;
            --scenarios)
                scenarios=true
                shift
                ;;
            --summary)
                summary=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    print_status "Starting development data seeding..."
    
    # Check if services are running
    if ! docker-compose -f docker-compose.dev.yml ps | grep -q "Up"; then
        print_error "Development services are not running. Please start them first with:"
        print_error "  ./dev-tools/tools/dev-start.sh"
        exit 1
    fi
    
    # Execute seeding based on options
    if [[ "$db_only" == true ]]; then
        seed_database "$environment" "$users" "$students" "$devices" "$days" "$clear_existing"
    elif [[ "$rabbitmq_only" == true ]]; then
        seed_rabbitmq "$messages"
    elif [[ "$redis_only" == true ]]; then
        seed_redis "$cache_entries"
    else
        # Seed everything
        seed_database "$environment" "$users" "$students" "$devices" "$days" "$clear_existing"
        seed_rabbitmq "$messages"
        seed_redis "$cache_entries"
    fi
    
    # Generate scenarios if requested
    if [[ "$scenarios" == true ]]; then
        generate_scenarios
    fi
    
    # Show summary if requested
    if [[ "$summary" == true ]]; then
        echo ""
        show_summary
    fi
    
    print_success "Development data seeding completed"
}

main "$@"