#!/usr/bin/env node

/**
 * Accessibility validation script for documentation
 * Tests documentation site for WCAG compliance
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const cheerio = require('cheerio');

const docsDir = path.join(__dirname, '..');
const htmlFiles = glob.sync('**/*.html', { 
  cwd: docsDir,
  ignore: ['node_modules/**', '.docusaurus/**', 'build/**']
});
const markdownFiles = glob.sync('**/*.md', { 
  cwd: docsDir,
  ignore: ['node_modules/**', '.docusaurus/**', 'build/**']
});

let totalFiles = 0;
let totalIssues = 0;
const issuesByType = {};

console.log('♿ Validating documentation accessibility...\n');

function addIssue(type, file, element, message) {
  if (!issuesByType[type]) {
    issuesByType[type] = [];
  }
  issuesByType[type].push({ file, element, message });
  totalIssues++;
}

function validateHtmlContent($, filePath) {
  const issues = [];

  // Check for images without alt text
  $('img').each((i, elem) => {
    const $img = $(elem);
    const alt = $img.attr('alt');
    const src = $img.attr('src');
    
    if (!alt || alt.trim() === '') {
      addIssue('missing-alt', filePath, `img[src="${src}"]`, 'Image missing alt text');
    }
  });

  // Check for headings hierarchy
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((i, elem) => {
    const level = parseInt(elem.tagName.substring(1));
    headings.push({ level, text: $(elem).text().trim() });
  });

  // Validate heading hierarchy
  for (let i = 1; i < headings.length; i++) {
    const current = headings[i];
    const previous = headings[i - 1];
    
    if (current.level > previous.level + 1) {
      addIssue('heading-hierarchy', filePath, `h${current.level}`, 
        `Heading level ${current.level} follows h${previous.level} - skips levels`);
    }
  }

  // Check for links without descriptive text
  $('a').each((i, elem) => {
    const $link = $(elem);
    const text = $link.text().trim();
    const href = $link.attr('href');
    
    if (!text || text.toLowerCase().match(/^(click here|here|link|read more)$/)) {
      addIssue('non-descriptive-link', filePath, `a[href="${href}"]`, 
        'Link text is not descriptive');
    }
  });

  // Check for tables without headers
  $('table').each((i, elem) => {
    const $table = $(elem);
    const hasHeaders = $table.find('th').length > 0;
    
    if (!hasHeaders) {
      addIssue('table-no-headers', filePath, 'table', 'Table missing header cells (th)');
    }
  });

  // Check for form inputs without labels
  $('input, textarea, select').each((i, elem) => {
    const $input = $(elem);
    const id = $input.attr('id');
    const type = $input.attr('type');
    
    // Skip hidden inputs
    if (type === 'hidden') return;
    
    if (id) {
      const hasLabel = $(`label[for="${id}"]`).length > 0;
      if (!hasLabel) {
        addIssue('input-no-label', filePath, `input[id="${id}"]`, 
          'Form input missing associated label');
      }
    } else {
      addIssue('input-no-id', filePath, elem.tagName.toLowerCase(), 
        'Form input missing id attribute for label association');
    }
  });

  return issues;
}

function validateMarkdownContent(content, filePath) {
  const issues = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check for images without alt text in markdown
    const imgRegex = /!\[([^\]]*)\]\([^)]+\)/g;
    let match;
    while ((match = imgRegex.exec(line)) !== null) {
      const altText = match[1];
      if (!altText || altText.trim() === '') {
        addIssue('missing-alt', filePath, `line ${lineNum}`, 
          'Markdown image missing alt text');
      }
    }

    // Check for non-descriptive link text
    const linkRegex = /\[([^\]]+)\]\([^)]+\)/g;
    while ((match = linkRegex.exec(line)) !== null) {
      const linkText = match[1].toLowerCase().trim();
      if (linkText.match(/^(click here|here|link|read more)$/)) {
        addIssue('non-descriptive-link', filePath, `line ${lineNum}`, 
          'Link text is not descriptive');
      }
    }
  });

  return issues;
}

async function validateHtmlFile(filePath) {
  return new Promise((resolve) => {
    try {
      const fullPath = path.join(docsDir, filePath);
      const htmlContent = fs.readFileSync(fullPath, 'utf8');
      const $ = cheerio.load(htmlContent);
      
      totalFiles++;
      validateHtmlContent($, filePath);
      
      console.log(`✅ ${filePath}: HTML accessibility checked`);
      resolve();
    } catch (error) {
      console.log(`❌ ${filePath}: Error reading HTML file`);
      console.log(`   Error: ${error.message}`);
      resolve();
    }
  });
}

async function validateMarkdownFile(filePath) {
  return new Promise((resolve) => {
    try {
      const fullPath = path.join(docsDir, filePath);
      const markdownContent = fs.readFileSync(fullPath, 'utf8');
      
      totalFiles++;
      validateMarkdownContent(markdownContent, filePath);
      
      console.log(`✅ ${filePath}: Markdown accessibility checked`);
      resolve();
    } catch (error) {
      console.log(`❌ ${filePath}: Error reading markdown file`);
      console.log(`   Error: ${error.message}`);
      resolve();
    }
  });
}

async function validateAllFiles() {
  const totalFilesToCheck = htmlFiles.length + markdownFiles.length;
  
  if (totalFilesToCheck === 0) {
    console.log('ℹ️  No HTML or Markdown files found to validate\n');
    return;
  }

  console.log(`Found ${totalFilesToCheck} files to validate for accessibility\n`);
  
  // Validate HTML files
  for (const file of htmlFiles) {
    await validateHtmlFile(file);
  }

  // Validate Markdown files
  for (const file of markdownFiles) {
    await validateMarkdownFile(file);
  }

  console.log('\n📊 Accessibility Validation Summary:');
  console.log(`Files checked: ${totalFiles}`);
  console.log(`Total issues: ${totalIssues}`);
  
  if (totalIssues > 0) {
    console.log('\n🔍 Issues by type:');
    Object.entries(issuesByType).forEach(([type, issues]) => {
      console.log(`\n${type.toUpperCase()} (${issues.length} issues):`);
      issues.forEach(issue => {
        console.log(`  - ${issue.file}: ${issue.message}`);
        if (issue.element !== issue.file) {
          console.log(`    Element: ${issue.element}`);
        }
      });
    });
    
    console.log('\n⚠️  Accessibility issues found - please review and fix');
    // Don't exit with error for accessibility issues, just warn
    console.log('💡 These are recommendations for better accessibility');
  } else {
    console.log('\n✅ No accessibility issues found');
  }
}

validateAllFiles().catch(console.error);