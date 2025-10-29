#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Monitor Lambda bundle sizes and ensure they stay under AWS limits
 */
class BundleSizeMonitor {
  constructor() {
    this.limits = {
      // AWS Lambda limits (in bytes)
      uncompressed: 250 * 1024 * 1024, // 250 MB
      compressed: 50 * 1024 * 1024,    // 50 MB
      // Our target limits (more conservative)
      targetUncompressed: 100 * 1024 * 1024, // 100 MB
      targetCompressed: 20 * 1024 * 1024     // 20 MB
    };
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
   * Check if size exceeds limits
   */
  checkLimits(size, type = 'uncompressed') {
    const awsLimit = this.limits[type];
    const targetLimit = this.limits[`target${type.charAt(0).toUpperCase() + type.slice(1)}`];
    
    return {
      exceedsAWS: size > awsLimit,
      exceedsTarget: size > targetLimit,
      awsLimit,
      targetLimit,
      percentage: (size / targetLimit) * 100
    };
  }

  /**
   * Analyze bundle sizes in dist directory
   */
  analyzeBundles() {
    const distDir = path.join(__dirname, '../dist');
    
    if (!fs.existsSync(distDir)) {
      console.log('❌ Dist directory not found. Run webpack build first.');
      return false;
    }

    console.log('📊 Lambda Bundle Size Analysis\n');
    console.log('='.repeat(80));

    const results = [];
    let hasViolations = false;

    // Recursively find all .js files in dist
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
      const limits = this.checkLimits(size);

      const status = limits.exceedsAWS ? '🚨' : limits.exceedsTarget ? '⚠️' : '✅';
      
      console.log(`${status} ${relativePath}`);
      console.log(`   Size: ${this.formatBytes(size)} (${limits.percentage.toFixed(1)}% of target)`);
      
      if (limits.exceedsAWS) {
        console.log(`   ❌ EXCEEDS AWS LIMIT: ${this.formatBytes(limits.awsLimit)}`);
        hasViolations = true;
      } else if (limits.exceedsTarget) {
        console.log(`   ⚠️  Exceeds target limit: ${this.formatBytes(limits.targetLimit)}`);
        hasViolations = true;
      }
      
      console.log('');

      results.push({
        path: relativePath,
        size,
        limits,
        status: limits.exceedsAWS ? 'CRITICAL' : limits.exceedsTarget ? 'WARNING' : 'OK'
      });
    }

    // Summary
    console.log('='.repeat(80));
    console.log('📋 Summary:');
    console.log(`   Total bundles: ${results.length}`);
    console.log(`   Critical (AWS limit exceeded): ${results.filter(r => r.status === 'CRITICAL').length}`);
    console.log(`   Warnings (Target limit exceeded): ${results.filter(r => r.status === 'WARNING').length}`);
    console.log(`   OK: ${results.filter(r => r.status === 'OK').length}`);

    // Recommendations
    if (hasViolations) {
      console.log('\n💡 Optimization Recommendations:');
      console.log('   1. Check webpack bundle analyzer report (bundle-report.html)');
      console.log('   2. Ensure tree-shaking is working properly');
      console.log('   3. Split large functions into smaller, focused handlers');
      console.log('   4. Use dynamic imports for optional dependencies');
      console.log('   5. Externalize AWS SDK and other runtime-provided libraries');
    }

    // Save results to JSON for CI/CD
    const reportPath = path.join(distDir, 'bundle-size-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
      summary: {
        total: results.length,
        critical: results.filter(r => r.status === 'CRITICAL').length,
        warnings: results.filter(r => r.status === 'WARNING').length,
        ok: results.filter(r => r.status === 'OK').length
      },
      limits: this.limits
    }, null, 2));

    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    return !hasViolations;
  }

  /**
   * Compare with previous build
   */
  compareWithPrevious() {
    const reportPath = path.join(__dirname, '../dist/bundle-size-report.json');
    const previousReportPath = path.join(__dirname, '../dist/bundle-size-report.previous.json');

    if (!fs.existsSync(reportPath)) {
      console.log('❌ No current report found. Run analysis first.');
      return;
    }

    if (!fs.existsSync(previousReportPath)) {
      console.log('ℹ️  No previous report found for comparison.');
      return;
    }

    const current = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const previous = JSON.parse(fs.readFileSync(previousReportPath, 'utf8'));

    console.log('\n📈 Bundle Size Comparison\n');
    console.log('='.repeat(80));

    for (const currentBundle of current.results) {
      const previousBundle = previous.results.find(p => p.path === currentBundle.path);
      
      if (!previousBundle) {
        console.log(`🆕 ${currentBundle.path} (NEW)`);
        console.log(`   Size: ${this.formatBytes(currentBundle.size)}`);
        continue;
      }

      const sizeDiff = currentBundle.size - previousBundle.size;
      const percentDiff = ((sizeDiff / previousBundle.size) * 100);
      
      const trend = sizeDiff > 0 ? '📈' : sizeDiff < 0 ? '📉' : '➡️';
      const diffStr = sizeDiff !== 0 ? ` (${sizeDiff > 0 ? '+' : ''}${this.formatBytes(sizeDiff)}, ${percentDiff > 0 ? '+' : ''}${percentDiff.toFixed(1)}%)` : '';
      
      console.log(`${trend} ${currentBundle.path}`);
      console.log(`   Size: ${this.formatBytes(currentBundle.size)}${diffStr}`);
      
      if (Math.abs(percentDiff) > 10) {
        console.log(`   ⚠️  Significant size change detected!`);
      }
      
      console.log('');
    }
  }
}

// CLI interface
const command = process.argv[2];
const monitor = new BundleSizeMonitor();

switch (command) {
  case 'analyze':
    const success = monitor.analyzeBundles();
    process.exit(success ? 0 : 1);
    break;
  
  case 'compare':
    monitor.compareWithPrevious();
    break;
  
  default:
    console.log('Usage:');
    console.log('  node monitor-bundle-sizes.js analyze   - Analyze current bundle sizes');
    console.log('  node monitor-bundle-sizes.js compare   - Compare with previous build');
    process.exit(1);
}