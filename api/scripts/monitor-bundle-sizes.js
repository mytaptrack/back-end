#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Monitor Lambda bundle sizes and ensure they stay under AWS limits
 */
class BundleSizeMonitor {
  constructor() {
    this.limits = {
      // AWS Lambda limits (in bytes)
      uncompressed: 250 * 1024 * 1024, // 250 MB
      compressed: 50 * 1024 * 1024,    // 50 MB
      // Our target limits (more conservative for optimal performance)
      targetUncompressed: 50 * 1024 * 1024, // 50 MB
      targetCompressed: 10 * 1024 * 1024    // 10 MB
    };
    
    // Bundle size thresholds for different function types
    this.functionTypeThresholds = {
      'device/functions/api': 5 * 1024 * 1024,      // 5 MB for API functions
      'device/functions/events': 10 * 1024 * 1024,   // 10 MB for event handlers
      'device/functions/iot': 3 * 1024 * 1024,       // 3 MB for IoT handlers
      'migration': 20 * 1024 * 1024,                 // 20 MB for migration functions
      'default': 15 * 1024 * 1024                    // 15 MB default
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
   * Get compressed file size using gzip
   */
  getCompressedSize(filePath) {
    try {
      const content = fs.readFileSync(filePath);
      const compressed = zlib.gzipSync(content);
      return compressed.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Determine function type from path
   */
  getFunctionType(filePath) {
    const pathParts = filePath.split('/');
    
    if (pathParts.includes('migration')) {
      return 'migration';
    }
    
    if (pathParts.includes('device')) {
      if (pathParts.includes('api')) {
        return 'device/functions/api';
      } else if (pathParts.includes('events')) {
        return 'device/functions/events';
      } else if (pathParts.includes('iot')) {
        return 'device/functions/iot';
      }
    }
    
    return 'default';
  }

  /**
   * Get threshold for function type
   */
  getThresholdForFunction(filePath) {
    const functionType = this.getFunctionType(filePath);
    return this.functionTypeThresholds[functionType] || this.functionTypeThresholds.default;
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
  checkLimits(size, filePath, type = 'uncompressed') {
    const awsLimit = this.limits[type];
    const targetLimit = this.limits[`target${type.charAt(0).toUpperCase() + type.slice(1)}`];
    const functionThreshold = this.getThresholdForFunction(filePath);
    
    return {
      exceedsAWS: size > awsLimit,
      exceedsTarget: size > targetLimit,
      exceedsFunction: size > functionThreshold,
      awsLimit,
      targetLimit,
      functionThreshold,
      percentage: (size / targetLimit) * 100,
      functionPercentage: (size / functionThreshold) * 100
    };
  }

  /**
   * Analyze bundle sizes in dist directory
   */
  analyzeBundles(distDir = null) {
    const targetDir = distDir || path.join(__dirname, '../dist');
    
    if (!fs.existsSync(targetDir)) {
      console.log(`❌ Directory ${targetDir} not found. Run build first.`);
      return false;
    }

    console.log('📊 Lambda Bundle Size Analysis\n');
    console.log('='.repeat(80));

    const results = [];
    let hasViolations = false;
    let hasFunctionViolations = false;

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

    const bundleFiles = findJSFiles(targetDir);

    for (const bundlePath of bundleFiles) {
      const relativePath = path.relative(targetDir, bundlePath);
      const uncompressedSize = this.getFileSize(bundlePath);
      const compressedSize = this.getCompressedSize(bundlePath);
      
      const uncompressedLimits = this.checkLimits(uncompressedSize, relativePath, 'uncompressed');
      const compressedLimits = this.checkLimits(compressedSize, relativePath, 'compressed');

      const status = uncompressedLimits.exceedsAWS || compressedLimits.exceedsAWS ? '🚨' : 
                    uncompressedLimits.exceedsTarget || compressedLimits.exceedsTarget ? '⚠️' :
                    uncompressedLimits.exceedsFunction ? '🟡' : '✅';
      
      console.log(`${status} ${relativePath}`);
      console.log(`   Uncompressed: ${this.formatBytes(uncompressedSize)} (${uncompressedLimits.functionPercentage.toFixed(1)}% of function limit)`);
      console.log(`   Compressed: ${this.formatBytes(compressedSize)} (${compressedLimits.percentage.toFixed(1)}% of target)`);
      console.log(`   Compression ratio: ${((1 - compressedSize / uncompressedSize) * 100).toFixed(1)}%`);
      
      if (uncompressedLimits.exceedsAWS || compressedLimits.exceedsAWS) {
        console.log(`   ❌ EXCEEDS AWS LIMITS`);
        hasViolations = true;
      } else if (uncompressedLimits.exceedsTarget || compressedLimits.exceedsTarget) {
        console.log(`   ⚠️  Exceeds target limits`);
        hasViolations = true;
      } else if (uncompressedLimits.exceedsFunction) {
        console.log(`   🟡 Exceeds function-specific limit: ${this.formatBytes(uncompressedLimits.functionThreshold)}`);
        hasFunctionViolations = true;
      }
      
      console.log('');

      results.push({
        path: relativePath,
        uncompressedSize,
        compressedSize,
        uncompressedLimits,
        compressedLimits,
        functionType: this.getFunctionType(relativePath),
        status: uncompressedLimits.exceedsAWS || compressedLimits.exceedsAWS ? 'CRITICAL' : 
               uncompressedLimits.exceedsTarget || compressedLimits.exceedsTarget ? 'WARNING' :
               uncompressedLimits.exceedsFunction ? 'FUNCTION_WARNING' : 'OK'
      });
    }

    // Summary
    console.log('='.repeat(80));
    console.log('📋 Summary:');
    console.log(`   Total bundles: ${results.length}`);
    console.log(`   Critical (AWS limit exceeded): ${results.filter(r => r.status === 'CRITICAL').length}`);
    console.log(`   Warnings (Target limit exceeded): ${results.filter(r => r.status === 'WARNING').length}`);
    console.log(`   Function warnings: ${results.filter(r => r.status === 'FUNCTION_WARNING').length}`);
    console.log(`   OK: ${results.filter(r => r.status === 'OK').length}`);

    // Function type breakdown
    const functionTypes = {};
    results.forEach(r => {
      if (!functionTypes[r.functionType]) {
        functionTypes[r.functionType] = { count: 0, totalSize: 0, avgSize: 0 };
      }
      functionTypes[r.functionType].count++;
      functionTypes[r.functionType].totalSize += r.uncompressedSize;
    });

    console.log('\n📊 Function Type Breakdown:');
    Object.entries(functionTypes).forEach(([type, stats]) => {
      stats.avgSize = stats.totalSize / stats.count;
      console.log(`   ${type}: ${stats.count} functions, avg size: ${this.formatBytes(stats.avgSize)}`);
    });

    // Recommendations
    if (hasViolations || hasFunctionViolations) {
      console.log('\n💡 Optimization Recommendations:');
      console.log('   1. Use specific imports instead of barrel exports (import { specific } from "package")');
      console.log('   2. Check webpack/esbuild bundle analyzer report for large dependencies');
      console.log('   3. Split large functions into smaller, focused handlers');
      console.log('   4. Use dynamic imports for optional dependencies');
      console.log('   5. Externalize AWS SDK and other runtime-provided libraries');
      console.log('   6. Consider using esbuild for better tree-shaking');
      
      if (hasFunctionViolations) {
        console.log('   7. Review function-specific violations - consider refactoring large functions');
      }
    }

    // Save results to JSON for CI/CD
    const reportPath = path.join(targetDir, 'bundle-size-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      bundler: path.basename(targetDir).includes('esbuild') ? 'esbuild' : 'webpack',
      results,
      summary: {
        total: results.length,
        critical: results.filter(r => r.status === 'CRITICAL').length,
        warnings: results.filter(r => r.status === 'WARNING').length,
        functionWarnings: results.filter(r => r.status === 'FUNCTION_WARNING').length,
        ok: results.filter(r => r.status === 'OK').length
      },
      functionTypes,
      limits: this.limits,
      functionTypeThresholds: this.functionTypeThresholds
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

  /**
   * Generate optimization suggestions based on bundle analysis
   */
  generateOptimizationSuggestions(results) {
    const suggestions = [];
    
    // Find largest bundles
    const largestBundles = results
      .sort((a, b) => b.uncompressedSize - a.uncompressedSize)
      .slice(0, 5);
    
    if (largestBundles.length > 0) {
      suggestions.push({
        type: 'large_bundles',
        title: 'Largest Bundles Need Attention',
        description: 'These bundles are consuming the most space:',
        items: largestBundles.map(b => `${b.path}: ${this.formatBytes(b.uncompressedSize)}`)
      });
    }
    
    // Find bundles with poor compression
    const poorCompression = results
      .filter(r => {
        const compressionRatio = 1 - (r.compressedSize / r.uncompressedSize);
        return compressionRatio < 0.6; // Less than 60% compression
      })
      .sort((a, b) => {
        const aRatio = 1 - (a.compressedSize / a.uncompressedSize);
        const bRatio = 1 - (b.compressedSize / b.uncompressedSize);
        return aRatio - bRatio;
      });
    
    if (poorCompression.length > 0) {
      suggestions.push({
        type: 'poor_compression',
        title: 'Poor Compression Ratios',
        description: 'These bundles may contain non-compressible content or duplicated code:',
        items: poorCompression.slice(0, 3).map(b => {
          const ratio = ((1 - (b.compressedSize / b.uncompressedSize)) * 100).toFixed(1);
          return `${b.path}: ${ratio}% compression`;
        })
      });
    }
    
    // Function type specific suggestions
    const migrationFunctions = results.filter(r => r.functionType === 'migration');
    if (migrationFunctions.some(f => f.status !== 'OK')) {
      suggestions.push({
        type: 'migration_functions',
        title: 'Migration Functions Are Large',
        description: 'Migration functions can be larger, but consider:',
        items: [
          'Split complex migrations into multiple smaller functions',
          'Use streaming for large data transformations',
          'Consider running migrations outside of Lambda if very large'
        ]
      });
    }
    
    return suggestions;
  }

  /**
   * Check for CI/CD integration
   */
  checkForCIViolations(results) {
    const critical = results.filter(r => r.status === 'CRITICAL');
    const warnings = results.filter(r => r.status === 'WARNING');
    
    if (critical.length > 0) {
      console.error('\n🚨 CI/CD FAILURE: Critical bundle size violations detected!');
      critical.forEach(r => {
        console.error(`   ${r.path}: ${this.formatBytes(r.uncompressedSize)} exceeds AWS limits`);
      });
      return false;
    }
    
    if (warnings.length > 0) {
      console.warn('\n⚠️  CI/CD WARNING: Bundle size warnings detected!');
      warnings.forEach(r => {
        console.warn(`   ${r.path}: ${this.formatBytes(r.uncompressedSize)} exceeds target limits`);
      });
      
      // Allow warnings in CI but log them
      if (process.env.CI_STRICT_BUNDLE_SIZE === 'true') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Analyze both webpack and esbuild outputs if available
   */
  compareBundlers() {
    const webpackDir = path.join(__dirname, '../dist');
    const esbuildDir = path.join(__dirname, '../dist-esbuild');
    
    const webpackExists = fs.existsSync(webpackDir);
    const esbuildExists = fs.existsSync(esbuildDir);
    
    if (!webpackExists && !esbuildExists) {
      console.log('❌ No build outputs found. Run webpack or esbuild first.');
      return false;
    }
    
    console.log('🔄 Comparing Bundler Performance\n');
    console.log('='.repeat(80));
    
    const results = {};
    
    if (webpackExists) {
      console.log('📦 Webpack Analysis:');
      results.webpack = this.analyzeBundlesQuiet(webpackDir);
    }
    
    if (esbuildExists) {
      console.log('\n⚡ esbuild Analysis:');
      results.esbuild = this.analyzeBundlesQuiet(esbuildDir);
    }
    
    if (webpackExists && esbuildExists) {
      console.log('\n📊 Bundler Comparison:');
      this.compareBundlerResults(results.webpack, results.esbuild);
    }
    
    return true;
  }

  /**
   * Analyze bundles without detailed output
   */
  analyzeBundlesQuiet(targetDir) {
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

    const bundleFiles = findJSFiles(targetDir);
    const results = [];

    for (const bundlePath of bundleFiles) {
      const relativePath = path.relative(targetDir, bundlePath);
      const uncompressedSize = this.getFileSize(bundlePath);
      const compressedSize = this.getCompressedSize(bundlePath);
      
      results.push({
        path: relativePath,
        uncompressedSize,
        compressedSize
      });
    }

    const totalUncompressed = results.reduce((sum, r) => sum + r.uncompressedSize, 0);
    const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);
    
    console.log(`   Total bundles: ${results.length}`);
    console.log(`   Total uncompressed: ${this.formatBytes(totalUncompressed)}`);
    console.log(`   Total compressed: ${this.formatBytes(totalCompressed)}`);
    console.log(`   Average compression: ${((1 - totalCompressed / totalUncompressed) * 100).toFixed(1)}%`);
    
    return { results, totalUncompressed, totalCompressed };
  }

  /**
   * Compare results from different bundlers
   */
  compareBundlerResults(webpack, esbuild) {
    const webpackSavings = webpack.totalUncompressed - esbuild.totalUncompressed;
    const compressionDiff = (esbuild.totalCompressed / esbuild.totalUncompressed) - 
                           (webpack.totalCompressed / webpack.totalUncompressed);
    
    console.log(`   Size difference: ${webpackSavings > 0 ? 'esbuild smaller by' : 'webpack smaller by'} ${this.formatBytes(Math.abs(webpackSavings))}`);
    console.log(`   Compression difference: ${compressionDiff > 0 ? 'esbuild compresses better' : 'webpack compresses better'} by ${Math.abs(compressionDiff * 100).toFixed(1)}%`);
    
    if (Math.abs(webpackSavings) > 1024 * 1024) { // 1MB difference
      console.log(`   💡 Recommendation: Use ${webpackSavings > 0 ? 'esbuild' : 'webpack'} for better bundle sizes`);
    }
  }
}

// CLI interface
const command = process.argv[2];
const monitor = new BundleSizeMonitor();

switch (command) {
  case 'analyze':
    const distDir = process.argv[3];
    const success = monitor.analyzeBundles(distDir);
    
    // CI/CD integration
    if (process.env.CI) {
      const reportPath = path.join(distDir || path.join(__dirname, '../dist'), 'bundle-size-report.json');
      if (fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const ciSuccess = monitor.checkForCIViolations(report.results);
        process.exit(ciSuccess ? 0 : 1);
      }
    }
    
    process.exit(success ? 0 : 1);
    break;
  
  case 'compare':
    monitor.compareWithPrevious();
    break;
    
  case 'compare-bundlers':
    monitor.compareBundlers();
    break;
  
  default:
    console.log('Usage:');
    console.log('  node monitor-bundle-sizes.js analyze [dir]        - Analyze bundle sizes');
    console.log('  node monitor-bundle-sizes.js compare              - Compare with previous build');
    console.log('  node monitor-bundle-sizes.js compare-bundlers     - Compare webpack vs esbuild');
    console.log('');
    console.log('Environment variables:');
    console.log('  CI=true                      - Enable CI mode');
    console.log('  CI_STRICT_BUNDLE_SIZE=true   - Fail CI on warnings');
    process.exit(1);
}