#!/bin/bash

# Security Setup Script for MyTapTrack Docker Containers
# This script initializes all security configurations and components

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_DIR="$(dirname "$SCRIPT_DIR")"
CONTAINERS_DIR="$(dirname "$SECURITY_DIR")"
PROJECT_ROOT="$(dirname "$CONTAINERS_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root (needed for some security configurations)
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root. This is required for some security configurations."
    else
        log_info "Running as non-root user. Some configurations may require sudo."
    fi
}

# Create necessary directories
create_directories() {
    log_info "Creating security directories..."
    
    local dirs=(
        "$SECURITY_DIR/certs"
        "$SECURITY_DIR/secrets"
        "$SECURITY_DIR/logs"
        "$SECURITY_DIR/policies"
        "$SECURITY_DIR/scans"
        "/etc/mytaptrack/security"
        "/var/log/mytaptrack/security"
    )
    
    for dir in "${dirs[@]}"; do
        if [[ ! -d "$dir" ]]; then
            mkdir -p "$dir"
            log_success "Created directory: $dir"
        else
            log_info "Directory already exists: $dir"
        fi
    done
}

# Generate TLS certificates for development
generate_dev_certificates() {
    log_info "Generating development TLS certificates..."
    
    local cert_dir="$SECURITY_DIR/certs"
    local ca_key="$cert_dir/ca.key"
    local ca_cert="$cert_dir/ca.crt"
    
    # Generate CA private key
    if [[ ! -f "$ca_key" ]]; then
        openssl genrsa -out "$ca_key" 4096
        chmod 600 "$ca_key"
        log_success "Generated CA private key"
    fi
    
    # Generate CA certificate
    if [[ ! -f "$ca_cert" ]]; then
        openssl req -new -x509 -days 3650 -key "$ca_key" -out "$ca_cert" \
            -subj "/C=US/ST=State/L=City/O=MyTapTrack/OU=Development/CN=MyTapTrack-CA"
        log_success "Generated CA certificate"
    fi
    
    # Generate service certificates
    local services=("nginx-proxy" "graphql-api" "rest-api" "device-api" "mongodb" "rabbitmq" "redis")
    
    for service in "${services[@]}"; do
        local service_key="$cert_dir/${service}.key"
        local service_csr="$cert_dir/${service}.csr"
        local service_cert="$cert_dir/${service}.crt"
        
        if [[ ! -f "$service_cert" ]]; then
            # Generate private key
            openssl genrsa -out "$service_key" 2048
            chmod 600 "$service_key"
            
            # Generate certificate signing request
            openssl req -new -key "$service_key" -out "$service_csr" \
                -subj "/C=US/ST=State/L=City/O=MyTapTrack/OU=Services/CN=${service}"
            
            # Generate certificate
            openssl x509 -req -in "$service_csr" -CA "$ca_cert" -CAkey "$ca_key" \
                -CAcreateserial -out "$service_cert" -days 90 \
                -extensions v3_req -extfile <(cat <<EOF
[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${service}
DNS.2 = localhost
IP.1 = 127.0.0.1
EOF
)
            
            # Clean up CSR
            rm "$service_csr"
            
            log_success "Generated certificate for $service"
        fi
    done
}

# Setup Docker secrets
setup_docker_secrets() {
    log_info "Setting up Docker secrets..."
    
    # Check if Docker Swarm is initialized
    if ! docker info --format '{{.Swarm.LocalNodeState}}' | grep -q "active"; then
        log_info "Initializing Docker Swarm for secrets management..."
        docker swarm init --advertise-addr 127.0.0.1 || log_warning "Docker Swarm may already be initialized"
    fi
    
    # Generate and create secrets
    local secrets=(
        "mytaptrack_mongodb_root_password"
        "mytaptrack_mongodb_app_password"
        "mytaptrack_rabbitmq_admin_password"
        "mytaptrack_rabbitmq_app_password"
        "mytaptrack_redis_password"
        "mytaptrack_jwt_private_key"
        "mytaptrack_jwt_public_key"
        "mytaptrack_api_encryption_key"
    )
    
    for secret_name in "${secrets[@]}"; do
        if ! docker secret ls --format "{{.Name}}" | grep -q "^${secret_name}$"; then
            case "$secret_name" in
                *_password)
                    # Generate random password
                    local password=$(openssl rand -base64 32)
                    echo "$password" | docker secret create "$secret_name" -
                    ;;
                *jwt_private_key)
                    # Generate JWT private key
                    openssl genrsa 2048 | docker secret create "$secret_name" -
                    ;;
                *jwt_public_key)
                    # Generate JWT public key (requires private key first)
                    local private_key_file=$(mktemp)
                    docker secret inspect mytaptrack_jwt_private_key --format '{{.Spec.Data}}' | base64 -d > "$private_key_file"
                    openssl rsa -in "$private_key_file" -pubout | docker secret create "$secret_name" -
                    rm "$private_key_file"
                    ;;
                *encryption_key)
                    # Generate encryption key
                    openssl rand -hex 32 | docker secret create "$secret_name" -
                    ;;
            esac
            log_success "Created Docker secret: $secret_name"
        else
            log_info "Docker secret already exists: $secret_name"
        fi
    done
}

