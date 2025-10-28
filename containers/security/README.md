# MyTapTrack Security Configuration

This directory contains comprehensive security configurations for the MyTapTrack Docker containerization solution. The security implementation follows industry best practices and provides multiple layers of protection.

## Overview

The security configuration implements:

- **Network Security**: Service isolation with custom Docker networks and firewall rules
- **Secret Management**: Secure handling of credentials using Docker Secrets
- **TLS/SSL Encryption**: End-to-end encryption for all service communications
- **Rate Limiting**: Multi-layer rate limiting and DDoS protection
- **Vulnerability Scanning**: Automated security scanning and assessment
- **Runtime Security**: Real-time monitoring and threat detection

## Quick Start

### 1. Initialize Security Configuration

```bash
# Run the security setup script
./containers/security/scripts/setup-security.sh

# This will:
# - Create necessary directories
# - Generate development TLS certificates
# - Set up Docker secrets
# - Configure firewall rules
# - Initialize monitoring
```

### 2. Deploy with Security

```bash
# Deploy using the security-enhanced compose file
docker-compose -f containers/docker-compose.yml -f containers/security/docker-compose.security.yml up -d

# Or use the combined security deployment
docker-compose -f containers/security/docker-compose.security.yml up -d
```

### 3. Run Security Audit

```bash
# Perform comprehensive security assessment
./containers/security/scripts/security-audit.sh

# View audit results
cat containers/security/audits/security_audit_*.json
```

## Security Components

### Network Security

**File**: `network-security.yml`

- **Network Isolation**: Separate networks for frontend, backend, database, and messaging
- **Firewall Rules**: iptables-based traffic filtering
- **Service Isolation**: Containers can only communicate with authorized services
- **Resource Limits**: CPU and memory constraints to prevent resource exhaustion

**Networks**:
- `frontend` (172.20.0.0/24): Public-facing services (nginx, APIs)
- `backend` (172.21.0.0/24): Internal application services
- `database` (172.22.0.0/24): Database services (MongoDB, Redis)
- `messaging` (172.23.0.0/24): Message broker services (RabbitMQ)

### Secret Management

**File**: `secrets-management.yml`

- **Docker Secrets**: Secure credential storage and distribution
- **Secret Rotation**: Automated credential rotation with configurable schedules
- **Access Control**: Service-specific secret access permissions
- **Multiple Providers**: Support for Docker Secrets, HashiCorp Vault, AWS Secrets Manager

**Managed Secrets**:
- Database credentials (MongoDB, Redis)
- Message broker credentials (RabbitMQ)
- JWT signing keys
- API encryption keys
- TLS certificates and keys

### TLS/SSL Configuration

**File**: `tls-ssl-config.yml`

- **End-to-End Encryption**: All service communications encrypted
- **Certificate Management**: Automated certificate generation and rotation
- **Strong Ciphers**: Modern TLS 1.2/1.3 with secure cipher suites
- **Certificate Authority**: Internal CA for service certificates

**Certificate Types**:
- CA certificate for internal PKI
- Server certificates for each service
- Client certificates for mutual TLS
- Load balancer certificates for external access

### Rate Limiting & DDoS Protection

**File**: `rate-limiting.yml`

- **Multi-Layer Protection**: Load balancer and application-level rate limiting
- **Adaptive Limits**: Different limits for different user types and endpoints
- **Geographic Filtering**: Optional country-based blocking
- **Bot Detection**: Automated bot identification and throttling

**Rate Limit Zones**:
- Authentication endpoints: 5 requests/minute
- GraphQL API: 50 requests/second
- REST API: 30 requests/second
- Device API: 20 requests/second

### Security Scanning

**File**: `security-scanning.yml`

- **Vulnerability Assessment**: Automated container image scanning with Trivy
- **Runtime Monitoring**: Real-time security monitoring with Falco
- **Compliance Checking**: CIS Docker Benchmark compliance
- **Automated Remediation**: Configurable auto-remediation for critical issues

**Scanning Tools**:
- **Trivy**: Vulnerability and misconfiguration scanning
- **Falco**: Runtime security monitoring
- **Custom Scripts**: Security audit and compliance checking

## Security Scripts

### Setup Script

**File**: `scripts/setup-security.sh`

Initializes the complete security configuration:

```bash
./containers/security/scripts/setup-security.sh
```

**Features**:
- Creates security directories
- Generates development certificates
- Sets up Docker secrets
- Configures firewall rules
- Initializes monitoring
- Validates configuration

### Audit Script

**File**: `scripts/security-audit.sh`

Performs comprehensive security assessment:

```bash
./containers/security/scripts/security-audit.sh
```

**Audit Categories**:
- Docker security configuration
- Container image vulnerabilities
- Network security settings
- Secret management
- TLS/SSL configuration
- Compliance with security policies

## Nginx Security Configuration

**File**: `nginx/security.conf`

