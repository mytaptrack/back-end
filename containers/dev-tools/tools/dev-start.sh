#!/bin/bash

# MyTapTrack Development Environment Startup Script

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

# Check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Setup environment files
setup_env() {
    if [[ ! -f ".env.dev" ]]; then
        print_status "Creating .env.dev from template..."
        cp .env.example .env.dev
        print_warning "Please review and update .env.dev with your settings"
    fi
}

# Build development images
build_images() {
    print_status "Building development images..."
    docker-compose -f docker-compose.dev.yml build --parallel
}

# Start infrastructure services first
start_infrastructure() {
    print_status "Starting infrastructure services..."
    docker-compose -f docker-compose.dev.yml up -d mongodb rabbitmq redis loki grafana promtail
    
    print_status "Waiting for infrastructure services to be ready..."
    
    # Wait for MongoDB
    print_status "Waiting for MongoDB..."
    until docker-compose -f docker-compose.dev.yml exec -T mongodb mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
        sleep 2
    done
    
    # Wait for RabbitMQ
    print_status "Waiting for RabbitMQ..."
    until docker-compose -f docker-compose.dev.yml exec -T rabbitmq rabbitmq-diagnostics -q ping >/dev/null 2>&1; do
        sleep 2
    done
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    until docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping >/dev/null 2>&1; do
        sleep 2
    done
    
    print_success "Infrastructure services are ready"
}

# Seed development data
seed_data() {
    print_status "Seeding development data..."
    docker-compose -f docker-compose.dev.yml run --rm dev-tools \
        node scripts/seed-test-data.js \
        --environment development \
        --users 10 \
        --students 25 \
        --devices 20 \
        --days 7 \
        --clear
}

# Start application services
start_services() {
    print_status "Starting application services..."
    docker-compose -f docker-compose.dev.yml up -d graphql-api rest-api device-api data-processor nginx-proxy
    
    print_status "Waiting for application services to be ready..."
    sleep 10
    
    # Check service health
    services=("graphql-api:4500" "rest-api:4501" "device-api:4502")
    for service in "${services[@]}"; do
        name="${service%:*}"
        port="${service#*:}"
        print_status "Checking $name health..."
        until curl -f "http://localhost:$port/health" >/dev/null 2>&1; do
            sleep 2
        done
    done
    
    print_success "Application services are ready"
}

# Show service URLs
show_urls() {
    echo ""
    echo "🚀 MyTapTrack Development Environment is ready!"
    echo ""
    echo "📊 Application Services:"
    echo "  GraphQL API:     http://localhost:4500/graphql"
    echo "  GraphQL Playground: http://localhost:4500/graphql"
    echo "  REST API:        http://localhost:4501/api/v2"
    echo "  Device API:      http://localhost:4502/device"
    echo "  Main App:        http://localhost (via nginx)"
    echo ""
    echo "🔧 Development Tools:"
    echo "  MongoDB Express: http://localhost:8081 (admin/devpassword)"
    echo "  Redis Commander: http://localhost:8082"
    echo "  RabbitMQ Mgmt:   http://localhost:15672 (admin/devpassword)"
    echo "  Grafana Logs:    http://localhost:3001 (admin/devpassword)"
    echo ""
    echo "🐛 Debug Ports:"
    echo "  GraphQL API:     localhost:9229"
    echo "  REST API:        localhost:9230"
    echo "  Device API:      localhost:9231"
    echo "  Data Processor:  localhost:9232"
    echo ""
    echo "📝 Useful Commands:"
    echo "  View logs:       ./dev-tools/tools/dev-logs.sh [service]"
    echo "  Reset data:      ./dev-tools/tools/dev-reset.sh"
    echo "  Stop services:   ./dev-tools/tools/dev-stop.sh"
    echo "  Inspect DB:      ./dev-tools/tools/dev-inspect.sh mongodb"
    echo "  Inspect Queue:   ./dev-tools/tools/dev-inspect.sh rabbitmq"
    echo ""
}

# Main execution
main() {
    local skip_build=false
    local skip_seed=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                skip_build=true
                shift
                ;;
            --skip-seed)
                skip_seed=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [options]"
                echo ""
                echo "Options:"
                echo "  --skip-build    Skip building Docker images"
                echo "  --skip-seed     Skip seeding development data"
                echo "  --help, -h      Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    print_status "Starting MyTapTrack development environment..."
    
    check_docker
    setup_env
    
    if [[ "$skip_build" != true ]]; then
        build_images
    fi
    
    start_infrastructure
    
    if [[ "$skip_seed" != true ]]; then
        seed_data
    fi
    
    start_services
    show_urls
}

main "$@"