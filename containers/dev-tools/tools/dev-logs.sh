#!/bin/bash

# MyTapTrack Development Logs Viewer

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

# Show available services
show_services() {
    echo "Available services:"
    echo "  all              - All services"
    echo "  graphql-api      - GraphQL API service"
    echo "  rest-api         - REST API service"
    echo "  device-api       - Device API service"
    echo "  data-processor   - Data processor service"
    echo "  mongodb          - MongoDB database"
    echo "  rabbitmq         - RabbitMQ message broker"
    echo "  redis            - Redis cache"
    echo "  nginx-proxy      - Nginx reverse proxy"
    echo "  mongo-express    - MongoDB web interface"
    echo "  redis-commander  - Redis web interface"
    echo "  grafana          - Grafana dashboard"
    echo "  loki             - Loki log aggregator"
    echo "  promtail         - Promtail log collector"
}

# Show logs for specific service
show_service_logs() {
    local service=$1
    local follow=$2
    local lines=$3
    local filter=$4
    
    if [[ "$service" == "all" ]]; then
        print_status "Showing logs for all services..."
        if [[ "$follow" == true ]]; then
            docker-compose -f docker-compose.dev.yml logs -f --tail="$lines"
        else
            docker-compose -f docker-compose.dev.yml logs --tail="$lines"
        fi
    else
        print_status "Showing logs for $service..."
        if [[ "$follow" == true ]]; then
            if [[ -n "$filter" ]]; then
                docker-compose -f docker-compose.dev.yml logs -f --tail="$lines" "$service" | grep -i "$filter"
            else
                docker-compose -f docker-compose.dev.yml logs -f --tail="$lines" "$service"
            fi
        else
            if [[ -n "$filter" ]]; then
                docker-compose -f docker-compose.dev.yml logs --tail="$lines" "$service" | grep -i "$filter"
            else
                docker-compose -f docker-compose.dev.yml logs --tail="$lines" "$service"
            fi
        fi
    fi
}

# Show structured logs with jq formatting
show_structured_logs() {
    local service=$1
    local follow=$2
    local lines=$3
    local level_filter=$4
    
    print_status "Showing structured logs for $service (level: ${level_filter:-all})..."
    
    if [[ "$follow" == true ]]; then
        if [[ -n "$level_filter" ]]; then
            docker-compose -f docker-compose.dev.yml logs -f --tail="$lines" "$service" 2>/dev/null | \
                grep -E '^\{.*\}$' | \
                jq -r --arg level "$level_filter" 'select(.level == $level or $level == "all") | "\(.timestamp // .time // now | strftime("%Y-%m-%d %H:%M:%S")) [\(.level | ascii_upcase)] \(.service // "unknown"): \(.message)"'
        else
            docker-compose -f docker-compose.dev.yml logs -f --tail="$lines" "$service" 2>/dev/null | \
                grep -E '^\{.*\}$' | \
                jq -r '"\(.timestamp // .time // now | strftime("%Y-%m-%d %H:%M:%S")) [\(.level | ascii_upcase)] \(.service // "unknown"): \(.message)"'
        fi
    else
        if [[ -n "$level_filter" ]]; then
            docker-compose -f docker-compose.dev.yml logs --tail="$lines" "$service" 2>/dev/null | \
                grep -E '^\{.*\}$' | \
                jq -r --arg level "$level_filter" 'select(.level == $level or $level == "all") | "\(.timestamp // .time // now | strftime("%Y-%m-%d %H:%M:%S")) [\(.level | ascii_upcase)] \(.service // "unknown"): \(.message)"'
        else
            docker-compose -f docker-compose.dev.yml logs --tail="$lines" "$service" 2>/dev/null | \
                grep -E '^\{.*\}$' | \
                jq -r '"\(.timestamp // .time // now | strftime("%Y-%m-%d %H:%M:%S")) [\(.level | ascii_upcase)] \(.service // "unknown"): \(.message)"'
        fi
    fi
}

