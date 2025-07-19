/**
 * VSX Remote SSH Extension Entry Point
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { SSHConnectionManagerImpl } from './ssh/connection-manager';
import { RemoteFileSystemProviderImpl } from './ssh/remote-file-system-provider';
import { RemoteTerminalProviderImpl } from './ssh/remote-terminal-provider';
import { RemoteFileCache } from './ssh/remote-file-cache';
import { ConfigurationManager } from './config/configuration-manager';
import { ExtensionHostBridgeImpl } from './vscode/extension-host-bridge';
import { ExtensionHostBridgeExtension } from './vscode/extension-host-bridge-extension';
import { SSHErrorClassifier } from './ssh/error-classifier.js';
import { ConnectionStateManagerImpl } from './ssh/connection-state-manager';
import { CommandPaletteIntegration } from './vscode/command-palette-integration';
import { WorkspaceContextManager } from './vscode/workspace-context-manager';
import { NotificationService, NotificationLevel } from './vscode/notification-service';
import { PerformanceMonitor } from './ssh/performance-monitor';

/**
 * Main extension class that coordinates all SSH remote functionality
 */
export class SSHRemoteExtension {
  private connectionManager: SSHConnectionManagerImpl;
  private configManager: ConfigurationManager;
  private fileCache: RemoteFileCache;
  private terminalProvider: RemoteTerminalProviderImpl;
  private extensionBridge: ExtensionHostBridgeImpl;
  private extensionBridgeExt: ExtensionHostBridgeExtension;
  private errorClassifier: SSHErrorClassifier;
  private stateManager: ConnectionStateManagerImpl;
  private commandPaletteIntegration: CommandPaletteIntegration;
  private workspaceContextManager: WorkspaceContextManager;
  private notificationService: NotificationService;
  private performanceMonitor: PerformanceMonitor;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    // Initialize notification service
    this.notificationService = NotificationService.getInstance();
    
    // Initialize configuration manager
    const configDir = path.join(os.homedir(), '.vscode', 'ssh-remote');
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.configManager = new ConfigurationManager(configDir, workspaceRoot);

    // Initialize file cache
    const cacheConfig = {
      maxSize: 100 * 1024 * 1024, // 100MB
      maxAge: 30 * 60 * 1000, // 30 minutes
      cacheDir: path.join(configDir, 'cache'),
      enableCompression: true
    };
    this.fileCache = new RemoteFileCache(cacheConfig);

    // Initialize error classifier
    this.errorClassifier = new SSHErrorClassifier();

    // Initialize connection state manager
    this.stateManager = new ConnectionStateManagerImpl(context);

    // Initialize connection manager with notification service
    this.connectionManager = new SSHConnectionManagerImpl(this.stateManager);

    // Initialize terminal provider
    this.terminalProvider = new RemoteTerminalProviderImpl();

    // Initialize extension bridge
    this.extensionBridge = new ExtensionHostBridgeImpl(
      this.connectionManager,
      this.configManager,
      this.fileCache,
      this.terminalProvider
    );
    
    // Initialize extension bridge extension for extension compatibility
    this.extensionBridgeExt = new ExtensionHostBridgeExtension(this.connectionManager);
    
    // Initialize workspace context manager
    this.workspaceContextManager = new WorkspaceContextManager(
      context,
      this.connectionManager,
      this.configManager
    );
    
    // Initialize command palette integration with workspace context manager
    this.commandPaletteIntegration = new CommandPaletteIntegration(
      this.extensionBridge,
      this.connectionManager,
      this.configManager,
      this.workspaceContextManager
    );
    
