// Minimal test for SSH extension
console.log('Testing minimal SSH extension...');

// Test if the extension file exists and can be loaded
try {
  const extension = require('./out/extension.js');
  console.log('✅ Extension file loaded successfully');
  
  // Test if the activate function exists
  if (typeof extension.activate === 'function') {
    console.log('✅ Activate function exists');
  } else {
    console.log('❌ Activate function not found');
  }
  
  // Test if the deactivate function exists
  if (typeof extension.deactivate === 'function') {
    console.log('✅ Deactivate function exists');
  } else {
    console.log('❌ Deactivate function not found');
  }
  
  // Test if the getExtension function exists
  if (typeof extension.getExtension === 'function') {
    console.log('✅ GetExtension function exists');
  } else {
    console.log('❌ GetExtension function not found');
  }
  
} catch (error) {
  console.error('❌ Failed to load extension:', error);
} 