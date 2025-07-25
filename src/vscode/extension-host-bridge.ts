import * as vscode from 'vscode';
import { SSHConnectionManagerImpl } from '../ssh/connection-manager';
import { RemoteFileSystemProviderImpl } from '../ssh/remote-file-system-provider';
import { RemoteTerminalProviderImpl } from '../ssh/remote-terminal-provider';
import { MountTerminalProviderImpl } from '../ssh/mount-terminal-provider';
import { MountSourceControlProviderImpl } from '../ssh/mount-source-control-provider';
import { ConfigurationManager } from '../config/configuration-manager';
import { RemoteFileCache } from '../ssh/remote-file-cache';
import { SSHHostConfig, SSHConfig, ConnectionStatus } from '../interfaces/ssh';
import { MountManager, MountTerminalOptions } from '../interfaces/mount';
import { MountSourceControlProvider } from '../interfaces/source-control';
import { HostConfigurationUI } from '../config/host-configuration-ui';

export interface ExtensionHostBridge {
  initialize(): Promise<void>;
  registerFileSystemProvider(connectionId: string, provider: RemoteFileSystemProviderImpl): void;
  unregisterFileSystemProvider(connectionId: string): void;
  createTerminal(connectionId: string, options?: any): Promise<vscode.Terminal>;
  createTerminalForMount(mountId: string, options?: MountTerminalOptions): Promise<vscode.Terminal>;
  openTerminalInCurrentWorkspaceFolder(): Promise<vscode.Terminal | undefined>;
  initializeSourceControlForMount(mountId: string): Promise<vscode.SourceControl>;
  executeGitCommand(mountId: string, command: string, ...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  refreshSourceControl(mountId: string): Promise<void>;
  updateStatusBar(connectionId: string, status: ConnectionStatus): void;
  showNotification(message: string, type: 'info' | 'warning' | 'error'): void;
  showInputBox(prompt: string, password?: boolean): Promise<string | undefined>;
  showQuickPick(items: string[], placeholder?: string): Promise<string | undefined>;
  openFile(uri: vscode.Uri): Promise<void>;
  revealFile(uri: vscode.Uri): Promise<void>;
  dispose(): void;
}

export class ExtensionHostBridgeImpl implements ExtensionHostBridge {
  private connectionManager: SSHConnectionManagerImpl;
  private configManager: ConfigurationManager;
  private fileCache: RemoteFileCache;
  private terminalProvider: RemoteTerminalProviderImpl;
  private mountTerminalProvider: MountTerminalProviderImpl | undefined;
  private mountSourceControlProvider: MountSourceControlProviderImpl | undefined;
  private mountManager: MountManager | undefined;
  private hostConfigUI: HostConfigurationUI;
  private statusBarItem: vscode.StatusBarItem;
  private fileSystemProviders: Map<string, vscode.FileSystemProvider> = new Map();
  private terminals: Map<string, vscode.Terminal> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor(
    connectionManager: SSHConnectionManagerImpl,
    configManager: ConfigurationManager,
    fileCache: RemoteFileCache,
    terminalProvider: RemoteTerminalProviderImpl
  ) {
    this.connectionManager = connectionManager;
    this.configManager = configManager;
    this.fileCache = fileCache;
    this.terminalProvider = terminalProvider;
    this.hostConfigUI = new HostConfigurationUI(configManager);
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  }

  async initialize(): Promise<void> {
    // Initialize the host configuration UI
    this.hostConfigUI = new HostConfigurationUI(this.configManager);
    
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.text = '$(server) SSH Remote';
    this.statusBarItem.tooltip = 'SSH Remote Extension';
    this.statusBarItem.show();
    this.disposables.push(this.statusBarItem);
    
    // Set up connection monitoring
    this.setupConnectionMonitoring();
    
    console.log('Extension Host Bridge initialized');
  }

  private setupConnectionMonitoring(): void {
    // Monitor connection status changes
    setInterval(() => {
      const activeConnections = this.connectionManager.getActiveConnections();
      if (activeConnections.length > 0) {
        const connection = activeConnections[0]; // For now, show first connection
        this.updateStatusBar(connection.id, connection.status);
      } else {
        this.statusBarItem.text = '$(server) SSH Remote';
        this.statusBarItem.tooltip = 'No active SSH connections';
      }
    }, 5000);
  }

  registerFileSystemProvider(connectionId: string, provider: RemoteFileSystemProviderImpl): void {
    const vscodeProvider = new VSCodeFileSystemProvider(provider);
    this.fileSystemProviders.set(connectionId, vscodeProvider);
  }