    // Initialize performance monitor
    this.performanceMonitor = PerformanceMonitor.getInstance();
  }

  /**
   * Initialize the extension
   */
  async activate(): Promise<void> {
    try {
      // Initialize the extension bridge
      await this.extensionBridge.initialize();
      
      // Initialize the extension bridge extension
      this.extensionBridgeExt.initialize();

      // Register commands using the command palette integration
      this.commandPaletteIntegration.registerCommands();

      // Ensure the main command is registered directly as well for redundancy
      this.context.subscriptions.push(
        vscode.commands.registerCommand('remote-ssh.connect', () => this.extensionBridge.showHostSelection())
      );

      // Load cached data
      await this.fileCache.loadFromDisk();

      // Start performance monitoring
      this.performanceMonitor.startLatencyMonitoring(this.connectionManager);
      this.performanceMonitor.startMemoryMonitoring(this.connectionManager);

      // Auto-connect if configured
      await this.autoConnectIfConfigured();

      console.log('SSH Remote Extension activated successfully');
    } catch (error) {
      console.error('Failed to activate SSH Remote Extension:', error);
      vscode.window.showErrorMessage('Failed to activate SSH Remote Extension');
    }
  }

  /**
   * Deactivate the extension
   */
  async deactivate(): Promise<void> {
    try {
      // Disconnect all connections
      await this.connectionManager.disconnectAll();

      // Dispose of all resources
      this.extensionBridge.dispose();
      this.extensionBridgeExt.dispose();
      this.commandPaletteIntegration.dispose();
      this.workspaceContextManager.dispose();
      this.notificationService.dispose();
      this.performanceMonitor.dispose();
      this.disposables.forEach(d => d.dispose());

      console.log('SSH Remote Extension deactivated');
    } catch (error) {
      console.error('Error during extension deactivation:', error);
    }
  }

  // Command registration is now handled by CommandPaletteIntegration

  /**
   * Auto-connect if configured
   */
  private async autoConnectIfConfigured(): Promise<void> {
    const settings = this.configManager.getWorkspaceSettings();
    if (settings.autoConnectOnOpen) {
      const defaultHost = await this.configManager.getDefaultHost();
      if (defaultHost) {
        try {
          await this.extensionBridge.connectToHost(defaultHost);
        } catch (error) {
          console.warn('Auto-connect failed:', error);
        }
      }
    }
  }

  /**
   * Show cache statistics
   */
  private showCacheStatistics(): void {
    const stats = this.fileCache.getStats();
    const message = `Cache Statistics:
- Total files: ${stats.totalFiles}
- Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB
- Hit rate: ${(stats.hitRate * 100).toFixed(1)}%
- Miss rate: ${(stats.missRate * 100).toFixed(1)}%
- Evictions: ${stats.evictions}`;

    vscode.window.showInformationMessage(message);
  }

  /**
   * Clear the file cache
   */
  private async clearCache(): Promise<void> {
    try {
      await this.fileCache.clearCache();
      vscode.window.showInformationMessage('Cache cleared successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to clear cache: ${error}`);
    }
  }

  /**
   * Export configuration
   */
  private exportConfiguration(): void {
    try {
      const config = this.configManager.exportConfiguration();
      const configJson = JSON.stringify(config, null, 2);
      
      // Create a new untitled document with the configuration
      vscode.workspace.openTextDocument({
        content: configJson,
        language: 'json'
      }).then(doc => {
        vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage('Configuration exported to new document');
      });
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to export configuration: ${error}`);
    }
  }

  /**
   * Import configuration
   */
  private async importConfiguration(): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument();
      const text = document.getText();
      const config = JSON.parse(text);
      
      this.configManager.importConfiguration(config);
      vscode.window.showInformationMessage('Configuration imported successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to import configuration: ${error}`);
    }
  }

  /**
   * Get the connection manager
   */
  getConnectionManager(): SSHConnectionManagerImpl {
    return this.connectionManager;
  }

  /**
   * Get the configuration manager
   */
  getConfigurationManager(): ConfigurationManager {
    return this.configManager;
  }

  /**
   * Get the file cache
   */
  getFileCache(): RemoteFileCache {
    return this.fileCache;
  }

  /**
   * Get the terminal provider
   */
  getTerminalProvider(): RemoteTerminalProviderImpl {
    return this.terminalProvider;
  }

  /**
   * Get the extension bridge
   */
  getExtensionBridge(): ExtensionHostBridgeImpl {
    return this.extensionBridge;
  }
  
  /**
   * Get the extension bridge extension
   */
  getExtensionBridgeExtension(): ExtensionHostBridgeExtension {
    return this.extensionBridgeExt;
  }
}

// Global extension instance
let extension: SSHRemoteExtension;

/**
 * Extension activation function
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    console.log('Activating VSX Remote SSH Extension...');
    
    // Create and activate the extension
    extension = new SSHRemoteExtension(context);
    await extension.activate();
    
    // Register additional utility commands
    context.subscriptions.push(
      vscode.commands.registerCommand('remote-ssh.showCacheStatistics', () => {
        // Show cache statistics in a notification
        vscode.window.showInformationMessage('Cache statistics feature not implemented yet');
      }),
      
      vscode.commands.registerCommand('remote-ssh.clearCache', async () => {
        await extension.getFileCache().clearCache();
        vscode.window.showInformationMessage('Remote SSH: Cache cleared successfully');
      }),
      
      vscode.commands.registerCommand('remote-ssh.exportConfiguration', () => {
        const config = extension.getConfigurationManager().exportConfiguration();
        const configJson = JSON.stringify(config, null, 2);
        
        vscode.workspace.openTextDocument({
          content: configJson,
          language: 'json'
        }).then(doc => {
          vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage('Remote SSH: Configuration exported to new document');
        });
      }),
      
      vscode.commands.registerCommand('remote-ssh.importConfiguration', async () => {
        const options: vscode.OpenDialogOptions = {
          canSelectMany: false,
          openLabel: 'Import',
          filters: {
            'JSON Files': ['json']
          }
        };
        
        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
          try {
            const document = await vscode.workspace.openTextDocument(fileUri[0]);
            const text = document.getText();
            const config = JSON.parse(text);
            
            extension.getConfigurationManager().importConfiguration(config);
            vscode.window.showInformationMessage('Remote SSH: Configuration imported successfully');
          } catch (error) {
            vscode.window.showErrorMessage(`Remote SSH: Failed to import configuration: ${error}`);
          }
        }
      })
    );
    
    console.log('VSX Remote SSH Extension activated successfully');
    
    // Show welcome message on first install
    const firstInstall = context.globalState.get('remote-ssh.firstInstall');
    if (firstInstall === undefined) {
      vscode.window.showInformationMessage(
        'VSX Remote SSH Extension has been installed. Use the "Connect to Host via SSH" command to get started.',
        'Show Documentation'
      ).then(selection => {
        if (selection === 'Show Documentation') {
          vscode.env.openExternal(vscode.Uri.parse('https://github.com/jajera/vsx-remote-ssh'));
        }
      });
      
      context.globalState.update('remote-ssh.firstInstall', false);
    }
  } catch (error) {
    console.error('Failed to activate VSX Remote SSH Extension:', error);
    vscode.window.showErrorMessage(`Failed to activate VSX Remote SSH Extension: ${error}`);
    throw error;
  }
}

/**
 * Extension deactivation function
 */
export async function deactivate(): Promise<void> {
  try {
    console.log('Deactivating VSX Remote SSH Extension...');
    
    if (extension) {
      await extension.deactivate();
    }
    
    console.log('VSX Remote SSH Extension deactivated successfully');
  } catch (error) {
    console.error('Error during VSX Remote SSH Extension deactivation:', error);
  }
}

/**
 * Get the global extension instance
 */
export function getExtension(): SSHRemoteExtension {
  return extension;
}