- **Security Headers**: HSTS, CSP, X-Frame-Options, etc.
- **Rate Limiting**: Request throttling and connection limits
- **TLS Termination**: Secure TLS configuration with modern ciphers
- **Attack Prevention**: SQL injection, XSS, and other attack pattern blocking

**Security Features**:
- HTTP to HTTPS redirection
- Security headers for all responses
- Rate limiting per endpoint
- Geographic blocking (configurable)
- Bot detection and throttling
- Custom error pages

## Docker Compose Security

**File**: `docker-compose.security.yml`

Security-enhanced Docker Compose configuration:

- **Hardened Containers**: Read-only filesystems, dropped capabilities
- **Resource Limits**: Memory and CPU constraints
- **Health Checks**: Service health monitoring
- **Secret Integration**: Docker Secrets for all sensitive data
- **Network Isolation**: Proper network segmentation

**Security Features**:
- `no-new-privileges` security option
- Minimal capability sets (CAP_DROP ALL, selective CAP_ADD)
- Non-root user execution
- Read-only root filesystems
- Temporary filesystem mounts for writable areas

## Configuration Files

### Network Security
- Network isolation policies
- Firewall rules and iptables configuration
- Container security constraints
- Resource limits and quotas

### Secret Management
- Docker Secrets configuration
- Secret rotation schedules
- Access control policies
- Multiple provider support

### TLS/SSL
- Certificate management
- TLS protocol and cipher configuration
- Certificate rotation policies
- OCSP stapling and CT logging

### Rate Limiting
- Multi-layer rate limiting rules
- DDoS protection mechanisms
- Geographic and user-agent filtering
- Escalation and penalty policies

### Security Scanning
- Vulnerability scanning configuration
- Runtime security monitoring
- Compliance benchmark settings
- Automated remediation rules

## Monitoring and Alerting

### Security Metrics

The security configuration includes comprehensive monitoring:

- **Falco**: Runtime security event monitoring
- **Trivy**: Vulnerability scan results
- **Nginx**: Access logs with security events
- **Custom Metrics**: Rate limiting violations, authentication failures

### Alert Channels

- Email notifications for critical security events
- Slack integration for team alerts
- PagerDuty integration for incident response
- Webhook support for custom integrations

### Log Aggregation

- Structured JSON logging across all services
- Correlation ID tracking for request tracing
- Centralized log collection and analysis
- Security event correlation and alerting

## Production Deployment

### Prerequisites

1. **Docker Swarm**: Required for Docker Secrets
2. **TLS Certificates**: Production certificates from trusted CA
3. **Secret Management**: External secret provider (Vault, AWS Secrets Manager)
4. **Monitoring**: External monitoring and alerting system

### Production Checklist

- [ ] Replace development certificates with production certificates
- [ ] Configure external secret management provider
- [ ] Set up external monitoring and alerting
- [ ] Configure backup and disaster recovery
- [ ] Perform security audit and penetration testing
- [ ] Document incident response procedures
- [ ] Train operations team on security procedures

### Environment-Specific Configuration

The security configuration supports multiple environments:

- **Development**: Relaxed security for development ease
- **Testing**: Production-like security for testing
- **Staging**: Full security configuration for pre-production testing
- **Production**: Maximum security with all features enabled

## Troubleshooting

### Common Issues

1. **Certificate Errors**: Check certificate paths and permissions
2. **Secret Access**: Verify Docker Swarm initialization and secret creation
3. **Network Connectivity**: Check network isolation and firewall rules
4. **Rate Limiting**: Adjust rate limits for development/testing

### Debug Commands

```bash
# Check Docker secrets
docker secret ls

# Inspect network configuration
docker network ls
docker network inspect mytaptrack_frontend

# View security logs
docker logs mytaptrack-nginx-proxy
docker logs mytaptrack-falco

# Run security audit
./containers/security/scripts/security-audit.sh
```

### Log Locations

- **Nginx Logs**: `/var/log/nginx/` (in nginx container)
- **Falco Logs**: `/var/log/falco/` (in falco container)
- **Audit Reports**: `containers/security/audits/`
- **Scan Results**: `containers/security/scans/`

## Security Best Practices

1. **Regular Updates**: Keep base images and dependencies updated
2. **Secret Rotation**: Implement regular secret rotation
3. **Monitoring**: Continuously monitor security events and metrics
4. **Incident Response**: Have documented incident response procedures
5. **Backup and Recovery**: Regular backups of security configurations
6. **Access Control**: Implement least privilege access principles
7. **Audit Trail**: Maintain comprehensive audit logs
8. **Compliance**: Regular compliance assessments and remediation

## Contributing

When contributing to security configurations:

1. Follow the principle of least privilege
2. Document all security changes
3. Test security configurations thoroughly
4. Update security documentation
5. Run security audit before submitting changes
6. Consider impact on all environments

## Support

For security-related issues:

1. Check the troubleshooting section
2. Review audit reports for specific issues
3. Consult the security logs
4. Contact the security team for critical issues
5. Follow incident response procedures for security incidents