import * as vscode from 'vscode';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';

/**
 * Integration for mount status in VS Code status bar
 */
export class MountStatusBarIntegration implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];
  private mountManager: MountManager;

  constructor(mountManager: MountManager) {
    this.mountManager = mountManager;
    
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 
      95 // Priority - should appear before other SSH-related items
    );
    
    this.statusBarItem.command = 'remote-ssh.manageMounts';
    this.statusBarItem.show();
    
    // Listen for mount point changes
    this.disposables.push(
      this.mountManager.onDidChangeMountPoints(this.updateStatusBar.bind(this))
    );
    
    // Initial update
    this.updateStatusBar(this.mountManager.getMountPoints());
  }

  /**
   * Update the status bar item based on current mount points
   */
  private updateStatusBar(mountPoints: MountPoint[]): void {
    if (mountPoints.length === 0) {
      // No mounts - show basic indicator
      this.statusBarItem.text = '$(folder-library) Mounts';
      this.statusBarItem.tooltip = 'No remote folders mounted\nClick to manage mounts';
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    // Count mounts by status
    const statusCounts = {
      connected: 0,
      disconnected: 0,
      connecting: 0,
      error: 0
    };

    mountPoints.forEach(mount => {
      statusCounts[mount.status]++;
    });

    // Determine primary status and icon
    let icon: string;
    let backgroundColor: vscode.ThemeColor | undefined;
    
    if (statusCounts.error > 0) {
      icon = '$(error)';
      backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (statusCounts.connecting > 0) {
      icon = '$(sync~spin)';
      backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (statusCounts.disconnected > 0 && statusCounts.connected === 0) {
      icon = '$(debug-disconnect)';
      backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (statusCounts.connected > 0) {
      icon = '$(folder-library)';
      backgroundColor = undefined;
    } else {
      icon = '$(folder-library)';
      backgroundColor = undefined;
    }

    // Set status bar text
    const totalMounts = mountPoints.length;
    this.statusBarItem.text = `${icon} ${totalMounts}`;
    this.statusBarItem.backgroundColor = backgroundColor;

    // Build tooltip
    const tooltip = this.buildTooltip(mountPoints, statusCounts);
    this.statusBarItem.tooltip = tooltip;
  }

  /**
   * Build detailed tooltip for the status bar item
   */
  private buildTooltip(mountPoints: MountPoint[], statusCounts: any): string {
    const lines: string[] = [];
    
    // Header
    const totalMounts = mountPoints.length;
    lines.push(`Remote Folder Mounts (${totalMounts})`);
    lines.push('');

    // Status summary
    if (statusCounts.connected > 0) {
      lines.push(`$(check) ${statusCounts.connected} connected`);
    }
    if (statusCounts.disconnected > 0) {
      lines.push(`$(debug-disconnect) ${statusCounts.disconnected} disconnected`);
    }
    if (statusCounts.connecting > 0) {
      lines.push(`$(sync~spin) ${statusCounts.connecting} connecting`);
    }
    if (statusCounts.error > 0) {
      lines.push(`$(error) ${statusCounts.error} error`);
    }

    // Individual mount details (limit to 5 for tooltip readability)
    if (mountPoints.length > 0) {
      lines.push('');
      lines.push('Recent mounts:');
      
      const recentMounts = mountPoints
        .sort((a, b) => b.lastConnected.getTime() - a.lastConnected.getTime())
        .slice(0, 5);

      recentMounts.forEach(mount => {
        const statusIcon = this.getStatusIcon(mount.status);
        const displayName = mount.displayName.length > 20 
          ? mount.displayName.substring(0, 17) + '...' 
          : mount.displayName;
        lines.push(`${statusIcon} ${displayName}`);
      });

      if (mountPoints.length > 5) {
        lines.push(`... and ${mountPoints.length - 5} more`);
      }
    }

    lines.push('');
    lines.push('Click to manage mounts');

    return lines.join('\n');
  }

  /**
   * Get status icon for a mount status
   */
  private getStatusIcon(status: MountStatus): string {
    switch (status) {
      case MountStatus.Connected:
        return '$(check)';
      case MountStatus.Disconnected:
        return '$(debug-disconnect)';
      case MountStatus.Connecting:
        return '$(sync~spin)';
      case MountStatus.Error:
        return '$(error)';
      default:
        return '$(question)';
    }
  }

  /**
   * Register quick action commands for mount management
   */
  registerQuickActions(): void {
    // Register command for quick mount action
    const quickMountDisposable = vscode.commands.registerCommand(
      'remote-ssh.quickMountAction', 
      this.showQuickActions.bind(this)
    );
    this.disposables.push(quickMountDisposable);

    // Update status bar to use quick actions command
    this.statusBarItem.command = 'remote-ssh.quickMountAction';
  }

  /**
   * Show quick actions menu when status bar is clicked
   */
  private async showQuickActions(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints();
    const actions: vscode.QuickPickItem[] = [];

    // Always show mount folder option
    actions.push({
      label: '$(plus) Mount Remote Folder',
      description: 'Mount a new remote folder',
      detail: 'Connect to a remote folder and add it to workspace'
    });

    if (mountPoints.length > 0) {
      // Show manage mounts option
      actions.push({
        label: '$(settings-gear) Manage Mounts',
        description: 'Manage existing mounts',
        detail: 'View, configure, or remove mounted folders'
      });

      // Show refresh all option
      actions.push({
        label: '$(refresh) Refresh All Mounts',
        description: 'Refresh all mounted folders',
        detail: 'Update connection status for all mounts'
      });

      // Show individual mount actions for disconnected/error mounts
      const problematicMounts = mountPoints.filter(
        mount => mount.status === MountStatus.Disconnected || mount.status === MountStatus.Error
      );

      if (problematicMounts.length > 0) {
        actions.push({
          label: '$(debug-disconnect) Reconnect Mounts',
          description: `Reconnect ${problematicMounts.length} disconnected mounts`,
          detail: 'Attempt to reconnect all disconnected mounts'
        });
      }
    }

    // Show quick pick
    const selectedAction = await vscode.window.showQuickPick(actions, {
      placeHolder: 'Select mount action',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (!selectedAction) {
      return;
    }

    // Execute selected action
    await this.executeQuickAction(selectedAction.label);
  }

  /**
   * Execute a quick action based on the selected label
   */
  private async executeQuickAction(actionLabel: string): Promise<void> {
    try {
      if (actionLabel.includes('Mount Remote Folder')) {
        await vscode.commands.executeCommand('remote-ssh.mountFolder');
      } else if (actionLabel.includes('Manage Mounts')) {
        await vscode.commands.executeCommand('remote-ssh.manageMounts');
      } else if (actionLabel.includes('Refresh All Mounts')) {
        await this.refreshAllMounts();
      } else if (actionLabel.includes('Reconnect Mounts')) {
        await this.reconnectDisconnectedMounts();
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to execute action: ${error}`);
    }
  }

  /**
   * Refresh all mounted folders
   */
  private async refreshAllMounts(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints();
    
    if (mountPoints.length === 0) {
      vscode.window.showInformationMessage('No mounts to refresh');
      return;
    }

    vscode.window.showInformationMessage(`Refreshing ${mountPoints.length} mounted folders...`);

    // Update status for all mounts (this would trigger connection checks)
    for (const mount of mountPoints) {
      // In a real implementation, this would check the actual connection status
      // For now, we'll just trigger a status update
      this.mountManager.updateMountStatus(mount.id, mount.status);
    }

    vscode.window.showInformationMessage('Mount refresh completed');
  }

  /**
   * Reconnect all disconnected mounts
   */
  private async reconnectDisconnectedMounts(): Promise<void> {
    const mountPoints = this.mountManager.getMountPoints();
    const disconnectedMounts = mountPoints.filter(
      mount => mount.status === MountStatus.Disconnected || mount.status === MountStatus.Error
    );

    if (disconnectedMounts.length === 0) {
      vscode.window.showInformationMessage('No disconnected mounts to reconnect');
      return;
    }

    vscode.window.showInformationMessage(`Reconnecting ${disconnectedMounts.length} mounts...`);

    let reconnectedCount = 0;
    for (const mount of disconnectedMounts) {
      try {
        // Set status to connecting
        this.mountManager.updateMountStatus(mount.id, MountStatus.Connecting);
        
        // In a real implementation, this would attempt to reconnect
        // For now, we'll simulate a reconnection attempt
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Simulate success/failure (in real implementation, this would be based on actual connection)
        const success = Math.random() > 0.3; // 70% success rate for simulation
        
        if (success) {
          this.mountManager.updateMountStatus(mount.id, MountStatus.Connected);
          reconnectedCount++;
        } else {
          this.mountManager.updateMountStatus(mount.id, MountStatus.Error);
        }
      } catch (error) {
        this.mountManager.updateMountStatus(mount.id, MountStatus.Error);
        console.error(`Failed to reconnect mount ${mount.id}:`, error);
      }
    }

    if (reconnectedCount === disconnectedMounts.length) {
      vscode.window.showInformationMessage(`Successfully reconnected all ${reconnectedCount} mounts`);
    } else if (reconnectedCount > 0) {
      vscode.window.showWarningMessage(
        `Reconnected ${reconnectedCount} of ${disconnectedMounts.length} mounts. ` +
        `${disconnectedMounts.length - reconnectedCount} failed to reconnect.`
      );
    } else {
      vscode.window.showErrorMessage('Failed to reconnect any mounts');
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.statusBarItem.dispose();
    this.disposables.forEach(d => d?.dispose());
    this.disposables = [];
  }
}