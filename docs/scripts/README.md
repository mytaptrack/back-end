# Documentation Validation Scripts

This directory contains automated validation scripts for the MyTapTrack documentation system. These scripts ensure documentation quality, consistency, and accessibility compliance.

## Available Scripts

### `validate-all.js`
Comprehensive validation runner that executes all validation checks in sequence.

**Usage:**
```bash
npm run validate-all
# or
node scripts/validate-all.js
```

**Features:**
- Runs all validation scripts in order
- Provides comprehensive summary report
- Distinguishes between critical and non-critical issues
- Exits with appropriate error codes for CI/CD integration

### `validate-links.js`
Validates all internal and external links in markdown files.

**Usage:**
```bash
npm run validate-links
# or
node scripts/validate-links.js
```

**Features:**
- Checks internal relative links for file existence
- Validates external HTTP/HTTPS links
- Configurable timeout and retry logic
- Ignores common patterns (mailto, tel, anchors)
- Detailed reporting of broken links

### `validate-diagrams.js`
Validates draw.io diagram files for structural integrity.

**Usage:**
```bash
npm run validate-diagrams
# or
node scripts/validate-diagrams.js
```

**Features:**
- Supports both `.drawio` and `.drawio.xml` files
- Validates XML structure and required elements
- Checks for empty diagrams
- Verifies draw.io host attribute
- Ensures proper mxGraphModel structure

### `validate-content.js`
Validates markdown content for quality and consistency.

**Usage:**
```bash
npm run validate-content
# or
node scripts/validate-content.js
```

**Features:**
- Checks for missing titles and proper heading hierarchy
- Detects TODO/FIXME comments and placeholder text
- Validates internal link references
- Enforces consistent formatting (list markers, heading styles)
- Checks for overly long lines and excessive blank lines
- Validates code blocks have language specifications

### `validate-accessibility.js`
Validates documentation for accessibility compliance (WCAG guidelines).

**Usage:**
```bash
npm run validate-accessibility
# or
node scripts/validate-accessibility.js
```

**Features:**
- Checks images for alt text (both HTML and Markdown)
- Validates heading hierarchy
- Ensures descriptive link text
- Checks tables for proper headers
- Validates form inputs have associated labels
- Provides recommendations for better accessibility

## Configuration

Validation behavior can be customized through `validation.config.js`:

```javascript
module.exports = {
  links: {
    timeout: 10000,
    retryCount: 3,
    ignorePatterns: ['^mailto:', '^tel:']
  },
  content: {
    maxLineLength: 120,
    requireTitles: true
  },
  accessibility: {
    wcagLevel: 'AA'
  }
};
```

## Integration

### Makefile Integration
```bash
make validate              # Run all validations
make validate-links        # Run only link validation
make validate-diagrams     # Run only diagram validation
make validate-content      # Run only content validation
make validate-accessibility # Run only accessibility validation
```

### CI/CD Integration
The validation scripts are integrated into the GitHub Actions workflow (`.github/workflows/validate-docs.yml`) and run automatically on:
- Push to main/develop branches
- Pull requests affecting documentation
- Manual workflow dispatch

### Exit Codes
- `0`: All validations passed
- `1`: Critical validation failures (broken links, invalid diagrams)
- Non-critical issues (content quality, accessibility) generate warnings but don't fail the build

## Development

### Adding New Validations
1. Create a new validation script following the existing pattern
2. Add it to `validate-all.js` with appropriate criticality level
3. Update `package.json` scripts section
4. Add Makefile target if needed
5. Update this README

### Testing Validations
```bash
# Test individual scripts
node scripts/validate-links.js
node scripts/validate-diagrams.js

# Test comprehensive validation
npm run validate-all

# Test in CI environment
act -j validate-documentation  # Using act to test GitHub Actions locally
```

## Troubleshooting

### Common Issues

**Link validation timeouts:**
- Increase timeout in configuration
- Check network connectivity
- Some external sites may block automated requests

**Diagram validation failures:**
- Ensure draw.io files are saved in XML format
- Check for corrupted XML structure
- Verify files were created with draw.io (not other tools)

**Content validation false positives:**
- Review ignore patterns in configuration
- Some technical documentation may legitimately exceed line length limits
- Adjust configuration for project-specific needs

**Accessibility warnings:**
- These are recommendations, not hard failures
- Consider the target audience and use case
- Some technical diagrams may not need alt text descriptions

### Performance Optimization

For large documentation sets:
- Use file patterns to limit scope
- Run validations in parallel where possible
- Cache external link validation results
- Consider running full validation only on CI, not locally

## Dependencies

The validation scripts require:
- Node.js 18+
- npm packages: `glob`, `markdown-link-check`, `xml2js`, `cheerio`
- All dependencies are listed in `package.json`