  unregisterFileSystemProvider(connectionId: string): void {
    const provider = this.fileSystemProviders.get(connectionId);
    if (provider) {
      this.fileSystemProviders.delete(connectionId);
    }
  }

  async createTerminal(connectionId: string, options?: any): Promise<vscode.Terminal> {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    const remoteTerminal = await this.terminalProvider.createTerminal(connection, options);
    const terminal = vscode.window.createTerminal({
      name: `SSH: ${connection.config.host}`,
      pty: new SSHPseudoTerminal(remoteTerminal)
    });

    this.terminals.set(connectionId, terminal);
    return terminal;
  }

  updateStatusBar(connectionId: string, status: ConnectionStatus): void {
    const connection = this.connectionManager.getConnection(connectionId);
    if (!connection) {return;}

    const statusIcons = {
      [ConnectionStatus.Connected]: '$(check)',
      [ConnectionStatus.Connecting]: '$(sync~spin)',
      [ConnectionStatus.Reconnecting]: '$(sync~spin)',
      [ConnectionStatus.Error]: '$(error)',
      [ConnectionStatus.Disconnected]: '$(server)'
    };

    this.statusBarItem.text = `${statusIcons[status]} SSH: ${connection.config.host}`;
    this.statusBarItem.tooltip = `SSH Connection to ${connection.config.host} (${status})`;
  }

  showNotification(message: string, type: 'info' | 'warning' | 'error'): void {
    switch (type) {
      case 'info':
        vscode.window.showInformationMessage(message);
        break;
      case 'warning':
        vscode.window.showWarningMessage(message);
        break;
      case 'error':
        vscode.window.showErrorMessage(message);
        break;
    }
  }