# Setup firewall rules
setup_firewall() {
    log_info "Setting up firewall rules..."
    
    # Check if iptables is available
    if ! command -v iptables &> /dev/null; then
        log_warning "iptables not found. Firewall rules will not be applied."
        return
    fi
    
    # Backup existing rules
    if [[ -f /etc/iptables/rules.v4 ]]; then
        cp /etc/iptables/rules.v4 /etc/iptables/rules.v4.backup.$(date +%Y%m%d_%H%M%S)
        log_info "Backed up existing iptables rules"
    fi
    
    # Apply basic security rules
    log_info "Applying basic firewall rules..."
    
    # Allow loopback
    iptables -A INPUT -i lo -j ACCEPT
    
    # Allow established connections
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    
    # Allow SSH (if needed)
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    
    # Allow HTTP/HTTPS
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT
    
    # Allow Docker networks
    iptables -A INPUT -s 172.16.0.0/12 -j ACCEPT
    
    # Drop all other input
    iptables -A INPUT -j DROP
    
    log_success "Applied basic firewall rules"
}

# Setup security monitoring
setup_monitoring() {
    log_info "Setting up security monitoring..."
    
    # Create monitoring configuration
    cat > "$SECURITY_DIR/monitoring-config.yml" <<EOF
monitoring:
  enabled: true
  
  # Log monitoring
  log_monitoring:
    paths:
      - "/var/log/mytaptrack/security/*.log"
      - "/var/log/docker/*.log"
    
    # Alert patterns
    alert_patterns:
      - pattern: "CRITICAL"
        action: "immediate_alert"
      - pattern: "authentication failed"
        action: "security_alert"
      - pattern: "rate limit exceeded"
        action: "throttling_alert"
  
  # Metrics collection
  metrics:
    - name: "security_events_total"
      type: "counter"
    - name: "authentication_failures_total"
      type: "counter"
    - name: "rate_limit_violations_total"
      type: "counter"
EOF
    
    log_success "Created security monitoring configuration"
}

# Setup vulnerability scanning
setup_vulnerability_scanning() {
    log_info "Setting up vulnerability scanning..."
    
    # Pull Trivy scanner image
    if docker image inspect aquasec/trivy:latest &> /dev/null; then
        log_info "Trivy scanner image already exists"
    else
        log_info "Pulling Trivy scanner image..."
        docker pull aquasec/trivy:latest
        log_success "Pulled Trivy scanner image"
    fi
    
    # Create scan script
    cat > "$SECURITY_DIR/scripts/scan-images.sh" <<'EOF'
#!/bin/bash

# Image vulnerability scanning script

set -euo pipefail

SCAN_DIR="/tmp/trivy-scans"
mkdir -p "$SCAN_DIR"

# Images to scan
IMAGES=(
    "mytaptrack/graphql-api:latest"
    "mytaptrack/rest-api:latest"
    "mytaptrack/device-api:latest"
    "mytaptrack/data-processor:latest"
)

echo "Starting vulnerability scan..."

for image in "${IMAGES[@]}"; do
    echo "Scanning $image..."
    
    # Run Trivy scan
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$SCAN_DIR:/output" \
        aquasec/trivy:latest image \
        --format json \
        --output "/output/$(basename "$image" | tr ':' '_').json" \
        "$image"
    
    echo "Scan completed for $image"
done

echo "All scans completed. Results in $SCAN_DIR"
EOF
    
    chmod +x "$SECURITY_DIR/scripts/scan-images.sh"
    log_success "Created vulnerability scanning script"
}

# Validate security configuration
validate_configuration() {
    log_info "Validating security configuration..."
    
    local errors=0
    
    # Check certificates
    if [[ ! -f "$SECURITY_DIR/certs/ca.crt" ]]; then
        log_error "CA certificate not found"
        ((errors++))
    fi
    
    # Check Docker secrets
    if ! docker secret ls &> /dev/null; then
        log_error "Docker secrets not accessible"
        ((errors++))
    fi
    
    # Check configuration files
    local config_files=(
        "$SECURITY_DIR/network-security.yml"
        "$SECURITY_DIR/secrets-management.yml"
        "$SECURITY_DIR/tls-ssl-config.yml"
        "$SECURITY_DIR/rate-limiting.yml"
        "$SECURITY_DIR/security-scanning.yml"
    )
    
    for config_file in "${config_files[@]}"; do
        if [[ ! -f "$config_file" ]]; then
            log_error "Configuration file not found: $config_file"
            ((errors++))
        fi
    done
    
    if [[ $errors -eq 0 ]]; then
        log_success "Security configuration validation passed"
        return 0
    else
        log_error "Security configuration validation failed with $errors errors"
        return 1
    fi
}

# Main execution
main() {
    log_info "Starting MyTapTrack security setup..."
    
    check_root
    create_directories
    generate_dev_certificates
    setup_docker_secrets
    setup_firewall
    setup_monitoring
    setup_vulnerability_scanning
    
    if validate_configuration; then
        log_success "Security setup completed successfully!"
        log_info "Next steps:"
        log_info "1. Review generated certificates in $SECURITY_DIR/certs/"
        log_info "2. Configure production secrets if deploying to production"
        log_info "3. Run vulnerability scans with $SECURITY_DIR/scripts/scan-images.sh"
        log_info "4. Review firewall rules and adjust as needed"
    else
        log_error "Security setup completed with errors. Please review and fix issues."
        exit 1
    fi
}

# Run main function
main "$@"