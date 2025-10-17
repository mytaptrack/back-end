#!/usr/bin/env node

/**
 * Draw.io XML diagram validation script
 * Validates XML structure and references in draw.io files
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const xml2js = require('xml2js');

const docsDir = path.join(__dirname, '..');
const diagramFiles = [
  ...glob.sync('**/*.drawio', { cwd: docsDir }),
  ...glob.sync('**/*.drawio.xml', { cwd: docsDir })
];

let totalFiles = 0;
let validFiles = 0;
let invalidFiles = 0;

console.log('🔍 Validating draw.io diagram files...\n');

async function validateDiagram(filePath) {
  return new Promise((resolve) => {
    const fullPath = path.join(docsDir, filePath);
    
    try {
      const xmlContent = fs.readFileSync(fullPath, 'utf8');
      
      // Parse XML to validate structure
      xml2js.parseString(xmlContent, { 
        trim: true,
        normalize: true,
        ignoreAttrs: false 
      }, (err, result) => {
        totalFiles++;
        
        if (err) {
          console.log(`❌ ${filePath}: Invalid XML structure`);
          console.log(`   Error: ${err.message}`);
          console.log(`   Suggestion: Check for line breaks in XML attributes or invalid characters`);
          invalidFiles++;
          resolve();
          return;
        }

        // Comprehensive validation checks
        const checks = [];
        
        // Check for mxfile root element
        if (!result.mxfile) {
          checks.push('Missing mxfile root element');
        } else {
          // Check for diagram element
          if (!result.mxfile.diagram) {
            checks.push('Missing diagram element');
          } else {
            const diagram = result.mxfile.diagram[0];
            
            // Check for mxGraphModel
            if (!diagram.mxGraphModel) {
              checks.push('Missing mxGraphModel element');
            } else {
              const model = diagram.mxGraphModel[0];
              
              // Check for root element
              if (!model.root) {
                checks.push('Missing root element in mxGraphModel');
              } else {
                // Check for at least one cell (should have default cells)
                if (!model.root[0].mxCell || model.root[0].mxCell.length < 2) {
                  checks.push('Missing default cells in diagram');
                }
              }
              
              // Validate diagram has content (more than just default cells)
              if (model.root && model.root[0].mxCell && model.root[0].mxCell.length <= 2) {
                checks.push('Diagram appears to be empty (only default cells present)');
              }
            }
          }
          
          // Check for valid host attribute (draw.io or diagrams.net)
          if (!result.mxfile.$.host || 
              (!result.mxfile.$.host.includes('draw.io') && 
               !result.mxfile.$.host.includes('diagrams.net'))) {
            checks.push('Invalid or missing host attribute (should be draw.io or diagrams.net)');
          }
        }

        if (checks.length > 0) {
          console.log(`❌ ${filePath}: Validation failed`);
          checks.forEach(check => console.log(`   - ${check}`));
          invalidFiles++;
        } else {
          console.log(`✅ ${filePath}: Valid draw.io file`);
          validFiles++;
        }

        resolve();
      });
    } catch (error) {
      console.log(`❌ ${filePath}: Cannot read file`);
      console.log(`   Error: ${error.message}`);
      totalFiles++;
      invalidFiles++;
      resolve();
    }
  });
}

async function validateAllDiagrams() {
  if (diagramFiles.length === 0) {
    console.log('ℹ️  No draw.io files found to validate\n');
    return;
  }

  console.log(`Found ${diagramFiles.length} draw.io files to validate\n`);
  
  for (const file of diagramFiles) {
    await validateDiagram(file);
  }

  console.log('\n📊 Validation Summary:');
  console.log(`Files checked: ${totalFiles}`);
  console.log(`Valid files: ${validFiles}`);
  console.log(`Invalid files: ${invalidFiles}`);
  
  if (invalidFiles > 0) {
    console.log('\n❌ Diagram validation failed');
    process.exit(1);
  } else {
    console.log('\n✅ All diagrams are valid');
  }
}

validateAllDiagrams().catch(console.error);