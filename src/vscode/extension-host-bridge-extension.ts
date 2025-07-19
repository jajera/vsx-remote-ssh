/**
 * Extension Host Bridge Extension
 * Implements the extension compatibility layer for the VSX Remote SSH extension
 */
import * as vscode from 'vscode';
import { SSHConnectionManager, SSHConnection } from '../interfaces/ssh';
import { ExtensionManager, DebugSessionManager, LanguageServerManager } from '../interfaces/extension';
import { ExtensionManagerImpl } from './extension-manager';
import { DebugSessionManagerImpl } from './debug-session-manager';
import { LanguageServerManagerImpl } from './language-server-manager';

/**
 * Extension Host Bridge Extension
 * Extends the core bridge with extension compatibility features
 */
export class ExtensionHostBridgeExtension {
  private extensionManager: ExtensionManager;
  private debugSessionManager: DebugSessionManager;
  private languageServerManager: LanguageServerManager;
  private disposables: vscode.Disposable[] = [];

  constructor(private connectionManager: SSHConnectionManager) {
    // Initialize extension compatibility components
    this.extensionManager = new ExtensionManagerImpl(connectionManager);
    this.debugSessionManager = new DebugSessionManagerImpl(connectionManager);
    this.languageServerManager = new LanguageServerManagerImpl(connectionManager);
  }

  /**
   * Initialize the extension host bridge extension
   */
  initialize(): void {
    // Register commands
    this.registerCommands();
  }

  /**
   * Register extension-related commands
   */
  private registerCommands(): void {
    // Show extension manager
    this.disposables.push(
      vscode.commands.registerCommand('ssh-remote.showExtensionManager', async (connectionId: string) => {
        await this.showExtensionManager(connectionId);
      })
    );
    
    // Install extension
    this.disposables.push(
      vscode.commands.registerCommand('ssh-remote.installExtension', async (connectionId: string, extensionId: string) => {
        await this.installExtension(connectionId, extensionId);
      })
    );
    
    // Uninstall extension
    this.disposables.push(
      vscode.commands.registerCommand('ssh-remote.uninstallExtension', async (connectionId: string, extensionId: string) => {
        await this.uninstallExtension(connectionId, extensionId);
      })
    );
    
    // Synchronize extensions
    this.disposables.push(
      vscode.commands.registerCommand('ssh-remote.synchronizeExtensions', async (connectionId: string) => {
        await this.synchronizeExtensions(connectionId);
      })
    );
    
    // Start debug session
    this.disposables.push(
      vscode.commands.registerCommand('ssh-remote.startDebugSession', async (connectionId: string, config: vscode.DebugConfiguration) => {
        await this.startDebugSession(connectionId, config);
      })
    );
  }