  async showInputBox(prompt: string, password?: boolean, defaultValue?: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt,
      password,
      ignoreFocusOut: true,
      value: defaultValue
    });
  }

  async showQuickPick(items: string[], placeholder?: string, activeItem?: string): Promise<string | undefined> {
    const options: vscode.QuickPickOptions = {
      placeHolder: placeholder,
      ignoreFocusOut: true
    };
    
    // VS Code doesn't directly support setting an active item in QuickPick
    // We'll return the result as is
    return vscode.window.showQuickPick(items, options);
  }

  async openFile(uri: vscode.Uri): Promise<void> {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  }

  async revealFile(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('revealInExplorer', uri);
  }

  async showHostSelection(): Promise<void> {
    // Use the host configuration UI to show the host selection menu
    const selectedHost = await this.hostConfigUI.showHostSelectionMenu();
    
    if (selectedHost) {
      await this.connectToHost(selectedHost);
    }
  }

  async connectToHost(host: SSHHostConfig): Promise<void> {
    try {
      this.showNotification(`Connecting to ${host.host}...`, 'info');
      
      const connection = await this.connectionManager.connect(host);
      
      if (connection && connection.isConnected()) {
        this.showNotification(`Connected to ${host.host}`, 'info');
        
        // Register file system provider for this connection
        const fileSystemProvider = new RemoteFileSystemProviderImpl(this.connectionManager);
        this.registerFileSystemProvider(connection.id, fileSystemProvider);
        
        // Update status bar
        this.updateStatusBar(connection.id, ConnectionStatus.Connected);
        
        // Open remote workspace if specified
        if (host.remoteWorkspace) {
          try {
            // Create a URI for the remote workspace
            const uri = vscode.Uri.parse(`ssh://${host.username}@${host.host}:${host.port}${host.remoteWorkspace}`);
            
            // Open the folder in a new window
            await vscode.commands.executeCommand('vscode.openFolder', uri);
          } catch (error) {
            this.showNotification(`Failed to open remote workspace: ${error}`, 'warning');
          }
        }
      }
    } catch (error) {
      this.showNotification(`Failed to connect to ${host.host}: ${error}`, 'error');
      throw error;
    }
  }

  async disconnectCurrentHost(): Promise<void> {
    const activeConnections = this.connectionManager.getActiveConnections();
    if (activeConnections.length === 0) {
      this.showNotification('No active SSH connections', 'info');
      return;
    }

    for (const connection of activeConnections) {
      await this.connectionManager.disconnect(connection.id);
      this.unregisterFileSystemProvider(connection.id);
    }

    this.showNotification('Disconnected from all SSH hosts', 'info');
  }

  showActiveConnections(): void {
    const connections = this.connectionManager.getActiveConnections();
    if (connections.length === 0) {
      this.showNotification('No active SSH connections', 'info');
      return;
    }

    const message = connections.map((c: any) => 
      `${c.config.host} (${c.status})`
    ).join('\n');

    vscode.window.showInformationMessage(`Active connections:\n${message}`);
  }

  async openTerminalForCurrentConnection(): Promise<vscode.Terminal | undefined> {
    const activeConnections = this.connectionManager.getActiveConnections();
    
    if (activeConnections.length === 0) {
      this.showNotification('No active SSH connection', 'warning');
      return undefined;
    }
    
    try {
      const connection = activeConnections[0];
      const terminal = await this.createTerminal(connection.id);
      terminal.show();
      return terminal;
    } catch (error) {
      this.showNotification(`Failed to open terminal: ${error}`, 'error');
      return undefined;
    }
  }
  
  /**
   * Set the mount manager for terminal integration with mounted folders
   * @param mountManager The mount manager instance
   */
  setMountManager(mountManager: MountManager): void {
    this.mountManager = mountManager;
    
    // Initialize the mount terminal provider if we have both dependencies
    if (this.mountManager && this.terminalProvider) {
      this.mountTerminalProvider = new MountTerminalProviderImpl(
        this.terminalProvider,
        this.mountManager
      );
    }
    
    // Initialize the mount source control provider
    if (this.mountManager) {
      this.mountSourceControlProvider = new MountSourceControlProviderImpl(
        this.mountManager
      );
    }
  }
  
  /**
   * Initialize source control for a mount point
   * @param mountId The ID of the mount point
   * @returns The source control instance
   */
  async initializeSourceControlForMount(mountId: string): Promise<vscode.SourceControl> {
    if (!this.mountSourceControlProvider || !this.mountManager) {
      throw new Error('Mount source control provider not initialized. Mount manager must be set first.');
    }
    
    const mountPoint = this.mountManager.getMountById(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point with ID ${mountId} not found`);
    }
    
    try {
      const sourceControl = await this.mountSourceControlProvider.initializeSourceControl(mountPoint);
      return sourceControl;
    } catch (error) {
      this.showNotification(`Failed to initialize source control for mount: ${error}`, 'error');
      throw error;
    }
  }
  
  /**
   * Execute a Git command on a mounted folder
   * @param mountId The ID of the mount point
   * @param command The Git command to execute
   * @param args The arguments for the Git command
   * @returns The result of the command execution
   */
  async executeGitCommand(
    mountId: string, 
    command: string, 
    ...args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    if (!this.mountSourceControlProvider || !this.mountManager) {
      throw new Error('Mount source control provider not initialized. Mount manager must be set first.');
    }
    
    const mountPoint = this.mountManager.getMountById(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point with ID ${mountId} not found`);
    }
    
    try {
      return await this.mountSourceControlProvider.executeGitCommand(mountId, command, ...args);
    } catch (error) {
      this.showNotification(`Failed to execute Git command: ${error}`, 'error');
      throw error;
    }
  }
  
  /**
   * Refresh the source control status for a mount point
   * @param mountId The ID of the mount point
   */
  async refreshSourceControl(mountId: string): Promise<void> {
    if (!this.mountSourceControlProvider || !this.mountManager) {
      throw new Error('Mount source control provider not initialized. Mount manager must be set first.');
    }
    
    const mountPoint = this.mountManager.getMountById(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point with ID ${mountId} not found`);
    }
    
    try {
      await this.mountSourceControlProvider.refreshSourceControl(mountId);
    } catch (error) {
      this.showNotification(`Failed to refresh source control: ${error}`, 'error');
      throw error;
    }
  }
  
  /**
   * Create a terminal for a mounted folder
   * @param mountId The ID of the mount point
   * @param options Terminal options
   * @returns A new VS Code terminal
   */
  async createTerminalForMount(mountId: string, options?: MountTerminalOptions): Promise<vscode.Terminal> {
    if (!this.mountTerminalProvider || !this.mountManager) {
      throw new Error('Mount terminal provider not initialized. Mount manager must be set first.');
    }
    
    const mountPoint = this.mountManager.getMountById(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point with ID ${mountId} not found`);
    }
    
    try {
      const terminal = await this.mountTerminalProvider.createTerminalForMount(mountId, options);
      terminal.show();
      return terminal;
    } catch (error) {
      this.showNotification(`Failed to create terminal for mount: ${error}`, 'error');
      throw error;
    }
  }
  
  /**
   * Open a terminal in the current workspace folder if it's a mounted folder
   * @returns A new terminal or undefined if the current folder is not a mounted folder
   */
  async openTerminalInCurrentWorkspaceFolder(): Promise<vscode.Terminal | undefined> {
    if (!this.mountTerminalProvider) {
      this.showNotification('Mount terminal provider not initialized', 'warning');
      return undefined;
    }
    
    try {
      const terminal = await this.mountTerminalProvider.openTerminalInCurrentWorkspaceFolder();
      if (terminal) {
        terminal.show();
        return terminal;
      } else {
        // If no mount was found for the current folder, fall back to regular SSH terminal
        return this.openTerminalForCurrentConnection();
      }
    } catch (error) {
      this.showNotification(`Failed to open terminal in current folder: ${error}`, 'warning');
      return undefined;
    }
  }

  async addNewHost(): Promise<void> {
    // Use the host configuration UI to add a new host
    const newHost = await this.hostConfigUI.addNewHost();
    
    if (newHost) {
      // Ask if user wants to connect now
      const connectNow = await this.showQuickPick(['Yes', 'No'], 'Connect to this host now?');
      if (connectNow === 'Yes') {
        await this.connectToHost(newHost);
      }
    }
  }

  async showHostManagement(): Promise<void> {
    // Use the host configuration UI to show the host management menu
    const selectedHost = await this.hostConfigUI.showHostManagement();
    
    if (selectedHost) {
      // If a host was selected, ask what action to perform
      const options = [
        'Connect',
        'Edit',
        'Delete',
        'Set as Default',
        'Test Connection'
      ];
      
      const action = await this.showQuickPick(options, `Action for ${selectedHost.name}`);
      
      if (!action) {
        return;
      }
      
      switch (action) {
        case 'Connect':
          await this.connectToHost(selectedHost);
          break;
        case 'Edit':
          await this.editHost(selectedHost);
          break;
        case 'Delete':
          await this.deleteHost(selectedHost.id);
          break;
        case 'Set as Default':
          await this.configManager.setDefaultHost(selectedHost.id);
          this.showNotification(`${selectedHost.name} set as default`, 'info');
          break;
        case 'Test Connection':
          await this.testConnection(selectedHost);
          break;
      }
    }
  }

  private async testConnectionImpl(host: SSHHostConfig): Promise<void> {
    try {
      this.showNotification(`Testing connection to ${host.host}...`, 'info');
      
      // Create a temporary connection to test
      const connection = await this.connectionManager.connect(host);
      
      if (connection && connection.isConnected()) {
        this.showNotification(`Connection to ${host.host} successful!`, 'info');
        
        // Disconnect the test connection
        await this.connectionManager.disconnect(connection.id);
      } else {
        this.showNotification(`Failed to connect to ${host.host}`, 'error');
      }
    } catch (error) {
      this.showNotification(`Connection test failed: ${error}`, 'error');
    }
  }

  async testConnection(hostId: string | SSHHostConfig): Promise<void> {
    let host: SSHHostConfig;
    
    if (typeof hostId === 'string') {
      const foundHost = await this.configManager.getHost(hostId);
      if (!foundHost) {
        this.showNotification(`Host with ID ${hostId} not found`, 'error');
        return;
      }
      host = foundHost;
    } else {
      host = hostId;
    }
    
    await this.testConnectionImpl(host);
  }

  private async editHostImpl(host: SSHHostConfig): Promise<void> {
    // Create a multi-step wizard for editing an existing host
    const fields = [
      'Name',
      'Hostname/IP',
      'Username',
      'Port',
      'Authentication Method',
      'Private Key Path',
      'Remote Workspace',
      'Cancel'
    ];
    
    const fieldToEdit = await this.showQuickPick(fields, 'Select field to edit');
    if (!fieldToEdit || fieldToEdit === 'Cancel') {
      return;
    }
    
    const updates: Partial<SSHHostConfig> = {};
    
    switch (fieldToEdit) {
      case 'Name':
        const name = await this.showInputBox('Enter new name', false, host.name);
        if (name) {
          updates.name = name;
        }
        break;
      case 'Hostname/IP':
        const hostname = await this.showInputBox('Enter new hostname or IP address', false, host.host);
        if (hostname) {
          updates.host = hostname;
        }
        break;
      case 'Username':
        const username = await this.showInputBox('Enter new username', false, host.username);
        if (username) {
          updates.username = username;
        }
        break;
      case 'Port':
        const portStr = await this.showInputBox('Enter new port', false, host.port.toString());
        if (portStr) {
          const port = parseInt(portStr, 10);
          if (isNaN(port) || port < 1 || port > 65535) {
            this.showNotification('Invalid port number. Please enter a number between 1 and 65535.', 'error');
            return;
          }
          updates.port = port;
        }
        break;
      case 'Authentication Method':
        const authMethods = ['password', 'key', 'agent'];
        const authMethod = await this.showQuickPick(authMethods, 'Select authentication method');
        if (authMethod) {
          updates.authMethod = authMethod as 'password' | 'key' | 'agent';
        }
        break;
      case 'Private Key Path':
        const keyPath = await this.showInputBox('Enter private key path', false, host.privateKeyPath);
        if (keyPath) {
          updates.privateKeyPath = keyPath;
        }
        break;
      case 'Remote Workspace':
        const workspace = await this.showInputBox('Enter remote workspace path', false, host.remoteWorkspace);
        if (workspace) {
          updates.remoteWorkspace = workspace;
        }
        break;
    }
    
    if (Object.keys(updates).length > 0) {
      try {
        await this.configManager.updateHost(host.id, updates);
        this.showNotification(`Host ${host.name} updated successfully`, 'info');
      } catch (error) {
        this.showNotification(`Failed to update host: ${error}`, 'error');
      }
    }
  }

  async editHost(hostId: string | SSHHostConfig): Promise<void> {
    let host: SSHHostConfig;
    
    if (typeof hostId === 'string') {
      const foundHost = await this.configManager.getHost(hostId);
      if (!foundHost) {
        this.showNotification(`Host with ID ${hostId} not found`, 'error');
        return;
      }
      host = foundHost;
    } else {
      host = hostId;
    }
    
    await this.editHostImpl(host);
  }
  
  /**
   * Delete a host by ID
   * @param hostId The ID of the host to delete
   */
  async deleteHost(hostId: string): Promise<void> {
    const host = await this.configManager.getHost(hostId);
    if (!host) {
      this.showNotification(`Host with ID ${hostId} not found`, 'error');
      return;
    }
    
    const confirmDelete = await this.showQuickPick(['Yes', 'No'], `Are you sure you want to delete ${host.name}?`);
    if (confirmDelete === 'Yes') {
      try {
        await this.configManager.deleteHost(hostId);
        this.showNotification(`Host ${host.name} deleted`, 'info');
      } catch (error) {
        this.showNotification(`Failed to delete host: ${error}`, 'error');
      }
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d.dispose());
    this.terminals.forEach(t => t.dispose());
  }
}

