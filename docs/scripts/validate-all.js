#!/usr/bin/env node

/**
 * Comprehensive documentation validation script
 * Runs all validation checks: links, diagrams, and accessibility
 */

const { spawn } = require('child_process');
const path = require('path');

const scriptsDir = __dirname;
const validationScripts = [
  { name: 'Link Validation', script: 'validate-links.js', critical: true },
  { name: 'Diagram Validation', script: 'validate-diagrams.js', critical: true },
  { name: 'Content Validation', script: 'validate-content.js', critical: false },
  { name: 'Accessibility Validation', script: 'validate-accessibility.js', critical: false }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

console.log('🚀 Running comprehensive documentation validation...\n');

function runScript(scriptName, scriptPath, critical = true) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running ${scriptName}...`);
    console.log(`${'='.repeat(60)}\n`);

    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: path.dirname(scriptPath)
    });

    child.on('close', (code) => {
      totalTests++;
      
      if (code === 0) {
        passedTests++;
        console.log(`\n✅ ${scriptName} completed successfully`);
      } else {
        failedTests++;
        if (critical) {
          console.log(`\n❌ ${scriptName} failed (critical)`);
        } else {
          console.log(`\n⚠️  ${scriptName} found issues (non-critical)`);
        }
      }
      
      resolve(code);
    });

    child.on('error', (error) => {
      totalTests++;
      failedTests++;
      console.error(`\n❌ Error running ${scriptName}:`, error.message);
      resolve(1);
    });
  });
}

async function runAllValidations() {
  const results = [];
  
  for (const validation of validationScripts) {
    const scriptPath = path.join(scriptsDir, validation.script);
    const result = await runScript(validation.name, scriptPath, validation.critical);
    results.push({
      name: validation.name,
      code: result,
      critical: validation.critical
    });
  }

  // Print final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 VALIDATION SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  console.log(`Total validations: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);

  console.log('\nDetailed Results:');
  results.forEach(result => {
    const status = result.code === 0 ? '✅ PASS' : (result.critical ? '❌ FAIL' : '⚠️  WARN');
    const criticality = result.critical ? '(Critical)' : '(Non-critical)';
    console.log(`  ${status} ${result.name} ${criticality}`);
  });

  // Determine overall result
  const criticalFailures = results.filter(r => r.code !== 0 && r.critical).length;
  
  if (criticalFailures > 0) {
    console.log('\n❌ Documentation validation failed due to critical issues');
    console.log('Please fix the issues above before proceeding.');
    process.exit(1);
  } else if (failedTests > 0) {
    console.log('\n⚠️  Documentation validation completed with warnings');
    console.log('Consider addressing the non-critical issues for better quality.');
  } else {
    console.log('\n✅ All documentation validations passed successfully!');
  }
}

runAllValidations().catch(console.error);