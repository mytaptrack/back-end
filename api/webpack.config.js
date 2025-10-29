const path = require('path');
const webpack = require('webpack');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

// AWS Lambda size limits (in bytes)
const LAMBDA_LIMITS = {
  uncompressed: 250 * 1024 * 1024, // 250 MB
  compressed: 50 * 1024 * 1024,    // 50 MB
  // Target limits (more conservative for optimal performance)
  targetUncompressed: 50 * 1024 * 1024, // 50 MB
  targetCompressed: 10 * 1024 * 1024    // 10 MB
};

// Custom plugin to enforce bundle size limits
class BundleSizeLimitPlugin {
  constructor(options = {}) {
    this.limits = { ...LAMBDA_LIMITS, ...options };
  }

  apply(compiler) {
    compiler.hooks.afterEmit.tap('BundleSizeLimitPlugin', (compilation) => {
      const assets = compilation.assets;
      let hasViolations = false;

      Object.keys(assets).forEach(assetName => {
        if (assetName.endsWith('.js')) {
          const asset = assets[assetName];
          const size = asset.size();
          
          if (size > this.limits.targetUncompressed) {
            console.warn(`⚠️  Bundle ${assetName} (${this.formatBytes(size)}) exceeds target limit (${this.formatBytes(this.limits.targetUncompressed)})`);
            hasViolations = true;
          }
          
          if (size > this.limits.uncompressed) {
            console.error(`🚨 Bundle ${assetName} (${this.formatBytes(size)}) exceeds AWS Lambda limit (${this.formatBytes(this.limits.uncompressed)})`);
            hasViolations = true;
          }
        }
      });

      if (hasViolations) {
        console.log('\n💡 Bundle size optimization recommendations:');
        console.log('   1. Use more specific imports from business logic packages');
        console.log('   2. Split large functions into smaller, focused handlers');
        console.log('   3. Use dynamic imports for optional dependencies');
        console.log('   4. Check webpack bundle analyzer report for large dependencies');
      }
    });
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = {
  target: 'node',
  mode: 'production',
  entry: {
    // Device API functions - only import device operations
    'device/functions/api/dataPut': './src/device/functions/api/dataPut.ts',
    'device/functions/api/audioPut': './src/device/functions/api/audioPut.ts',
    'device/functions/api/firmwarePost': './src/device/functions/api/firmwarePost.ts',
    'device/functions/api/timeGet': './src/device/functions/api/timeGet.ts',
    'device/functions/api/wifiPing': './src/device/functions/api/wifiPing.ts',
    
    // App API functions - only import app operations
    'device/functions/appApi/appDelete': './src/device/functions/appApi/appDelete.ts',
    'device/functions/appApi/appTokenRetrieve': './src/device/functions/appApi/appTokenRetrieve.ts',
    
    // Event handlers - import specific operations based on function
    'device/functions/events/patternEventNotification': './src/device/functions/events/patternEventNotification.ts',
    'device/functions/events/notesNotification': './src/device/functions/events/notesNotification.ts',
    'device/functions/events/singleEventNotification': './src/device/functions/events/singleEventNotification.ts',
    'device/functions/events/ensureResponseUpdateStatus': './src/device/functions/events/ensureResponseUpdateStatus.ts',
    
    // Processing functions
    'device/functions/processing/device-identity-reset': './src/device/functions/processing/device-identity-reset.ts',
    
    // IoT handlers
    'device/functions/iot/handlers/click': './src/device/functions/iot/handlers/click.ts',
    
    // Server functions
    'device/functions/server/getAuthConfig': './src/device/functions/server/getAuthConfig.ts',
    
    // Migration functions
    'migration/migrateApps': './src/migration/migrateApps.ts',
    'migration/migrateReports': './src/migration/migrateReports.ts',
    'migration/migrateSources': './src/migration/migrateSources.ts',
    'migration/migrateNotes': './src/migration/migrateNotes.ts',
    'migration/migrateTeam': './src/migration/migrateTeam.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    clean: true // Clean dist directory before each build
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // Alias business logic packages for tree-shaking
      '@mytaptrack/business-logic-core': path.resolve(__dirname, '../business-logic/core/src'),
      '@mytaptrack/business-logic-user': path.resolve(__dirname, '../business-logic/user/src'),
      '@mytaptrack/business-logic-student': path.resolve(__dirname, '../business-logic/student/src'),
      '@mytaptrack/business-logic-device': path.resolve(__dirname, '../business-logic/device/src'),
      '@mytaptrack/business-logic-app': path.resolve(__dirname, '../business-logic/app/src'),
      '@mytaptrack/business-logic-license': path.resolve(__dirname, '../business-logic/license/src'),
      '@mytaptrack/business-logic-report': path.resolve(__dirname, '../business-logic/report/src')
    },
    // Prefer ES modules for better tree-shaking
    mainFields: ['module', 'main'],
    // Resolve symlinks to enable better tree-shaking
    symlinks: false
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              compilerOptions: {
                target: 'es2018',
                module: 'esnext', // Use ES modules for better tree-shaking
                moduleResolution: 'node',
                allowSyntheticDefaultImports: true,
                esModuleInterop: true,
                // Enable strict mode for better optimization
                strict: true,
                // Remove unused imports
                importsNotUsedAsValues: 'remove'
              }
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  optimization: {
    // Enable tree-shaking
    usedExports: true,
    sideEffects: false,
    // Enable minification
    minimize: true,
    // Split chunks for better caching (disabled for Lambda)
    splitChunks: false,
    // Optimize module concatenation
    concatenateModules: true,
    // Remove empty chunks
    removeEmptyChunks: true,
    // Merge duplicate chunks
    mergeDuplicateChunks: true,
    // Remove modules that are not used
    providedExports: true,
    // Analyze module usage
    mangleExports: 'size'
  },
  externals: {
    // Keep AWS SDK external to reduce bundle size
    'aws-sdk': 'aws-sdk',
    '@aws-sdk/client-dynamodb': '@aws-sdk/client-dynamodb',
    '@aws-sdk/client-eventbridge': '@aws-sdk/client-eventbridge',
    '@aws-sdk/client-s3': '@aws-sdk/client-s3',
    '@aws-sdk/client-ses': '@aws-sdk/client-ses',
    '@aws-sdk/client-sesv2': '@aws-sdk/client-sesv2',
    '@aws-sdk/client-sfn': '@aws-sdk/client-sfn',
    '@aws-sdk/lib-dynamodb': '@aws-sdk/lib-dynamodb',
    '@aws-sdk/client-cognito-identity-provider': '@aws-sdk/client-cognito-identity-provider',
    '@aws-sdk/client-kms': '@aws-sdk/client-kms',
    '@aws-sdk/client-secrets-manager': '@aws-sdk/client-secrets-manager',
    '@aws-sdk/client-ssm': '@aws-sdk/client-ssm',
    '@aws-sdk/client-sns': '@aws-sdk/client-sns',
    '@aws-sdk/client-sqs': '@aws-sdk/client-sqs',
    // External runtime dependencies
    '@lumigo/tracer': '@lumigo/tracer'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    }),
    // Bundle size limit enforcement
    new BundleSizeLimitPlugin(),
    // Bundle analyzer plugin for monitoring bundle sizes
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: 'bundle-report.html',
      generateStatsFile: true,
      statsFilename: 'bundle-stats.json'
    }),
    // Ignore moment.js locales to reduce bundle size
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/
    })
  ],
  // Performance hints
  performance: {
    hints: 'warning',
    maxAssetSize: LAMBDA_LIMITS.targetUncompressed,
    maxEntrypointSize: LAMBDA_LIMITS.targetUncompressed
  },
  // Source maps for debugging (disabled in production for size)
  devtool: false,
  // Stats configuration
  stats: {
    assets: true,
    chunks: false,
    modules: false,
    reasons: false,
    usedExports: true,
    providedExports: true,
    optimizationBailout: true
  }
};