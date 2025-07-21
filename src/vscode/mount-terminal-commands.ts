/**
 * Mount Terminal Commands
 * Provides command palette integration for mount-aware terminals
 */
import * as vscode from 'vscode';
import { ExtensionHostBridgeImpl } from './extension-host-bridge';
import { MountManager, MountTerminalOptions } from '../interfaces/mount';
import { NotificationService, NotificationLevel } from './notification-service';

/**
 * Handles VS Code command palette integration for mount-aware terminals
 */
export class MountTerminalCommands {
  private disposables: vscode.Disposable[] = [];
  private notificationService: NotificationService;
  
  /**
   * Creates a new mount terminal commands instance
   * @param extensionBridge The extension host bridge
   * @param mountManager The mount manager
   */
  constructor(
    private extensionBridge: ExtensionHostBridgeImpl,
    private mountManager: MountManager
  ) {
    // Get notification service instance
    this.notificationService = NotificationService.getInstance();
    
    // Set the mount manager in the extension bridge
    this.extensionBridge.setMountManager(mountManager);
  }
  
  /**
   * Register all mount terminal commands
   */
  registerCommands(): void {
    console.log('DEBUG: MountTerminalCommands.registerCommands called');
    
    // Terminal commands for mounted folders
    this.registerCommand('remote-ssh.openTerminalInMount', this.openTerminalInMount.bind(this));
    this.registerCommand('remote-ssh.openTerminalInCurrentFolder', this.openTerminalInCurrentFolder.bind(this));
    this.registerCommand('remote-ssh.openTerminalWithPath', this.openTerminalWithPath.bind(this));
    
    console.log('DEBUG: MountTerminalCommands.registerCommands completed');
  }
  
  /**
   * Helper method to register a command
   */
  private registerCommand(command: string, callback: (...args: any[]) => any): void {
    console.log(`DEBUG: Registering command: ${command}`);
    const disposable = vscode.commands.registerCommand(command, callback);
    this.disposables.push(disposable);
    console.log(`DEBUG: Command registered: ${command}`);
  }
  
  /**
   * Open a terminal in a mounted folder
   */
  private async openTerminalInMount(): Promise<void> {
    // Get all active mounts
    const mounts = this.mountManager.getMounts().filter(m => m.isActive);
    if (mounts.length === 0) {
      this.notificationService.showNotification('No active mounted folders', NotificationLevel.Info);
      return;
    }
    
    // Create quick pick items for each mount
    const items = mounts.map(mount => ({
      label: mount.name,
      description: `Remote path: ${mount.remotePath}`,
      detail: `Mount ID: ${mount.id}`,
      mount
    }));
    
    // Show quick pick with mount options
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a mounted folder to open terminal in',
      ignoreFocusOut: true
    });
    
    if (!selected) {
      return;
    }
    
    try {
      // Create a terminal for the selected mount
      await this.extensionBridge.createTerminalForMount(selected.mount.id);
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to open terminal in mounted folder: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Open a terminal in the current folder if it's a mounted folder
   */
  private async openTerminalInCurrentFolder(): Promise<void> {
    try {
      const terminal = await this.extensionBridge.openTerminalInCurrentWorkspaceFolder();
      if (!terminal) {
        this.notificationService.showNotification(
          'Current folder is not a mounted folder',
          NotificationLevel.Info
        );
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to open terminal in current folder: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Open a terminal in a mounted folder with a specific path
   */
  private async openTerminalWithPath(): Promise<void> {
    // Get all active mounts
    const mounts = this.mountManager.getMounts().filter(m => m.isActive);
    if (mounts.length === 0) {
      this.notificationService.showNotification('No active mounted folders', NotificationLevel.Info);
      return;
    }
    
    // Create quick pick items for each mount
    const items = mounts.map(mount => ({
      label: mount.name,
      description: `Remote path: ${mount.remotePath}`,
      detail: `Mount ID: ${mount.id}`,
      mount
    }));
    
    // Show quick pick with mount options
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a mounted folder to open terminal in',
      ignoreFocusOut: true
    });
    
    if (!selected) {
      return;
    }
    
    // Ask for a path within the mount
    const path = await vscode.window.showInputBox({
      prompt: `Enter a path within ${selected.mount.name}`,
      placeHolder: 'e.g., src/app or /absolute/path',
      ignoreFocusOut: true
    });
    
    if (path === undefined) {
      return;
    }
    
    try {
      // Create terminal options with the specified path
      const options: MountTerminalOptions = {
        cwd: path,
        useWorkingDirectory: true
      };
      
      // Create a terminal for the selected mount with the specified path
      await this.extensionBridge.createTerminalForMount(selected.mount.id, options);
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to open terminal in mounted folder: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}