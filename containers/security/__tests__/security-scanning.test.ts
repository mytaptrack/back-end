/**
 * Security Scanning Configuration Tests
 * Tests vulnerability assessment and security monitoring
 */

import { describe, test, expect, beforeAll } from '@jest/globals';

describe('Security Scanning Configuration', () => {
  let scanningConfig: any;
  
  beforeAll(() => {
    scanningConfig = global.securityTestUtils.loadYamlConfig('security-scanning.yml');
  });
  
  describe('Configuration Structure', () => {
    test('should have valid configuration structure', () => {
      const validation = global.securityTestUtils.validateSecurityConfigStructure(scanningConfig);
      expect(validation.valid).toBe(true);
    });
    
    test('should define image scanning configuration', () => {
      expect(scanningConfig.image_scanning).toBeDefined();
      expect(scanningConfig.image_scanning.scanners).toBeDefined();
      expect(scanningConfig.image_scanning.scan_policies).toBeDefined();
    });
    
    test('should define runtime scanning configuration', () => {
      expect(scanningConfig.runtime_scanning).toBeDefined();
      expect(scanningConfig.runtime_scanning.runtime_scanners).toBeDefined();
    });
    
    test('should define compliance scanning configuration', () => {
      expect(scanningConfig.compliance_scanning).toBeDefined();
      expect(scanningConfig.compliance_scanning.benchmarks).toBeDefined();
    });
  });
  
  describe('Image Scanning Configuration', () => {
    test('should configure Trivy scanner', () => {
      const trivy = scanningConfig.image_scanning.scanners.trivy;
      
      expect(trivy.enabled).toBe(true);
      expect(trivy.image).toBe('aquasec/trivy:latest');
      expect(trivy.scan_types).toContain('vuln');
      expect(trivy.scan_types).toContain('config');
      expect(trivy.scan_types).toContain('secret');
      expect(trivy.scan_types).toContain('license');
    });
    
    test('should define severity levels', () => {
      const trivy = scanningConfig.image_scanning.scanners.trivy;
      
      expect(trivy.severity_levels).toContain('CRITICAL');
      expect(trivy.severity_levels).toContain('HIGH');
      expect(trivy.severity_levels).toContain('MEDIUM');
      expect(trivy.severity_levels).toContain('LOW');
    });
    
    test('should configure exit code policy', () => {
      const trivy = scanningConfig.image_scanning.scanners.trivy;
      const exitCodePolicy = trivy.exit_code_policy;
      
      expect(exitCodePolicy.critical).toBe(1);
      expect(exitCodePolicy.high).toBe(1);
      expect(exitCodePolicy.medium).toBe(0);
      expect(exitCodePolicy.low).toBe(0);
    });
    
    test('should support multiple scanners', () => {
      const scanners = scanningConfig.image_scanning.scanners;
      
      expect(scanners.trivy).toBeDefined();
      expect(scanners.clair).toBeDefined();
      expect(scanners.anchore).toBeDefined();
    });
  });
  
  describe('Scan Policies', () => {
    test('should define base image policies', () => {
      const baseImages = scanningConfig.image_scanning.scan_policies.base_images;
      
      expect(baseImages.allowed_registries).toBeDefined();
      expect(baseImages.prohibited_images).toBeDefined();
      expect(baseImages.required_labels).toBeDefined();
      
      expect(baseImages.allowed_registries).toContain('docker.io');
      expect(baseImages.prohibited_images).toContain('*:latest');
      expect(baseImages.required_labels).toContain('maintainer');
      expect(baseImages.required_labels).toContain('version');
    });
    
    test('should define vulnerability policies', () => {
      const vulnPolicies = scanningConfig.image_scanning.scan_policies.vulnerability_policies;
      
      expect(vulnPolicies.max_vulnerabilities).toBeDefined();
      expect(vulnPolicies.max_vulnerability_age).toBeDefined();
      expect(vulnPolicies.cve_exceptions).toBeDefined();
      
      expect(vulnPolicies.max_vulnerabilities.critical).toBe(0);
      expect(vulnPolicies.max_vulnerabilities.high).toBeLessThanOrEqual(10);
    });
    
    test('should define configuration policies', () => {
      const configPolicies = scanningConfig.image_scanning.scan_policies.config_policies;
      
      expect(configPolicies.dockerfile_checks).toBeDefined();
      expect(configPolicies.runtime_checks).toBeDefined();
      
      expect(configPolicies.dockerfile_checks).toContain('no_root_user');
      expect(configPolicies.dockerfile_checks).toContain('no_sudo');
      expect(configPolicies.dockerfile_checks).toContain('health_check_present');
      
      expect(configPolicies.runtime_checks).toContain('read_only_filesystem');
      expect(configPolicies.runtime_checks).toContain('no_privileged_mode');
      expect(configPolicies.runtime_checks).toContain('resource_limits_set');
    });
    
    test('should have CVE exception mechanism', () => {
      const vulnPolicies = scanningConfig.image_scanning.scan_policies.vulnerability_policies;
      const exceptions = vulnPolicies.cve_exceptions;
      
      expect(Array.isArray(exceptions)).toBe(true);
      
      if (exceptions.length > 0) {
        exceptions.forEach((exception: any) => {
          expect(exception.cve).toBeDefined();
          expect(exception.reason).toBeDefined();
          expect(exception.expires).toBeDefined();
        });
      }
    });
  });
  
  describe('Runtime Security Scanning', () => {
    test('should configure Falco for runtime monitoring', () => {
      const falco = scanningConfig.runtime_scanning.runtime_scanners.falco;
      
      expect(falco.enabled).toBe(true);
      expect(falco.image).toBe('falcosecurity/falco:latest');
      expect(falco.rules).toBeDefined();
      expect(falco.outputs).toBeDefined();
      
      expect(falco.rules).toContain('shell_in_container');
      expect(falco.rules).toContain('write_below_etc');
      expect(falco.rules).toContain('read_sensitive_file');
    });
    
    test('should configure runtime monitoring', () => {
      const runtimeMonitor = scanningConfig.runtime_scanning.runtime_scanners.runtime_monitor;
      
      expect(runtimeMonitor.enabled).toBe(true);
      expect(runtimeMonitor.process_monitoring).toBeDefined();
      expect(runtimeMonitor.network_monitoring).toBeDefined();
      expect(runtimeMonitor.filesystem_monitoring).toBeDefined();
    });
    
    test('should define process whitelists and blacklists', () => {
      const processMonitoring = scanningConfig.runtime_scanning.runtime_scanners.runtime_monitor.process_monitoring;
      
      expect(processMonitoring.whitelist_processes).toBeDefined();
      expect(processMonitoring.blacklist_processes).toBeDefined();
      
      expect(processMonitoring.whitelist_processes).toContain('node');
      expect(processMonitoring.whitelist_processes).toContain('mongod');
      expect(processMonitoring.whitelist_processes).toContain('rabbitmq-server');
      
      expect(processMonitoring.blacklist_processes).toContain('nc');
      expect(processMonitoring.blacklist_processes).toContain('netcat');
    });
    
    test('should configure network monitoring', () => {
      const networkMonitoring = scanningConfig.runtime_scanning.runtime_scanners.runtime_monitor.network_monitoring;
      
      expect(networkMonitoring.monitor_connections).toBe(true);
      expect(networkMonitoring.allowed_outbound_ports).toBeDefined();
      expect(networkMonitoring.blocked_outbound_ports).toBeDefined();
      
      expect(networkMonitoring.allowed_outbound_ports).toContain(80);
      expect(networkMonitoring.allowed_outbound_ports).toContain(443);
      expect(networkMonitoring.allowed_outbound_ports).toContain(53);
      
      expect(networkMonitoring.blocked_outbound_ports).toContain(22);
      expect(networkMonitoring.blocked_outbound_ports).toContain(23);
    });
    
    test('should configure filesystem monitoring', () => {
      const fsMonitoring = scanningConfig.runtime_scanning.runtime_scanners.runtime_monitor.filesystem_monitoring;
      
      expect(fsMonitoring.monitor_paths).toBeDefined();
      expect(fsMonitoring.ignore_paths).toBeDefined();
      
      expect(fsMonitoring.monitor_paths).toContain('/etc');
      expect(fsMonitoring.monitor_paths).toContain('/usr/bin');
      expect(fsMonitoring.monitor_paths).toContain('/bin');
      
      expect(fsMonitoring.ignore_paths).toContain('/tmp');
      expect(fsMonitoring.ignore_paths).toContain('/proc');
      expect(fsMonitoring.ignore_paths).toContain('/sys');
    });
  });
  
  describe('Compliance Scanning', () => {
    test('should configure CIS Docker Benchmark', () => {
      const cisDocker = scanningConfig.compliance_scanning.benchmarks.cis_docker;
      
      expect(cisDocker.enabled).toBe(true);
      expect(cisDocker.version).toBeDefined();
      expect(cisDocker.checks).toBeDefined();
      
      expect(cisDocker.checks).toContain('1.1.1');
      expect(cisDocker.checks).toContain('2.1');
      expect(cisDocker.checks).toContain('4.1');
      expect(cisDocker.checks).toContain('4.6');
    });
    
    test('should configure NIST Cybersecurity Framework', () => {
      const nistCsf = scanningConfig.compliance_scanning.benchmarks.nist_csf;
      
      expect(nistCsf.enabled).toBe(true);
      expect(nistCsf.functions).toBeDefined();
      
      expect(nistCsf.functions).toContain('identify');
      expect(nistCsf.functions).toContain('protect');
      expect(nistCsf.functions).toContain('detect');
      expect(nistCsf.functions).toContain('respond');
      expect(nistCsf.functions).toContain('recover');
    });
    
    test('should configure compliance reporting', () => {
      const reporting = scanningConfig.compliance_scanning.reporting;
      
      expect(reporting.enabled).toBe(true);
      expect(reporting.formats).toBeDefined();
      expect(reporting.schedule).toBeDefined();
      expect(reporting.storage).toBeDefined();
      
      expect(reporting.formats).toContain('json');
      expect(reporting.formats).toContain('html');
      expect(reporting.formats).toContain('pdf');
      
      expect(reporting.schedule).toMatch(/^[\d\*\-\/,\s]+$/); // Cron format
    });
  });
  
  describe('Security Automation', () => {
    test('should configure automated remediation', () => {
      const autoRemediation = scanningConfig.automation.auto_remediation;
      
      expect(autoRemediation.enabled).toBe(true);
      expect(autoRemediation.actions).toBeDefined();
      expect(autoRemediation.approval_workflows).toBeDefined();
    });
    
    test('should define remediation actions', () => {
      const actions = scanningConfig.automation.auto_remediation.actions;
      
      expect(actions.update_base_images).toBeDefined();
      expect(actions.patch_critical_vulns).toBeDefined();
      expect(actions.restart_risky_containers).toBeDefined();
      
      expect(actions.update_base_images.enabled).toBe(true);
      expect(actions.patch_critical_vulns.enabled).toBe(true);
      expect(actions.restart_risky_containers.enabled).toBe(false); // Should require approval
    });
    
    test('should configure CI/CD integration', () => {
      const cicdIntegration = scanningConfig.automation.cicd_integration;
      
      expect(cicdIntegration.pre_deployment).toBeDefined();
      expect(cicdIntegration.post_deployment).toBeDefined();
      
      expect(cicdIntegration.pre_deployment.enabled).toBe(true);
      expect(cicdIntegration.pre_deployment.triggers).toContain('pull_request');
      expect(cicdIntegration.pre_deployment.triggers).toContain('merge_to_main');
      
      expect(cicdIntegration.pre_deployment.block_deployment.critical_vulnerabilities).toBe(true);
      expect(cicdIntegration.pre_deployment.block_deployment.policy_violations).toBe(true);
    });
    
    test('should configure post-deployment monitoring', () => {
      const postDeployment = scanningConfig.automation.cicd_integration.post_deployment;
      
      expect(postDeployment.enabled).toBe(true);
      expect(postDeployment.monitoring_period).toBeDefined();
      expect(postDeployment.auto_rollback).toBeDefined();
      
      expect(postDeployment.auto_rollback.enabled).toBe(true);
      expect(postDeployment.auto_rollback.triggers).toContain('critical_vulnerability_detected');
      expect(postDeployment.auto_rollback.triggers).toContain('security_policy_violation');
    });
  });
  
  describe('Notification and Alerting', () => {
    test('should configure notification channels', () => {
      const channels = scanningConfig.notifications.channels;
      
      expect(channels.email).toBeDefined();
      expect(channels.slack).toBeDefined();
      expect(channels.pagerduty).toBeDefined();
      
      expect(channels.email.enabled).toBe(true);
      expect(channels.slack.enabled).toBe(true);
      expect(channels.pagerduty.enabled).toBe(true);
      
      expect(channels.email.recipients).toBeDefined();
      expect(channels.slack.webhook_url).toBeDefined();
      expect(channels.pagerduty.service_key).toBeDefined();
    });
    
    test('should define alert rules', () => {
      const alertRules = scanningConfig.notifications.alert_rules;
      
      expect(alertRules.critical_vulnerability).toBeDefined();
      expect(alertRules.high_vulnerability).toBeDefined();
      expect(alertRules.policy_violation).toBeDefined();
      expect(alertRules.compliance_failure).toBeDefined();
      
      expect(alertRules.critical_vulnerability.severity).toBe('critical');
      expect(alertRules.critical_vulnerability.immediate).toBe(true);
      
      expect(alertRules.high_vulnerability.delay).toBeDefined();
      expect(alertRules.policy_violation.delay).toBeDefined();
    });
  });
  
  describe('Reporting and Metrics', () => {
    test('should configure security metrics dashboard', () => {
      const dashboard = scanningConfig.reporting.dashboard;
      
      expect(dashboard.enabled).toBe(true);
      expect(dashboard.metrics).toBeDefined();
      expect(dashboard.refresh_interval).toBeDefined();
      
      expect(dashboard.metrics).toContain('vulnerabilities_by_severity');
      expect(dashboard.metrics).toContain('compliance_score');
      expect(dashboard.metrics).toContain('scan_coverage');
      expect(dashboard.metrics).toContain('remediation_time');
    });
    
    test('should configure security reports', () => {
      const reports = scanningConfig.reporting.reports;
      
      expect(reports.executive_summary).toBeDefined();
      expect(reports.technical_report).toBeDefined();
      expect(reports.compliance_report).toBeDefined();
      
      expect(reports.executive_summary.enabled).toBe(true);
      expect(reports.technical_report.enabled).toBe(true);
      expect(reports.compliance_report.enabled).toBe(true);
      
      // All reports should have schedules and recipients
      Object.values(reports).forEach((report: any) => {
        if (report.enabled) {
          expect(report.schedule).toBeDefined();
          expect(report.recipients).toBeDefined();
          expect(report.schedule).toMatch(/^[\d\*\-\/,\s]+$/); // Cron format
        }
      });
    });
  });
  
  describe('Scanner Configuration Validation', () => {
    test('should have reasonable vulnerability thresholds', () => {
      const maxVulns = scanningConfig.image_scanning.scan_policies.vulnerability_policies.max_vulnerabilities;
      
      expect(maxVulns.critical).toBe(0); // No critical vulnerabilities allowed
      expect(maxVulns.high).toBeLessThanOrEqual(10);
      expect(maxVulns.medium).toBeLessThanOrEqual(50);
      expect(maxVulns.low).toBeLessThanOrEqual(200);
    });
    
    test('should have reasonable vulnerability age limits', () => {
      const maxAge = scanningConfig.image_scanning.scan_policies.vulnerability_policies.max_vulnerability_age;
      
      expect(maxAge.critical).toMatch(/^\d+d$/);
      expect(maxAge.high).toMatch(/^\d+d$/);
      expect(maxAge.medium).toMatch(/^\d+d$/);
      
      // Critical vulnerabilities should have shorter age limits
      const criticalDays = parseInt(maxAge.critical.replace('d', ''));
      const highDays = parseInt(maxAge.high.replace('d', ''));
      const mediumDays = parseInt(maxAge.medium.replace('d', ''));
      
      expect(criticalDays).toBeLessThan(highDays);
      expect(highDays).toBeLessThan(mediumDays);
    });
    
    test('should validate Falco output configuration', () => {
      const falcoOutputs = scanningConfig.runtime_scanning.runtime_scanners.falco.outputs;
      
      expect(Array.isArray(falcoOutputs)).toBe(true);
      expect(falcoOutputs.length).toBeGreaterThan(0);
      
      falcoOutputs.forEach((output: any) => {
        expect(output.type).toBeDefined();
        
        if (output.type === 'file') {
          expect(output.file).toBeDefined();
        } else if (output.type === 'http') {
          expect(output.url).toBeDefined();
        }
      });
    });
  });
});