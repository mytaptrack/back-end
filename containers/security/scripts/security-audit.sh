#!/bin/bash

# Security Audit Script for MyTapTrack Docker Containers
# Performs comprehensive security assessment and generates reports

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_DIR="$(dirname "$SCRIPT_DIR")"
AUDIT_DIR="$SECURITY_DIR/audits"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
AUDIT_REPORT="$AUDIT_DIR/security_audit_$TIMESTAMP.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Initialize audit
initialize_audit() {
    log_info "Initializing security audit..."
    
    mkdir -p "$AUDIT_DIR"
    
    # Initialize audit report
    cat > "$AUDIT_REPORT" <<EOF
{
  "audit_metadata": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "version": "1.0",
    "auditor": "MyTapTrack Security Audit Script"
  },
  "summary": {
    "total_checks": 0,
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "score": 0
  },
  "categories": {}
}
EOF
    
    log_success "Audit initialized: $AUDIT_REPORT"
}

# Add result to audit report
add_audit_result() {
    local category="$1"
    local check_name="$2"
    local status="$3"
    local message="$4"
    local severity="${5:-medium}"
    
    # Create temporary file for jq processing
    local temp_file=$(mktemp)
    
    # Add result using jq
    jq --arg cat "$category" \
       --arg check "$check_name" \
       --arg status "$status" \
       --arg msg "$message" \
       --arg sev "$severity" \
       '.categories[$cat] //= [] | 
        .categories[$cat] += [{
          "check": $check,
          "status": $status,
          "message": $msg,
          "severity": $sev,
          "timestamp": now | strftime("%Y-%m-%dT%H:%M:%SZ")
        }] |
        .summary.total_checks += 1 |
        if $status == "PASS" then .summary.passed += 1
        elif $status == "FAIL" then .summary.failed += 1
        else .summary.warnings += 1 end' \
       "$AUDIT_REPORT" > "$temp_file"
    
    mv "$temp_file" "$AUDIT_REPORT"
}

# Check Docker security configuration
audit_docker_security() {
    log_info "Auditing Docker security configuration..."
    
    local category="docker_security"
    
    # Check Docker daemon configuration
    if docker info --format '{{.SecurityOptions}}' | grep -q "name=seccomp"; then
        add_audit_result "$category" "seccomp_enabled" "PASS" "Seccomp security profile is enabled"
    else
        add_audit_result "$category" "seccomp_enabled" "FAIL" "Seccomp security profile is not enabled" "high"
    fi
    
    # Check for user namespace remapping
    if docker info --format '{{.SecurityOptions}}' | grep -q "name=userns"; then
        add_audit_result "$category" "user_namespace" "PASS" "User namespace remapping is enabled"
    else
        add_audit_result "$category" "user_namespace" "WARN" "User namespace remapping is not enabled" "medium"
    fi
    
    # Check Docker version
    local docker_version=$(docker version --format '{{.Server.Version}}')
    local major_version=$(echo "$docker_version" | cut -d. -f1)
    local minor_version=$(echo "$docker_version" | cut -d. -f2)
    
    if [[ $major_version -gt 20 ]] || [[ $major_version -eq 20 && $minor_version -ge 10 ]]; then
        add_audit_result "$category" "docker_version" "PASS" "Docker version $docker_version is recent"
    else
        add_audit_result "$category" "docker_version" "WARN" "Docker version $docker_version may be outdated" "medium"
    fi
    
    # Check for privileged containers
    local privileged_containers=$(docker ps --format "table {{.Names}}\t{{.Status}}" --filter "label=privileged=true" | wc -l)
    if [[ $privileged_containers -eq 0 ]]; then
        add_audit_result "$category" "no_privileged_containers" "PASS" "No privileged containers running"
    else
        add_audit_result "$category" "no_privileged_containers" "FAIL" "$privileged_containers privileged containers found" "high"
    fi
}

