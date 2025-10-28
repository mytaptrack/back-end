/**
 * TLS/SSL Configuration Tests
 * Tests encryption configuration and certificate management
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

describe('TLS/SSL Configuration', () => {
  let tlsConfig: any;
  
  beforeAll(() => {
    tlsConfig = global.securityTestUtils.loadYamlConfig('tls-ssl-config.yml');
  });
  
  describe('Configuration Structure', () => {
    test('should have valid configuration structure', () => {
      const validation = global.securityTestUtils.validateSecurityConfigStructure(tlsConfig);
      expect(validation.valid).toBe(true);
    });
    
    test('should define TLS configurations for all services', () => {
      expect(tlsConfig.tls_configurations).toBeDefined();
      expect(tlsConfig.tls_configurations.nginx_proxy).toBeDefined();
      expect(tlsConfig.tls_configurations.api_services).toBeDefined();
      expect(tlsConfig.tls_configurations.mongodb).toBeDefined();
      expect(tlsConfig.tls_configurations.rabbitmq).toBeDefined();
      expect(tlsConfig.tls_configurations.redis).toBeDefined();
    });
  });
  
  describe('Nginx Proxy TLS Configuration', () => {
    test('should configure external TLS properly', () => {
      const nginxConfig = tlsConfig.tls_configurations.nginx_proxy;
      const externalTLS = nginxConfig.external_tls;
      
      expect(externalTLS.enabled).toBe(true);
      expect(externalTLS.certificate_path).toBeDefined();
      expect(externalTLS.private_key_path).toBeDefined();
      expect(externalTLS.protocols).toContain('TLSv1.2');
      expect(externalTLS.protocols).toContain('TLSv1.3');
      expect(externalTLS.protocols).not.toContain('TLSv1.0');
      expect(externalTLS.protocols).not.toContain('TLSv1.1');
    });
    
    test('should use secure cipher suites', () => {
      const nginxConfig = tlsConfig.tls_configurations.nginx_proxy;
      const ciphers = nginxConfig.external_tls.ciphers;
      
      expect(ciphers).toContain('ECDHE-ECDSA-AES256-GCM-SHA384');
      expect(ciphers).toContain('ECDHE-RSA-AES256-GCM-SHA384');
      expect(ciphers).toContain('ECDHE-ECDSA-CHACHA20-POLY1305');
      
      // Should not contain weak ciphers
      ciphers.forEach((cipher: string) => {
        expect(cipher).not.toMatch(/RC4|MD5|DES|NULL/i);
      });
    });
    
    test('should enable mutual TLS for internal communication', () => {
      const nginxConfig = tlsConfig.tls_configurations.nginx_proxy;
      const internalTLS = nginxConfig.internal_tls;
      
      expect(internalTLS.enabled).toBe(true);
      expect(internalTLS.mutual_tls).toBe(true);
      expect(internalTLS.ca_certificate_path).toBeDefined();
      expect(internalTLS.client_certificate_path).toBeDefined();
      expect(internalTLS.client_key_path).toBeDefined();
    });
  });
  
  describe('API Services TLS Configuration', () => {
    test('should configure server TLS', () => {
      const apiConfig = tlsConfig.tls_configurations.api_services;
      const serverTLS = apiConfig.server_tls;
      
      expect(serverTLS.enabled).toBe(true);
      expect(serverTLS.certificate_path).toBeDefined();
      expect(serverTLS.private_key_path).toBeDefined();
      expect(serverTLS.ca_certificate_path).toBeDefined();
      expect(serverTLS.verify_client).toBe(true);
    });
    
    test('should configure client TLS', () => {
      const apiConfig = tlsConfig.tls_configurations.api_services;
      const clientTLS = apiConfig.client_tls;
      
      expect(clientTLS.enabled).toBe(true);
      expect(clientTLS.certificate_path).toBeDefined();
      expect(clientTLS.private_key_path).toBeDefined();
      expect(clientTLS.ca_certificate_path).toBeDefined();
      expect(clientTLS.verify_server).toBe(true);
    });
  });
  
  describe('Database TLS Configuration', () => {
    test('should require TLS for MongoDB', () => {
      const mongoConfig = tlsConfig.tls_configurations.mongodb;
      
      expect(mongoConfig.tls_mode).toBe('requireTLS');
      expect(mongoConfig.certificate_path).toBeDefined();
      expect(mongoConfig.private_key_path).toBeDefined();
      expect(mongoConfig.ca_certificate_path).toBeDefined();
      expect(mongoConfig.client_certificate_required).toBe(true);
    });
    
    test('should configure RabbitMQ SSL options', () => {
      const rabbitmqConfig = tlsConfig.tls_configurations.rabbitmq;
      const sslOptions = rabbitmqConfig.ssl_options;
      
      expect(sslOptions.verify).toBe('verify_peer');
      expect(sslOptions.fail_if_no_peer_cert).toBe(true);
      expect(sslOptions.cacertfile).toBeDefined();
      expect(sslOptions.certfile).toBeDefined();
      expect(sslOptions.keyfile).toBeDefined();
    });
    
    test('should enable TLS for Redis', () => {
      const redisConfig = tlsConfig.tls_configurations.redis;
      
      expect(redisConfig.tls_enabled).toBe(true);
      expect(redisConfig.tls_cert_file).toBeDefined();
      expect(redisConfig.tls_key_file).toBeDefined();
      expect(redisConfig.tls_ca_cert_file).toBeDefined();
      expect(redisConfig.tls_protocols).toContain('TLSv1.2');
      expect(redisConfig.tls_protocols).toContain('TLSv1.3');
    });
  });
  
  describe('Certificate Management', () => {
    test('should define CA configuration', () => {
      const caConfig = tlsConfig.certificate_management.ca_config;
      
      expect(caConfig.organization).toBeDefined();
      expect(caConfig.organizational_unit).toBeDefined();
      expect(caConfig.country).toBeDefined();
      expect(caConfig.validity_days).toBeGreaterThan(365);
      expect(caConfig.key_size).toBeGreaterThanOrEqual(2048);
    });
    
    test('should configure server certificates', () => {
      const serverCerts = tlsConfig.certificate_management.server_certificates;
      
      expect(serverCerts.validity_days).toBeLessThanOrEqual(365);
      expect(serverCerts.key_size).toBeGreaterThanOrEqual(2048);
      expect(serverCerts.algorithm).toBe('RSA');
    });
    
    test('should define SANs for all services', () => {
      const sans = tlsConfig.certificate_management.server_certificates.sans;
      
      expect(sans.nginx_proxy).toContain('localhost');
      expect(sans.api_services).toContain('graphql-api');
      expect(sans.api_services).toContain('rest-api');
      expect(sans.api_services).toContain('device-api');
      expect(sans.mongodb).toContain('mongodb');
      expect(sans.rabbitmq).toContain('rabbitmq');
      expect(sans.redis).toContain('redis');
    });
    
    test('should configure client certificates', () => {
      const clientCerts = tlsConfig.certificate_management.client_certificates;
      
      expect(clientCerts.validity_days).toBeLessThanOrEqual(365);
      expect(clientCerts.key_size).toBeGreaterThanOrEqual(2048);
      expect(clientCerts.algorithm).toBe('RSA');
    });
  });
  
  describe('Certificate Rotation', () => {
    test('should enable certificate rotation', () => {
      const rotation = tlsConfig.certificate_rotation;
      
      expect(rotation.enabled).toBe(true);
      expect(rotation.rotation_threshold_days).toBeGreaterThan(0);
      expect(rotation.schedule).toMatch(/^[\d\*\-\/,\s]+$/); // Cron format
    });
    
    test('should have overlap period for rotation', () => {
      const rotation = tlsConfig.certificate_rotation;
      
      expect(rotation.strategy.overlap_period).toBeDefined();
      expect(rotation.strategy.overlap_period).toMatch(/^\d+[dhm]$/);
    });
    
    test('should configure ACME integration', () => {
      const acme = tlsConfig.certificate_rotation.acme;
      
      expect(acme.server).toBeDefined();
      expect(acme.email).toBeDefined();
    });
  });
  
  describe('Security Policies', () => {
    test('should enforce minimum TLS version', () => {
      const policies = tlsConfig.security_policies;
      
      expect(policies.min_tls_version).toBe('1.2');
    });
    
    test('should use modern cipher suite policy', () => {
      const policies = tlsConfig.security_policies;
      
      expect(policies.cipher_suite_policy).toBe('modern');
    });
    
    test('should configure HSTS', () => {
      const hsts = tlsConfig.security_policies.hsts;
      
      expect(hsts.enabled).toBe(true);
      expect(hsts.max_age).toBeGreaterThanOrEqual(31536000); // 1 year
      expect(hsts.include_subdomains).toBe(true);
      expect(hsts.preload).toBe(true);
    });
    
    test('should enable certificate transparency', () => {
      const ct = tlsConfig.security_policies.certificate_transparency;
      
      expect(ct.enabled).toBe(true);
      expect(ct.sct_required).toBe(true);
    });
    
    test('should enable OCSP stapling', () => {
      const ocsp = tlsConfig.security_policies.ocsp_stapling;
      
      expect(ocsp.enabled).toBe(true);
      expect(ocsp.cache_timeout).toBeGreaterThan(0);
    });
  });
  
  describe('Monitoring and Alerting', () => {
    test('should monitor certificate expiration', () => {
      const monitoring = tlsConfig.monitoring.certificate_expiration;
      
      expect(monitoring.enabled).toBe(true);
      expect(monitoring.warning_days).toBeGreaterThan(monitoring.critical_days);
      expect(monitoring.critical_days).toBeGreaterThan(0);
    });
    
    test('should monitor TLS handshakes', () => {
      const handshakeMonitoring = tlsConfig.monitoring.handshake_monitoring;
      
      expect(handshakeMonitoring.enabled).toBe(true);
      expect(handshakeMonitoring.timeout_threshold).toBeGreaterThan(0);
    });
    
    test('should track cipher usage', () => {
      const cipherTracking = tlsConfig.monitoring.cipher_tracking;
      
      expect(cipherTracking.enabled).toBe(true);
      expect(cipherTracking.log_weak_ciphers).toBe(true);
    });
  });
  
  describe('Development Configuration', () => {
    test('should support self-signed certificates for development', () => {
      const development = tlsConfig.development;
      
      expect(development.self_signed.enabled).toBe(true);
      expect(development.self_signed.validity_days).toBeLessThanOrEqual(365);
    });
    
    test('should not skip verification by default', () => {
      const development = tlsConfig.development;
      
      expect(development.skip_verification.enabled).toBe(false);
    });
    
    test('should generate test certificates', () => {
      const development = tlsConfig.development;
      
      expect(development.test_certificates.generate_on_startup).toBe(true);
      expect(development.test_certificates.cleanup_on_shutdown).toBe(true);
    });
  });
  
  describe('TLS Configuration Validation', () => {
    test('should use secure TLS versions only', () => {
      const allConfigs = Object.values(tlsConfig.tls_configurations);
      
      allConfigs.forEach((config: any) => {
        if (config.protocols) {
          config.protocols.forEach((protocol: string) => {
            expect(protocol).toMatch(/^TLSv1\.[23]$/);
          });
        }
        
        if (config.external_tls?.protocols) {
          config.external_tls.protocols.forEach((protocol: string) => {
            expect(protocol).toMatch(/^TLSv1\.[23]$/);
          });
        }
        
        if (config.tls_protocols) {
          expect(config.tls_protocols).toMatch(/TLSv1\.[23]/);
        }
      });
    });
    
    test('should have proper certificate paths', () => {
      const allConfigs = Object.values(tlsConfig.tls_configurations);
      
      allConfigs.forEach((config: any) => {
        const checkPaths = (obj: any) => {
          if (obj.certificate_path) {
            expect(obj.certificate_path).toMatch(/\.crt$/);
          }
          if (obj.private_key_path) {
            expect(obj.private_key_path).toMatch(/\.key$/);
          }
          if (obj.ca_certificate_path) {
            expect(obj.ca_certificate_path).toMatch(/\.crt$/);
          }
        };
        
        checkPaths(config);
        if (config.external_tls) checkPaths(config.external_tls);
        if (config.internal_tls) checkPaths(config.internal_tls);
        if (config.server_tls) checkPaths(config.server_tls);
        if (config.client_tls) checkPaths(config.client_tls);
      });
    });
  });
});