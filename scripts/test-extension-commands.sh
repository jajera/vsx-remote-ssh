#!/bin/bash

# Test script to verify extension commands are properly registered
echo "🧪 Testing SSH Remote Extension Commands"
echo "========================================"

# Compile the extension
echo "📦 Compiling extension..."
npm run compile

if [ $? -ne 0 ]; then
    echo "❌ Compilation failed"
    exit 1
fi

echo "✅ Compilation successful"

# Launch VS Code Extension Development Host
echo "🚀 Launching VS Code Extension Development Host..."
echo ""
echo "📋 Testing Instructions:"
echo "========================"
echo "1. In the new VS Code window that opens:"
echo "2. Press Ctrl+Shift+P to open Command Palette"
echo "3. Type 'Remote SSH' to see available commands"
echo "4. Try 'Remote SSH: Add SSH Host' command"
echo "5. Check that the command works without errors"
echo ""
echo "🔧 Expected Commands:"
echo "====================="
echo "- Remote SSH: Connect to Host via SSH"
echo "- Remote SSH: Add SSH Host"
echo "- Remote SSH: Disconnect"
echo "- Remote SSH: Show Active Connections"
echo "- Remote SSH: Manage SSH Hosts"
echo "- Remote SSH: Open Remote Terminal"
echo "- Remote SSH: Open Remote Workspace"
echo ""
echo "📝 If you see 'command not found' errors, the extension isn't loading properly"
echo "📝 If commands appear and work, the extension is functioning correctly"
echo ""

# Launch VS Code with the extension
code --extensionDevelopmentPath="$(pwd)" --disable-extensions

echo ""
echo "✅ Extension Development Host launched"
echo "💡 Check the new VS Code window for the extension functionality" 