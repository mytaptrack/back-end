/**
 * Jest test setup for security tests
 * Configures test environment and utilities for security testing
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Extend Jest matchers for security testing
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidSecurityConfig(): R;
      toHaveSecureDefaults(): R;
      toHaveValidTLSConfig(): R;
      toHaveValidNetworkConfig(): R;
    }
  }
}

// Custom Jest matchers for security
expect.extend({
  toBeValidSecurityConfig(received: any) {
    const requiredFields = ['version', 'services', 'networks', 'secrets'];
    const hasAllFields = requiredFields.every(field => received.hasOwnProperty(field));
    
    if (hasAllFields) {
      return {
        message: () => `Expected security config not to be valid`,
        pass: true,
      };
    } else {
      const missingFields = requiredFields.filter(field => !received.hasOwnProperty(field));
      return {
        message: () => `Expected security config to have required fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
  },

  toHaveSecureDefaults(received: any) {
    const securityChecks = [
      received.security_opt?.includes('no-new-privileges:true'),
      received.read_only === true,
      received.cap_drop?.includes('ALL'),
      received.user && received.user !== 'root' && received.user !== '0:0'
    ];
    
    const passedChecks = securityChecks.filter(Boolean).length;
    const totalChecks = securityChecks.length;
    
    if (passedChecks >= totalChecks * 0.75) { // At least 75% of security checks pass
      return {
        message: () => `Expected service not to have secure defaults`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected service to have secure defaults (passed ${passedChecks}/${totalChecks} checks)`,
        pass: false,
      };
    }
  },

  toHaveValidTLSConfig(received: any) {
    const tlsChecks = [
      received.ssl_protocols?.includes('TLSv1.2') || received.ssl_protocols?.includes('TLSv1.3'),
      received.ssl_certificate || received.tls_cert_file || received.certificate_path,
      received.ssl_certificate_key || received.tls_key_file || received.private_key_path,
      !received.ssl_protocols?.includes('TLSv1.0'), // Should not include old TLS versions
      !received.ssl_protocols?.includes('TLSv1.1')
    ];
    
    const passedChecks = tlsChecks.filter(Boolean).length;
    
    if (passedChecks >= 3) { // At least basic TLS requirements
      return {
        message: () => `Expected TLS config not to be valid`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected valid TLS configuration (passed ${passedChecks}/5 checks)`,
        pass: false,
      };
    }
  },

  toHaveValidNetworkConfig(received: any) {
    const networkChecks = [
      received.driver === 'bridge',
      received.ipam?.config?.[0]?.subnet,
      received.internal !== undefined, // Should explicitly set internal flag
      received.driver_opts
    ];
    
    const passedChecks = networkChecks.filter(Boolean).length;
    
    if (passedChecks >= 3) {
      return {
        message: () => `Expected network config not to be valid`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected valid network configuration (passed ${passedChecks}/4 checks)`,
        pass: false,
      };
    }
  },
});

// Global test utilities for security testing
global.securityTestUtils = {
  // Load and parse YAML configuration files
  loadYamlConfig(filePath: string): any {
    const fullPath = path.resolve(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Configuration file not found: ${fullPath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    return yaml.load(content);
  },

  // Load Docker Compose configuration
  loadDockerComposeConfig(filePath: string): any {
    return this.loadYamlConfig(filePath);
  },

  // Check if Docker is available
  isDockerAvailable(): boolean {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  // Check if Docker Swarm is initialized
  isDockerSwarmInitialized(): boolean {
    try {
      const result = execSync('docker info --format "{{.Swarm.LocalNodeState}}"', { encoding: 'utf8' });
      return result.trim() === 'active';
    } catch {
      return false;
    }
  },

  // Validate certificate file
  validateCertificate(certPath: string): boolean {
    try {
      const fullPath = path.resolve(__dirname, '..', certPath);
      if (!fs.existsSync(fullPath)) {
        return false;
      }
      
      // Basic certificate validation using openssl
      execSync(`openssl x509 -in "${fullPath}" -noout -text`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  // Validate private key file
  validatePrivateKey(keyPath: string): boolean {
    try {
      const fullPath = path.resolve(__dirname, '..', keyPath);
      if (!fs.existsSync(fullPath)) {
        return false;
      }
      
      // Basic private key validation using openssl
      execSync(`openssl rsa -in "${fullPath}" -check -noout`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },

  // Check if port is in use
  isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const server = net.createServer();
      
      server.listen(port, () => {
        server.once('close', () => resolve(false));
        server.close();
      });
      
      server.on('error', () => resolve(true));
    });
  },

  // Generate test certificate for testing
  generateTestCertificate(name: string): { cert: string; key: string } {
    const testDir = path.resolve(__dirname, 'temp');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    const certPath = path.join(testDir, `${name}.crt`);
    const keyPath = path.join(testDir, `${name}.key`);
    
    try {
      // Generate private key
      execSync(`openssl genrsa -out "${keyPath}" 2048`, { stdio: 'ignore' });
      
      // Generate certificate
      execSync(`openssl req -new -x509 -key "${keyPath}" -out "${certPath}" -days 1 -subj "/CN=${name}"`, { stdio: 'ignore' });
      
      return { cert: certPath, key: keyPath };
    } catch (error) {
      throw new Error(`Failed to generate test certificate: ${error}`);
    }
  },

  // Clean up test files
  cleanup(): void {
    const testDir = path.resolve(__dirname, 'temp');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  },

  // Mock Docker secrets for testing
  mockDockerSecrets: {
    'mytaptrack_mongodb_root_password': 'test-mongo-root-pass',
    'mytaptrack_mongodb_app_password': 'test-mongo-app-pass',
    'mytaptrack_rabbitmq_admin_password': 'test-rabbitmq-admin-pass',
    'mytaptrack_rabbitmq_app_password': 'test-rabbitmq-app-pass',
    'mytaptrack_redis_password': 'test-redis-pass',
    'mytaptrack_jwt_private_key': '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----',
    'mytaptrack_jwt_public_key': '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0B...\n-----END PUBLIC KEY-----',
    'mytaptrack_api_encryption_key': 'test-encryption-key-32-chars-long'
  },

  // Validate security configuration structure
  validateSecurityConfigStructure(config: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required top-level fields
    const requiredFields = ['version'];
    requiredFields.forEach(field => {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });
    
    // Validate version format
    if (config.version && !config.version.match(/^\d+\.\d+$/)) {
      errors.push('Invalid version format, expected X.Y');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  },

  // Common security test data
  testData: {
    validTLSConfig: {
      ssl_protocols: ['TLSv1.2', 'TLSv1.3'],
      ssl_certificate: '/etc/ssl/certs/test.crt',
      ssl_certificate_key: '/etc/ssl/private/test.key',
      ssl_ciphers: [
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384'
      ]
    },
    
    insecureTLSConfig: {
      ssl_protocols: ['TLSv1.0', 'TLSv1.1'],
      ssl_certificate: '/etc/ssl/certs/test.crt'
      // Missing private key
    },
    
    secureServiceConfig: {
      security_opt: ['no-new-privileges:true'],
      read_only: true,
      cap_drop: ['ALL'],
      cap_add: ['CHOWN', 'SETGID', 'SETUID'],
      user: '1000:1000'
    },
    
    insecureServiceConfig: {
      privileged: true,
      user: 'root',
      cap_add: ['ALL']
    },
    
    validNetworkConfig: {
      driver: 'bridge',
      ipam: {
        config: [{ subnet: '172.20.0.0/24' }]
      },
      internal: true,
      driver_opts: {
        'com.docker.network.bridge.enable_icc': 'false'
      }
    }
  }
};

// Declare global types
declare global {
  var securityTestUtils: {
    loadYamlConfig(filePath: string): any;
    loadDockerComposeConfig(filePath: string): any;
    isDockerAvailable(): boolean;
    isDockerSwarmInitialized(): boolean;
    validateCertificate(certPath: string): boolean;
    validatePrivateKey(keyPath: string): boolean;
    isPortInUse(port: number): Promise<boolean>;
    generateTestCertificate(name: string): { cert: string; key: string };
    cleanup(): void;
    mockDockerSecrets: Record<string, string>;
    validateSecurityConfigStructure(config: any): { valid: boolean; errors: string[] };
    testData: {
      validTLSConfig: any;
      insecureTLSConfig: any;
      secureServiceConfig: any;
      insecureServiceConfig: any;
      validNetworkConfig: any;
    };
  };
}

// Setup and teardown
beforeAll(() => {
  // Any global setup needed for security tests
});

afterAll(() => {
  // Cleanup test files
  global.securityTestUtils.cleanup();
});