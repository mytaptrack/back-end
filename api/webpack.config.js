const path = require('path');
const webpack = require('webpack');

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
    libraryTarget: 'commonjs2'
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
    }
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
                module: 'commonjs',
                moduleResolution: 'node',
                allowSyntheticDefaultImports: true,
                esModuleInterop: true
              }
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  optimization: {
    usedExports: true,
    sideEffects: false,
    minimize: true
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
    '@aws-sdk/lib-dynamodb': '@aws-sdk/lib-dynamodb'
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    }),
    // Bundle analyzer plugin for monitoring bundle sizes
    new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)({
      analyzerMode: 'static',
      openAnalyzer: false,
      reportFilename: 'bundle-report.html'
    })
  ]
};