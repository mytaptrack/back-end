#!/bin/bash

# MyTapTrack Development Environment Reset Script

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

# Reset database data
reset_database() {
    print_status "Resetting database data..."
    
    # Clear MongoDB collections
    docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh mytaptrack_dev --eval "
        db.primary.deleteMany({});
        db.data.deleteMany({});
        db.migrations.deleteMany({});
        print('Database collections cleared');
    "
    
    # Clear Redis cache
    docker-compose -f docker-compose.dev.yml exec -T redis redis-cli FLUSHALL
    
    print_success "Database data cleared"
}

# Reset message queues
reset_queues() {
    print_status "Resetting message queues..."
    
    # Purge all queues in RabbitMQ
    docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl list_queues name | tail -n +2 | while read queue; do
        if [[ -n "$queue" ]]; then
            docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmqctl purge_queue "$queue"
        fi
    done
    
    print_success "Message queues cleared"
}

# Reseed test data
reseed_data() {
    local environment=${1:-development}
    local users=${2:-10}
    local students=${3:-25}
    local devices=${4:-20}
    local days=${5:-7}
    
    print_status "Reseeding test data..."
    print_status "Environment: $environment, Users: $users, Students: $students, Devices: $devices, Days: $days"
    
    docker-compose -f docker-compose.dev.yml run --rm dev-tools \
        node scripts/seed-test-data.js \
        --environment "$environment" \
        --users "$users" \
        --students "$students" \
        --devices "$devices" \
        --days "$days" \
        --clear
    
    print_success "Test data reseeded"
}

# Restart services
restart_services() {
    print_status "Restarting application services..."
    
    # Restart app services to clear any cached state
    docker-compose -f docker-compose.dev.yml restart graphql-api rest-api device-api data-processor
    
    # Wait for services to be ready
    sleep 5
    
    services=("graphql-api:4500" "rest-api:4501" "device-api:4502")
    for service in "${services[@]}"; do
        name="${service%:*}"
        port="${service#*:}"
        print_status "Checking $name health..."
        until curl -f "http://localhost:$port/health" >/dev/null 2>&1; do
            sleep 2
        done
    done
    
    print_success "Services restarted and ready"
}

# Show usage
show_usage() {
    echo "MyTapTrack Development Environment Reset Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --db-only           Reset database only (no queues or restart)"
    echo "  --queues-only       Reset message queues only"
    echo "  --no-seed           Don't reseed test data"
    echo "  --no-restart        Don't restart services"
    echo "  --environment <env> Environment for test data (default: development)"
    echo "  --users <count>     Number of users to create (default: 10)"
    echo "  --students <count>  Number of students to create (default: 25)"
    echo "  --devices <count>   Number of devices to create (default: 20)"
    echo "  --days <count>      Days of time-series data (default: 7)"
    echo "  --help, -h          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Full reset with default data"
    echo "  $0 --db-only                 # Reset database only"
    echo "  $0 --no-seed                 # Reset but don't add test data"
    echo "  $0 --users 50 --students 200 # Reset with more test data"
}

# Main execution
main() {
    local db_only=false
    local queues_only=false
    local no_seed=false
    local no_restart=false
    local environment="development"
    local users=10
    local students=25
    local devices=20
    local days=7
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --db-only)
                db_only=true
                shift
                ;;
            --queues-only)
                queues_only=true
                shift
                ;;
            --no-seed)
                no_seed=true
                shift
                ;;
            --no-restart)
                no_restart=true
                shift
                ;;
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
    
    print_warning "This will reset the development environment data"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Reset cancelled"
        exit 0
    fi
    
    if [[ "$db_only" == true ]]; then
        reset_database
    elif [[ "$queues_only" == true ]]; then
        reset_queues
    else
        reset_database
        reset_queues
    fi
    
    if [[ "$no_seed" != true ]]; then
        reseed_data "$environment" "$users" "$students" "$devices" "$days"
    fi
    
    if [[ "$no_restart" != true && "$db_only" != true && "$queues_only" != true ]]; then
        restart_services
    fi
    
    print_success "Development environment reset complete"
}

main "$@"