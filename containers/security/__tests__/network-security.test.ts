/**
 * Network Security Configuration Tests
 * Tests network isolation, firewall rules, and security policies
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

describe('Network Security Configuration', () => {
  let networkConfig: any;
  
  beforeAll(() => {
    networkConfig = global.securityTestUtils.loadYamlConfig('network-security.yml');
  });
  
  describe('Network Configuration Structure', () => {
    test('should have valid configuration structure', () => {
      const validation = global.securityTestUtils.validateSecurityConfigStructure(networkConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
    
    test('should define all required networks', () => {
      expect(networkConfig.networks).toBeDefined();
      expect(networkConfig.networks.frontend).toBeDefined();
      expect(networkConfig.networks.backend).toBeDefined();
      expect(networkConfig.networks.database).toBeDefined();
      expect(networkConfig.networks.messaging).toBeDefined();
    });
    
    test('should have proper network isolation', () => {
      const { networks } = networkConfig;
      
      // Frontend network should allow external access
      expect(networks.frontend.internal).toBeUndefined();
      
      // Backend networks should be internal
      expect(networks.backend.internal).toBe(true);
      expect(networks.database.internal).toBe(true);
      expect(networks.messaging.internal).toBe(true);
    });
  });
  
  describe('Network Isolation', () => {
    test('should configure proper subnet isolation', () => {
      const { networks } = networkConfig;
      
      expect(networks.frontend).toHaveValidNetworkConfig();
      expect(networks.backend).toHaveValidNetworkConfig();
      expect(networks.database).toHaveValidNetworkConfig();
      expect(networks.messaging).toHaveValidNetworkConfig();
    });
    
    test('should use different subnets for each network', () => {
      const { networks } = networkConfig;
      const subnets = Object.values(networks).map((network: any) => 
        network.ipam?.config?.[0]?.subnet
      ).filter(Boolean);
      
      // All subnets should be unique
      const uniqueSubnets = new Set(subnets);
      expect(uniqueSubnets.size).toBe(subnets.length);
    });
    
    test('should disable inter-container communication where appropriate', () => {
      const { networks } = networkConfig;
      
      // Frontend network should disable ICC for security
      expect(networks.frontend.driver_opts['com.docker.network.bridge.enable_icc']).toBe('false');
      
      // Backend networks can enable ICC for internal communication
      expect(networks.backend.driver_opts['com.docker.network.bridge.enable_icc']).toBe('true');
    });
  });
  
  describe('Security Policies', () => {
    test('should define security policies', () => {
      expect(networkConfig.security_policies).toBeDefined();
      expect(networkConfig.security_policies.api_to_backend).toBeDefined();
      expect(networkConfig.security_policies.backend_to_database).toBeDefined();
      expect(networkConfig.security_policies.backend_to_messaging).toBeDefined();
      expect(networkConfig.security_policies.default_deny).toBeDefined();
    });
    
    test('should implement default deny policy', () => {
      const defaultDeny = networkConfig.security_policies.default_deny;
      expect(defaultDeny.action).toBe('deny');
      expect(defaultDeny.log).toBe(true);
    });
    
    test('should allow only necessary communication', () => {
      const apiToBackend = networkConfig.security_policies.api_to_backend;
      expect(apiToBackend).toHaveLength(1);
      expect(apiToBackend[0].source).toBe('frontend');
      expect(apiToBackend[0].destination).toBe('backend');
      expect(apiToBackend[0].ports).toEqual([3000, 4000, 5000]);
    });
  });
  
  describe('Firewall Rules', () => {
    test('should define firewall rules', () => {
      expect(networkConfig.firewall_rules).toBeDefined();
      expect(networkConfig.firewall_rules.input_rules).toBeDefined();
      expect(networkConfig.firewall_rules.forward_rules).toBeDefined();
      expect(networkConfig.firewall_rules.output_rules).toBeDefined();
    });
    
    test('should have secure input rules', () => {
      const inputRules = networkConfig.firewall_rules.input_rules;
      
      // Should allow established connections
      expect(inputRules.some((rule: string) => 
        rule.includes('ESTABLISHED,RELATED')
      )).toBe(true);
      
      // Should allow loopback
      expect(inputRules.some((rule: string) => 
        rule.includes('-i lo -j ACCEPT')
      )).toBe(true);
      
      // Should drop all other input by default
      expect(inputRules.some((rule: string) => 
        rule.includes('-A INPUT -j DROP')
      )).toBe(true);
    });
    
    test('should allow only necessary ports', () => {
      const inputRules = networkConfig.firewall_rules.input_rules;
      
      // Should allow HTTP/HTTPS
      expect(inputRules.some((rule: string) => 
        rule.includes('--dport 80')
      )).toBe(true);
      expect(inputRules.some((rule: string) => 
        rule.includes('--dport 443')
      )).toBe(true);
    });
  });
  
  describe('Container Security', () => {
    test('should define container security constraints', () => {
      expect(networkConfig.container_security).toBeDefined();
      expect(networkConfig.container_security.default_security_opts).toBeDefined();
      expect(networkConfig.container_security.cap_drop).toBeDefined();
      expect(networkConfig.container_security.cap_add).toBeDefined();
    });
    
    test('should have secure default options', () => {
      const securityOpts = networkConfig.container_security.default_security_opts;
      expect(securityOpts).toContain('no-new-privileges:true');
    });
    
    test('should drop dangerous capabilities', () => {
      const capDrop = networkConfig.container_security.cap_drop;
      expect(capDrop).toContain('ALL');
    });
    
    test('should add only necessary capabilities', () => {
      const capAdd = networkConfig.container_security.cap_add;
      const allowedCaps = ['CHOWN', 'SETGID', 'SETUID', 'NET_BIND_SERVICE'];
      
      capAdd.forEach((cap: string) => {
        expect(allowedCaps).toContain(cap);
      });
    });
    
    test('should enable user namespace remapping', () => {
      const userNamespace = networkConfig.container_security.user_namespace;
      expect(userNamespace.enabled).toBe(true);
      expect(userNamespace.uid_map).toBeDefined();
      expect(userNamespace.gid_map).toBeDefined();
    });
  });
  
  describe('Resource Limits', () => {
    test('should define resource limits', () => {
      expect(networkConfig.resource_limits).toBeDefined();
      expect(networkConfig.resource_limits.memory_limits).toBeDefined();
      expect(networkConfig.resource_limits.cpu_limits).toBeDefined();
    });
    
    test('should have appropriate memory limits', () => {
      const memoryLimits = networkConfig.resource_limits.memory_limits;
      
      expect(memoryLimits.api_services).toBeDefined();
      expect(memoryLimits.database_services).toBeDefined();
      expect(memoryLimits.message_broker).toBeDefined();
      
      // Database services should have higher memory limits
      expect(memoryLimits.database_services).toBe('1g');
      expect(memoryLimits.api_services).toBe('512m');
    });
    
    test('should have CPU limits', () => {
      const cpuLimits = networkConfig.resource_limits.cpu_limits;
      
      expect(cpuLimits.api_services).toBeDefined();
      expect(cpuLimits.database_services).toBeDefined();
      expect(cpuLimits.message_broker).toBeDefined();
      
      // All CPU limits should be reasonable
      expect(parseFloat(cpuLimits.api_services)).toBeLessThanOrEqual(1.0);
      expect(parseFloat(cpuLimits.database_services)).toBeLessThanOrEqual(2.0);
    });
    
    test('should prevent fork bombs', () => {
      expect(networkConfig.resource_limits.pids_limit).toBeDefined();
      expect(networkConfig.resource_limits.pids_limit).toBeGreaterThan(0);
      expect(networkConfig.resource_limits.pids_limit).toBeLessThan(1000);
    });
    
    test('should limit file descriptors', () => {
      const ulimits = networkConfig.resource_limits.ulimits;
      expect(ulimits.nofile).toBeDefined();
      expect(ulimits.nproc).toBeDefined();
      
      expect(ulimits.nofile).toBeGreaterThan(0);
      expect(ulimits.nproc).toBeGreaterThan(0);
    });
  });
  
  describe('Network Security Validation', () => {
    test('should validate subnet ranges', () => {
      const { networks } = networkConfig;
      
      Object.values(networks).forEach((network: any) => {
        const subnet = network.ipam?.config?.[0]?.subnet;
        if (subnet) {
          // Should be private IP ranges
          expect(subnet).toMatch(/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/);
        }
      });
    });
    
    test('should not overlap with common network ranges', () => {
      const { networks } = networkConfig;
      const subnets = Object.values(networks).map((network: any) => 
        network.ipam?.config?.[0]?.subnet
      ).filter(Boolean);
      
      // Should not use Docker's default bridge network
      expect(subnets).not.toContain('172.17.0.0/16');
      
      // Should not use common host networks
      expect(subnets).not.toContain('192.168.1.0/24');
      expect(subnets).not.toContain('10.0.0.0/24');
    });
  });
});