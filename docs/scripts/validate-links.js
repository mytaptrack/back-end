#!/usr/bin/env node

/**
 * Link validation script for documentation
 * Validates all internal and external links in markdown files
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const markdownLinkCheck = require('markdown-link-check');

const docsDir = path.join(__dirname, '..');
const markdownFiles = glob.sync('**/*.md', { cwd: docsDir });

let totalFiles = 0;
let totalLinks = 0;
let brokenLinks = 0;

console.log('🔍 Validating documentation links...\n');

async function validateFile(filePath) {
  return new Promise((resolve) => {
    const fullPath = path.join(docsDir, filePath);
    const markdown = fs.readFileSync(fullPath, 'utf8');
    
    const options = {
      baseUrl: 'file://' + docsDir,
      showProgressBar: false,
      timeout: 5000,
      retryOn429: true,
      retryCount: 3,
      ignorePatterns: [
        { pattern: '^mailto:' },
        { pattern: '^tel:' },
        { pattern: '^#' }, // Skip anchor links for now
      ]
    };

    markdownLinkCheck(markdown, options, (err, results) => {
      if (err) {
        console.error(`❌ Error checking ${filePath}:`, err.message);
        resolve();
        return;
      }

      totalFiles++;
      const fileLinks = results.length;
      totalLinks += fileLinks;
      
      const fileBrokenLinks = results.filter(result => result.status === 'dead');
      brokenLinks += fileBrokenLinks.length;

      if (fileBrokenLinks.length > 0) {
        console.log(`❌ ${filePath} (${fileBrokenLinks.length}/${fileLinks} broken):`);
        fileBrokenLinks.forEach(result => {
          console.log(`   - ${result.link} (${result.statusCode})`);
        });
      } else {
        console.log(`✅ ${filePath} (${fileLinks} links)`);
      }

      resolve();
    });
  });
}

async function validateAllFiles() {
  console.log(`Found ${markdownFiles.length} markdown files to validate\n`);
  
  for (const file of markdownFiles) {
    await validateFile(file);
  }

  console.log('\n📊 Validation Summary:');
  console.log(`Files checked: ${totalFiles}`);
  console.log(`Total links: ${totalLinks}`);
  console.log(`Broken links: ${brokenLinks}`);
  
  if (brokenLinks > 0) {
    console.log('\n❌ Link validation failed');
    process.exit(1);
  } else {
    console.log('\n✅ All links are valid');
  }
}

validateAllFiles().catch(console.error);