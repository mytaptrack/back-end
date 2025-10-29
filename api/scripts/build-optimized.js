#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Optimized build script for Lambda functions
 * Supports both webpack and esbuild with bundle size monitoring
 */
class OptimizedBuilder {
  constructor() {
    this.bundlers = ['webpack', 'esbuild'];
    this.defaultBundler = 'webpack';
  }

  /**
   * Clean build directories
   */
  clean() {
    console.log('🧹 Cleaning build directories...');
    
    const dirsToClean = ['dist', 'dist-esbuild'];
    
    dirsToClean.forEach(dir => {
      const fullPath = path.join(__dirname, '..', dir);
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`   Cleaned ${dir}/`);
      }
    });
  }

  /**
   * Build with webpack
   */
  buildWebpack() {
    console.log('📦 Building with webpack...');
    
    try {
      execSync('npm run build:webpack', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('✅ Webpack build completed');
      return true;
    } catch (error) {
      console.error('❌ Webpack build failed:', error.message);
      return false;
    }
  }

  /**
   * Build with esbuild
   */
  buildEsbuild() {
    console.log('⚡ Building with esbuild...');
    
    try {
      execSync('node esbuild.config.js build', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('✅ esbuild build completed');
      return true;
    } catch (error) {
      console.error('❌ esbuild build failed:', error.message);
      return false;
    }
  }

  /**
   * Analyze bundle sizes
   */
  analyzeBundles(bundler) {
    console.log(`📊 Analyzing ${bundler} bundle sizes...`);
    
    try {
      const distDir = bundler === 'esbuild' ? 'dist-esbuild' : 'dist';
      execSync(`node scripts/monitor-bundle-sizes.js analyze ${distDir}`, { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      return true;
    } catch (error) {
      console.error(`❌ Bundle analysis failed for ${bundler}:`, error.message);
      return false;
    }
  }

  /**
   * Compare bundlers
   */
  compareBundlers() {
    console.log('🔄 Comparing bundler performance...');
    
    try {
      execSync('node scripts/monitor-bundle-sizes.js compare-bundlers', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      return true;
    } catch (error) {
      console.error('❌ Bundler comparison failed:', error.message);
      return false;
    }
  }

  /**
   * Generate optimization report
   */
  generateOptimizationReport() {
    console.log('📄 Generating optimization report...');
    
    const reports = [];
    
    // Check for webpack report
    const webpackReportPath = path.join(__dirname, '../dist/bundle-size-report.json');
    if (fs.existsSync(webpackReportPath)) {
      const webpackReport = JSON.parse(fs.readFileSync(webpackReportPath, 'utf8'));
      reports.push({ bundler: 'webpack', ...webpackReport });
    }
    
    // Check for esbuild report
    const esbuildReportPath = path.join(__dirname, '../dist-esbuild/bundle-size-report.json');
    if (fs.existsSync(esbuildReportPath)) {
      const esbuildReport = JSON.parse(fs.readFileSync(esbuildReportPath, 'utf8'));
      reports.push({ bundler: 'esbuild', ...esbuildReport });
    }
    
    if (reports.length === 0) {
      console.log('❌ No bundle reports found');
      return false;
    }
    
    // Generate combined report
    const combinedReport = {
      timestamp: new Date().toISOString(),
      reports,
      recommendations: this.generateRecommendations(reports)
    };
    
    const outputPath = path.join(__dirname, '../optimization-report.json');
    fs.writeFileSync(outputPath, JSON.stringify(combinedReport, null, 2));
    
    console.log(`✅ Optimization report saved to: ${outputPath}`);
    
    // Print summary
    this.printOptimizationSummary(combinedReport);
    
    return true;
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(reports) {
    const recommendations = [];
    
    // Find the best bundler
    if (reports.length > 1) {
      const webpackReport = reports.find(r => r.bundler === 'webpack');
      const esbuildReport = reports.find(r => r.bundler === 'esbuild');
      
      if (webpackReport && esbuildReport) {
        const webpackTotal = webpackReport.results.reduce((sum, r) => sum + r.uncompressedSize, 0);
        const esbuildTotal = esbuildReport.results.reduce((sum, r) => sum + r.uncompressedSize, 0);
        
        const savings = Math.abs(webpackTotal - esbuildTotal);
        const betterBundler = webpackTotal < esbuildTotal ? 'webpack' : 'esbuild';
        
        if (savings > 1024 * 1024) { // 1MB difference
          recommendations.push({
            type: 'bundler_choice',
            priority: 'high',
            title: `Use ${betterBundler} for better bundle sizes`,
            description: `${betterBundler} produces bundles that are ${this.formatBytes(savings)} smaller on average`,
            impact: 'bundle_size'
          });
        }
      }
    }
    
    // Find functions that exceed limits
    reports.forEach(report => {
      const violations = report.results.filter(r => r.status === 'CRITICAL' || r.status === 'WARNING');
      
      violations.forEach(violation => {
        recommendations.push({
          type: 'size_violation',
          priority: violation.status === 'CRITICAL' ? 'critical' : 'high',
          title: `Optimize ${violation.path}`,
          description: `Bundle size: ${this.formatBytes(violation.uncompressedSize)}`,
          suggestions: [
            'Use specific imports instead of barrel exports',
            'Split function into smaller handlers',
            'Use dynamic imports for optional dependencies',
            'Review dependencies for unused code'
          ],
          impact: 'bundle_size'
        });
      });
    });
    
    return recommendations;
  }

  /**
   * Print optimization summary
   */
  printOptimizationSummary(report) {
    console.log('\n📋 Optimization Summary\n');
    console.log('='.repeat(80));
    
    report.reports.forEach(bundlerReport => {
      console.log(`\n${bundlerReport.bundler.toUpperCase()} Results:`);
      console.log(`   Total bundles: ${bundlerReport.summary.total}`);
      console.log(`   Critical issues: ${bundlerReport.summary.critical}`);
      console.log(`   Warnings: ${bundlerReport.summary.warnings}`);
      console.log(`   OK: ${bundlerReport.summary.ok}`);
    });
    
    if (report.recommendations.length > 0) {
      console.log('\n💡 Top Recommendations:');
      report.recommendations
        .sort((a, b) => {
          const priorityOrder = { critical: 3, high: 2, medium: 1, low: 0 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        })
        .slice(0, 5)
        .forEach((rec, index) => {
          const priority = rec.priority === 'critical' ? '🚨' : 
                          rec.priority === 'high' ? '⚠️' : '💡';
          console.log(`   ${index + 1}. ${priority} ${rec.title}`);
          console.log(`      ${rec.description}`);
        });
    }
    
    console.log('\n='.repeat(80));
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
   * Main build process
   */
  async build(options = {}) {
    const { 
      bundler = this.defaultBundler, 
      clean = true, 
      analyze = true, 
      compare = false,
      report = true 
    } = options;
    
    console.log('🚀 Starting optimized Lambda build process...\n');
    
    // Clean if requested
    if (clean) {
      this.clean();
    }
    
    let success = true;
    
    // Build with specified bundler
    if (bundler === 'both') {
      success = this.buildWebpack() && this.buildEsbuild();
    } else if (bundler === 'webpack') {
      success = this.buildWebpack();
    } else if (bundler === 'esbuild') {
      success = this.buildEsbuild();
    } else {
      console.error(`❌ Unknown bundler: ${bundler}`);
      return false;
    }
    
    if (!success) {
      console.error('❌ Build failed');
      return false;
    }
    
    // Analyze bundles
    if (analyze) {
      if (bundler === 'both') {
        this.analyzeBundles('webpack');
        this.analyzeBundles('esbuild');
      } else {
        this.analyzeBundles(bundler);
      }
    }
    
    // Compare bundlers
    if (compare && bundler === 'both') {
      this.compareBundlers();
    }
    
    // Generate optimization report
    if (report) {
      this.generateOptimizationReport();
    }
    
    console.log('\n✅ Build process completed successfully!');
    return true;
  }
}

// CLI interface
const args = process.argv.slice(2);
const builder = new OptimizedBuilder();

// Parse command line arguments
const options = {
  bundler: 'webpack',
  clean: true,
  analyze: true,
  compare: false,
  report: true
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  switch (arg) {
    case '--bundler':
      options.bundler = args[++i] || 'webpack';
      break;
    case '--no-clean':
      options.clean = false;
      break;
    case '--no-analyze':
      options.analyze = false;
      break;
    case '--compare':
      options.compare = true;
      break;
    case '--no-report':
      options.report = false;
      break;
    case '--help':
      console.log('Usage: node build-optimized.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  --bundler <webpack|esbuild|both>  Choose bundler (default: webpack)');
      console.log('  --no-clean                        Skip cleaning build directories');
      console.log('  --no-analyze                      Skip bundle size analysis');
      console.log('  --compare                         Compare bundlers (requires --bundler both)');
      console.log('  --no-report                       Skip optimization report generation');
      console.log('  --help                            Show this help message');
      process.exit(0);
      break;
    default:
      if (arg.startsWith('--')) {
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
      }
  }
}

// Run the build
builder.build(options).then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Build process failed:', error);
  process.exit(1);
});