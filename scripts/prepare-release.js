#!/usr/bin/env node

/**
 * Script to prepare the extension for release
 * This script:
 * 1. Updates version numbers
 * 2. Generates CHANGELOG entries
 * 3. Runs final tests
 * 4. Prepares packaging
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runAllTests } = require('../tests/integration/test-runner');

// Configuration
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
const readmePath = path.join(__dirname, '..', 'README.md');

/**
 * Update version in package.json
 */
function updateVersion(type = 'patch') {
  console.log(`\nUpdating version (${type})...`);
  
  try {
    // Read current package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;
    
    // Calculate new version
    let [major, minor, patch] = currentVersion.split('.').map(Number);
    
    switch (type) {
      case 'major':
        major++;
        minor = 0;
        patch = 0;
        break;
      case 'minor':
        minor++;
        patch = 0;
        break;
      case 'patch':
      default:
        patch++;
        break;
    }
    
    const newVersion = `${major}.${minor}.${patch}`;
    packageJson.version = newVersion;
    
    // Write updated package.json
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    console.log(`Version updated from ${currentVersion} to ${newVersion}`);
    return { currentVersion, newVersion };
  } catch (error) {
    console.error('Failed to update version:', error);
    process.exit(1);
  }
}

/**
 * Update CHANGELOG.md
 */
function updateChangelog(currentVersion, newVersion) {
  console.log('\nUpdating CHANGELOG.md...');
  
  try {
    // Create changelog if it doesn't exist
    if (!fs.existsSync(changelogPath)) {
      fs.writeFileSync(changelogPath, '# Change Log\n\nAll notable changes to the "vsx-remote-ssh" extension will be documented in this file.\n\n');
    }
    
    // Read current changelog
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    
    // Get git commit messages since last tag
    let commitMessages;
    try {
      commitMessages = execSync('git log --pretty=format:"- %s" -n 10').toString();
    } catch (error) {
      commitMessages = '- Initial release';
    }
    
    // Add new version section
    const date = new Date().toISOString().split('T')[0];
    const newSection = `\n## [${newVersion}] - ${date}\n\n${commitMessages}\n`;
    
    // Insert new section after header
    const headerEndIndex = changelog.indexOf('\n\n') + 2;
    changelog = changelog.slice(0, headerEndIndex) + newSection + changelog.slice(headerEndIndex);
    
    // Write updated changelog
    fs.writeFileSync(changelogPath, changelog);
    
    console.log('CHANGELOG.md updated successfully');
  } catch (error) {
    console.error('Failed to update CHANGELOG:', error);
    process.exit(1);
  }
}

/**
 * Run final tests
 */
function runFinalTests() {
  console.log('\nRunning final tests...');
  
  try {
    // Run tests
    runAllTests();
    console.log('All tests passed successfully');
  } catch (error) {
    console.error('Tests failed:', error);
    process.exit(1);
  }
}

/**
 * Prepare packaging
 */
function preparePackaging() {
  console.log('\nPreparing for packaging...');
  
  try {
    // Clean output directory
    execSync('npm run clean', { stdio: 'inherit' });
    
    // Compile
    execSync('npm run compile', { stdio: 'inherit' });
    
    // Lint
    execSync('npm run lint', { stdio: 'inherit' });
    
    // Generate docs
    execSync('npm run generate-docs', { stdio: 'inherit' });
    
    console.log('Packaging preparation completed successfully');
  } catch (error) {
    console.error('Packaging preparation failed:', error);
    process.exit(1);
  }
}

/**
 * Main function
 */
function main() {
  console.log('Preparing VSX Remote SSH Extension for release...');
  console.log('==============================================');
  
  // Get version update type from command line args
  const args = process.argv.slice(2);
  const versionType = args[0] || 'patch';
  
  if (!['major', 'minor', 'patch'].includes(versionType)) {
    console.error('Invalid version type. Use "major", "minor", or "patch"');
    process.exit(1);
  }
  
  // Update version
  const { currentVersion, newVersion } = updateVersion(versionType);
  
  // Update changelog
  updateChangelog(currentVersion, newVersion);
  
  // Run final tests
  runFinalTests();
  
  // Prepare packaging
  preparePackaging();
  
  console.log('\n==============================================');
  console.log(`VSX Remote SSH Extension v${newVersion} is ready for packaging!`);
  console.log('Run "npm run package" to create the VSIX file');
  console.log('==============================================');
}

// Run the script
main();