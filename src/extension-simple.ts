/**
 * Simple VSX Remote SSH Extension Entry Point for Testing
 */
import * as vscode from 'vscode';

/**
 * Simple extension class for testing activation
 */
export class SimpleSSHExtension {
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    console.log('DEBUG: Simple extension constructor started');
    
    // Register a simple test command immediately
    this.disposables.push(
      vscode.commands.registerCommand('remote-ssh.test', () => {
        vscode.window.showInformationMessage('SSH Extension is working!');
        console.log('DEBUG: Test command executed');
      })
    );
    
    // Register the activation test command
    this.disposables.push(
      vscode.commands.registerCommand('remote-ssh.test-activation', () => {
        vscode.window.showInformationMessage('Extension activation test successful!');
        console.log('DEBUG: Activation test command executed');
      })
    );
    
    console.log('DEBUG: Simple extension constructor completed');
  }

  /**
   * Initialize the extension
   */
  async activate(): Promise<void> {
    try {
      console.log('DEBUG: Simple extension activate started');
      
      console.log('DEBUG: Simple extension activated successfully');
    } catch (error) {
      console.error('Failed to activate simple SSH Extension:', error);
      vscode.window.showErrorMessage('Failed to activate simple SSH Extension');
    }
  }

  /**
   * Deactivate the extension
   */
  async deactivate(): Promise<void> {
    try {
      this.disposables.forEach(d => d.dispose());
      console.log('Simple SSH Extension deactivated');
    } catch (error) {
      console.error('Error during simple extension deactivation:', error);
    }
  }
}

// Global extension instance
let extension: SimpleSSHExtension;

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    console.log('DEBUG: Activating Simple VSX Remote SSH Extension...');
    console.log('DEBUG: Extension context:', context.extension.id);
    console.log('DEBUG: Extension path:', context.extension.extensionPath);
    
    // Create and activate the extension
    extension = new SimpleSSHExtension(context);
    console.log('DEBUG: Simple extension instance created');
    
    await extension.activate();
    console.log('DEBUG: Simple extension activate() completed');

    console.log('DEBUG: Simple VSX Remote SSH Extension activated successfully');
    
    // Show welcome message
    vscode.window.showInformationMessage('Simple SSH Extension activated successfully!');
    
  } catch (error) {
    console.error('DEBUG: Failed to activate Simple VSX Remote SSH Extension:', error);
    vscode.window.showErrorMessage(`Failed to activate Simple VSX Remote SSH Extension: ${error}`);
    throw error;
  }
}

/**
 * Extension deactivation function
 */
export async function deactivate(): Promise<void> {
  try {
    console.log('Deactivating Simple VSX Remote SSH Extension...');
    
    if (extension) {
      await extension.deactivate();
    }
    
    console.log('Simple VSX Remote SSH Extension deactivated successfully');
  } catch (error) {
    console.error('Error during Simple VSX Remote SSH Extension deactivation:', error);
  }
}

/**
 * Get the global extension instance
 */
export function getExtension(): SimpleSSHExtension {
  return extension;
} 