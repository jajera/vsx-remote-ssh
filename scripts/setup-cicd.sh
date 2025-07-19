#!/bin/bash

# CI/CD Setup Script for SSH Remote Extension
# This script helps set up the GitHub Actions workflows

set -e

echo "🚀 CI/CD Setup for SSH Remote Extension"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    print_error "Not in a git repository. Please run this script from the project root."
    exit 1
fi

# Check if GitHub Actions directory exists
if [ ! -d ".github/workflows" ]; then
    print_error "GitHub Actions workflows not found. Please ensure the .github/workflows directory exists."
    exit 1
fi

print_success "GitHub Actions workflows found"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

print_success "package.json found"

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_status "Current version: $CURRENT_VERSION"

echo ""
echo "📋 CI/CD Setup Checklist"
echo "========================"

echo ""
echo "1. 🔐 Repository Secrets"
echo "   Add these secrets to your GitHub repository:"
echo "   - Go to Settings → Secrets and variables → Actions"
echo "   - Add VSCE_PAT with your Personal Access Token"
echo ""

echo "2. 🏪 VS Code Marketplace Setup"
echo "   - Create publisher account at marketplace.visualstudio.com"
echo "   - Get Personal Access Token from Azure DevOps"
echo "   - Add token to repository secrets as VSCE_PAT"
echo ""

echo "3. 🛡️ Branch Protection"
echo "   - Go to Settings → Branches"
echo "   - Add rule for main branch"
echo "   - Require status checks to pass"
echo "   - Require pull request reviews"
echo ""

echo "4. 📊 Workflow Status Badges"
echo "   Add these to your README.md:"
echo "   \`\`\`markdown"
echo "   ![CI](https://github.com/\$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\)\/\([^.]*\).*/\1\/\2/')/workflows/CI/badge.svg)"
echo "   ![Release](https://github.com/\$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\)\/\([^.]*\).*/\1\/\2/')/workflows/Release/badge.svg)"
echo "   \`\`\`"
echo ""

echo "5. 🧪 Test the Workflows"
echo "   - Push changes to trigger CI workflow"
echo "   - Check GitHub Actions tab for status"
echo ""

echo "📋 Available Workflows"
echo "======================"
echo "✅ CI (ci.yml) - Runs on push/PR"
echo "✅ Release (release.yml) - Runs on v* tags"
echo "✅ Prerelease (prerelease.yml) - Runs on v*-alpha/beta/rc tags"
echo "✅ Version Bump (version-bump.yml) - Manual workflow"
echo "✅ Auto Release (auto-release.yml) - Runs on main push"
echo ""

echo "🚀 Quick Start Commands"
echo "======================"
echo ""

echo "# Test the extension locally"
echo "npm test"
echo "npm run lint"
echo "npm run compile"
echo "npm run package"
echo ""

echo "# Create a test release"
echo "npm version patch"
echo "git add ."
echo "git commit -m 'chore: bump version'"
echo "git tag v\$NEW_VERSION"
echo "git push origin v\$NEW_VERSION"
echo ""

echo "# Use automated version bump"
echo "# Go to GitHub Actions → Version Bump → Run workflow"
echo ""

echo "📚 Documentation"
echo "==============="
echo "📖 CI_CD_GUIDE.md - Complete setup and usage guide"
echo "📖 PUBLISHING.md - Publishing to VS Code marketplace"
echo "📖 TESTING.md - Testing the extension"
echo ""

print_success "CI/CD setup instructions completed!"
echo ""
echo "💡 Next Steps:"
echo "1. Add repository secrets (VSCE_PAT)"
echo "2. Set up branch protection"
echo "3. Test workflows with a push"
echo "4. Create your first release"
echo ""
echo "🎉 Your CI/CD pipeline is ready to automate releases!" 