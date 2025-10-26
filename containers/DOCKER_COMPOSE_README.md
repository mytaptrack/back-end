# MyTapTrack Docker Compose Configuration

This directory contains Docker Compose configurations for running MyTapTrack in containerized environments.

## Files Overview

### Docker Compose Files
- `docker-compose.yml` - Production configuration
- `docker-compose.dev.yml` - Development configuration with hot-reload
- `docker-compose.test.yml` - Testing configuration
- `docker-compose.prod.yml` - Production overrides with monitoring

### Configuration Files
- `config/production.yml` - Production environment configuration
- `config/development.yml` - Development environment configuration
- `config/test.yml` - Test environment configuration
- `.env.example` - Environment variables template

### Infrastructure Configuration
- `nginx/nginx.conf` - Production nginx configuration
- `nginx/nginx.dev.conf` - Development nginx configuration
- `init-scripts/mongodb/` - MongoDB initialization scripts
- `init-scripts/rabbitmq/` - RabbitMQ configuration and definitions

## Quick Start

### Development Environment

1. Copy environment file:
```bash
cp .env.example .env.dev
```

2. Edit `.env.dev` with development settings:
```bash
NODE_ENV=development
MONGODB_PASSWORD=devpassword
RABBITMQ_PASSWORD=devpassword
LOG_LEVEL=debug
```

3. Start development environment:
```bash
docker-compose -f docker-compose.dev.yml up -d
```

4. Access services:
- GraphQL API: http://localhost:4500/graphql
- REST API: http://localhost:4501/api/v2
- Device API: http://localhost:4502/device
- RabbitMQ Management: http://localhost:15672 (admin/devpassword)
- MongoDB Express: http://localhost:8081 (admin/devpassword)

### Production Environment

1. Copy environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with production settings:
```bash
NODE_ENV=production
MONGODB_PASSWORD=your_secure_password
RABBITMQ_PASSWORD=your_secure_password
REDIS_PASSWORD=your_secure_password
JWT_ISSUER=your_domain
CORS_ORIGINS=https://your-domain.com
```

3. Generate SSL certificates (place in `nginx/ssl/`):
```bash
mkdir -p nginx/ssl
# Add your SSL certificate files:
# nginx/ssl/cert.pem
# nginx/ssl/key.pem
```

4. Start production environment:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Testing Environment

1. Start test environment:
```bash
docker-compose -f docker-compose.test.yml up -d
```

2. Run tests:
```bash
docker-compose -f docker-compose.test.yml exec test-runner npm test
```

## Service Architecture

### Load Balancer (nginx)
- Routes requests to appropriate API services
- Handles SSL termination in production
- Implements rate limiting and CORS

### API Services
- **GraphQL API** (Port 4000): Apollo Server with MyTapTrack schema
- **REST API** (Port 4501): Express.js with REST endpoints
- **Device API** (Port 4502): IoT device communication endpoints
- **Data Processor**: Background event processing service

### Infrastructure Services
- **MongoDB**: Primary database with automatic indexing
- **RabbitMQ**: Message broker for event-driven architecture
- **Redis**: Caching and session storage

## Environment Variables

### Required Variables
```bash
NODE_ENV=production|development|test
MONGODB_PASSWORD=secure_password
RABBITMQ_PASSWORD=secure_password
REDIS_PASSWORD=secure_password
JWT_ISSUER=your_issuer
JWT_AUDIENCE=your_audience
CORS_ORIGINS=https://your-domain.com
```

### Optional Variables
```bash
LOG_LEVEL=info|debug|warn|error
BATCH_SIZE=10
RETRY_ATTEMPTS=3
RETRY_DELAY=5000
APP_VERSION=1.0.0
```

## Scaling Services

### Development Scaling
```bash
docker-compose -f docker-compose.dev.yml up -d --scale graphql-api=2 --scale rest-api=2
```

### Production Scaling
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale graphql-api=3 --scale rest-api=3
```

## Data Persistence

### Development
- Uses named volumes for data persistence
- Data survives container restarts
- Can be reset with `docker-compose down -v`

### Production
- Uses named volumes with backup directories
- Automatic database backups (configure separately)
- Persistent storage across deployments

## Monitoring

### Development
- Container logs: `docker-compose logs -f [service_name]`
- Health checks: `docker-compose ps`

### Production
- Prometheus metrics: http://localhost:9090
- Grafana dashboards: http://localhost:3001
- Structured JSON logging
- Health check endpoints

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 80, 443, 4501, 4500, 4502, 5672, 15672, 6379, 27017 are available
2. **Memory issues**: Increase Docker memory limits for production
3. **Permission issues**: Ensure proper file permissions for mounted volumes
4. **Network issues**: Check Docker network configuration

### Debugging Commands

```bash
# View logs
docker-compose logs -f [service_name]

# Execute commands in containers
docker-compose exec graphql-api sh
docker-compose exec mongodb mongosh

# Check service health
docker-compose ps
curl http://localhost/health

# Reset development environment
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
```

### Database Access

```bash
# MongoDB
docker-compose exec mongodb mongosh -u admin -p

# Redis
docker-compose exec redis redis-cli -a password

# RabbitMQ Management
# Access via web interface: http://localhost:15672
```

## Security Considerations

### Production Security
- Use strong passwords for all services
- Implement proper SSL certificates
- Configure firewall rules
- Regular security updates
- Monitor access logs

### Network Security
- Services communicate on isolated Docker network
- External access only through nginx proxy
- Rate limiting and DDoS protection enabled

## Backup and Recovery

### Database Backups
```bash
# MongoDB backup
docker-compose exec mongodb mongodump --out /backups/$(date +%Y%m%d_%H%M%S)

# Redis backup
docker-compose exec redis redis-cli --rdb /backups/dump_$(date +%Y%m%d_%H%M%S).rdb
```

### Configuration Backups
- Backup `.env` files
- Backup SSL certificates
- Backup custom configuration files

## Performance Tuning

### Resource Limits
- Adjust CPU and memory limits in production compose file
- Monitor resource usage with `docker stats`
- Scale services based on load

### Database Optimization
- MongoDB indexes are created automatically
- Redis memory optimization configured
- Connection pooling enabled

## Migration from AWS

1. Export data from DynamoDB to MongoDB format
2. Configure authentication provider (Cognito → JWT/OIDC)
3. Update environment variables
4. Test functionality with development environment
5. Deploy to production with monitoring

For detailed migration instructions, see the main project documentation.