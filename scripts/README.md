# Scripts Directory

This directory contains automation scripts for the SSH Remote Extension.

## Available Scripts

### `generate-changelog.js`

Automatically generates changelog entries from git commit messages.

**Usage:**

```bash
# Generate changelog for a specific version
npm run changelog 1.0.1

# Or run directly
node scripts/generate-changelog.js 1.0.1
```

**Features:**

- Categorizes commits by type (feat, fix, docs, chore)
- Automatically detects commits since last tag
- Updates CHANGELOG.md with proper formatting
- Integrates with GitHub Actions workflows

### GitHub Actions Integration

The `generate-changelog.js` script is automatically used by:

- `.github/workflows/version-bump.yml` - For manual version bumps
- `.github/workflows/auto-release.yml` - For automatic releases

## How It Works

1. **Commit Detection**: Finds commits since the last git tag
2. **Categorization**: Groups commits by keywords:
   - `feat/feature/add` → Added
   - `fix/bug/issue` → Fixed  
   - `doc/readme/changelog` → Documentation
   - `chore/refactor/style/test` → Changed
3. **Changelog Update**: Inserts categorized changes into CHANGELOG.md
4. **Version Management**: Creates new version section with current date

## Commit Message Guidelines

For best changelog generation, use conventional commit messages:

```bash
# Features
git commit -m "feat: add SSH key authentication"

# Bug fixes
git commit -m "fix: resolve connection timeout issue"

# Documentation
git commit -m "docs: update README with new features"

# Refactoring
git commit -m "chore: refactor connection manager"
```

## Automation

The changelog generation is fully automated through GitHub Actions:

1. **Manual Release**: Go to Actions → Version Bump → Run workflow
2. **Automatic Release**: Update version in package.json and push to main
3. **Changelog**: Automatically generated and included in releases
