#!/bin/bash

# MyTapTrack Development Tools Demo Workflow

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN} $1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_command() {
    echo -e "${CYAN}$ $1${NC}"
}

# Wait for user input
wait_for_user() {
    echo ""
    read -p "Press Enter to continue or Ctrl+C to exit..."
    echo ""
}

# Demo workflow
demo_workflow() {
    print_header "MyTapTrack Development Tools Demo"
    echo ""
    echo "This demo will show you how to use the development tools for:"
    echo "• Starting the development environment"
    echo "• Seeding test data with realistic scenarios"
    echo "• Inspecting databases and message queues"
    echo "• Viewing and filtering logs"
    echo "• Resetting the environment"
    echo ""
    echo "Note: This is a demonstration only. Commands will be shown but not executed."
    wait_for_user
    
    # Step 1: Environment startup
    print_header "Step 1: Starting Development Environment"
    print_step "Start the complete development stack with hot-reload capabilities"
    print_command "./tools/dev.sh start"
    echo ""
    print_info "This command will:"
    echo "  • Build Docker images if needed"
    echo "  • Start infrastructure services (MongoDB, RabbitMQ, Redis)"
    echo "  • Start application services with hot-reload"
    echo "  • Seed initial test data"
    echo "  • Display service URLs and debug ports"
    wait_for_user
    
    # Step 2: Check status
    print_header "Step 2: Checking Service Status"
    print_step "Verify all services are running correctly"
    print_command "./tools/dev.sh status"
    echo ""
    print_info "Shows Docker Compose service status with health information"
    wait_for_user
    
    # Step 3: Seed realistic data
    print_header "Step 3: Seeding Realistic Test Data"
    print_step "Generate comprehensive test data with realistic scenarios"
    print_command "./tools/dev.sh seed --scenarios --summary"
    echo ""
    print_info "This will create:"
    echo "  • Users, students, devices with relationships"
    echo "  • Time-series data for the past 14 days"
    echo "  • RabbitMQ messages simulating real events"
    echo "  • Redis cache entries for sessions and rate limits"
    echo "  • Realistic school day scenarios (logins, activities, alerts)"
    wait_for_user
    
    # Step 4: Inspect database
    print_header "Step 4: Inspecting Database Data"
    print_step "Explore the seeded data in MongoDB"
    print_command "./tools/dev.sh inspect mongodb users"
    echo ""
    print_info "Shows user data overview with role distribution"
    echo ""
    print_command "./tools/dev.sh inspect mongodb students"
    echo ""
    print_info "Shows student data with grade distribution"
    echo ""
    print_command "./tools/dev.sh inspect mongodb timeseries"
    echo ""
    print_info "Shows time-series data points and recent activity"
    wait_for_user
    
    # Step 5: Inspect message queues
    print_header "Step 5: Inspecting Message Queues"
    print_step "Check RabbitMQ queues and messages"
    print_command "./tools/dev.sh inspect rabbitmq queues"
    echo ""
    print_info "Shows queue status with message counts"
    echo ""
    print_command "./tools/dev.sh inspect rabbitmq connections"
    echo ""
    print_info "Shows active connections from application services"
    wait_for_user
    
    # Step 6: View logs
    print_header "Step 6: Viewing Service Logs"
    print_step "Monitor application logs with filtering"
    print_command "./tools/dev.sh logs all --structured --level info"
    echo ""
    print_info "Shows structured JSON logs from all services at info level"
    echo ""
    print_command "./tools/dev.sh logs graphql-api -f"
    echo ""
    print_info "Follow GraphQL API logs in real-time"
    echo ""
    print_command "./tools/dev.sh logs all --errors"
    echo ""
    print_info "Show only error logs from all services"
    wait_for_user
    
    # Step 7: Development workflow
    print_header "Step 7: Development Workflow"
    print_step "Typical development workflow with hot-reload"
    echo ""
    print_info "1. Edit source code in your IDE"
    echo "   • Files are mounted with 'cached' volumes for performance"
    echo "   • Services automatically restart on code changes"
    echo ""
    print_info "2. Debug with IDE integration"
    echo "   • GraphQL API: localhost:9229"
    echo "   • REST API: localhost:9230"
    echo "   • Device API: localhost:9231"
    echo "   • Data Processor: localhost:9232"
    echo ""
    print_info "3. Test changes with seeded data"
    echo "   • Use realistic test scenarios"
    echo "   • Inspect data changes in real-time"
    wait_for_user
    
    # Step 8: Web interfaces
    print_header "Step 8: Web Development Interfaces"
    print_step "Access web-based development tools"
    echo ""
    print_info "Database Management:"
    echo "  • MongoDB Express: http://localhost:8081 (admin/devpassword)"
    echo "  • Redis Commander: http://localhost:8082"
    echo ""
    print_info "Message Broker:"
    echo "  • RabbitMQ Management: http://localhost:15672 (admin/devpassword)"
    echo ""
    print_info "Log Aggregation:"
    echo "  • Grafana Dashboards: http://localhost:3001 (admin/devpassword)"
    echo ""
    print_info "Application APIs:"
    echo "  • GraphQL Playground: http://localhost:4500/graphql"
    echo "  • REST API: http://localhost:4501/api/v2"
    echo "  • Device API: http://localhost:4502/device"
    wait_for_user
    
    # Step 9: Reset environment
    print_header "Step 9: Resetting Development Environment"
    print_step "Clean reset with fresh data when needed"
    print_command "./tools/dev.sh reset --clear --scenarios"
    echo ""
    print_info "This will:"
    echo "  • Clear all database collections"
    echo "  • Purge all message queues"
    echo "  • Clear Redis cache"
    echo "  • Reseed with fresh test data and scenarios"
    echo "  • Restart application services"
    wait_for_user
    
    # Step 10: Shutdown
    print_header "Step 10: Stopping Development Environment"
    print_step "Clean shutdown with data preservation options"
    print_command "./tools/dev.sh stop"
    echo ""
    print_info "Stops and removes containers but preserves volumes"
    echo ""
    print_command "./tools/dev.sh stop --keep-data"
    echo ""
    print_info "Stops services but keeps containers and data"
    echo ""
    print_command "./tools/dev.sh stop --clean-all"
    echo ""
    print_info "Complete cleanup - removes containers, volumes, and images"
    wait_for_user
    
    # Summary
    print_header "Development Tools Summary"
    echo ""
    print_success "You've seen the complete development workflow!"
    echo ""
    echo "🚀 Key Benefits:"
    echo "  • Hot-reload for rapid development"
    echo "  • Comprehensive test data with realistic scenarios"
    echo "  • Advanced log aggregation and filtering"
    echo "  • Database and queue inspection tools"
    echo "  • Web-based management interfaces"
    echo "  • Debug port integration for IDE debugging"
    echo ""
    echo "📚 Next Steps:"
    echo "  • Read the full documentation: ./README.md"
    echo "  • Start your development environment: ./tools/dev.sh start"
    echo "  • Explore the inspection tools: ./tools/dev.sh inspect --help"
    echo "  • Set up IDE integration with debug ports"
    echo ""
    echo "🔧 Integration:"
    echo "  • Add to main Makefile for easy access"
    echo "  • Configure IDE tasks and debug settings"
    echo "  • Set up team development standards"
    echo ""
    print_success "Happy developing with MyTapTrack! 🎉"
}

