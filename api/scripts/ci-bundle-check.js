#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * CI/CD Bundle Size Check Script
 * Enforces bundle size limits and fails builds if exceeded
 */
class CIBundleCheck {
  constructor() {
    this.limits = {
      // AWS Lambda limits (in bytes)
      uncompressed: 250 * 1024 * 1024, // 250 MB
      compressed: 50 * 1024 * 1024,    // 50 MB
      // Target limits (more conservative)
      targetUncompressed: 50 * 1024 * 1024, // 50 MB
      targetCompressed: 10 * 1024 * 1024    // 10 MB
    };
    
    // CI configuration from environment
    this.config = {
      strictMode: process.env.CI_STRICT_BUNDLE_SIZE === 'true',
      failOnWarnings: process.env.CI_FAIL_ON_BUNDLE_WARNINGS === 'true',
      maxBundleSize: parseInt(process.env.CI_MAX_BUNDLE_SIZE) || this.limits.targetUncompressed,
      reportPath: process.env.CI_BUNDLE_REPORT_PATH || './bundle-size-report.json',
      artifactPath: process.env.CI_ARTIFACT_PATH || './ci-artifacts'
    };
  }

  /**
   * Run bundle size check for CI/CD
   */
  async runCheck() {
    console.log('🔍 Running CI/CD Bundle Size Check\n');
    console.log('='.repeat(80));
    
    // Ensure artifacts directory exists
    if (!fs.existsSync(this.config.artifactPath)) {
      fs.mkdirSync(this.config.artifactPath, { recursive: true });
    }
    
    let success = true;
    const results = {
      timestamp: new Date().toISOString(),
      config: this.config,
      checks: []
    };
    
    // Check webpack build if exists
    const webpackDir = path.join(__dirname, '../dist');
    if (fs.existsSync(webpackDir)) {
      console.log('📦 Checking webpack bundles...');
      const webpackResult = await this.checkBundles(webpackDir, 'webpack');
      results.checks.push(webpackResult);
      
      if (!webpackResult.passed) {
        success = false;
      }
    }
    
    // Check esbuild if exists
    const esbuildDir = path.join(__dirname, '../dist-esbuild');
    if (fs.existsSync(esbuildDir)) {
      console.log('\n⚡ Checking esbuild bundles...');
      const esbuildResult = await this.checkBundles(esbuildDir, 'esbuild');
      results.checks.push(esbuildResult);
      
      if (!esbuildResult.passed) {
        success = false;
      }
    }
    
    if (results.checks.length === 0) {
      console.error('❌ No build outputs found to check');
      success = false;
    }
    
    // Save CI results
    const ciReportPath = path.join(this.config.artifactPath, 'ci-bundle-check.json');
    fs.writeFileSync(ciReportPath, JSON.stringify(results, null, 2));
    
    // Generate CI summary
    this.generateCISummary(results);
    
    // Generate GitHub Actions annotations if in GitHub Actions
    if (process.env.GITHUB_ACTIONS) {
      this.generateGitHubAnnotations(results);
    }
    
    console.log(`\n📄 CI report saved to: ${ciReportPath}`);
    
    return success;
  }

  /**
   * Check bundles in a directory
   */
  async checkBundles(distDir, bundlerName) {
    const result = {
      bundler: bundlerName,
      directory: distDir,
      passed: true,
      violations: [],
      warnings: [],
      bundles: []
    };
    
    // Find all JS files
    const findJSFiles = (dir, files = []) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          findJSFiles(fullPath, files);
        } else if (item.endsWith('.js')) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const bundleFiles = findJSFiles(distDir);
    
    for (const bundlePath of bundleFiles) {
      const relativePath = path.relative(distDir, bundlePath);
      const size = this.getFileSize(bundlePath);
      
      const bundleResult = {
        path: relativePath,
        size,
        sizeFormatted: this.formatBytes(size),
        status: 'ok'
      };
      
      // Check against AWS limits (critical)
      if (size > this.limits.uncompressed) {
        bundleResult.status = 'critical';
        bundleResult.violation = `Exceeds AWS Lambda limit (${this.formatBytes(this.limits.uncompressed)})`;
        result.violations.push(bundleResult);
        result.passed = false;
        
        console.error(`🚨 CRITICAL: ${relativePath} - ${this.formatBytes(size)} exceeds AWS limit`);
      }
      // Check against target limits (warning/error based on config)
      else if (size > this.config.maxBundleSize) {
        bundleResult.status = this.config.failOnWarnings ? 'error' : 'warning';
        bundleResult.violation = `Exceeds target limit (${this.formatBytes(this.config.maxBundleSize)})`;
        
        if (this.config.failOnWarnings) {
          result.violations.push(bundleResult);
          result.passed = false;
          console.error(`❌ ERROR: ${relativePath} - ${this.formatBytes(size)} exceeds target limit`);
        } else {
          result.warnings.push(bundleResult);
          console.warn(`⚠️  WARNING: ${relativePath} - ${this.formatBytes(size)} exceeds target limit`);
        }
      } else {
        console.log(`✅ OK: ${relativePath} - ${this.formatBytes(size)}`);
      }
      
      result.bundles.push(bundleResult);
    }
    