# Show error logs only
show_error_logs() {
    local service=$1
    local lines=$2
    
    print_status "Showing error logs for $service..."
    
    if [[ "$service" == "all" ]]; then
        docker-compose -f docker-compose.dev.yml logs --tail="$lines" | grep -i -E "(error|exception|fail|fatal)"
    else
        docker-compose -f docker-compose.dev.yml logs --tail="$lines" "$service" | grep -i -E "(error|exception|fail|fatal)"
    fi
}

# Show performance logs
show_performance_logs() {
    local service=$1
    local lines=$2
    
    print_status "Showing performance logs for $service..."
    
    if [[ "$service" == "all" ]]; then
        docker-compose -f docker-compose.dev.yml logs --tail="$lines" | grep -i -E "(slow|timeout|performance|latency|duration)"
    else
        docker-compose -f docker-compose.dev.yml logs --tail="$lines" "$service" | grep -i -E "(slow|timeout|performance|latency|duration)"
    fi
}

# Show usage
show_usage() {
    echo "MyTapTrack Development Logs Viewer"
    echo ""
    echo "Usage: $0 [service] [options]"
    echo ""
    echo "Services:"
    show_services
    echo ""
    echo "Options:"
    echo "  -f, --follow        Follow log output (like tail -f)"
    echo "  -n, --lines <num>   Number of lines to show (default: 100)"
    echo "  --filter <text>     Filter logs containing text"
    echo "  --level <level>     Filter by log level (debug, info, warn, error)"
    echo "  --structured        Parse and format JSON logs"
    echo "  --errors            Show only error logs"
    echo "  --performance       Show only performance-related logs"
    echo "  --help, -h          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 graphql-api -f              # Follow GraphQL API logs"
    echo "  $0 all --errors                # Show all error logs"
    echo "  $0 rest-api --level error      # Show REST API error level logs"
    echo "  $0 mongodb --filter \"slow\"     # Show MongoDB logs containing 'slow'"
    echo "  $0 all --structured --level info # Show structured info logs from all services"
}

# Main execution
main() {
    local service=""
    local follow=false
    local lines=100
    local filter=""
    local level_filter=""
    local structured=false
    local errors_only=false
    local performance_only=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--follow)
                follow=true
                shift
                ;;
            -n|--lines)
                lines="$2"
                shift 2
                ;;
            --filter)
                filter="$2"
                shift 2
                ;;
            --level)
                level_filter="$2"
                shift 2
                ;;
            --structured)
                structured=true
                shift
                ;;
            --errors)
                errors_only=true
                shift
                ;;
            --performance)
                performance_only=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            -*)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
            *)
                if [[ -z "$service" ]]; then
                    service="$1"
                else
                    print_error "Multiple services specified: $service and $1"
                    show_usage
                    exit 1
                fi
                shift
                ;;
        esac
    done
    
    # Default to all services if none specified
    if [[ -z "$service" ]]; then
        service="all"
    fi
    
    # Validate service name
    valid_services=("all" "graphql-api" "rest-api" "device-api" "data-processor" "mongodb" "rabbitmq" "redis" "nginx-proxy" "mongo-express" "redis-commander" "grafana" "loki" "promtail")
    if [[ ! " ${valid_services[@]} " =~ " ${service} " ]]; then
        print_error "Invalid service: $service"
        echo ""
        show_services
        exit 1
    fi
    
    # Check if jq is available for structured logs
    if [[ "$structured" == true ]] && ! command -v jq &> /dev/null; then
        print_warning "jq not found, falling back to regular logs"
        structured=false
    fi
    
    # Show appropriate logs
    if [[ "$errors_only" == true ]]; then
        show_error_logs "$service" "$lines"
    elif [[ "$performance_only" == true ]]; then
        show_performance_logs "$service" "$lines"
    elif [[ "$structured" == true ]]; then
        show_structured_logs "$service" "$follow" "$lines" "$level_filter"
    else
        show_service_logs "$service" "$follow" "$lines" "$filter"
    fi
}

main "$@"