#!/bin/bash

# MyTapTrack Development Environment Manager

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# Show main menu
show_menu() {
    echo ""
    echo "🚀 MyTapTrack Development Environment Manager"
    echo ""
    echo "Available commands:"
    echo "  start       Start the development environment"
    echo "  stop        Stop the development environment"
    echo "  restart     Restart the development environment"
    echo "  reset       Reset data and restart"
    echo "  logs        View service logs"
    echo "  inspect     Inspect databases and queues"
    echo "  seed        Seed test data"
    echo "  status      Show service status"
    echo "  shell       Open service shell"
    echo "  help        Show this help message"
    echo ""
    echo "Quick actions:"
    echo "  dev start                    # Start with default settings"
    echo "  dev logs graphql-api -f      # Follow GraphQL API logs"
    echo "  dev inspect mongodb users    # Inspect user data"
    echo "  dev seed --scenarios         # Seed with realistic scenarios"
    echo "  dev reset --clear            # Full reset with clean data"
    echo ""
}

# Show usage for specific command
show_command_usage() {
    local command=$1
    
    case $command in
        start)
            echo "Usage: dev start [options]"
            echo "  --skip-build    Skip building Docker images"
            echo "  --skip-seed     Skip seeding development data"
            ;;
        stop)
            echo "Usage: dev stop [options]"
            echo "  --keep-data     Keep containers and data"
            echo "  --clean-all     Remove everything"
            ;;
        logs)
            echo "Usage: dev logs [service] [options]"
            echo "  -f, --follow    Follow log output"
            echo "  --errors        Show only errors"
            echo "  --structured    Parse JSON logs"
            ;;
        inspect)
            echo "Usage: dev inspect <service> [command]"
            echo "  mongodb stats   Show database statistics"
            echo "  rabbitmq queues Show message queues"
            echo "  redis info      Show cache information"
            ;;
        seed)
            echo "Usage: dev seed [options]"
            echo "  --users <n>     Number of users"
            echo "  --scenarios     Generate realistic scenarios"
            echo "  --clear         Clear existing data"
            ;;
        reset)
            echo "Usage: dev reset [options]"
            echo "  --clear         Clear all data"
            echo "  --no-seed       Don't reseed data"
            ;;
        *)
            show_menu
            ;;
    esac
}

# Execute command
execute_command() {
    local command=$1
    shift
    
    case $command in
        start)
            "$SCRIPT_DIR/dev-start.sh" "$@"
            ;;
        stop)
            "$SCRIPT_DIR/dev-stop.sh" "$@"
            ;;
        restart)
            "$SCRIPT_DIR/dev-stop.sh" --keep-data
            "$SCRIPT_DIR/dev-start.sh" --skip-build "$@"
            ;;
        reset)
            "$SCRIPT_DIR/dev-reset.sh" "$@"
            ;;
        logs)
            "$SCRIPT_DIR/dev-logs.sh" "$@"
            ;;
        inspect)
            "$SCRIPT_DIR/dev-inspect.sh" "$@"
            ;;
        seed)
            "$SCRIPT_DIR/dev-seed.sh" "$@"
            ;;
        status)
            cd "$(dirname "$(dirname "$SCRIPT_DIR")")"
            docker-compose -f docker-compose.dev.yml ps
            ;;
        shell)
            local service=$1
            if [[ -z "$service" ]]; then
                print_error "Please specify a service name"
                echo "Available services: graphql-api, rest-api, device-api, data-processor, mongodb, rabbitmq, redis"
                exit 1
            fi
            cd "$(dirname "$(dirname "$SCRIPT_DIR")")"
            docker-compose -f docker-compose.dev.yml exec "$service" sh
            ;;
        help|--help|-h)
            if [[ -n "$1" ]]; then
                show_command_usage "$1"
            else
                show_menu
            fi
            ;;
        *)
            print_error "Unknown command: $command"
            show_menu
            exit 1
            ;;
    esac
}

# Main execution
main() {
    if [[ $# -eq 0 ]]; then
        show_menu
        exit 0
    fi
    
    local command=$1
    shift
    
    # Handle help for specific commands
    if [[ "$1" == "--help" || "$1" == "-h" ]]; then
        show_command_usage "$command"
        exit 0
    fi
    
    execute_command "$command" "$@"
}

main "$@"