#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Generate changelog from git commits
 */
function generateChangelog() {
  const version = process.argv[2];
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  
  if (!version) {
    console.error('Usage: node generate-changelog.js <version>');
    process.exit(1);
  }

  try {
    // Get commits since last tag
    let commits;
    try {
      const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null', { encoding: 'utf8' }).trim();
      commits = execSync(`git log --pretty=format:"- %s" ${lastTag}..HEAD --reverse`, { encoding: 'utf8' });
    } catch (error) {
      // No previous tags, get all commits
      commits = execSync('git log --pretty=format:"- %s" --reverse', { encoding: 'utf8' });
    }

    // Categorize commits
    const lines = commits.trim().split('\n').filter(line => line.trim());
    
    const features = lines.filter(line => 
      line.toLowerCase().includes('feat') || 
      line.toLowerCase().includes('feature') || 
      line.toLowerCase().includes('add')
    );
    
    const fixes = lines.filter(line => 
      line.toLowerCase().includes('fix') || 
      line.toLowerCase().includes('bug') || 
      line.toLowerCase().includes('issue')
    );
    
    const docs = lines.filter(line => 
      line.toLowerCase().includes('doc') || 
      line.toLowerCase().includes('readme') || 
      line.toLowerCase().includes('changelog')
    );
    
    const chores = lines.filter(line => 
      line.toLowerCase().includes('chore') || 
      line.toLowerCase().includes('refactor') || 
      line.toLowerCase().includes('style') || 
      line.toLowerCase().includes('test')
    );

    // Build changelog content
    let changelogContent = '';
    
    if (features.length > 0) {
      changelogContent += '\n### Added\n' + features.join('\n');
    }
    
    if (fixes.length > 0) {
      changelogContent += '\n\n### Fixed\n' + fixes.join('\n');
    }
    
    if (docs.length > 0) {
      changelogContent += '\n\n### Documentation\n' + docs.join('\n');
    }
    
    if (chores.length > 0) {
      changelogContent += '\n\n### Changed\n' + chores.join('\n');
    }
    
    // If no categorized commits, use all commits
    if (!changelogContent) {
      changelogContent = '\n### Changes\n' + lines.join('\n');
    }

    // Read current changelog
    let changelog = fs.readFileSync(changelogPath, 'utf8');
    
    // Create new version section
    const date = new Date().toISOString().split('T')[0];
    const newSection = `\n## [${version}] - ${date}${changelogContent}\n`;
    
    // Replace [Unreleased] section with new version
    changelog = changelog.replace(
      /## \[Unreleased\].*?(?=\n## \[|$)/s,
      `## [Unreleased]\n\n<!-- Changes will be automatically added here by the version-bump workflow -->`
    );
    
    // Insert new version after [Unreleased]
    changelog = changelog.replace(
      /## \[Unreleased\].*?\n\n<!-- Changes will be automatically added here by the version-bump workflow -->/s,
      `## [Unreleased]\n\n<!-- Changes will be automatically added here by the version-bump workflow -->${newSection}`
    );
    
    // Write updated changelog
    fs.writeFileSync(changelogPath, changelog);
    
    console.log(`✅ Changelog updated for version ${version}`);
    console.log(`📝 Added ${lines.length} commits to changelog`);
    
  } catch (error) {
    console.error('❌ Failed to generate changelog:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  generateChangelog();
}

module.exports = { generateChangelog }; 