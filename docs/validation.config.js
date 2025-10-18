/**
 * Configuration for documentation validation scripts
 */

module.exports = {
  // Link validation configuration
  links: {
    timeout: 10000,
    retryCount: 3,
    retryOn429: true,
    ignorePatterns: [
      '^mailto:',
      '^tel:',
      '^#',
      '^javascript:',
      'localhost',
      '127.0.0.1',
      'example.com',
      'placeholder.com'
    ],
    // Patterns for links that should be checked but might be temporarily unavailable
    warningPatterns: [
      'github.com.*/(issues|pull)/',
      'aws.amazon.com/documentation'
    ]
  },

  // Diagram validation configuration
  diagrams: {
    requiredElements: ['mxfile', 'diagram', 'mxGraphModel', 'root'],
    allowEmptyDiagrams: false,
    validateHost: true,
    expectedHost: 'draw.io'
  },

  // Content validation configuration
  content: {
    maxLineLength: 120,
    maxConsecutiveBlankLines: 2,
    requireTitles: true,
    requireLanguageInCodeBlocks: true,
    checkForPlaceholders: true,
    checkForTodos: true,
    consistentListMarkers: true
  },

  // Accessibility validation configuration
  accessibility: {
    requireAltText: true,
    checkHeadingHierarchy: true,
    requireDescriptiveLinks: true,
    checkTableHeaders: true,
    checkFormLabels: true,
    // WCAG level to target (A, AA, AAA)
    wcagLevel: 'AA'
  },

  // File patterns to include/exclude
  files: {
    include: [
      '**/*.md',
      '**/*.html',
      '**/*.drawio',
      '**/*.drawio.xml'
    ],
    exclude: [
      'node_modules/**',
      '.git/**',
      'build/**',
      'dist/**',
      '.docusaurus/**'
    ]
  },

  // Output configuration
  output: {
    verbose: false,
    saveResults: false,
    resultsFile: 'validation-results.json',
    exitOnError: true,
    // Only exit on critical errors, not warnings
    exitOnWarnings: false
  }
};