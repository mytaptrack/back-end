#!/bin/bash

# MyTapTrack Docker Compose Management Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
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

# Check if Docker and Docker Compose are installed
check_dependencies() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
}

# Show usage information
show_usage() {
    echo "MyTapTrack Docker Compose Management Script"
    echo ""
    echo "Usage: $0 [COMMAND] [ENVIRONMENT] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  start       Start services"
    echo "  stop        Stop services"
    echo "  restart     Restart services"
    echo "  logs        Show logs"
    echo "  status      Show service status"
    echo "  build       Build images"
    echo "  clean       Clean up containers and volumes"
    echo "  backup      Backup databases"
    echo "  restore     Restore databases"
    echo "  shell       Open shell in service container"
    echo ""
    echo "Environments:"
    echo "  dev         Development environment (default)"
    echo "  prod        Production environment"
    echo "  test        Test environment"
    echo ""
    echo "Examples:"
    echo "  $0 start dev                 # Start development environment"
    echo "  $0 start prod                # Start production environment"
    echo "  $0 logs dev graphql-api      # Show GraphQL API logs in dev"
    echo "  $0 shell dev mongodb         # Open MongoDB shell in dev"
    echo "  $0 backup prod               # Backup production databases"
}

# Get Docker Compose files for environment
get_compose_files() {
    local env=$1
    case $env in
        "dev")
            echo "-f docker-compose.dev.yml"
            ;;
        "prod")
            echo "-f docker-compose.yml -f docker-compose.prod.yml"
            ;;
        "test")
            echo "-f docker-compose.test.yml"
            ;;
        *)
            print_error "Unknown environment: $env"
            exit 1
            ;;
    esac
}

# Start services
start_services() {
    local env=$1
    local compose_files=$(get_compose_files $env)
    
    print_status "Starting MyTapTrack $env environment..."
    
    # Check if .env file exists
    if [[ $env == "dev" && ! -f ".env.dev" ]]; then
        print_warning ".env.dev not found, copying from .env.example"
        cp .env.example .env.dev
    elif [[ $env == "prod" && ! -f ".env" ]]; then
        print_warning ".env not found, copying from .env.example"
        cp .env.example .env
        print_warning "Please edit .env with your production settings before starting"
        return 1
    fi
    
    docker-compose $compose_files up -d
    print_success "MyTapTrack $env environment started"
    
    # Show service URLs
    if [[ $env == "dev" ]]; then
        echo ""
        echo "Development services available at:"
        echo "  GraphQL API: http://localhost:4500/graphql"
        echo "  REST API: http://localhost:4501/api/v2"
        echo "  Device API: http://localhost:4502/device"
        echo "  RabbitMQ Management: http://localhost:15672"
        echo "  MongoDB Express: http://localhost:8081"
    elif [[ $env == "prod" ]]; then
        echo ""
        echo "Production services available at:"
        echo "  Main API: http://localhost (or your domain)"
        echo "  RabbitMQ Management: http://localhost:15672"
        echo "  Prometheus: http://localhost:9090"
        echo "  Grafana: http://localhost:3001"
    fi
}

# Stop services
stop_services() {
    local env=$1
    local compose_files=$(get_compose_files $env)
    
    print_status "Stopping MyTapTrack $env environment..."
    docker-compose $compose_files down
    print_success "MyTapTrack $env environment stopped"
}

# Restart services
restart_services() {
    local env=$1
    stop_services $env
    start_services $env
}

# Show logs
show_logs() {
    local env=$1
    local service=$2
    local compose_files=$(get_compose_files $env)
    
    if [[ -n $service ]]; then
        print_status "Showing logs for $service in $env environment..."
        docker-compose $compose_files logs -f $service
    else
        print_status "Showing logs for all services in $env environment..."
        docker-compose $compose_files logs -f
    fi
}

# Show status
show_status() {
    local env=$1
    local compose_files=$(get_compose_files $env)
    
    print_status "Service status for $env environment:"
    docker-compose $compose_files ps
}

# Build images
build_images() {
    local env=$1
    local compose_files=$(get_compose_files $env)
    
    print_status "Building images for $env environment..."
    docker-compose $compose_files build
    print_success "Images built successfully"
}

# Clean up
clean_up() {
    local env=$1
    local compose_files=$(get_compose_files $env)
    
    print_warning "This will remove all containers and volumes for $env environment"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Cleaning up $env environment..."
        docker-compose $compose_files down -v --remove-orphans
        docker system prune -f
        print_success "Cleanup completed"
    else
        print_status "Cleanup cancelled"
    fi
}

# Backup databases
backup_databases() {
    local env=$1
    local compose_files=$(get_compose_files $env)
    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    
    print_status "Creating backup directory: $backup_dir"
    mkdir -p "$backup_dir"
    
    # MongoDB backup
    print_status "Backing up MongoDB..."
    docker-compose $compose_files exec -T mongodb mongodump --archive > "$backup_dir/mongodb.archive"
    
    # Redis backup
    print_status "Backing up Redis..."
    docker-compose $compose_files exec -T redis redis-cli --rdb - > "$backup_dir/redis.rdb"
    
    print_success "Databases backed up to $backup_dir"
}

# Restore databases
restore_databases() {
    local env=$1
    local backup_dir=$2
    local compose_files=$(get_compose_files $env)
    
    if [[ -z $backup_dir ]]; then
        print_error "Please specify backup directory"
        echo "Usage: $0 restore $env /path/to/backup"
        exit 1
    fi
    
    if [[ ! -d $backup_dir ]]; then
        print_error "Backup directory not found: $backup_dir"
        exit 1
    fi
    
    print_warning "This will overwrite existing data in $env environment"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # MongoDB restore
        if [[ -f "$backup_dir/mongodb.archive" ]]; then
            print_status "Restoring MongoDB..."
            docker-compose $compose_files exec -T mongodb mongorestore --archive < "$backup_dir/mongodb.archive"
        fi
        
        # Redis restore
        if [[ -f "$backup_dir/redis.rdb" ]]; then
            print_status "Restoring Redis..."
            docker-compose $compose_files stop redis
            docker-compose $compose_files exec -T redis cp "$backup_dir/redis.rdb" /data/dump.rdb
            docker-compose $compose_files start redis
        fi
        
        print_success "Databases restored from $backup_dir"
    else
        print_status "Restore cancelled"
    fi
}

# Open shell in service container
open_shell() {
    local env=$1
    local service=$2
    local compose_files=$(get_compose_files $env)
    
    if [[ -z $service ]]; then
        print_error "Please specify service name"
        echo "Available services: graphql-api, rest-api, device-api, data-processor, mongodb, rabbitmq, redis"
        exit 1
    fi
    
    print_status "Opening shell in $service container..."
    docker-compose $compose_files exec $service sh
}

# Main script logic
main() {
    check_dependencies
    
    local command=$1
    local env=${2:-dev}
    local arg3=$3
    
    if [[ -z $command ]]; then
        show_usage
        exit 1
    fi
    
    case $command in
        "start")
            start_services $env
            ;;
        "stop")
            stop_services $env
            ;;
        "restart")
            restart_services $env
            ;;
        "logs")
            show_logs $env $arg3
            ;;
        "status")
            show_status $env
            ;;
        "build")
            build_images $env
            ;;
        "clean")
            clean_up $env
            ;;
        "backup")
            backup_databases $env
            ;;
        "restore")
            restore_databases $env $arg3
            ;;
        "shell")
            open_shell $env $arg3
            ;;
        "help"|"-h"|"--help")
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"