# Check container image security
audit_container_images() {
    log_info "Auditing container image security..."
    
    local category="image_security"
    
    # Get list of running containers
    local containers=$(docker ps --format "{{.Image}}")
    
    for image in $containers; do
        local image_name=$(echo "$image" | tr '/' '_' | tr ':' '_')
        
        # Check for latest tag usage
        if echo "$image" | grep -q ":latest"; then
            add_audit_result "$category" "latest_tag_$image_name" "WARN" "Image $image uses 'latest' tag" "medium"
        else
            add_audit_result "$category" "latest_tag_$image_name" "PASS" "Image $image uses specific tag"
        fi
        
        # Run Trivy scan if available
        if command -v trivy &> /dev/null || docker image inspect aquasec/trivy:latest &> /dev/null; then
            log_info "Running vulnerability scan for $image..."
            
            local scan_output=$(mktemp)
            
            if command -v trivy &> /dev/null; then
                trivy image --format json --quiet "$image" > "$scan_output" 2>/dev/null || true
            else
                docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
                    aquasec/trivy:latest image --format json --quiet "$image" > "$scan_output" 2>/dev/null || true
            fi
            
            if [[ -s "$scan_output" ]]; then
                local critical_vulns=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL") | .VulnerabilityID' "$scan_output" 2>/dev/null | wc -l)
                local high_vulns=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH") | .VulnerabilityID' "$scan_output" 2>/dev/null | wc -l)
                
                if [[ $critical_vulns -gt 0 ]]; then
                    add_audit_result "$category" "vulnerabilities_$image_name" "FAIL" "Image $image has $critical_vulns critical vulnerabilities" "critical"
                elif [[ $high_vulns -gt 5 ]]; then
                    add_audit_result "$category" "vulnerabilities_$image_name" "WARN" "Image $image has $high_vulns high vulnerabilities" "high"
                else
                    add_audit_result "$category" "vulnerabilities_$image_name" "PASS" "Image $image has acceptable vulnerability levels"
                fi
            fi
            
            rm -f "$scan_output"
        fi
    done
}

# Check network security
audit_network_security() {
    log_info "Auditing network security..."
    
    local category="network_security"
    
    # Check for custom networks
    local custom_networks=$(docker network ls --filter driver=bridge --format "{{.Name}}" | grep -v bridge | wc -l)
    if [[ $custom_networks -gt 0 ]]; then
        add_audit_result "$category" "custom_networks" "PASS" "Custom Docker networks are in use"
    else
        add_audit_result "$category" "custom_networks" "WARN" "No custom Docker networks found" "medium"
    fi
    
    # Check for containers on default bridge
    local default_bridge_containers=$(docker network inspect bridge --format '{{len .Containers}}')
    if [[ $default_bridge_containers -eq 0 ]]; then
        add_audit_result "$category" "default_bridge_usage" "PASS" "No containers using default bridge network"
    else
        add_audit_result "$category" "default_bridge_usage" "WARN" "$default_bridge_containers containers using default bridge" "medium"
    fi
    
    # Check for exposed ports
    local exposed_ports=$(docker ps --format "{{.Ports}}" | grep -o "0.0.0.0:[0-9]*" | wc -l)
    if [[ $exposed_ports -eq 0 ]]; then
        add_audit_result "$category" "exposed_ports" "PASS" "No containers exposing ports to all interfaces"
    else
        add_audit_result "$category" "exposed_ports" "WARN" "$exposed_ports containers exposing ports to 0.0.0.0" "medium"
    fi
}

# Check secrets and credentials
audit_secrets() {
    log_info "Auditing secrets and credentials..."
    
    local category="secrets_management"
    
    # Check for Docker secrets usage
    if docker secret ls &> /dev/null; then
        local secret_count=$(docker secret ls --format "{{.Name}}" | wc -l)
        if [[ $secret_count -gt 0 ]]; then
            add_audit_result "$category" "docker_secrets" "PASS" "$secret_count Docker secrets configured"
        else
            add_audit_result "$category" "docker_secrets" "WARN" "No Docker secrets found" "medium"
        fi
    else
        add_audit_result "$category" "docker_secrets" "FAIL" "Docker Swarm not initialized - secrets unavailable" "high"
    fi
    
    # Check for environment variables with sensitive data
    local containers_with_env=$(docker ps --format "{{.Names}}")
    for container in $containers_with_env; do
        local env_vars=$(docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -i -E "(password|secret|key|token)" | wc -l)
        if [[ $env_vars -gt 0 ]]; then
            add_audit_result "$category" "env_secrets_$container" "WARN" "Container $container has $env_vars potential secrets in environment" "medium"
        else
            add_audit_result "$category" "env_secrets_$container" "PASS" "Container $container has no obvious secrets in environment"
        fi
    done
}