# Show available demo options
show_demo_options() {
    echo "MyTapTrack Development Tools Demo"
    echo ""
    echo "Available demos:"
    echo "  workflow    Complete development workflow demonstration"
    echo "  quick       Quick overview of main commands"
    echo "  help        Show this help message"
    echo ""
    echo "Usage: $0 [demo_type]"
    echo ""
    echo "Examples:"
    echo "  $0 workflow    # Full workflow demonstration"
    echo "  $0 quick       # Quick command overview"
}

# Quick demo
quick_demo() {
    print_header "Quick Development Tools Overview"
    echo ""
    echo "🚀 Main Commands:"
    echo ""
    print_command "./tools/dev.sh start"
    echo "   Start complete development environment with hot-reload"
    echo ""
    print_command "./tools/dev.sh logs all -f"
    echo "   Follow logs from all services in real-time"
    echo ""
    print_command "./tools/dev.sh inspect mongodb users"
    echo "   Inspect user data in MongoDB"
    echo ""
    print_command "./tools/dev.sh seed --scenarios"
    echo "   Generate realistic test data and scenarios"
    echo ""
    print_command "./tools/dev.sh reset --clear"
    echo "   Reset environment with fresh data"
    echo ""
    print_command "./tools/dev.sh stop"
    echo "   Stop development environment"
    echo ""
    echo "📊 Web Interfaces:"
    echo "  • MongoDB Express: http://localhost:8081"
    echo "  • RabbitMQ Management: http://localhost:15672"
    echo "  • Grafana Logs: http://localhost:3001"
    echo "  • GraphQL Playground: http://localhost:4500/graphql"
    echo ""
    echo "🐛 Debug Ports:"
    echo "  • GraphQL API: localhost:9229"
    echo "  • REST API: localhost:9230"
    echo "  • Device API: localhost:9231"
    echo "  • Data Processor: localhost:9232"
    echo ""
    print_success "For full workflow demo: $0 workflow"
}

# Main execution
main() {
    local demo_type=${1:-workflow}
    
    case $demo_type in
        workflow)
            demo_workflow
            ;;
        quick)
            quick_demo
            ;;
        help|--help|-h)
            show_demo_options
            ;;
        *)
            echo "Unknown demo type: $demo_type"
            echo ""
            show_demo_options
            exit 1
            ;;
    esac
}

main "$@"