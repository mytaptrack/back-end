#!/bin/bash

# Test script for development tools

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test script existence and permissions
test_scripts() {
    print_status "Testing script files..."
    
    local scripts=(
        "tools/dev.sh"
        "tools/dev-start.sh"
        "tools/dev-stop.sh"
        "tools/dev-reset.sh"
        "tools/dev-logs.sh"
        "tools/dev-inspect.sh"
        "tools/dev-seed.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [[ -f "$script" ]]; then
            if [[ -x "$script" ]]; then
                print_success "Script $script exists and is executable"
            else
                print_error "Script $script exists but is not executable"
                return 1
            fi
        else
            print_error "Script $script does not exist"
            return 1
        fi
    done
}

# Test help commands
test_help_commands() {
    print_status "Testing help commands..."
    
    local scripts=(
        "tools/dev.sh"
        "tools/dev-start.sh"
        "tools/dev-stop.sh"
        "tools/dev-reset.sh"
        "tools/dev-logs.sh"
        "tools/dev-inspect.sh"
        "tools/dev-seed.sh"
    )
    
    for script in "${scripts[@]}"; do
        if ./"$script" --help >/dev/null 2>&1; then
            print_success "Help command works for $script"
        else
            print_error "Help command failed for $script"
            return 1
        fi
    done
}

# Test configuration files
test_config_files() {
    print_status "Testing configuration files..."
    
    local configs=(
        "loki-config.yaml"
        "promtail-config.yaml"
        "grafana-datasources.yaml"
        "grafana-dashboards.yaml"
        "dashboards/mytaptrack-logs.json"
    )
    
    for config in "${configs[@]}"; do
        if [[ -f "$config" ]]; then
            print_success "Configuration file $config exists"
        else
            print_error "Configuration file $config does not exist"
            return 1
        fi
    done
}

# Test Docker Compose development file
test_docker_compose() {
    print_status "Testing Docker Compose development configuration..."
    
    cd ..  # Go to containers directory
    
    if docker-compose -f docker-compose.dev.yml config >/dev/null 2>&1; then
        print_success "Docker Compose development configuration is valid"
    else
        print_error "Docker Compose development configuration is invalid"
        return 1
    fi
    
    cd dev-tools  # Return to dev-tools directory
}

# Test main dev script functionality
test_main_dev_script() {
    print_status "Testing main dev script functionality..."
    
    # Test without arguments (should show menu)
    if ./tools/dev.sh 2>/dev/null | grep -q "MyTapTrack Development Environment Manager"; then
        print_success "Main dev script shows menu correctly"
    else
        print_error "Main dev script menu not working"
        return 1
    fi
    
    # Test help command
    if ./tools/dev.sh help 2>/dev/null | grep -q "Available commands"; then
        print_success "Main dev script help command works"
    else
        print_error "Main dev script help command failed"
        return 1
    fi
}

# Run all tests
run_tests() {
    print_status "Starting development tools tests..."
    echo ""
    
    local failed=0
    
    test_scripts || failed=1
    echo ""
    
    test_help_commands || failed=1
    echo ""
    
    test_config_files || failed=1
    echo ""
    
    test_docker_compose || failed=1
    echo ""
    
    test_main_dev_script || failed=1
    echo ""
    
    if [[ $failed -eq 0 ]]; then
        print_success "All development tools tests passed!"
        echo ""
        echo "🚀 Development tools are ready to use!"
        echo ""
        echo "Quick start:"
        echo "  ./tools/dev.sh start     # Start development environment"
        echo "  ./tools/dev.sh help      # Show all available commands"
        echo ""
    else
        print_error "Some tests failed. Please check the output above."
        exit 1
    fi
}

# Main execution
main() {
    if [[ "$1" == "--help" || "$1" == "-h" ]]; then
        echo "Development Tools Test Script"
        echo ""
        echo "Usage: $0"
        echo ""
        echo "This script tests all development tools for functionality and configuration."
        exit 0
    fi
    
    run_tests
}

main "$@"