# Check TLS/SSL configuration
audit_tls_ssl() {
    log_info "Auditing TLS/SSL configuration..."
    
    local category="tls_ssl"
    
    # Check for certificate files
    local cert_dir="$SECURITY_DIR/certs"
    if [[ -d "$cert_dir" ]]; then
        local cert_count=$(find "$cert_dir" -name "*.crt" | wc -l)
        if [[ $cert_count -gt 0 ]]; then
            add_audit_result "$category" "certificates_present" "PASS" "$cert_count certificates found"
            
            # Check certificate expiration
            for cert_file in "$cert_dir"/*.crt; do
                if [[ -f "$cert_file" ]]; then
                    local cert_name=$(basename "$cert_file" .crt)
                    local expiry_date=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
                    local expiry_epoch=$(date -d "$expiry_date" +%s)
                    local current_epoch=$(date +%s)
                    local days_until_expiry=$(( (expiry_epoch - current_epoch) / 86400 ))
                    
                    if [[ $days_until_expiry -lt 7 ]]; then
                        add_audit_result "$category" "cert_expiry_$cert_name" "FAIL" "Certificate $cert_name expires in $days_until_expiry days" "critical"
                    elif [[ $days_until_expiry -lt 30 ]]; then
                        add_audit_result "$category" "cert_expiry_$cert_name" "WARN" "Certificate $cert_name expires in $days_until_expiry days" "high"
                    else
                        add_audit_result "$category" "cert_expiry_$cert_name" "PASS" "Certificate $cert_name expires in $days_until_expiry days"
                    fi
                fi
            done
        else
            add_audit_result "$category" "certificates_present" "WARN" "No certificates found in $cert_dir" "medium"
        fi
    else
        add_audit_result "$category" "certificates_present" "FAIL" "Certificate directory not found" "high"
    fi
}

# Check compliance with security policies
audit_compliance() {
    log_info "Auditing compliance with security policies..."
    
    local category="compliance"
    
    # Check for security configuration files
    local config_files=(
        "network-security.yml"
        "secrets-management.yml"
        "tls-ssl-config.yml"
        "rate-limiting.yml"
        "security-scanning.yml"
    )
    
    for config_file in "${config_files[@]}"; do
        if [[ -f "$SECURITY_DIR/$config_file" ]]; then
            add_audit_result "$category" "config_$config_file" "PASS" "Security configuration file $config_file exists"
        else
            add_audit_result "$category" "config_$config_file" "FAIL" "Security configuration file $config_file missing" "medium"
        fi
    done
    
    # Check for security monitoring
    if [[ -f "$SECURITY_DIR/monitoring-config.yml" ]]; then
        add_audit_result "$category" "monitoring_config" "PASS" "Security monitoring configuration exists"
    else
        add_audit_result "$category" "monitoring_config" "WARN" "Security monitoring configuration missing" "medium"
    fi
}

# Calculate final score
calculate_score() {
    log_info "Calculating security score..."
    
    local temp_file=$(mktemp)
    
    jq '.summary.score = ((.summary.passed * 100) / .summary.total_checks | floor)' "$AUDIT_REPORT" > "$temp_file"
    mv "$temp_file" "$AUDIT_REPORT"
}

# Generate summary report
generate_summary() {
    log_info "Generating audit summary..."
    
    local summary=$(jq -r '.summary | "Total Checks: \(.total_checks)\nPassed: \(.passed)\nFailed: \(.failed)\nWarnings: \(.warnings)\nSecurity Score: \(.score)%"' "$AUDIT_REPORT")
    
    echo
    echo "=================================="
    echo "   SECURITY AUDIT SUMMARY"
    echo "=================================="
    echo "$summary"
    echo "=================================="
    echo
    
    # Show critical and high severity issues
    local critical_issues=$(jq -r '.categories[] | .[] | select(.severity == "critical") | "CRITICAL: \(.check) - \(.message)"' "$AUDIT_REPORT")
    local high_issues=$(jq -r '.categories[] | .[] | select(.severity == "high") | "HIGH: \(.check) - \(.message)"' "$AUDIT_REPORT")
    
    if [[ -n "$critical_issues" ]]; then
        echo "CRITICAL ISSUES:"
        echo "$critical_issues"
        echo
    fi
    
    if [[ -n "$high_issues" ]]; then
        echo "HIGH PRIORITY ISSUES:"
        echo "$high_issues"
        echo
    fi
    
    log_success "Full audit report saved to: $AUDIT_REPORT"
}

# Main execution
main() {
    log_info "Starting MyTapTrack security audit..."
    
    # Check dependencies
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed. Please install jq to run the security audit."
        exit 1
    fi
    
    initialize_audit
    audit_docker_security
    audit_container_images
    audit_network_security
    audit_secrets
    audit_tls_ssl
    audit_compliance
    calculate_score
    generate_summary
    
    # Determine exit code based on critical issues
    local critical_count=$(jq -r '[.categories[] | .[] | select(.severity == "critical")] | length' "$AUDIT_REPORT")
    
    if [[ $critical_count -gt 0 ]]; then
        log_error "Security audit completed with $critical_count critical issues"
        exit 1
    else
        log_success "Security audit completed successfully"
        exit 0
    fi
}

# Run main function
main "$@"