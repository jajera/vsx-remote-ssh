// Minimal test to check extension loading
const path = require('path');

console.log('Testing extension loading...');

try {
  // Try to load the extension
  const extensionPath = path.join(__dirname, 'out', 'extension.js');
  console.log('Extension path:', extensionPath);
  
  const extension = require(extensionPath);
  console.log('✅ Extension loaded successfully');
  console.log('Available exports:', Object.keys(extension));
  
  // Check if activate function exists
  if (typeof extension.activate === 'function') {
    console.log('✅ activate function exists');
  } else {
    console.log('❌ activate function missing');
  }
  
  // Check if deactivate function exists
  if (typeof extension.deactivate === 'function') {
    console.log('✅ deactivate function exists');
  } else {
    console.log('❌ deactivate function missing');
  }
  
} catch (error) {
  console.error('❌ Failed to load extension:', error.message);
  console.error('Stack:', error.stack);
} 