// Helper classes for VS Code integration
class VSCodeFileSystemProvider implements vscode.FileSystemProvider {
  constructor(private remoteProvider: RemoteFileSystemProviderImpl) {}

  onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>().event;
  
  watch(): vscode.FileSystemWatcher {
    return {
      ignoreCreateEvents: false,
      ignoreChangeEvents: false,
      ignoreDeleteEvents: false,
      onDidCreate: new vscode.EventEmitter<vscode.Uri>().event,
      onDidChange: new vscode.EventEmitter<vscode.Uri>().event,
      onDidDelete: new vscode.EventEmitter<vscode.Uri>().event,
      dispose: () => {}
    };
  }

  // Delegate all methods to remote provider
  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    return this.remoteProvider.readFile(uri);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void> {
    return this.remoteProvider.writeFile(uri, content, options);
  }

  async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    return this.remoteProvider.delete(uri, options);
  }

  async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
    return this.remoteProvider.rename(oldUri, newUri, options);
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    return this.remoteProvider.stat(uri);
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    return this.remoteProvider.readDirectory(uri);
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    return this.remoteProvider.createDirectory(uri);
  }
}

class SSHPseudoTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number>();

  onDidWrite = this.writeEmitter.event;
  onDidClose = this.closeEmitter.event;

  constructor(private remoteTerminal: any) {
    this.remoteTerminal.onData((data: string) => {
      this.writeEmitter.fire(data);
    });

    this.remoteTerminal.onExit((code: number) => {
      this.closeEmitter.fire(code);
    });
  }

  open(): void {
    // Terminal is ready
  }

  close(): void {
    this.remoteTerminal.dispose();
  }

  handleInput(data: string): void {
    this.remoteTerminal.write(data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.remoteTerminal.resize(dimensions.columns, dimensions.rows);
  }
} 