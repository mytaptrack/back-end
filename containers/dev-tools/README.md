# MyTapTrack Development Tools

This directory contains comprehensive development tooling for the MyTapTrack Docker containerization project. These tools provide hot-reload capabilities, database inspection, log aggregation, and test data management for efficient development workflows.

## Quick Start

```bash
# Start the development environment
./tools/dev.sh start

# View logs from all services
./tools/dev.sh logs all -f

# Inspect database data
./tools/dev.sh inspect mongodb users

# Reset environment with fresh test data
./tools/dev.sh reset --clear --scenarios
```

## Available Tools

### 🚀 Environment Management

#### `dev.sh` - Main Development Manager
Central command for all development operations.

```bash
./tools/dev.sh start                    # Start development environment
./tools/dev.sh stop                     # Stop development environment
./tools/dev.sh restart                  # Restart services
./tools/dev.sh status                   # Show service status
./tools/dev.sh help                     # Show available commands
```

#### `dev-start.sh` - Environment Startup
Comprehensive startup script with dependency management.

```bash
./tools/dev-start.sh                    # Start with defaults
./tools/dev-start.sh --skip-build       # Skip Docker image building
./tools/dev-start.sh --skip-seed        # Skip test data seeding
```

**Features:**
- Automatic Docker image building
- Infrastructure service startup (MongoDB, RabbitMQ, Redis)
- Service health checking
- Test data seeding
- Development URL display

#### `dev-stop.sh` - Environment Shutdown
Clean shutdown with data preservation options.

```bash
./tools/dev-stop.sh                     # Stop and remove containers
./tools/dev-stop.sh --keep-data         # Stop but keep containers
./tools/dev-stop.sh --clean-volumes     # Remove all data
./tools/dev-stop.sh --clean-all         # Complete cleanup
```

### 📊 Data Management

#### `dev-seed.sh` - Test Data Seeding
Comprehensive test data generation for all services.

```bash
./tools/dev-seed.sh                     # Seed with defaults
./tools/dev-seed.sh --users 50 --students 200  # Custom counts
./tools/dev-seed.sh --scenarios         # Generate realistic scenarios
./tools/dev-seed.sh --clear --summary   # Clear and show summary
```

**Data Types:**
- **Database**: Users, students, devices, time-series data
- **RabbitMQ**: Event messages, queue population
- **Redis**: Cache entries, session data, rate limits

**Scenarios:**
- School day simulation (login patterns, device connections)
- Activity spikes (lunch time, class changes)
- Battery alerts and device events
- Report generation cycles

#### `dev-reset.sh` - Environment Reset
Reset data while preserving infrastructure.

```bash
./tools/dev-reset.sh                    # Reset with default data
./tools/dev-reset.sh --clear            # Clear all existing data
./tools/dev-reset.sh --no-seed          # Reset without reseeding
./tools/dev-reset.sh --db-only          # Reset database only
```

### 🔍 Inspection and Debugging

#### `dev-inspect.sh` - Database and Queue Inspector
Interactive inspection of all data stores.

```bash
# MongoDB inspection
./tools/dev-inspect.sh mongodb stats    # Database statistics
./tools/dev-inspect.sh mongodb users    # User data overview
./tools/dev-inspect.sh mongodb students # Student data overview
./tools/dev-inspect.sh mongodb shell    # Open MongoDB shell

# RabbitMQ inspection
./tools/dev-inspect.sh rabbitmq queues  # Queue status and messages
./tools/dev-inspect.sh rabbitmq exchanges # Exchange configuration
./tools/dev-inspect.sh rabbitmq connections # Active connections

# Redis inspection
./tools/dev-inspect.sh redis info       # Server information
./tools/dev-inspect.sh redis keys "user:*" # Key pattern matching
./tools/dev-inspect.sh redis shell      # Open Redis CLI
```

#### `dev-logs.sh` - Advanced Log Viewer
Structured log viewing with filtering and formatting.

```bash
# Basic log viewing
./tools/dev-logs.sh all -f              # Follow all service logs
./tools/dev-logs.sh graphql-api         # Show GraphQL API logs
./tools/dev-logs.sh mongodb --errors    # Show only error logs

# Advanced filtering
./tools/dev-logs.sh all --structured --level error  # Structured error logs
./tools/dev-logs.sh rest-api --filter "slow"        # Filter by content
./tools/dev-logs.sh all --performance               # Performance-related logs
```

**Log Features:**
- JSON log parsing and formatting
- Log level filtering (debug, info, warn, error)
- Content-based filtering
- Performance log highlighting
- Real-time following with `-f`

## Development Environment Features

### 🔄 Hot Reload Capabilities

All application services support hot reload for rapid development:

- **Volume Mounts**: Source code mounted with `cached` consistency
- **File Watching**: `CHOKIDAR_USEPOLLING=true` for cross-platform compatibility
- **Debug Ports**: Node.js debugger ports exposed for each service
- **Automatic Restart**: Services restart on code changes

### 🐛 Debug Configuration

Debug ports are exposed for all services:

- **GraphQL API**: `localhost:9229`
- **REST API**: `localhost:9230`
- **Device API**: `localhost:9231`
- **Data Processor**: `localhost:9232`

Connect your IDE debugger to these ports for breakpoint debugging.

### 📈 Log Aggregation

Comprehensive logging infrastructure:

