import * as vscode from 'vscode';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';

/**
 * Interface for integrating mounts with VS Code explorer
 */
export interface ExplorerIntegration {
  /**
   * Register decorations and context menu items for mounted folders
   */
  registerExplorerIntegration(): void;
  
  /**
   * Update decorations for a mount point
   * @param mountPoint Mount point to update
   */
  updateMountDecorations(mountPoint: MountPoint): void;
  
  /**
   * Dispose of the explorer integration
   */
  dispose(): void;
}

/**
 * Implementation of ExplorerIntegration for integrating mounts with VS Code explorer
 */
export class ExplorerIntegrationImpl implements ExplorerIntegration {
  private readonly mountManager: MountManager;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly mountStatusDecorationType: vscode.TextEditorDecorationType;
  
  constructor(mountManager: MountManager) {
    this.mountManager = mountManager;
    
    // Create decoration type for mount status
    this.mountStatusDecorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 3px',
        textDecoration: 'none'
      }
    });
    
    this.disposables.push(this.mountStatusDecorationType);
  }
  
  /**
   * Register decorations and context menu items for mounted folders
   */
  registerExplorerIntegration(): void {
    // Register file explorer decorations provider
    this.registerFileDecorationProvider();
    
    // Register context menu items
    this.registerContextMenuItems();
    
    // Listen for mount status changes
    this.mountManager.onDidChangeMountPoints(this.handleMountPointsChanged.bind(this));
  }
  
  /**
   * Update decorations for a mount point
   * @param mountPoint Mount point to update
   */
  updateMountDecorations(mountPoint: MountPoint): void {
    // Trigger a refresh of the explorer decorations
    vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
  }
  
  /**
   * Dispose of the explorer integration
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables.length = 0;
  }
  
  /**
   * Register file decoration provider for mount status indicators
   */
  private registerFileDecorationProvider(): void {
    const provider = vscode.window.registerFileDecorationProvider({
      provideFileDecoration: (uri: vscode.Uri) => {
        // Only decorate workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const isWorkspaceFolder = workspaceFolders.some(folder => 
          folder.uri.toString() === uri.toString()
        );
        
        if (!isWorkspaceFolder || uri.scheme !== 'ssh-mount') {
          return undefined;
        }
        
        // Get mount point
        const mountId = uri.authority;
        const mountPoint = this.mountManager.getMountPointById(mountId);
        
        if (!mountPoint) {
          return undefined;
        }
        
        // Return decoration based on mount status
        switch (mountPoint.status) {
          case MountStatus.Connected:
            return {
              badge: '✓',
              tooltip: 'Connected',
              color: new vscode.ThemeColor('gitDecoration.addedResourceForeground')
            };
          case MountStatus.Disconnected:
            return {
              badge: '✗',
              tooltip: 'Disconnected',
              color: new vscode.ThemeColor('gitDecoration.deletedResourceForeground')
            };
          case MountStatus.Connecting:
            return {
              badge: '⟳',
              tooltip: 'Connecting...',
              color: new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')
            };
          case MountStatus.Error:
            return {
              badge: '!',
              tooltip: 'Error',
              color: new vscode.ThemeColor('errorForeground')
            };
          default:
            return undefined;
        }
      }
    });
    
    this.disposables.push(provider);
  }
  
  /**
   * Register context menu items for mount operations
   */
  private registerContextMenuItems(): void {
    // Register command to unmount folder
    const unmountCommand = vscode.commands.registerCommand('remote-ssh.unmountFolder', async (resource: vscode.Uri) => {
      if (!resource || resource.scheme !== 'ssh-mount') {
        // If no resource is provided, show a quick pick to select a mount
        const mountPoints = this.mountManager.getMountPoints();
        if (mountPoints.length === 0) {
          vscode.window.showInformationMessage('No mounted folders to unmount.');
          return;
        }
        
        const items = mountPoints.map(mp => ({
          label: mp.displayName,
          description: mp.remotePath,
          mountId: mp.id
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a folder to unmount'
        });
        
        if (!selected) {
          return;
        }
        
        await this.mountManager.unmountFolder(selected.mountId);
        return;
      }
      
      // Unmount the selected folder
      const mountId = resource.authority;
      await this.mountManager.unmountFolder(mountId);
    });
    
    // Register command to reconnect mount
    const reconnectCommand = vscode.commands.registerCommand('remote-ssh.reconnectMount', async (resource: vscode.Uri) => {
      if (!resource || resource.scheme !== 'ssh-mount') {
        // If no resource is provided, show a quick pick to select a mount
        const mountPoints = this.mountManager.getMountPoints().filter(
          mp => mp.status !== MountStatus.Connected
        );
        
        if (mountPoints.length === 0) {
          vscode.window.showInformationMessage('No disconnected mounts to reconnect.');
          return;
        }
        
        const items = mountPoints.map(mp => ({
          label: mp.displayName,
          description: mp.remotePath,
          mountId: mp.id
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a folder to reconnect'
        });
        
        if (!selected) {
          return;
        }
        
        // TODO: Implement reconnect functionality in MountManager
        vscode.window.showInformationMessage(`Reconnecting ${selected.label}...`);
        return;
      }
      
      // Reconnect the selected mount
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount ${mountId} not found.`);
        return;
      }
      
      // TODO: Implement reconnect functionality in MountManager
      vscode.window.showInformationMessage(`Reconnecting ${mountPoint.displayName}...`);
    });
    
    // Register command to refresh mount
    const refreshCommand = vscode.commands.registerCommand('remote-ssh.refreshMount', async (resource: vscode.Uri) => {
      if (!resource || resource.scheme !== 'ssh-mount') {
        // If no resource is provided, show a quick pick to select a mount
        const mountPoints = this.mountManager.getMountPoints();
        if (mountPoints.length === 0) {
          vscode.window.showInformationMessage('No mounted folders to refresh.');
          return;
        }
        
        const items = mountPoints.map(mp => ({
          label: mp.displayName,
          description: mp.remotePath,
          mountId: mp.id
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a folder to refresh'
        });
        
        if (!selected) {
          return;
        }
        
        // TODO: Implement refresh functionality in MountManager
        vscode.window.showInformationMessage(`Refreshing ${selected.label}...`);
        return;
      }
      
      // Refresh the selected mount
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount ${mountId} not found.`);
        return;
      }
      
      // TODO: Implement refresh functionality in MountManager
      vscode.window.showInformationMessage(`Refreshing ${mountPoint.displayName}...`);
    });
    
    // Register command to configure mount options
    const configureCommand = vscode.commands.registerCommand('remote-ssh.configureMountOptions', async (resource: vscode.Uri) => {
      if (!resource || resource.scheme !== 'ssh-mount') {
        // If no resource is provided, show a quick pick to select a mount
        const mountPoints = this.mountManager.getMountPoints();
        if (mountPoints.length === 0) {
          vscode.window.showInformationMessage('No mounted folders to configure.');
          return;
        }
        
        const items = mountPoints.map(mp => ({
          label: mp.displayName,
          description: mp.remotePath,
          mountId: mp.id
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a folder to configure'
        });
        
        if (!selected) {
          return;
        }
        
        // Configure the selected mount
        try {
          const updatedMountPoint = await this.mountManager.configureMountOptions(selected.mountId);
          if (updatedMountPoint) {
            vscode.window.showInformationMessage(`Configuration updated for ${updatedMountPoint.displayName}.`);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to configure mount: ${(error as Error).message}`);
        }
        return;
      }
      
      // Configure the selected mount
      const mountId = resource.authority;
      const mountPoint = this.mountManager.getMountPointById(mountId);
      
      if (!mountPoint) {
        vscode.window.showErrorMessage(`Mount ${mountId} not found.`);
        return;
      }
      
      // Configure the mount
      try {
        const updatedMountPoint = await this.mountManager.configureMountOptions(mountId);
        if (updatedMountPoint) {
          vscode.window.showInformationMessage(`Configuration updated for ${updatedMountPoint.displayName}.`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to configure mount: ${(error as Error).message}`);
      }
    });
    
    this.disposables.push(unmountCommand, reconnectCommand, refreshCommand, configureCommand);
  }
  
  /**
   * Handle mount points changed event
   * @param mountPoints Updated mount points
   */
  private handleMountPointsChanged(mountPoints: MountPoint[]): void {
    // Refresh explorer decorations
    vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
  }
}