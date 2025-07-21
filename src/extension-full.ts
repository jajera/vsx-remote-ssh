/**
 * Full VSX Remote SSH Extension with all SSH functionality
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
import { SSHErrorClassifier } from './ssh/error-classifier';
import { ConnectionStateManagerImpl } from './ssh/connection-state-manager';
import { CommandPaletteIntegration } from './vscode/command-palette-integration';
import { MountTerminalCommands } from './vscode/mount-terminal-commands';
import { MountSourceControlCommands } from './vscode/mount-source-control-commands';
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
  private mountTerminalCommands: MountTerminalCommands | undefined;
  private mountSourceControlCommands: MountSourceControlCommands | undefined;
  private workspaceContextManager: WorkspaceContextManager;
  private notificationService: NotificationService;
  private performanceMonitor: PerformanceMonitor;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    console.log('DEBUG: Full extension constructor started');
    
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
    
    console.log('DEBUG: Full extension constructor completed');
  }

  /**
   * Initialize the extension
   */
  async activate(): Promise<void> {
    try {
      console.log('DEBUG: Full extension activate started');
      
      // Initialize the extension bridge
      await this.extensionBridge.initialize();
      console.log('DEBUG: Extension bridge initialized');
      
      // Initialize the extension bridge extension
      this.extensionBridgeExt.initialize();
      console.log('DEBUG: Extension bridge extension initialized');

      // Register commands using the command palette integration
      this.commandPaletteIntegration.registerCommands();
      console.log('DEBUG: Commands registered');

      // Initialize mount terminal commands if a mount manager is available
      this.initializeMountTerminalCommands();
      console.log('DEBUG: Mount terminal commands initialized');
      
      // Initialize mount source control commands if a mount manager is available
      this.initializeMountSourceControlCommands();
      console.log('DEBUG: Mount source control commands initialized');

      // Load cached data
      await this.fileCache.loadFromDisk();
      console.log('DEBUG: Cache loaded');

      // Start performance monitoring
      this.performanceMonitor.startLatencyMonitoring(this.connectionManager);
      this.performanceMonitor.startMemoryMonitoring(this.connectionManager);
      console.log('DEBUG: Performance monitoring started');

      // Auto-connect if configured
      await this.autoConnectIfConfigured();
      console.log('DEBUG: Auto-connect completed');

      console.log('Full SSH Remote Extension activated successfully');
    } catch (error) {
      console.error('Failed to activate full SSH Remote Extension:', error);
      throw error;
    }
  }
  
  /**
   * Initialize mount terminal commands if a mount manager is available
   */
  private initializeMountTerminalCommands(): void {
    try {
      // Check if we have a mount manager available
      // This would typically be initialized elsewhere when the mount functionality is set up
      const mountManager = (this as any).mountManager;
      
      if (mountManager) {
        // Initialize mount terminal commands
        this.mountTerminalCommands = new MountTerminalCommands(
          this.extensionBridge,
          mountManager
        );
        
        // Register mount terminal commands
        this.mountTerminalCommands.registerCommands();
        console.log('DEBUG: Mount terminal commands registered');
      } else {
        console.log('DEBUG: Mount manager not available, skipping mount terminal commands initialization');
      }
    } catch (error) {
      console.error('Failed to initialize mount terminal commands:', error);
    }
  }
  
  /**
   * Initialize mount source control commands if a mount manager is available
   */
  private initializeMountSourceControlCommands(): void {
    try {
      // Check if we have a mount manager available
      // This would typically be initialized elsewhere when the mount functionality is set up
      const mountManager = (this as any).mountManager;
      
      if (mountManager) {
        // Get the source control provider from the extension bridge
        const sourceControlProvider = (this.extensionBridge as any).mountSourceControlProvider;
        
        if (sourceControlProvider) {
          // Initialize mount source control commands
          this.mountSourceControlCommands = new MountSourceControlCommands(
            this.extensionBridge,
            mountManager,
            sourceControlProvider
          );
          
          // Register mount source control commands
          this.mountSourceControlCommands.registerCommands();
          console.log('DEBUG: Mount source control commands registered');
        } else {
          console.log('DEBUG: Source control provider not available, skipping mount source control commands initialization');
        }
      } else {
        console.log('DEBUG: Mount manager not available, skipping mount source control commands initialization');
      }
    } catch (error) {
      console.error('Failed to initialize mount source control commands:', error);
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
      if (this.mountTerminalCommands) {
        this.mountTerminalCommands.dispose();
      }
      if (this.mountSourceControlCommands) {
        this.mountSourceControlCommands.dispose();
      }
      this.workspaceContextManager.dispose();
      this.notificationService.dispose();
      this.performanceMonitor.dispose();
      this.disposables.forEach(d => d.dispose());

      console.log('Full SSH Remote Extension deactivated');
    } catch (error) {
      console.error('Error during full extension deactivation:', error);
    }
  }

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