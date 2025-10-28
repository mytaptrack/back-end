# RabbitMQ Configuration for MyTapTrack

This directory contains comprehensive RabbitMQ configuration and setup scripts for the MyTapTrack Docker containerization. The setup provides a complete message broker solution that replaces AWS EventBridge for Docker deployments.

## Overview

The RabbitMQ configuration implements:

- **Event-driven architecture** matching existing EventBridge patterns
- **Comprehensive retry mechanisms** with exponential backoff
- **Dead letter queues** for failed message handling
- **Health monitoring** and operational visibility
- **Connection recovery** and failover handling
- **Performance optimization** for high-throughput scenarios

## Files Structure

```
containers/init-scripts/rabbitmq/
├── rabbitmq.conf                 # Main RabbitMQ configuration
├── definitions.json              # Production queue/exchange definitions
├── dev-definitions.json          # Development environment definitions
├── test-definitions.json         # Test environment definitions
├── init-rabbitmq.sh             # Initialization script
├── health-check.sh              # Health monitoring script
├── monitoring-setup.sh          # Monitoring configuration
├── connection-recovery.sh       # Connection recovery service
├── docker-entrypoint.sh         # Docker container entrypoint
├── test-setup.sh               # Validation test suite
└── README.md                   # This documentation
```

## Event Routing Architecture

### Exchange Structure

- **`mytaptrack.events`** (topic): Main event exchange for all business events
- **`mytaptrack.retry`** (direct): Retry exchange for failed message processing
- **`mytaptrack.dlx`** (direct): Dead letter exchange for permanently failed messages

### Queue Structure

For each event type (`user`, `student`, `license`, `report`, `app`, `device`):

1. **Main Queue** (`{type}.events`): Primary event processing queue
2. **Retry Queue** (`{type}.events.retry`): Temporary retry queue with TTL
3. **Failed Queue** (`{type}.events.failed`): Permanent storage for failed messages

### Message Flow

```
Event Published → mytaptrack.events → {type}.events
                                           ↓ (on failure)
                                    mytaptrack.retry → {type}.events.retry
                                           ↓ (after TTL)
                                    mytaptrack.events → {type}.events (retry)
                                           ↓ (on repeated failure)
                                    mytaptrack.dlx → {type}.events.failed
```

## Event Types and Routing Keys

Based on the existing EventBridge patterns found in the codebase:

### User Events
- `user.created` - User account creation
- `user.updated` - User profile updates
- `user.deleted` - User account deletion

### Student Events
- `student.created` - Student record creation
- `student.updated` - Student profile updates
- `student.deleted` - Student record deletion
- `student.documents.updated` - Student document changes
- `student.license.updated` - Student license assignments
- `student.note.updated` - Student notes updates

### License Events
- `license.created` - License creation
- `license.updated` - License modifications
- `license.deleted` - License removal
- `license.tags.updated` - License tag changes

### Report Events
- `report.created` - Report generation
- `report.updated` - Report modifications
- `report.deleted` - Report removal
- `report.data.updated` - Report data changes

### App Events
- `app.created` - Application creation
- `app.updated` - Application updates
- `app.deleted` - Application removal
- `app.notes.created` - Application notes
- `app.track.event` - Application tracking events

### Device Events
- `device.created` - Device registration
- `device.updated` - Device profile updates
- `device.deleted` - Device removal
- `device.status.updated` - Device status changes
- `device.battery.updated` - Battery level updates
- `device.settings.updated` - Device configuration changes
- `device.track.event` - Device tracking events
- `device.audio.event` - Device audio events

## Configuration Files

### rabbitmq.conf

Main RabbitMQ server configuration with optimizations for:
- Memory management and limits
- Connection handling and recovery
- Performance tuning
- Monitoring and statistics collection

### definitions.json

Production environment configuration including:
- User accounts and permissions
- VHost setup
- Exchange and queue definitions
- Binding configurations
- Policy definitions for HA and performance

### dev-definitions.json / test-definitions.json

Environment-specific configurations with appropriate settings for development and testing.

## Scripts

### init-rabbitmq.sh

Comprehensive initialization script that:
- Creates all required exchanges, queues, and bindings
- Sets up retry mechanisms and dead letter queues
- Configures policies for high availability
- Establishes monitoring infrastructure

**Usage:**
```bash
# Set environment variables
export RABBITMQ_HOST=localhost
export RABBITMQ_PORT=15672
export RABBITMQ_DEFAULT_USER=admin
export RABBITMQ_DEFAULT_PASS=password
export RABBITMQ_VHOST=mytaptrack

# Run initialization
./init-rabbitmq.sh
```

### health-check.sh

Comprehensive health monitoring that checks:
- Management API accessibility
- Cluster and node health
- VHost and resource status
- Exchange and queue health
- Connection and channel status
- Memory and disk usage
- Message flow testing

**Usage:**
```bash
./health-check.sh
```

### monitoring-setup.sh

Configures advanced monitoring features:
- Detailed statistics collection
- Performance monitoring queues
- Alerting infrastructure
- Metrics forwarding with shovel
- Federation for multi-node setups

**Usage:**
```bash
./monitoring-setup.sh
```

### connection-recovery.sh

Connection recovery and failover service:
- Continuous health monitoring
- Automatic connection recovery
- Stuck consumer detection and restart
- Problematic queue management
- Infrastructure recreation on failure

**Usage:**
```bash
# Run as daemon
./connection-recovery.sh --daemon

# One-shot recovery
./connection-recovery.sh --recover
```

### test-setup.sh

