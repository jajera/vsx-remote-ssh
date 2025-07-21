/**
 * Mount-aware Terminal Provider Implementation
 * Provides terminal functionality for mounted remote folders
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { 
  SSHConnection, 
  RemoteTerminalProvider, 
  RemoteTerminal, 
  TerminalOptions,
  MountPoint,
  MountManager,
  MountTerminalOptions
} from '../interfaces';
import { RemoteTerminalProviderImpl } from './remote-terminal-provider';
import { TerminalSessionManager } from './terminal-session-manager';
import { MountErrorHandler, MountErrorType } from './mount-error-handler';

/**
 * Implementation of mount-aware terminal provider
 * Manages terminal sessions for mounted remote folders
 */
export class MountTerminalProviderImpl {
  private _terminalProvider: RemoteTerminalProviderImpl;
  private _mountManager: MountManager;
  private _sessionManager: TerminalSessionManager;
  private _mountTerminals: Map<string, vscode.Terminal[]>;
  private _disposables: vscode.Disposable[] = [];
  private _errorHandler: MountErrorHandler;
  
  /**
   * Creates a new mount-aware terminal provider
   * @param terminalProvider The underlying terminal provider
   * @param mountManager The mount manager
   * @param sessionManager Optional terminal session manager
   */
  constructor(
    terminalProvider: RemoteTerminalProviderImpl,
    mountManager: MountManager,
    sessionManager?: TerminalSessionManager
  ) {
    this._terminalProvider = terminalProvider;
    this._mountManager = mountManager;
    this._sessionManager = sessionManager || new TerminalSessionManager();
    this._mountTerminals = new Map<string, vscode.Terminal[]>();
    this._errorHandler = new MountErrorHandler();
    
    // Register event handlers
    this._registerEventHandlers();
  }
  
  /**
   * Create a terminal for a mounted folder
   * @param mountId The ID of the mount point
   * @param options Terminal options
   * @returns A new VS Code terminal
   */
  async createTerminalForMount(mountId: string, options?: MountTerminalOptions): Promise<vscode.Terminal> {
    // Get the mount point
    const mountPoint = this._mountManager.getMountById(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point with ID ${mountId} not found`);
    }
    
    // Get the connection for this mount
    const connection = await this._getConnectionForMount(mountPoint);
    
    // Resolve the working directory
    const workingDirectory = await this.resolveWorkingDirectory(mountId, options?.cwd);
    
    // Create terminal options
    const terminalOptions: TerminalOptions = {
      ...options,
      cwd: workingDirectory
    };
    
    // Create the remote terminal
    const remoteTerminal = await this._terminalProvider.createTerminal(connection, terminalOptions);
    
    // Create the VS Code terminal
    const terminal = vscode.window.createTerminal({
      name: options?.name || `${mountPoint.name} (${path.basename(workingDirectory)})`,
      pty: new MountPseudoTerminal(remoteTerminal, mountPoint)
    });
    
    // Store the terminal in our mount-specific collection
    this._addTerminalToMount(mountId, terminal);
    
    // Show the terminal
    terminal.show();
    
    return terminal;
  }
  
  /**
   * Get all terminals for a specific mount
   * @param mountId The ID of the mount point
   * @returns Array of terminals for the mount
   */
  getTerminalsForMount(mountId: string): vscode.Terminal[] {
    return this._mountTerminals.get(mountId) || [];
  }
  
  /**
   * Resolve a working directory for a mount point
   * @param mountId The ID of the mount point
   * @param relativePath Optional relative path within the mount
   * @returns The resolved absolute path on the remote system
   */
  async resolveWorkingDirectory(mountId: string, relativePath?: string): Promise<string> {
    // Get the mount point
    const mountPoint = this._mountManager.getMountById(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point with ID ${mountId} not found`);
    }
    
    // Start with the remote path from the mount point
    let workingDirectory = mountPoint.remotePath;
    
    // If a relative path is provided, resolve it
    if (relativePath) {
      // Handle special case for ~ (home directory)
      if (relativePath === '~') {
        // Get the connection to determine the home directory
        const connection = await this._getConnectionForMount(mountPoint);
        
        try {
          // Execute a command to get the home directory
          const result = await connection.execute('echo $HOME');
          if (result.exitCode === 0) {
            workingDirectory = result.stdout.trim();
          }
        } catch (error) {
          console.error('Failed to resolve home directory:', error);
          // Fall back to the mount path
        }
      } else if (relativePath.startsWith('/')) {
        // Absolute path on the remote system
        workingDirectory = relativePath;
      } else {
        // Relative path from the mount point
        workingDirectory = path.posix.join(mountPoint.remotePath, relativePath);
      }
    }
    
