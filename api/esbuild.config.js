#!/usr/bin/env node

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// AWS Lambda size limits (in bytes)
const LAMBDA_LIMITS = {
  uncompressed: 250 * 1024 * 1024, // 250 MB
  compressed: 50 * 1024 * 1024,    // 50 MB
  // Target limits (more conservative for optimal performance)
  targetUncompressed: 50 * 1024 * 1024, // 50 MB
  targetCompressed: 10 * 1024 * 1024    // 10 MB
};

// Bundle size analysis plugin
const bundleSizePlugin = {
  name: 'bundle-size-analysis',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;

      const outputDir = build.initialOptions.outdir;
      if (!outputDir || !fs.existsSync(outputDir)) return;

      console.log('\n📊 Lambda Bundle Size Analysis (esbuild)\n');
      console.log('='.repeat(80));

      const files = fs.readdirSync(outputDir, { recursive: true });
      let hasViolations = false;

      files.forEach(file => {
        if (typeof file === 'string' && file.endsWith('.js')) {
          const filePath = path.join(outputDir, file);
          const stats = fs.statSync(filePath);
          const size = stats.size;
          
          const exceedsTarget = size > LAMBDA_LIMITS.targetUncompressed;
          const exceedsAWS = size > LAMBDA_LIMITS.uncompressed;
          
          const status = exceedsAWS ? '🚨' : exceedsTarget ? '⚠️' : '✅';
          const percentage = (size / LAMBDA_LIMITS.targetUncompressed) * 100;
          
          console.log(`${status} ${file}`);
          console.log(`   Size: ${formatBytes(size)} (${percentage.toFixed(1)}% of target)`);
          
          if (exceedsAWS) {
            console.log(`   ❌ EXCEEDS AWS LIMIT: ${formatBytes(LAMBDA_LIMITS.uncompressed)}`);
            hasViolations = true;
          } else if (exceedsTarget) {
            console.log(`   ⚠️  Exceeds target limit: ${formatBytes(LAMBDA_LIMITS.targetUncompressed)}`);
            hasViolations = true;
          }
          
          console.log('');
        }
      });

      if (hasViolations) {
        console.log('💡 Bundle size optimization recommendations:');
        console.log('   1. Use more specific imports from business logic packages');
        console.log('   2. Split large functions into smaller, focused handlers');
        console.log('   3. Use dynamic imports for optional dependencies');
        console.log('   4. Enable esbuild tree-shaking with --tree-shaking=true');
      }

      console.log('='.repeat(80));
    });
  }
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Entry points for Lambda functions
const entryPoints = {
  // Device API functions
  'device/functions/api/dataPut': './src/device/functions/api/dataPut.ts',
  'device/functions/api/audioPut': './src/device/functions/api/audioPut.ts',
  'device/functions/api/firmwarePost': './src/device/functions/api/firmwarePost.ts',
  'device/functions/api/timeGet': './src/device/functions/api/timeGet.ts',
  'device/functions/api/wifiPing': './src/device/functions/api/wifiPing.ts',
  
  // App API functions
  'device/functions/appApi/appDelete': './src/device/functions/appApi/appDelete.ts',
  'device/functions/appApi/appTokenRetrieve': './src/device/functions/appApi/appTokenRetrieve.ts',
  
  // Event handlers
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
};

// esbuild configuration
const buildConfig = {
  entryPoints,
  outdir: 'dist-esbuild',
  bundle: true,
  minify: true,
  sourcemap: false, // Disable source maps for smaller bundles
  target: 'node18',
  platform: 'node',
  format: 'cjs',
  // Tree shaking configuration
  treeShaking: true,
  // Splitting disabled for Lambda (each function needs to be self-contained)
  splitting: false,
  // External dependencies (provided by Lambda runtime)
  external: [
    'aws-sdk',
    '@aws-sdk/*',
    '@lumigo/tracer'
  ],
  // Alias for business logic packages
  alias: {
    '@mytaptrack/business-logic-core': path.resolve(__dirname, '../business-logic/core/src'),
    '@mytaptrack/business-logic-user': path.resolve(__dirname, '../business-logic/user/src'),
    '@mytaptrack/business-logic-student': path.resolve(__dirname, '../business-logic/student/src'),
    '@mytaptrack/business-logic-device': path.resolve(__dirname, '../business-logic/device/src'),
    '@mytaptrack/business-logic-app': path.resolve(__dirname, '../business-logic/app/src'),
    '@mytaptrack/business-logic-license': path.resolve(__dirname, '../business-logic/license/src'),
    '@mytaptrack/business-logic-report': path.resolve(__dirname, '../business-logic/report/src')
  },
  // Define environment variables
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  // Plugins
  plugins: [bundleSizePlugin],
  // Loader configuration
  loader: {
    '.ts': 'ts'
  },
  // Resolve configuration
  resolveExtensions: ['.ts', '.js'],
  // Metafile for analysis
  metafile: true,
  // Log level
  logLevel: 'info'
};

// Build function
async function build() {
  try {
    console.log('🚀 Building Lambda functions with esbuild...\n');
    
    const result = await esbuild.build(buildConfig);
    
    // Save metafile for analysis
    if (result.metafile) {
      fs.writeFileSync(
        path.join(__dirname, 'dist-esbuild', 'metafile.json'),
        JSON.stringify(result.metafile, null, 2)
      );
      console.log('📄 Metafile saved to dist-esbuild/metafile.json');
    }
    
    console.log('✅ Build completed successfully!');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Analyze function for existing builds
async function analyze() {
  const metafilePath = path.join(__dirname, 'dist-esbuild', 'metafile.json');
  
  if (!fs.existsSync(metafilePath)) {
    console.error('❌ Metafile not found. Run build first.');
    process.exit(1);
  }
  
  const metafile = JSON.parse(fs.readFileSync(metafilePath, 'utf8'));
  
  console.log('\n📊 Bundle Analysis (esbuild)\n');
  console.log('='.repeat(80));
  
  Object.entries(metafile.outputs).forEach(([outputPath, output]) => {
    if (outputPath.endsWith('.js')) {
      const relativePath = path.relative('dist-esbuild', outputPath);
      const size = output.bytes;
      const exceedsTarget = size > LAMBDA_LIMITS.targetUncompressed;
      const exceedsAWS = size > LAMBDA_LIMITS.uncompressed;
      
      const status = exceedsAWS ? '🚨' : exceedsTarget ? '⚠️' : '✅';
      const percentage = (size / LAMBDA_LIMITS.targetUncompressed) * 100;
      
      console.log(`${status} ${relativePath}`);
      console.log(`   Size: ${formatBytes(size)} (${percentage.toFixed(1)}% of target)`);
      
      if (output.imports && output.imports.length > 0) {
        console.log(`   Imports: ${output.imports.length} modules`);
      }
      
      if (exceedsAWS) {
        console.log(`   ❌ EXCEEDS AWS LIMIT: ${formatBytes(LAMBDA_LIMITS.uncompressed)}`);
      } else if (exceedsTarget) {
        console.log(`   ⚠️  Exceeds target limit: ${formatBytes(LAMBDA_LIMITS.targetUncompressed)}`);
      }
      
      console.log('');
    }
  });
  
  console.log('='.repeat(80));
}

// CLI interface
const command = process.argv[2];

switch (command) {
  case 'build':
    build();
    break;
  case 'analyze':
    analyze();
    break;
  default:
    console.log('Usage:');
    console.log('  node esbuild.config.js build    - Build Lambda functions');
    console.log('  node esbuild.config.js analyze  - Analyze existing build');
    process.exit(1);
}