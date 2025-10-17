#!/usr/bin/env node

/**
 * Content validation script for documentation
 * Checks for common content issues, consistency, and completeness
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const docsDir = path.join(__dirname, '..');
const markdownFiles = glob.sync('**/*.md', { 
  cwd: docsDir,
  ignore: ['node_modules/**', '.docusaurus/**', 'build/**']
});

let totalFiles = 0;
let totalIssues = 0;
const issuesByType = {};

console.log('📝 Validating documentation content...\n');

function addIssue(type, file, line, message) {
  if (!issuesByType[type]) {
    issuesByType[type] = [];
  }
  issuesByType[type].push({ file, line, message });
  totalIssues++;
}

function validateMarkdownContent(content, filePath) {
  const lines = content.split('\n');
  
  // Check for title (first heading)
  const hasTitle = lines.some(line => line.startsWith('# '));
  if (!hasTitle) {
    addIssue('missing-title', filePath, 1, 'Document missing main title (# heading)');
  }

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmedLine = line.trim();

    // Check for TODO/FIXME comments
    if (trimmedLine.match(/TODO|FIXME|XXX/i)) {
      addIssue('todo-comment', filePath, lineNum, 'TODO/FIXME comment found');
    }

    // Check for placeholder text
    if (trimmedLine.match(/lorem ipsum|placeholder|replace this|coming soon/i)) {
      addIssue('placeholder-text', filePath, lineNum, 'Placeholder text found');
    }

    // Check for broken internal references
    const internalLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = internalLinkRegex.exec(line)) !== null) {
      const linkPath = match[2];
      
      // Check for relative links to files that should exist
      if (linkPath.startsWith('./') || linkPath.startsWith('../') || 
          (linkPath.startsWith('/') && !linkPath.startsWith('http'))) {
        
        // Resolve the path relative to the current file
        const currentDir = path.dirname(path.join(docsDir, filePath));
        let resolvedPath;
        
        if (linkPath.startsWith('/')) {
          resolvedPath = path.join(docsDir, linkPath.substring(1));
        } else {
          resolvedPath = path.resolve(currentDir, linkPath);
        }

        // Remove anchor fragments
        const pathWithoutAnchor = resolvedPath.split('#')[0];
        
        if (!fs.existsSync(pathWithoutAnchor)) {
          addIssue('broken-internal-link', filePath, lineNum, 
            `Internal link points to non-existent file: ${linkPath}`);
        }
      }
    }

    // Check for inconsistent heading styles
    if (trimmedLine.match(/^#{1,6}\s/)) {
      // Check for trailing hashes (inconsistent style)
      if (trimmedLine.endsWith('#')) {
        addIssue('inconsistent-heading', filePath, lineNum, 
          'Heading uses trailing hashes (inconsistent style)');
      }
      
      // Check for missing space after hash
      if (trimmedLine.match(/^#+[^#\s]/)) {
        addIssue('heading-spacing', filePath, lineNum, 
          'Heading missing space after hash marks');
      }
    }

    // Check for long lines (readability)
    if (line.length > 120 && !line.includes('http') && !line.includes('`')) {
      addIssue('long-line', filePath, lineNum, 
        `Line exceeds 120 characters (${line.length} chars)`);
    }

    // Check for multiple consecutive blank lines
    if (index > 0 && trimmedLine === '' && lines[index - 1].trim() === '') {
      let consecutiveBlankLines = 1;
      for (let i = index - 1; i >= 0 && lines[i].trim() === ''; i--) {
        consecutiveBlankLines++;
      }
      if (consecutiveBlankLines > 2) {
        addIssue('excessive-blank-lines', filePath, lineNum, 
          `${consecutiveBlankLines} consecutive blank lines`);
      }
    }

    // Check for inconsistent list formatting
    if (trimmedLine.match(/^[\*\-\+]\s/)) {
      const listMarker = trimmedLine[0];
      // Check if this file consistently uses the same list marker
      // This is a simplified check - could be enhanced
      if (content.includes('* ') && content.includes('- ')) {
        addIssue('inconsistent-list-markers', filePath, lineNum, 
          'Mixed list markers (* and -) in same document');
      }
    }
  });

  // Check for proper README structure
  if (filePath.endsWith('README.md')) {
    const hasOverview = content.toLowerCase().includes('overview') || 
                       content.toLowerCase().includes('introduction');
    if (!hasOverview) {
      addIssue('readme-structure', filePath, 1, 
        'README missing overview or introduction section');
    }
  }

  // Check for code blocks without language specification
  const codeBlockRegex = /```(\w*)\n/g;
  let codeMatch;
  while ((codeMatch = codeBlockRegex.exec(content)) !== null) {
    if (!codeMatch[1]) {
      const lineNum = content.substring(0, codeMatch.index).split('\n').length;
      addIssue('code-block-no-language', filePath, lineNum, 
        'Code block missing language specification');
    }
  }
}

async function validateFile(filePath) {
  return new Promise((resolve) => {
    try {
      const fullPath = path.join(docsDir, filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      totalFiles++;
      validateMarkdownContent(content, filePath);
      
      console.log(`✅ ${filePath}: Content validated`);
      resolve();
    } catch (error) {
      console.log(`❌ ${filePath}: Error reading file`);
      console.log(`   Error: ${error.message}`);
      resolve();
    }
  });
}

async function validateAllFiles() {
  if (markdownFiles.length === 0) {
    console.log('ℹ️  No markdown files found to validate\n');
    return;
  }

  console.log(`Found ${markdownFiles.length} markdown files to validate\n`);
  
  for (const file of markdownFiles) {
    await validateFile(file);
  }

  console.log('\n📊 Content Validation Summary:');
  console.log(`Files checked: ${totalFiles}`);
  console.log(`Total issues: ${totalIssues}`);
  
  if (totalIssues > 0) {
    console.log('\n🔍 Issues by type:');
    Object.entries(issuesByType).forEach(([type, issues]) => {
      console.log(`\n${type.toUpperCase().replace(/-/g, ' ')} (${issues.length} issues):`);
      issues.slice(0, 10).forEach(issue => { // Limit to first 10 per type
        console.log(`  - ${issue.file}:${issue.line} - ${issue.message}`);
      });
      if (issues.length > 10) {
        console.log(`  ... and ${issues.length - 10} more`);
      }
    });
    
    console.log('\n⚠️  Content issues found - consider reviewing and fixing');
    console.log('💡 These are recommendations for better documentation quality');
  } else {
    console.log('\n✅ No content issues found');
  }
}

validateAllFiles().catch(console.error);