Comprehensive validation test suite:
- Connectivity testing
- Configuration validation
- Message flow testing
- Performance verification
- Health check validation

**Usage:**
```bash
./test-setup.sh
```

## Docker Integration

### docker-entrypoint.sh

Custom Docker entrypoint that:
- Starts RabbitMQ server
- Enables required plugins
- Runs initialization scripts
- Starts monitoring services
- Handles graceful shutdown

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RABBITMQ_HOST` | `localhost` | RabbitMQ server hostname |
| `RABBITMQ_PORT` | `15672` | Management API port |
| `RABBITMQ_DEFAULT_USER` | `admin` | Admin username |
| `RABBITMQ_DEFAULT_PASS` | `password` | Admin password |
| `RABBITMQ_VHOST` | `mytaptrack` | Virtual host name |
| `MYTAPTRACK_APP_PASSWORD` | `app_secure_password` | Application user password |
| `ENVIRONMENT` | `production` | Environment type |

## Retry and Error Handling

### Retry Mechanism

1. **Initial Failure**: Message fails processing in main queue
2. **Retry Queue**: Message moved to retry queue with 30-second TTL
3. **Requeue**: After TTL expires, message returns to main queue
4. **Final Failure**: After multiple retries, message goes to failed queue

### Configuration

- **Retry TTL**: 30 seconds (configurable)
- **Main Queue TTL**: 1 hour (prevents infinite accumulation)
- **Max Retry Attempts**: Controlled by application logic
- **Failed Queue Limits**: 10,000 messages max to prevent unbounded growth

### Dead Letter Queue Strategy

- **Immediate DLQ**: Critical errors that shouldn't be retried
- **Retry DLQ**: Temporary failures that should be retried
- **Final DLQ**: Messages that have exhausted all retry attempts

## Monitoring and Alerting

### Health Metrics

- Queue lengths and message rates
- Consumer counts and processing rates
- Memory and disk usage
- Connection and channel statistics
- Error rates and failed message counts

### Alerting Queues

- **`alerts.critical`**: Critical system alerts
- **`alerts.warning`**: Warning-level alerts
- **Monitoring queues**: Performance metrics collection

### Management UI

Access the RabbitMQ Management UI at `http://localhost:15672`
- Username: `admin` (or configured value)
- Password: Set via environment variable

## Performance Optimization

### Queue Policies

- **High Availability**: All queues mirrored across nodes
- **Message TTL**: Prevents infinite message accumulation
- **Length Limits**: Prevents memory exhaustion
- **Overflow Behavior**: Drop-head or reject-publish strategies

### Connection Settings

- **Heartbeat**: 60 seconds for connection health
- **Channel Limits**: 2047 channels per connection
- **TCP Optimization**: Nodelay and proper buffer settings
- **Prefetch**: 250 messages per consumer for optimal throughput

## Troubleshooting

### Common Issues

1. **Connection Failures**
   - Run `./connection-recovery.sh --recover`
   - Check network connectivity
   - Verify credentials

2. **Queue Buildup**
   - Check consumer health
   - Verify message processing logic
   - Consider scaling consumers

3. **Memory Issues**
   - Check queue lengths
   - Verify TTL settings
   - Monitor memory usage

4. **Performance Problems**
   - Check prefetch settings
   - Verify connection pooling
   - Monitor channel usage

### Diagnostic Commands

```bash
# Check overall health
./health-check.sh

# Test configuration
./test-setup.sh

# Manual recovery
./connection-recovery.sh --recover

# Check RabbitMQ status
rabbitmqctl status

# List queues with details
rabbitmqctl list_queues name messages consumers
```

## Security Considerations

### User Management

- **Admin User**: Full management access
- **Application User**: Limited to specific vhost operations
- **Password Security**: Use strong passwords and rotate regularly

### Network Security

- **Management Port**: Restrict access to management interface
- **AMQP Port**: Secure client connections
- **TLS**: Enable for production deployments

### Access Control

- **VHost Isolation**: Separate environments using vhosts
- **Permission Granularity**: Minimal required permissions
- **Connection Limits**: Prevent resource exhaustion

## Integration with MyTapTrack

### Message Broker Abstraction

The RabbitMQ setup integrates with the MyTapTrack message broker abstraction layer:

```typescript
// Example usage in business logic
await context.messageBroker.publish('user.created', {
  userId: user.id,
  email: user.email,
  timestamp: new Date().toISOString()
});
```

### Event Handlers

Container services subscribe to relevant queues:

```typescript
// Example subscription
await messageBroker.subscribe('user.*', async (message) => {
  // Handle user events
  await processUserEvent(message.payload);
});
```

### Configuration Loading

Services automatically detect RabbitMQ configuration:

```typescript
const config = await loadConfiguration();
if (config.messageBroker.provider === 'rabbitmq') {
  // Use RabbitMQ implementation
}
```

## Maintenance

### Regular Tasks

1. **Monitor Queue Lengths**: Ensure no excessive buildup
2. **Check Failed Queues**: Review and process failed messages
3. **Update Passwords**: Rotate credentials regularly
4. **Review Logs**: Check for errors and performance issues
5. **Backup Configuration**: Save definitions and policies

### Scaling Considerations

- **Horizontal Scaling**: Add more RabbitMQ nodes for clustering
- **Consumer Scaling**: Increase consumer instances for high throughput
- **Queue Partitioning**: Split high-volume queues by routing keys
- **Federation**: Connect multiple RabbitMQ clusters

This comprehensive RabbitMQ setup provides a robust, scalable, and maintainable message broker solution for MyTapTrack's Docker containerization, ensuring reliable event-driven communication across all services.