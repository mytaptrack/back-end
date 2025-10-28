/**
 * Docker Compose Security Configuration Tests
 * Tests the security-enhanced Docker Compose configuration
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

describe('Docker Compose Security Configuration', () => {
  let dockerComposeConfig: any;
  
  beforeAll(() => {
    dockerComposeConfig = global.securityTestUtils.loadDockerComposeConfig('docker-compose.security.yml');
  });
  
  describe('Configuration Structure', () => {
    test('should have valid Docker Compose structure', () => {
      expect(dockerComposeConfig).toBeValidSecurityConfig();
    });
    
    test('should define all required services', () => {
      const requiredServices = [
        'nginx-proxy',
        'graphql-api',
        'rest-api',
        'device-api',
        'data-processor',
        'mongodb',
        'rabbitmq',
        'redis',
        'falco',
        'trivy-scanner'
      ];
      
      requiredServices.forEach(service => {
        expect(dockerComposeConfig.services[service]).toBeDefined();
      });
    });
    
    test('should define secure networks', () => {
      expect(dockerComposeConfig.networks).toBeDefined();
      expect(dockerComposeConfig.networks.frontend).toHaveValidNetworkConfig();
      expect(dockerComposeConfig.networks.backend).toHaveValidNetworkConfig();
      expect(dockerComposeConfig.networks.database).toHaveValidNetworkConfig();
      expect(dockerComposeConfig.networks.messaging).toHaveValidNetworkConfig();
      expect(dockerComposeConfig.networks.monitoring).toHaveValidNetworkConfig();
    });
    
    test('should define Docker secrets', () => {
      expect(dockerComposeConfig.secrets).toBeDefined();
      
      const requiredSecrets = [
        'mytaptrack_mongodb_root_password',
        'mytaptrack_mongodb_app_password',
        'mytaptrack_rabbitmq_admin_password',
        'mytaptrack_rabbitmq_app_password',
        'mytaptrack_redis_password',
        'mytaptrack_jwt_private_key',
        'mytaptrack_jwt_public_key',
        'mytaptrack_api_encryption_key'
      ];
      
      requiredSecrets.forEach(secret => {
        expect(dockerComposeConfig.secrets[secret]).toBeDefined();
        expect(dockerComposeConfig.secrets[secret].external).toBe(true);
      });
    });
  });
  
  describe('Service Security Configuration', () => {
    test('should configure nginx-proxy with security hardening', () => {
      const nginxProxy = dockerComposeConfig.services['nginx-proxy'];
      
      expect(nginxProxy).toHaveSecureDefaults();
      expect(nginxProxy.security_opt).toContain('no-new-privileges:true');
      expect(nginxProxy.read_only).toBe(true);
      expect(nginxProxy.cap_drop).toContain('ALL');
      expect(nginxProxy.cap_add).toContain('NET_BIND_SERVICE');
    });
    
    test('should configure API services with security hardening', () => {
      const apiServices = ['graphql-api', 'rest-api', 'device-api'];
      
      apiServices.forEach(serviceName => {
        const service = dockerComposeConfig.services[serviceName];
        
        expect(service).toHaveSecureDefaults();
        expect(service.user).toBe('1000:1000');
        expect(service.environment).toContain('NODE_ENV=production');
        expect(service.environment).toContain('TLS_ENABLED=true');
        expect(service.environment).toContain('RATE_LIMITING_ENABLED=true');
      });
    });
    
    test('should configure data-processor with security hardening', () => {
      const dataProcessor = dockerComposeConfig.services['data-processor'];
      
      expect(dataProcessor).toHaveSecureDefaults();
      expect(dataProcessor.user).toBe('1000:1000');
      expect(dataProcessor.environment).toContain('NODE_ENV=production');
      expect(dataProcessor.environment).toContain('TLS_ENABLED=true');
    });
    
    test('should configure database services with security hardening', () => {
      const databaseServices = ['mongodb', 'rabbitmq', 'redis'];
      
      databaseServices.forEach(serviceName => {
        const service = dockerComposeConfig.services[serviceName];
        
        expect(service).toHaveSecureDefaults();
        expect(service.user).toBe('999:999');
      });
    });
  });
  
  describe('Network Security', () => {
    test('should isolate networks properly', () => {
      const { networks } = dockerComposeConfig;
      
      // Frontend network should not be internal
      expect(networks.frontend.internal).toBeUndefined();
      
      // Backend networks should be internal
      expect(networks.backend.internal).toBe(true);
      expect(networks.database.internal).toBe(true);
      expect(networks.messaging.internal).toBe(true);
      expect(networks.monitoring.internal).toBe(true);
    });
    
    test('should use different subnets for network isolation', () => {
      const { networks } = dockerComposeConfig;
      const subnets = Object.values(networks).map((network: any) => 
        network.ipam?.config?.[0]?.subnet
      ).filter(Boolean);
      
      // All subnets should be unique
      const uniqueSubnets = new Set(subnets);
      expect(uniqueSubnets.size).toBe(subnets.length);
      
      // Should use private IP ranges
      subnets.forEach(subnet => {
        expect(subnet).toMatch(/^172\.(2[0-4])\.\d+\.\d+\/24$/);
      });
    });
    
    test('should configure network driver options', () => {
      const { networks } = dockerComposeConfig;
      
      // Frontend network should disable ICC
      expect(networks.frontend.driver_opts['com.docker.network.bridge.enable_icc']).toBe('false');
      
      // Backend networks should enable ICC for internal communication
      expect(networks.backend.driver_opts['com.docker.network.bridge.enable_icc']).toBe('true');
      expect(networks.database.driver_opts['com.docker.network.bridge.enable_icc']).toBe('true');
    });
  });
  
  describe('Secret Management', () => {
    test('should use external secrets', () => {
      Object.values(dockerComposeConfig.secrets).forEach((secret: any) => {
        expect(secret.external).toBe(true);
      });
    });
    
    test('should assign secrets to appropriate services', () => {
      const { services } = dockerComposeConfig;
      
      // API services should have app-level secrets
      ['graphql-api', 'rest-api', 'device-api'].forEach(serviceName => {
        const service = services[serviceName];
        expect(service.secrets).toContain('mytaptrack_mongodb_app_password');
        expect(service.secrets).toContain('mytaptrack_jwt_public_key');
        expect(service.secrets).toContain('mytaptrack_api_encryption_key');
        expect(service.secrets).not.toContain('mytaptrack_mongodb_root_password');
      });
      
      // Database services should have their own secrets
      expect(services.mongodb.secrets).toContain('mytaptrack_mongodb_root_password');
      expect(services.rabbitmq.secrets).toContain('mytaptrack_rabbitmq_admin_password');
      expect(services.redis.secrets).toContain('mytaptrack_redis_password');
    });
  });
  
  describe('Volume Security', () => {
    test('should configure secure volumes', () => {
      const { volumes } = dockerComposeConfig;
      
      expect(volumes.mongodb_data).toBeDefined();
      expect(volumes.rabbitmq_data).toBeDefined();
      expect(volumes.redis_data).toBeDefined();
      
      // Data volumes should use bind mounts with specific paths
      expect(volumes.mongodb_data.driver_opts.device).toBe('/var/lib/mytaptrack/mongodb');
      expect(volumes.rabbitmq_data.driver_opts.device).toBe('/var/lib/mytaptrack/rabbitmq');
      expect(volumes.redis_data.driver_opts.device).toBe('/var/lib/mytaptrack/redis');
    });
    
    test('should mount certificates as read-only', () => {
      const services = ['nginx-proxy', 'graphql-api', 'rest-api', 'device-api', 'data-processor', 'mongodb', 'rabbitmq', 'redis'];
      
      services.forEach(serviceName => {
        const service = dockerComposeConfig.services[serviceName];
        if (service.volumes) {
          const certVolumes = service.volumes.filter((volume: string) => 
            volume.includes('/etc/ssl/certs') || 
            volume.includes('/etc/ssl/private') || 
            volume.includes('/etc/ssl/ca')
          );
          
          certVolumes.forEach((volume: string) => {
            expect(volume).toMatch(/:ro$/);
          });
        }
      });
    });
  });
  
  describe('Resource Limits', () => {
    test('should define resource limits for all services', () => {
      Object.values(dockerComposeConfig.services).forEach((service: any) => {
        if (service.deploy?.resources?.limits) {
          expect(service.deploy.resources.limits.memory).toBeDefined();
          expect(service.deploy.resources.limits.cpus).toBeDefined();
        }
      });
    });
    
    test('should have appropriate resource limits', () => {
      const { services } = dockerComposeConfig;
      
      // API services should have moderate limits
      ['graphql-api', 'rest-api', 'device-api', 'data-processor'].forEach(serviceName => {
        const service = services[serviceName];
        expect(service.deploy.resources.limits.memory).toBe('512M');
        expect(service.deploy.resources.limits.cpus).toBe('0.5');
      });
      
      // Database should have higher limits
      expect(services.mongodb.deploy.resources.limits.memory).toBe('1G');
      expect(services.mongodb.deploy.resources.limits.cpus).toBe('1.0');
    });
    
    test('should define resource reservations', () => {
      Object.values(dockerComposeConfig.services).forEach((service: any) => {
        if (service.deploy?.resources?.reservations) {
          expect(service.deploy.resources.reservations.memory).toBeDefined();
          expect(service.deploy.resources.reservations.cpus).toBeDefined();
          
          // Reservations should be less than limits
          const limits = service.deploy.resources.limits;
          const reservations = service.deploy.resources.reservations;
          
          const limitMemory = parseInt(limits.memory.replace(/[GM]/, ''));
          const reservationMemory = parseInt(reservations.memory.replace(/[GM]/, ''));
          expect(reservationMemory).toBeLessThanOrEqual(limitMemory);
          
          expect(parseFloat(reservations.cpus)).toBeLessThanOrEqual(parseFloat(limits.cpus));
        }
      });
    });
  });
  
  describe('Health Checks', () => {
    test('should define health checks for all services', () => {
      const servicesWithHealthChecks = ['nginx-proxy', 'graphql-api', 'rest-api', 'device-api', 'mongodb', 'rabbitmq', 'redis'];
      
      servicesWithHealthChecks.forEach(serviceName => {
        const service = dockerComposeConfig.services[serviceName];
        expect(service.healthcheck).toBeDefined();
        expect(service.healthcheck.test).toBeDefined();
        expect(service.healthcheck.interval).toBeDefined();
        expect(service.healthcheck.timeout).toBeDefined();
        expect(service.healthcheck.retries).toBeDefined();
        expect(service.healthcheck.start_period).toBeDefined();
      });
    });
    
    test('should have reasonable health check intervals', () => {
      const servicesWithHealthChecks = ['nginx-proxy', 'graphql-api', 'rest-api', 'device-api', 'mongodb', 'rabbitmq', 'redis'];
      
      servicesWithHealthChecks.forEach(serviceName => {
        const service = dockerComposeConfig.services[serviceName];
        const healthcheck = service.healthcheck;
        
        expect(healthcheck.interval).toMatch(/^\d+s$/);
        expect(healthcheck.timeout).toMatch(/^\d+s$/);
        expect(healthcheck.start_period).toMatch(/^\d+s$/);
        
        const interval = parseInt(healthcheck.interval.replace('s', ''));
        const timeout = parseInt(healthcheck.timeout.replace('s', ''));
        
        expect(timeout).toBeLessThan(interval);
        expect(healthcheck.retries).toBeGreaterThan(0);
        expect(healthcheck.retries).toBeLessThan(10);
      });
    });
  });
  
  describe('Security Monitoring Services', () => {
    test('should configure Falco for runtime security', () => {
      const falco = dockerComposeConfig.services.falco;
      
      expect(falco.image).toBe('falcosecurity/falco:latest');
      expect(falco.privileged).toBe(true); // Required for Falco
      expect(falco.environment).toContain('FALCO_GRPC_ENABLED=true');
      
      // Should mount host paths for monitoring
      const hostMounts = falco.volumes.filter((volume: string) => 
        volume.startsWith('/var/run/docker.sock') ||
        volume.startsWith('/dev') ||
        volume.startsWith('/proc') ||
        volume.startsWith('/boot')
      );
      expect(hostMounts.length).toBeGreaterThan(0);
    });
    
    test('should configure Trivy scanner', () => {
      const trivy = dockerComposeConfig.services['trivy-scanner'];
      
      expect(trivy.image).toBe('aquasec/trivy:latest');
      expect(trivy.command).toContain('server');
      
      // Should mount Docker socket for scanning
      const dockerSocketMount = trivy.volumes.find((volume: string) => 
        volume.includes('/var/run/docker.sock')
      );
      expect(dockerSocketMount).toBeDefined();
      expect(dockerSocketMount).toMatch(/:ro$/);
    });
  });
  
  describe('TLS Configuration', () => {
    test('should configure TLS for database services', () => {
      const mongodb = dockerComposeConfig.services.mongodb;
      expect(mongodb.command).toContain('--tlsMode requireTLS');
      expect(mongodb.command).toContain('--tlsCertificateKeyFile');
      expect(mongodb.command).toContain('--tlsCAFile');
      
      const redis = dockerComposeConfig.services.redis;
      expect(redis.command).toContain('--tls-port 6380');
      expect(redis.command).toContain('--port 0'); // Disable non-TLS port
      expect(redis.command).toContain('--tls-cert-file');
      expect(redis.command).toContain('--tls-key-file');
    });
    
    test('should configure RabbitMQ SSL environment', () => {
      const rabbitmq = dockerComposeConfig.services.rabbitmq;
      
      expect(rabbitmq.environment).toContain('RABBITMQ_SSL_CACERTFILE=/etc/ssl/ca/ca.crt');
      expect(rabbitmq.environment).toContain('RABBITMQ_SSL_CERTFILE=/etc/ssl/certs/rabbitmq.crt');
      expect(rabbitmq.environment).toContain('RABBITMQ_SSL_KEYFILE=/etc/ssl/private/rabbitmq.key');
      expect(rabbitmq.environment).toContain('RABBITMQ_SSL_VERIFY=verify_peer');
      expect(rabbitmq.environment).toContain('RABBITMQ_SSL_FAIL_IF_NO_PEER_CERT=true');
    });
  });
  
  describe('Service Dependencies', () => {
    test('should define proper service dependencies', () => {
      const nginxProxy = dockerComposeConfig.services['nginx-proxy'];
      expect(nginxProxy.depends_on).toContain('graphql-api');
      expect(nginxProxy.depends_on).toContain('rest-api');
      expect(nginxProxy.depends_on).toContain('device-api');
    });
    
    test('should place services on appropriate networks', () => {
      const { services } = dockerComposeConfig;
      
      // Nginx should be on frontend network
      expect(services['nginx-proxy'].networks).toContain('frontend');
      
      // API services should be on frontend and backend
      ['graphql-api', 'rest-api', 'device-api'].forEach(serviceName => {
        expect(services[serviceName].networks).toContain('frontend');
        expect(services[serviceName].networks).toContain('backend');
      });
      
      // Database services should be on their respective networks
      expect(services.mongodb.networks).toContain('database');
      expect(services.rabbitmq.networks).toContain('messaging');
      expect(services.redis.networks).toContain('backend');
    });
  });
});