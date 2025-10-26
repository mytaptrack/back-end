#!/bin/bash

# Build script for MyTapTrack Docker containers
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TAG=${TAG:-latest}
REGISTRY=${REGISTRY:-mytaptrack}
BUILD_ARGS=""
PUSH=${PUSH:-false}

# Function to print colored output
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

# Function to build a container
build_container() {
    local service=$1
    local dockerfile="containers/${service}/Dockerfile"
    local image_name="${REGISTRY}/${service}:${TAG}"
    
    print_status "Building ${service} container..."
    
    if [ ! -f "$dockerfile" ]; then
        print_error "Dockerfile not found: $dockerfile"
        return 1
    fi
    
    # Build the container
    if docker build -f "$dockerfile" -t "$image_name" $BUILD_ARGS .; then
        print_success "Built ${service} container: ${image_name}"
        
        # Push if requested
        if [ "$PUSH" = "true" ]; then
            print_status "Pushing ${image_name}..."
            if docker push "$image_name"; then
                print_success "Pushed ${image_name}"
            else
                print_error "Failed to push ${image_name}"
                return 1
            fi
        fi
    else
        print_error "Failed to build ${service} container"
        return 1
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "business-logic" ]; then
        print_error "This script must be run from the project root directory"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to build dependencies
build_dependencies() {
    print_status "Building TypeScript dependencies..."
    
    # Build business logic packages
    local packages=("types" "lib" "business-logic/core" "business-logic/user" "business-logic/student" "business-logic/license" "business-logic/report" "business-logic/app" "business-logic/device")
    
    for package in "${packages[@]}"; do
        if [ -d "$package" ] && [ -f "$package/package.json" ]; then
            print_status "Building $package..."
            (cd "$package" && npm run build) || {
                print_error "Failed to build $package"
                exit 1
            }
        else
            print_warning "Package not found or no package.json: $package"
        fi
    done
    
    print_success "Dependencies built successfully"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [SERVICES...]"
    echo ""
    echo "Build Docker containers for MyTapTrack services"
    echo ""
    echo "Options:"
    echo "  -t, --tag TAG        Docker image tag (default: latest)"
    echo "  -r, --registry REG   Docker registry prefix (default: mytaptrack)"
    echo "  -p, --push          Push images to registry after building"
    echo "  -h, --help          Show this help message"
    echo "  --no-deps           Skip building TypeScript dependencies"
    echo "  --build-arg ARG     Pass build argument to docker build"
    echo ""
    echo "Services:"
    echo "  graphql-api         GraphQL API service"
    echo "  rest-api           REST API service"
    echo "  device-api         Device API service"
    echo "  data-processor     Data processor service"
    echo "  all                Build all services (default)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Build all services with default settings"
    echo "  $0 graphql-api rest-api              # Build specific services"
    echo "  $0 -t v1.0.0 -p all                 # Build and push all services with tag v1.0.0"
    echo "  $0 --build-arg NODE_ENV=production   # Pass build argument"
}

# Parse command line arguments
SERVICES=()
BUILD_DEPS=true

while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -p|--push)
            PUSH=true
            shift
            ;;
        --no-deps)
            BUILD_DEPS=false
            shift
            ;;
        --build-arg)
            BUILD_ARGS="$BUILD_ARGS --build-arg $2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        graphql-api|rest-api|device-api|data-processor|all)
            SERVICES+=("$1")
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Default to all services if none specified
if [ ${#SERVICES[@]} -eq 0 ]; then
    SERVICES=("all")
fi

# Expand "all" to individual services
if [[ " ${SERVICES[@]} " =~ " all " ]]; then
    SERVICES=("graphql-api" "rest-api" "device-api" "data-processor")
fi

# Main execution
main() {
    print_status "Starting MyTapTrack container build process"
    print_status "Registry: ${REGISTRY}"
    print_status "Tag: ${TAG}"
    print_status "Services: ${SERVICES[*]}"
    print_status "Push: ${PUSH}"
    
    check_prerequisites
    
    if [ "$BUILD_DEPS" = "true" ]; then
        build_dependencies
    else
        print_warning "Skipping dependency build (--no-deps specified)"
    fi
    
    # Build each service
    local failed_services=()
    for service in "${SERVICES[@]}"; do
        if ! build_container "$service"; then
            failed_services+=("$service")
        fi
    done
    
    # Report results
    echo ""
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_success "All containers built successfully!"
        print_status "Built images:"
        for service in "${SERVICES[@]}"; do
            echo "  - ${REGISTRY}/${service}:${TAG}"
        done
    else
        print_error "Some containers failed to build:"
        for service in "${failed_services[@]}"; do
            echo "  - $service"
        done
        exit 1
    fi
}

# Run main function
main