#!/bin/bash

# SSH Remote Extension Test Script
# This script helps test the extension in development mode

set -e

echo "🚀 SSH Remote Extension Testing Script"
echo "======================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the extension root directory."
    exit 1
fi

# Check if VS Code is installed
if ! command -v code &> /dev/null; then
    echo "❌ Error: VS Code not found. Please install VS Code first."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js not found. Please install Node.js first."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Compile the extension
echo "📦 Compiling extension..."
npm run compile

if [ $? -eq 0 ]; then
    echo "✅ Compilation successful"
else
    echo "❌ Compilation failed"
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
npm test

if [ $? -eq 0 ]; then
    echo "✅ Tests passed"
else
    echo "❌ Tests failed"
    exit 1
fi

# Check if we should launch VS Code
echo ""
echo "🎯 Choose testing method:"
echo "1. Launch VS Code Extension Development Host"
echo "2. Launch VS Code Extension Test Host (clean environment)"
echo "3. Package extension (.vsix file)"
echo "4. Exit"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo "🚀 Launching VS Code Extension Development Host..."
        code --extensionDevelopmentPath="$(pwd)"
        ;;
    2)
        echo "🧪 Launching VS Code Extension Test Host..."
        code --extensionDevelopmentPath="$(pwd)" --disable-extensions
        ;;
    3)
        echo "📦 Packaging extension..."
        npm run package
        if [ $? -eq 0 ]; then
            echo "✅ Package created successfully"
            echo "📁 Look for .vsix file in the current directory"
            echo "💡 To install: code --install-extension ssh-remote-1.0.0.vsix"
        else
            echo "❌ Packaging failed"
        fi
        ;;
    4)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "📋 Testing Checklist:"
echo "===================="
echo "1. Add SSH host configuration"
echo "2. Test connection (password/key auth)"
echo "3. Open remote workspace"
echo "4. Test file operations (read/write/create/delete)"
echo "5. Open remote terminal"
echo "6. Test performance monitoring"
echo "7. Test error handling"
echo ""
echo "🔧 Command Testing:"
echo "=================="
echo "1. Press Ctrl+Shift+P to open command palette"
echo "2. Type 'Remote SSH' to see available commands"
echo "3. Try 'Remote SSH: Add SSH Host' - should work without errors"
echo "4. Try 'Remote SSH: Connect to Host via SSH' - should show host selection"
echo "5. Check status bar shows 'SSH Remote' indicator"
echo ""
echo "📝 Troubleshooting:"
echo "=================="
echo "- If commands show 'not found' error, extension isn't loading"
echo "- Check Developer Tools (Help > Toggle Developer Tools) for errors"
echo "- Check extension logs (Developer: Show Logs > Extension Host)"
echo "- Restart VS Code if needed"
echo ""
echo "📚 For detailed testing guide, see TESTING.md" 