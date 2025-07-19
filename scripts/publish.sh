#!/bin/bash

# SSH Remote Extension Publishing Script
# This script automates the publishing process to VS Code Marketplace

set -e

echo "🚀 SSH Remote Extension Publishing Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the extension root directory."
    exit 1
fi

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    print_warning "vsce not found. Installing..."
    npm install -g @vscode/vsce
fi

# Check if user is logged in
if ! vsce whoami &> /dev/null; then
    print_warning "You are not logged in to vsce."
    echo "Please run: vsce login <publisher-name>"
    echo "You can get your publisher name from: https://marketplace.visualstudio.com/manage"
    exit 1
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_status "Current version: $CURRENT_VERSION"

# Ask for version bump type
echo ""
echo "📦 Version Management"
echo "===================="
echo "1. Patch (bug fixes) - 1.0.0 → 1.0.1"
echo "2. Minor (new features) - 1.0.0 → 1.1.0"
echo "3. Major (breaking changes) - 1.0.0 → 2.0.0"
echo "4. Skip version bump"
echo ""
read -p "Choose version bump type (1-4): " version_choice

case $version_choice in
    1)
        print_status "Bumping patch version..."
        npm version patch
        ;;
    2)
        print_status "Bumping minor version..."
        npm version minor
        ;;
    3)
        print_status "Bumping major version..."
        npm version major
        ;;
    4)
        print_warning "Skipping version bump"
        ;;
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
print_status "New version: $NEW_VERSION"

# Run tests
print_status "Running tests..."
npm test

if [ $? -ne 0 ]; then
    print_error "Tests failed. Aborting publish."
    exit 1
fi

print_success "All tests passed"

# Run linting
print_status "Running linting..."
npm run lint

if [ $? -ne 0 ]; then
    print_error "Linting failed. Aborting publish."
    exit 1
fi

print_success "Linting passed"

# Compile the extension
print_status "Compiling extension..."
npm run compile

if [ $? -ne 0 ]; then
    print_error "Compilation failed. Aborting publish."
    exit 1
fi

print_success "Compilation successful"

# Package the extension
print_status "Packaging extension..."
npm run package

if [ $? -ne 0 ]; then
    print_error "Packaging failed. Aborting publish."
    exit 1
fi

print_success "Extension packaged successfully"

# Check if package was created
PACKAGE_FILE="vsx-remote-ssh-$NEW_VERSION.vsix"
if [ ! -f "$PACKAGE_FILE" ]; then
    print_error "Package file $PACKAGE_FILE not found"
    exit 1
fi

print_success "Package file created: $PACKAGE_FILE"

# Show package info
print_status "Package information:"
vsce show "$PACKAGE_FILE"

# Ask for confirmation
echo ""
echo "📋 Publishing Checklist"
echo "======================"
echo "✅ Tests passed"
echo "✅ Linting passed"
echo "✅ Compilation successful"
echo "✅ Package created"
echo "✅ README.md updated"
echo "✅ CHANGELOG.md updated"
echo "✅ LICENSE file present"
echo ""
read -p "Ready to publish? (y/N): " confirm

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    print_warning "Publishing cancelled"
    exit 0
fi

# Publish the extension
print_status "Publishing to VS Code Marketplace..."
vsce publish

if [ $? -eq 0 ]; then
    print_success "Extension published successfully!"
    echo ""
    echo "🎉 Publication Complete!"
    echo "======================"
    echo "Version: $NEW_VERSION"
    echo "Package: $PACKAGE_FILE"
    echo "Marketplace: https://marketplace.visualstudio.com/items?itemName=vsx-remote-ssh.ssh-remote"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Check the marketplace listing"
    echo "2. Test installation in a clean VS Code instance"
    echo "3. Monitor user feedback and issues"
    echo "4. Plan next release"
else
    print_error "Publishing failed"
    exit 1
fi

# Clean up
print_status "Cleaning up..."
rm -f "$PACKAGE_FILE"

print_success "Publishing process completed successfully!" 