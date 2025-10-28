/**
 * Security Scripts Tests
 * Tests the security setup and audit scripts
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Security Scripts', () => {
  const scriptsDir = path.resolve(__dirname, '..', 'scripts');
  const setupScript = path.join(scriptsDir, 'setup-security.sh');
  const auditScript = path.join(scriptsDir, 'security-audit.sh');
  
  beforeAll(() => {
    // Ensure scripts exist and are executable
    expect(fs.existsSync(setupScript)).toBe(true);
    expect(fs.existsSync(auditScript)).toBe(true);
  });
  
  afterAll(() => {
    // Cleanup any test artifacts
    global.securityTestUtils.cleanup();
  });
  
  describe('Setup Security Script', () => {
    test('should be executable', () => {
      const stats = fs.statSync(setupScript);
      expect(stats.mode & parseInt('111', 8)).toBeGreaterThan(0);
    });
    
    test('should have proper shebang', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      expect(content.startsWith('#!/bin/bash')).toBe(true);
    });
    
    test('should use strict error handling', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      expect(content).toContain('set -euo pipefail');
    });
    
    test('should define required functions', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      
      const requiredFunctions = [
        'log_info',
        'log_success',
        'log_warning',
        'log_error',
        'check_root',
        'create_directories',
        'generate_dev_certificates',
        'setup_docker_secrets',
        'setup_firewall',
        'setup_monitoring',
        'setup_vulnerability_scanning',
        'validate_configuration',
        'main'
      ];
      
      requiredFunctions.forEach(func => {
        expect(content).toMatch(new RegExp(`${func}\\s*\\(\\)`));
      });
    });
    
    test('should validate script syntax', () => {
      expect(() => {
        execSync(`bash -n "${setupScript}"`, { stdio: 'pipe' });
      }).not.toThrow();
    });
    
    test('should create necessary directories', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      
      const expectedDirs = [
        '$SECURITY_DIR/certs',
        '$SECURITY_DIR/secrets',
        '$SECURITY_DIR/logs',
        '$SECURITY_DIR/policies',
        '$SECURITY_DIR/scans',
        '/etc/mytaptrack/security',
        '/var/log/mytaptrack/security'
      ];
      
      expectedDirs.forEach(dir => {
        expect(content).toContain(dir);
      });
    });
    
    test('should generate certificates with proper parameters', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      
      // Should generate CA with 4096-bit key
      expect(content).toMatch(/openssl genrsa.*4096/);
      
      // Should generate service certificates with 2048-bit keys
      expect(content).toMatch(/openssl genrsa.*2048/);
      
      // Should include proper certificate extensions
      expect(content).toContain('v3_req');
      expect(content).toContain('subjectAltName');
    });
    
    test('should setup Docker secrets properly', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      
      // Should check for Docker Swarm
      expect(content).toContain('docker swarm init');
      
      // Should create required secrets
      const requiredSecrets = [
        'mytaptrack_mongodb_root_password',
        'mytaptrack_mongodb_app_password',
        'mytaptrack_rabbitmq_admin_password',
        'mytaptrack_jwt_private_key',
        'mytaptrack_api_encryption_key'
      ];
      
      requiredSecrets.forEach(secret => {
        expect(content).toContain(secret);
      });
    });
    
    test('should validate configuration at the end', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      
      expect(content).toContain('validate_configuration');
      expect(content).toMatch(/if validate_configuration; then/);
    });
  });
  
  describe('Security Audit Script', () => {
    test('should be executable', () => {
      const stats = fs.statSync(auditScript);
      expect(stats.mode & parseInt('111', 8)).toBeGreaterThan(0);
    });
    
    test('should have proper shebang', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      expect(content.startsWith('#!/bin/bash')).toBe(true);
    });
    
    test('should use strict error handling', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      expect(content).toContain('set -euo pipefail');
    });
    
    test('should define required audit functions', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      const requiredFunctions = [
        'initialize_audit',
        'add_audit_result',
        'audit_docker_security',
        'audit_container_images',
        'audit_network_security',
        'audit_secrets',
        'audit_tls_ssl',
        'audit_compliance',
        'calculate_score',
        'generate_summary',
        'main'
      ];
      
      requiredFunctions.forEach(func => {
        expect(content).toMatch(new RegExp(`${func}\\s*\\(\\)`));
      });
    });
    
    test('should validate script syntax', () => {
      expect(() => {
        execSync(`bash -n "${auditScript}"`, { stdio: 'pipe' });
      }).not.toThrow();
    });
    
    test('should require jq for JSON processing', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      expect(content).toContain('command -v jq');
      expect(content).toContain('jq is required');
    });
    
    test('should generate JSON audit report', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      expect(content).toContain('AUDIT_REPORT=');
      expect(content).toContain('.json');
      expect(content).toMatch(/jq.*audit_metadata/);
      expect(content).toMatch(/jq.*summary/);
      expect(content).toMatch(/jq.*categories/);
    });
    
    test('should audit all security categories', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      const auditCategories = [
        'audit_docker_security',
        'audit_container_images',
        'audit_network_security',
        'audit_secrets',
        'audit_tls_ssl',
        'audit_compliance'
      ];
      
      auditCategories.forEach(category => {
        expect(content).toContain(category);
      });
    });
    
    test('should check Docker security configuration', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      // Should check for seccomp
      expect(content).toContain('seccomp');
      
      // Should check for user namespace
      expect(content).toContain('userns');
      
      // Should check Docker version
      expect(content).toContain('docker version');
      
      // Should check for privileged containers
      expect(content).toContain('privileged');
    });
    
    test('should perform vulnerability scanning', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      // Should use Trivy for scanning
      expect(content).toContain('trivy');
      expect(content).toContain('aquasec/trivy');
      
      // Should check for critical and high vulnerabilities
      expect(content).toContain('CRITICAL');
      expect(content).toContain('HIGH');
    });
    
    test('should calculate security score', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      expect(content).toMatch(/\.summary\.score.*passed.*total_checks/);
      expect(content).toContain('calculate_score');
    });
    
    test('should generate summary report', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      expect(content).toContain('SECURITY AUDIT SUMMARY');
      expect(content).toContain('Total Checks');
      expect(content).toContain('Security Score');
      expect(content).toContain('CRITICAL ISSUES');
      expect(content).toContain('HIGH PRIORITY ISSUES');
    });
    
    test('should exit with appropriate codes', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      // Should exit 1 for critical issues
      expect(content).toMatch(/critical_count.*exit 1/);
      
      // Should exit 0 for success
      expect(content).toMatch(/exit 0/);
    });
  });
  
  describe('Script Integration', () => {
    test('should have consistent directory structure', () => {
      const setupContent = fs.readFileSync(setupScript, 'utf8');
      const auditContent = fs.readFileSync(auditScript, 'utf8');
      
      // Both scripts should reference the same security directory
      expect(setupContent).toContain('SECURITY_DIR=');
      expect(auditContent).toContain('SECURITY_DIR=');
      
      // Both should use the same certificate directory
      expect(setupContent).toContain('/certs');
      expect(auditContent).toContain('/certs');
    });
    
    test('should use consistent logging functions', () => {
      const setupContent = fs.readFileSync(setupScript, 'utf8');
      const auditContent = fs.readFileSync(auditScript, 'utf8');
      
      const logFunctions = ['log_info', 'log_success', 'log_warning', 'log_error'];
      
      logFunctions.forEach(func => {
        expect(setupContent).toContain(func);
        expect(auditContent).toContain(func);
      });
    });
    
    test('should validate same configuration files', () => {
      const setupContent = fs.readFileSync(setupScript, 'utf8');
      const auditContent = fs.readFileSync(auditScript, 'utf8');
      
      const configFiles = [
        'network-security.yml',
        'secrets-management.yml',
        'tls-ssl-config.yml',
        'rate-limiting.yml',
        'security-scanning.yml'
      ];
      
      configFiles.forEach(file => {
        expect(setupContent).toContain(file);
        expect(auditContent).toContain(file);
      });
    });
  });
  
  describe('Error Handling', () => {
    test('setup script should handle missing dependencies', () => {
      const content = fs.readFileSync(setupScript, 'utf8');
      
      // Should check for required commands
      expect(content).toMatch(/command -v.*openssl/);
      expect(content).toMatch(/command -v.*docker/);
      
      // Should handle errors gracefully
      expect(content).toContain('|| log_warning');
      expect(content).toContain('|| log_error');
    });
    
    test('audit script should handle missing tools', () => {
      const content = fs.readFileSync(auditScript, 'utf8');
      
      // Should check for jq
      expect(content).toContain('command -v jq');
      
      // Should handle Docker not being available
      expect(content).toContain('docker info');
      
      // Should handle missing files gracefully
      expect(content).toMatch(/\[\[ -f.*\]\]/);
    });
    
    test('scripts should validate inputs', () => {
      const setupContent = fs.readFileSync(setupScript, 'utf8');
      const auditContent = fs.readFileSync(auditScript, 'utf8');
      
      // Should validate file existence
      expect(setupContent).toMatch(/\[\[ -f/);
      expect(auditContent).toMatch(/\[\[ -f/);
      
      // Should validate directory existence
      expect(setupContent).toMatch(/\[\[ -d/);
      expect(auditContent).toMatch(/\[\[ -d/);
    });
  });
  
  describe('Security Best Practices', () => {
    test('scripts should not contain hardcoded secrets', () => {
      const setupContent = fs.readFileSync(setupScript, 'utf8');
      const auditContent = fs.readFileSync(auditScript, 'utf8');
      
      // Should not contain actual passwords or keys
      expect(setupContent).not.toMatch(/password.*=.*[^$]/i);
      expect(setupContent).not.toMatch(/key.*=.*[^$]/i);
      expect(auditContent).not.toMatch(/password.*=.*[^$]/i);
      expect(auditContent).not.toMatch(/key.*=.*[^$]/i);
    });
    
    test('scripts should use secure file permissions', () => {
      const setupContent = fs.readFileSync(setupScript, 'utf8');
      
      // Should set secure permissions on generated files
      expect(setupContent).toContain('chmod 600');
    });
    
    test('scripts should clean up temporary files', () => {
      const setupContent = fs.readFileSync(setupScript, 'utf8');
      const auditContent = fs.readFileSync(auditScript, 'utf8');
      
      // Should clean up CSR files
      expect(setupContent).toContain('rm "$service_csr"');
      
      // Should clean up temporary files
      expect(auditContent).toContain('rm -f');
    });
  });
});