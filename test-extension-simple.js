// Simple test to verify extension is working
console.log('Testing SSH Extension...');

// Check if we can access VS Code API
try {
  const vscode = require('vscode');
  console.log('✅ VS Code API accessible');
  
  // Test if extension is loaded
  console.log('Extension should be loaded with activation event "*"');
  
  // List available commands
  vscode.commands.getCommands().then(commands => {
    const sshCommands = commands.filter(cmd => cmd.startsWith('remote-ssh'));
    console.log('Available SSH commands:', sshCommands);
    
    if (sshCommands.length > 0) {
      console.log('✅ SSH commands are registered');
    } else {
      console.log('❌ No SSH commands found');
    }
  }).catch(err => {
    console.error('Error getting commands:', err);
  });
  
} catch (error) {
  console.error('❌ Cannot access VS Code API:', error);
} 