  /**
   * Show the extension manager UI
   */
  async showExtensionManager(connectionId: string): Promise<void> {
    try {
      // Get remote extensions
      const remoteExtensions = await (this.extensionManager as ExtensionManagerImpl).getRemoteExtensions(connectionId);
      
      // Show extensions in a quick pick
      const items = remoteExtensions.map(ext => `${ext.name} (${ext.version}) - ${ext.isCompatible ? 'Compatible' : 'Not Compatible'}`);
      
      const selected = await vscode.window.showQuickPick([
        ...items,
        '$(add) Install New Extension',
        '$(sync) Synchronize Extensions',
        '$(close) Close'
      ], { placeHolder: 'Remote Extensions' });
      
      if (!selected) {
        return;
      }
      
      if (selected === '$(add) Install New Extension') {
        await this.showInstallExtensionUI(connectionId);
      } else if (selected === '$(sync) Synchronize Extensions') {
        await this.synchronizeExtensions(connectionId);
      } else if (selected !== '$(close) Close') {
        // Handle extension selection
        const index = items.indexOf(selected);
        if (index !== -1) {
          const extension = remoteExtensions[index];
          await this.showExtensionOptions(connectionId, extension);
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to show extension manager: ${error}`);
    }
  }
  
  /**
   * Show options for a selected extension
   */
  private async showExtensionOptions(connectionId: string, extension: any): Promise<void> {
    const options = ['Uninstall', 'Cancel'];
    const selected = await vscode.window.showQuickPick(options, { placeHolder: `${extension.name} (${extension.version})` });
    
    if (selected === 'Uninstall') {
      await this.uninstallExtension(connectionId, extension.id);
    }
  }
  
  /**
   * Show UI for installing a new extension
   */
  private async showInstallExtensionUI(connectionId: string): Promise<void> {
    const extensionId = await vscode.window.showInputBox({
      prompt: 'Enter extension ID (e.g., publisher.name)',
      placeHolder: 'publisher.name'
    });
    
    if (!extensionId) {
      return;
    }
    
    await this.installExtension(connectionId, extensionId);
  }
  
  /**
   * Install an extension on the remote host
   */
  async installExtension(connectionId: string, extensionId: string): Promise<void> {
    try {
      vscode.window.showInformationMessage(`Installing extension ${extensionId}...`);
      
      const result = await (this.extensionManager as ExtensionManagerImpl).installExtension(connectionId, extensionId);
      
      if (result.status === 'installed') {
        vscode.window.showInformationMessage(`Extension ${extensionId} installed successfully`);
      } else {
        vscode.window.showErrorMessage(`Failed to install extension: ${result.error}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install extension: ${error}`);
    }
  }
  
  /**
   * Uninstall an extension from the remote host
   */
  async uninstallExtension(connectionId: string, extensionId: string): Promise<void> {
    try {
      vscode.window.showInformationMessage(`Uninstalling extension ${extensionId}...`);
      
      const result = await (this.extensionManager as ExtensionManagerImpl).uninstallExtension(connectionId, extensionId);
      
      if (result) {
        vscode.window.showInformationMessage(`Extension ${extensionId} uninstalled successfully`);
      } else {
        vscode.window.showErrorMessage(`Failed to uninstall extension`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to uninstall extension: ${error}`);
    }
  }
  
  /**
   * Synchronize extensions from local to remote
   */
  async synchronizeExtensions(connectionId: string): Promise<void> {
    try {
      vscode.window.showInformationMessage('Synchronizing extensions...');
      
      const results = await (this.extensionManager as ExtensionManagerImpl).synchronizeExtensions(connectionId);
      
      const installed = results.filter(r => r.status === 'installed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      
      vscode.window.showInformationMessage(`Synchronized extensions: ${installed} installed, ${failed} failed`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to synchronize extensions: ${error}`);
    }
  }
  
  /**
   * Start a debug session on the remote host
   */
  async startDebugSession(connectionId: string, config: vscode.DebugConfiguration): Promise<void> {
    try {
      vscode.window.showInformationMessage('Starting debug session...');
      
      const session = await (this.debugSessionManager as DebugSessionManagerImpl).startDebugSession(connectionId, config);
      
      vscode.window.showInformationMessage(`Debug session started: ${session.name}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start debug session: ${error}`);
    }
  }
  
  /**
   * Start a language server on the remote host
   */
  async startLanguageServer(connectionId: string, languageId: string): Promise<void> {
    try {
      vscode.window.showInformationMessage(`Starting ${languageId} language server...`);
      
      const result = await this.languageServerManager.startLanguageServer(connectionId, languageId);
      
      if (result) {
        vscode.window.showInformationMessage(`${languageId} language server started successfully`);
      } else {
        vscode.window.showErrorMessage(`Failed to start ${languageId} language server`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to start language server: ${error}`);
    }
  }
  
  /**
   * Stop a language server on the remote host
   */
  async stopLanguageServer(connectionId: string, languageId: string): Promise<void> {
    try {
      await this.languageServerManager.stopLanguageServer(connectionId, languageId);
      vscode.window.showInformationMessage(`${languageId} language server stopped`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to stop language server: ${error}`);
    }
  }
  
  /**
   * Get the extension manager
   */
  getExtensionManager(): ExtensionManager {
    return this.extensionManager;
  }
  
  /**
   * Get the debug session manager
   */
  getDebugSessionManager(): DebugSessionManager {
    return this.debugSessionManager;
  }
  
  /**
   * Get the language server manager
   */
  getLanguageServerManager(): LanguageServerManager {
    return this.languageServerManager;
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Dispose of all disposables
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    
    // Dispose of extension compatibility components
    (this.debugSessionManager as DebugSessionManagerImpl).dispose();
    (this.languageServerManager as LanguageServerManagerImpl).dispose();
  }
}