- **Loki**: Log aggregation and storage
- **Promtail**: Log collection from containers
- **Grafana**: Log visualization and dashboards
- **Structured Logging**: JSON format with correlation IDs

Access Grafana at `http://localhost:3001` (admin/devpassword)

### 🔧 Development Services

Additional services for development productivity:

- **MongoDB Express**: `http://localhost:8081` - Database web interface
- **Redis Commander**: `http://localhost:8082` - Redis web interface
- **RabbitMQ Management**: `http://localhost:15672` - Message broker interface

## Configuration

### Environment Variables

Development environment uses `.env.dev` file:

```bash
# Database
MONGODB_PASSWORD=devpassword
RABBITMQ_PASSWORD=devpassword
REDIS_PASSWORD=password

# Application
JWT_ISSUER=mytaptrack-dev
JWT_AUDIENCE=mytaptrack-api-dev
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
LOG_LEVEL=debug

# Development
HOT_RELOAD=true
CHOKIDAR_USEPOLLING=true
```

### Service Configuration

Services use development-specific configuration:

- **Reduced timeouts** for faster feedback
- **Verbose logging** for debugging
- **Relaxed security** for development ease
- **Test data integration** for realistic scenarios

## Best Practices

### Development Workflow

1. **Start Environment**: `./tools/dev.sh start`
2. **Check Status**: `./tools/dev.sh status`
3. **View Logs**: `./tools/dev.sh logs all -f`
4. **Make Changes**: Edit source code (auto-reload)
5. **Test Changes**: Use seeded test data
6. **Debug Issues**: Use inspection tools
7. **Reset Data**: `./tools/dev.sh reset` when needed

### Data Management

- **Use Scenarios**: `--scenarios` flag for realistic test data
- **Preserve Data**: Use `--keep-data` when stopping
- **Regular Resets**: Reset data regularly to avoid inconsistencies
- **Inspect Regularly**: Use inspection tools to understand data state

### Debugging

- **Structured Logs**: Use `--structured` flag for better log parsing
- **Filter Logs**: Use level and content filters to focus on issues
- **Debug Ports**: Connect IDE debugger for breakpoint debugging
- **Health Checks**: Monitor service health endpoints

### Performance

- **Volume Caching**: Uses `cached` volumes for better performance
- **Selective Restart**: Restart only affected services
- **Resource Limits**: Monitor container resource usage
- **Log Rotation**: Logs are automatically rotated by Docker

## Troubleshooting

### Common Issues

#### Services Won't Start
```bash
# Check Docker status
docker info

# Check port conflicts
netstat -tulpn | grep :4500

# Rebuild images
./tools/dev.sh stop --clean-images
./tools/dev.sh start
```

#### Hot Reload Not Working
```bash
# Check file watching
./tools/dev-logs.sh graphql-api --filter "watching"

# Restart with polling
docker-compose -f docker-compose.dev.yml restart graphql-api
```

#### Database Connection Issues
```bash
# Check MongoDB status
./tools/dev-inspect.sh mongodb stats

# Reset database
./tools/dev-reset.sh --db-only
```

#### Message Queue Issues
```bash
# Check RabbitMQ status
./tools/dev-inspect.sh rabbitmq overview

# Reset queues
./tools/dev-reset.sh --queues-only
```

### Performance Issues

#### Slow Startup
- Use `--skip-build` if images are up to date
- Use `--skip-seed` if test data exists
- Check available system resources

#### High Resource Usage
- Monitor container stats: `docker stats`
- Reduce log levels in production-like testing
- Use selective service startup

#### File Watching Issues
- Ensure `CHOKIDAR_USEPOLLING=true` is set
- Check file system permissions
- Verify volume mount paths

## Integration with Main Project

### Makefile Integration

Add to main project Makefile:

```makefile
dev-start:
	cd containers && ./dev-tools/tools/dev.sh start

dev-stop:
	cd containers && ./dev-tools/tools/dev.sh stop

dev-logs:
	cd containers && ./dev-tools/tools/dev.sh logs all -f

dev-reset:
	cd containers && ./dev-tools/tools/dev.sh reset --clear
```

### IDE Integration

#### VS Code Tasks

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Dev Environment",
      "type": "shell",
      "command": "./containers/dev-tools/tools/dev.sh start",
      "group": "build"
    },
    {
      "label": "View Dev Logs",
      "type": "shell",
      "command": "./containers/dev-tools/tools/dev.sh logs all -f",
      "group": "test"
    }
  ]
}
```

#### Debug Configuration

Add to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to GraphQL API",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "address": "localhost",
      "localRoot": "${workspaceFolder}",
      "remoteRoot": "/app"
    }
  ]
}
```

## Contributing

When adding new development tools:

1. **Follow Naming**: Use `dev-*.sh` pattern
2. **Add Help**: Include `--help` option
3. **Use Colors**: Use consistent color coding
4. **Error Handling**: Include proper error handling
5. **Documentation**: Update this README
6. **Integration**: Add to main `dev.sh` script

## Support

For issues with development tools:

1. Check service logs: `./tools/dev.sh logs <service>`
2. Verify service status: `./tools/dev.sh status`
3. Try environment reset: `./tools/dev.sh reset --clear`
4. Check Docker resources: `docker system df`
5. Review container logs: `docker logs <container_name>`