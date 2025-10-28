#!/bin/bash

# MyTapTrack Development Environment Stop Script

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

# Stop services
stop_services() {
    local keep_data=$1
    
    if [[ "$keep_data" == true ]]; then
        print_status "Stopping services (keeping data)..."
        docker-compose -f docker-compose.dev.yml stop
    else
        print_status "Stopping services and removing containers..."
        docker-compose -f docker-compose.dev.yml down
    fi
}

# Clean up volumes
clean_volumes() {
    print_warning "This will remove all development data (databases, logs, etc.)"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing volumes..."
        docker-compose -f docker-compose.dev.yml down -v
        print_success "Volumes removed"
    else
        print_status "Volume cleanup cancelled"
    fi
}

# Clean up images
clean_images() {
    print_warning "This will remove all MyTapTrack development images"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing images..."
        docker images --format "table {{.Repository}}:{{.Tag}}" | grep mytaptrack | awk '{print $1}' | xargs -r docker rmi
        print_success "Images removed"
    else
        print_status "Image cleanup cancelled"
    fi
}

# Show usage
show_usage() {
    echo "MyTapTrack Development Environment Stop Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --keep-data     Stop services but keep containers and data"
    echo "  --clean-volumes Remove all data volumes"
    echo "  --clean-images  Remove all development images"
    echo "  --clean-all     Remove containers, volumes, and images"
    echo "  --help, -h      Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                    # Stop and remove containers (keep volumes)"
    echo "  $0 --keep-data        # Stop services but keep everything"
    echo "  $0 --clean-volumes    # Stop and remove all data"
    echo "  $0 --clean-all        # Complete cleanup"
}

# Main execution
main() {
    local keep_data=false
    local clean_volumes_flag=false
    local clean_images_flag=false
    local clean_all=false
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --keep-data)
                keep_data=true
                shift
                ;;
            --clean-volumes)
                clean_volumes_flag=true
                shift
                ;;
            --clean-images)
                clean_images_flag=true
                shift
                ;;
            --clean-all)
                clean_all=true
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
    
    if [[ "$clean_all" == true ]]; then
        stop_services false
        clean_volumes
        clean_images
    elif [[ "$clean_volumes_flag" == true ]]; then
        stop_services false
        clean_volumes
    elif [[ "$clean_images_flag" == true ]]; then
        stop_services false
        clean_images
    else
        stop_services "$keep_data"
    fi
    
    print_success "Development environment stopped"
}

main "$@"