    return workingDirectory;
  }
  
  /**
   * Open a terminal in the current workspace folder if it's a mounted folder
   * @returns A new terminal or undefined if the current folder is not a mounted folder
   */
  async openTerminalInCurrentWorkspaceFolder(): Promise<vscode.Terminal | undefined> {
    // Get the active workspace folder
    const activeFolder = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (!activeFolder) {
      return undefined;
    }
    
    // Check if the active folder is within a mount
    for (const mount of this._mountManager.getMounts()) {
      const mountUri = this._mountManager.getMountUri(mount);
      
      if (activeFolder.startsWith(mountUri.fsPath)) {
        // Calculate the relative path within the mount
        const relativePath = path.relative(mountUri.fsPath, activeFolder);
        
        // Create a terminal for this mount with the relative path as the working directory
        return this.createTerminalForMount(mount.id, {
          cwd: relativePath || undefined,
          useWorkingDirectory: true
        });
      }
    }
    
    return undefined;
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Dispose of all terminals
    for (const terminals of this._mountTerminals.values()) {
      for (const terminal of terminals) {
        terminal.dispose();
      }
    }
    
    // Clear the collections
    this._mountTerminals.clear();
    
    // Dispose of all disposables
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
  
  /**
   * Register event handlers
   */
  private _registerEventHandlers(): void {
    // Handle terminal close events
    this._disposables.push(
      vscode.window.onDidCloseTerminal(terminal => {
        // Remove the terminal from our collections
        for (const [mountId, terminals] of this._mountTerminals.entries()) {
          const index = terminals.indexOf(terminal);
          if (index !== -1) {
            terminals.splice(index, 1);
            if (terminals.length === 0) {
              this._mountTerminals.delete(mountId);
            } else {
              this._mountTerminals.set(mountId, terminals);
            }
            break;
          }
        }
      })
    );
  }
  
  /**
   * Add a terminal to the mount-specific collection
   * @param mountId The ID of the mount point
   * @param terminal The terminal to add
   */
  private _addTerminalToMount(mountId: string, terminal: vscode.Terminal): void {
    const terminals = this._mountTerminals.get(mountId) || [];
    terminals.push(terminal);
    this._mountTerminals.set(mountId, terminals);
  }
  
  /**
   * Get the SSH connection for a mount point
   * @param mountPoint The mount point
   * @returns The SSH connection
   */
  private async _getConnectionForMount(mountPoint: MountPoint): Promise<SSHConnection> {
    // This would typically be implemented by getting the connection from a connection manager
    // For now, we'll throw an error since we don't have access to the connection manager
    throw new Error('Not implemented: _getConnectionForMount');
  }
}

/**
 * Pseudo-terminal implementation for mounted folders
 */
class MountPseudoTerminal implements vscode.Pseudoterminal {
  private _writeEmitter = new vscode.EventEmitter<string>();
  private _closeEmitter = new vscode.EventEmitter<number>();
  
  onDidWrite = this._writeEmitter.event;
  onDidClose = this._closeEmitter.event;
  
  /**
   * Creates a new mount pseudo-terminal
   * @param remoteTerminal The underlying remote terminal
   * @param mountPoint The mount point
   */
  constructor(
    private _remoteTerminal: RemoteTerminal,
    private _mountPoint: MountPoint
  ) {
    // Set up event handlers
    this._remoteTerminal.onData((data: string) => {
      this._writeEmitter.fire(data);
    });
    
    this._remoteTerminal.onExit((code: number) => {
      this._closeEmitter.fire(code);
    });
  }
  
  /**
   * Open the terminal
   */
  open(): void {
    // Terminal is ready
    // Display a welcome message with mount information
    const message = `\r\n\x1b[1;34m> Connected to mounted folder: ${this._mountPoint.name}\x1b[0m\r\n` +
                    `\x1b[1;34m> Remote path: ${this._mountPoint.remotePath}\x1b[0m\r\n\r\n`;
    
    this._writeEmitter.fire(message);
  }
  
  /**
   * Close the terminal
   */
  close(): void {
    this._remoteTerminal.dispose();
  }
  
  /**
   * Handle input from the terminal
   * @param data The input data
   */
  handleInput(data: string): void {
    this._remoteTerminal.write(data);
  }
  
  /**
   * Set the terminal dimensions
   * @param dimensions The terminal dimensions
   */
  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this._remoteTerminal.resize(dimensions.columns, dimensions.rows);
  }
}