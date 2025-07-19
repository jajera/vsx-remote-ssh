// Simple test extension
const vscode = require('vscode');

function activate(context) {
    console.log('DEBUG: Simple test extension activated');
    
    // Register a simple command
    const disposable = vscode.commands.registerCommand('test-simple.hello', () => {
        vscode.window.showInformationMessage('Hello from simple test extension!');
    });
    
    context.subscriptions.push(disposable);
    console.log('DEBUG: Simple test command registered');
}

function deactivate() {
    console.log('DEBUG: Simple test extension deactivated');
}

module.exports = {
    activate,
    deactivate
}; 