    return result;
  }

  /**
   * Generate CI summary
   */
  generateCISummary(results) {
    console.log('\n📋 CI Bundle Check Summary\n');
    console.log('='.repeat(80));
    
    let totalViolations = 0;
    let totalWarnings = 0;
    let totalBundles = 0;
    
    results.checks.forEach(check => {
      console.log(`\n${check.bundler.toUpperCase()} Results:`);
      console.log(`   Bundles checked: ${check.bundles.length}`);
      console.log(`   Violations: ${check.violations.length}`);
      console.log(`   Warnings: ${check.warnings.length}`);
      console.log(`   Status: ${check.passed ? '✅ PASSED' : '❌ FAILED'}`);
      
      totalViolations += check.violations.length;
      totalWarnings += check.warnings.length;
      totalBundles += check.bundles.length;
    });
    
    console.log('\n📊 Overall Summary:');
    console.log(`   Total bundles: ${totalBundles}`);
    console.log(`   Total violations: ${totalViolations}`);
    console.log(`   Total warnings: ${totalWarnings}`);
    
    const overallPassed = results.checks.every(check => check.passed);
    console.log(`   Overall status: ${overallPassed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (totalViolations > 0) {
      console.log('\n🚨 Bundle Size Violations:');
      results.checks.forEach(check => {
        check.violations.forEach(violation => {
          console.log(`   ${check.bundler}: ${violation.path} - ${violation.violation}`);
        });
      });
    }
    
    if (totalWarnings > 0) {
      console.log('\n⚠️  Bundle Size Warnings:');
      results.checks.forEach(check => {
        check.warnings.forEach(warning => {
          console.log(`   ${check.bundler}: ${warning.path} - ${warning.violation}`);
        });
      });
    }
    
    console.log('\n='.repeat(80));
  }

  /**
   * Generate GitHub Actions annotations
   */
  generateGitHubAnnotations(results) {
    results.checks.forEach(check => {
      check.violations.forEach(violation => {
        console.log(`::error file=${violation.path}::Bundle size violation: ${violation.violation}`);
      });
      
      check.warnings.forEach(warning => {
        console.log(`::warning file=${warning.path}::Bundle size warning: ${warning.violation}`);
      });
    });
  }

  /**
   * Get file size in bytes
   */
  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Set up bundle size limits for PR checks
   */
  setupPRCheck() {
    console.log('🔧 Setting up PR bundle size check...');
    
    // Create GitHub workflow if it doesn't exist
    const workflowDir = path.join(process.cwd(), '.github/workflows');
    const workflowFile = path.join(workflowDir, 'bundle-size-check.yml');
    
    if (!fs.existsSync(workflowDir)) {
      fs.mkdirSync(workflowDir, { recursive: true });
    }
    
    if (!fs.existsSync(workflowFile)) {
      const workflowContent = `name: Bundle Size Check

on:
  pull_request:
    paths:
      - 'api/**'
      - 'business-logic/**'
  push:
    branches: [main, develop]

jobs:
  bundle-size-check:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: api/package-lock.json
      
      - name: Install dependencies
        run: |
          cd api
          npm ci
      
      - name: Build bundles
        run: |
          cd api
          npm run build:optimized -- --bundler both
      
      - name: Check bundle sizes
        run: |
          cd api
          node scripts/ci-bundle-check.js
        env:
          CI: true
          CI_FAIL_ON_BUNDLE_WARNINGS: false
          CI_MAX_BUNDLE_SIZE: 52428800  # 50MB
      
      - name: Upload bundle reports
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: bundle-reports
          path: |
            api/dist/bundle-size-report.json
            api/dist-esbuild/bundle-size-report.json
            api/ci-artifacts/
`;
      
      fs.writeFileSync(workflowFile, workflowContent);
      console.log(`✅ Created GitHub workflow: ${workflowFile}`);
    } else {
      console.log(`ℹ️  GitHub workflow already exists: ${workflowFile}`);
    }
  }
}

// CLI interface
const command = process.argv[2];
const checker = new CIBundleCheck();

switch (command) {
  case 'check':
    checker.runCheck().then(success => {
      process.exit(success ? 0 : 1);
    }).catch(error => {
      console.error('❌ CI bundle check failed:', error);
      process.exit(1);
    });
    break;
    
  case 'setup':
    checker.setupPRCheck();
    break;
    
  default:
    console.log('Usage:');
    console.log('  node ci-bundle-check.js check   - Run bundle size check for CI/CD');
    console.log('  node ci-bundle-check.js setup   - Set up GitHub Actions workflow');
    console.log('');
    console.log('Environment variables:');
    console.log('  CI_STRICT_BUNDLE_SIZE=true       - Enable strict mode');
    console.log('  CI_FAIL_ON_BUNDLE_WARNINGS=true  - Fail on warnings');
    console.log('  CI_MAX_BUNDLE_SIZE=<bytes>        - Custom size limit');
    console.log('  CI_ARTIFACT_PATH=<path>           - Artifact output path');
    process.exit(1);
}