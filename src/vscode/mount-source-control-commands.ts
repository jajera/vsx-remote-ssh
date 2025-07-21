/**
 * Mount Source Control Commands
 * Provides command palette integration for Git operations on mounted folders
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionHostBridgeImpl } from './extension-host-bridge';
import { MountManager, MountSourceControlProvider } from '../interfaces';
import { NotificationService, NotificationLevel } from './notification-service';

/**
 * Handles VS Code command palette integration for Git operations on mounted folders
 */
export class MountSourceControlCommands {
  private disposables: vscode.Disposable[] = [];
  private notificationService: NotificationService;
  
  /**
   * Creates a new mount source control commands instance
   * @param extensionBridge The extension host bridge
   * @param mountManager The mount manager
   * @param sourceControlProvider The source control provider
   */
  constructor(
    private extensionBridge: ExtensionHostBridgeImpl,
    private mountManager: MountManager,
    private sourceControlProvider: MountSourceControlProvider
  ) {
    // Get notification service instance
    this.notificationService = NotificationService.getInstance();
  }
  
  /**
   * Register all mount source control commands
   */
  registerCommands(): void {
    console.log('DEBUG: MountSourceControlCommands.registerCommands called');
    
    // Git commands for mounted folders
    this.registerCommand('remote-ssh.initializeGitRepository', this.initializeGitRepository.bind(this));
    this.registerCommand('remote-ssh.gitStatus', this.gitStatus.bind(this));
    this.registerCommand('remote-ssh.gitAdd', this.gitAdd.bind(this));
    this.registerCommand('remote-ssh.gitCommit', this.gitCommit.bind(this));
    this.registerCommand('remote-ssh.gitPush', this.gitPush.bind(this));
    this.registerCommand('remote-ssh.gitPull', this.gitPull.bind(this));
    this.registerCommand('remote-ssh.gitCheckout', this.gitCheckout.bind(this));
    this.registerCommand('remote-ssh.gitBranch', this.gitBranch.bind(this));
    this.registerCommand('remote-ssh.refreshSourceControl', this.refreshSourceControl.bind(this));
    
    console.log('DEBUG: MountSourceControlCommands.registerCommands completed');
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
   * Initialize a Git repository in a mounted folder
   */
  private async initializeGitRepository(): Promise<void> {
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
      placeHolder: 'Select a mounted folder to initialize as Git repository',
      ignoreFocusOut: true
    });
    
    if (!selected) {
      return;
    }
    
    try {
      // Execute git init command
      const result = await this.sourceControlProvider.executeGitCommand(
        selected.mount.id,
        'init'
      );
      
      if (result.exitCode === 0) {
        this.notificationService.showNotification(
          `Git repository initialized in ${selected.mount.name}`,
          NotificationLevel.Info
        );
        
        // Initialize source control for this mount
        await this.sourceControlProvider.initializeSourceControl(selected.mount);
      } else {
        this.notificationService.showNotification(
          `Failed to initialize Git repository: ${result.stderr}`,
          NotificationLevel.Error
        );
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to initialize Git repository: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Show Git status for a mounted folder
   */
  private async gitStatus(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    try {
      // Execute git status command
      const result = await this.sourceControlProvider.executeGitCommand(
        mountPoint.id,
        'status'
      );
      
      if (result.exitCode === 0) {
        // Show the status in an output channel
        const outputChannel = vscode.window.createOutputChannel(`Git Status: ${mountPoint.name}`);
        outputChannel.append(result.stdout);
        outputChannel.show();
      } else {
        this.notificationService.showNotification(
          `Failed to get Git status: ${result.stderr}`,
          NotificationLevel.Error
        );
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to get Git status: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Add files to Git staging area
   */
  private async gitAdd(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    // Get the current file path relative to the mount
    const currentFilePath = await this.getCurrentFileRelativePath(mountPoint);
    if (!currentFilePath) {
      return;
    }
    
    try {
      // Execute git add command
      const result = await this.sourceControlProvider.executeGitCommand(
        mountPoint.id,
        'add',
        currentFilePath
      );
      
      if (result.exitCode === 0) {
        this.notificationService.showNotification(
          `Added ${path.basename(currentFilePath)} to staging area`,
          NotificationLevel.Info
        );
        
        // Refresh the source control view
        await this.sourceControlProvider.refreshSourceControl(mountPoint.id);
      } else {
        this.notificationService.showNotification(
          `Failed to add file to staging area: ${result.stderr}`,
          NotificationLevel.Error
        );
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to add file to staging area: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Commit changes in Git repository
   */
  private async gitCommit(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    // Ask for commit message
    const commitMessage = await vscode.window.showInputBox({
      prompt: 'Enter commit message',
      placeHolder: 'Commit message',
      ignoreFocusOut: true
    });
    
    if (!commitMessage) {
      return;
    }
    
    try {
      // Execute git commit command
      const result = await this.sourceControlProvider.executeGitCommand(
        mountPoint.id,
        'commit',
        '-m',
        commitMessage
      );
      
      if (result.exitCode === 0) {
        this.notificationService.showNotification(
          `Changes committed: ${commitMessage}`,
          NotificationLevel.Info
        );
        
        // Refresh the source control view
        await this.sourceControlProvider.refreshSourceControl(mountPoint.id);
      } else {
        this.notificationService.showNotification(
          `Failed to commit changes: ${result.stderr}`,
          NotificationLevel.Error
        );
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to commit changes: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Push changes to remote repository
   */
  private async gitPush(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    try {
      // Execute git push command
      const result = await this.sourceControlProvider.executeGitCommand(
        mountPoint.id,
        'push'
      );
      
      if (result.exitCode === 0) {
        this.notificationService.showNotification(
          'Changes pushed to remote repository',
          NotificationLevel.Info
        );
      } else {
        this.notificationService.showNotification(
          `Failed to push changes: ${result.stderr}`,
          NotificationLevel.Error
        );
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to push changes: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Pull changes from remote repository
   */
  private async gitPull(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    try {
      // Execute git pull command
      const result = await this.sourceControlProvider.executeGitCommand(
        mountPoint.id,
        'pull'
      );
      
      if (result.exitCode === 0) {
        this.notificationService.showNotification(
          'Changes pulled from remote repository',
          NotificationLevel.Info
        );
        
        // Refresh the source control view
        await this.sourceControlProvider.refreshSourceControl(mountPoint.id);
      } else {
        this.notificationService.showNotification(
          `Failed to pull changes: ${result.stderr}`,
          NotificationLevel.Error
        );
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to pull changes: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Checkout a branch
   */
  private async gitCheckout(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    try {
      // Get list of branches
      const branchResult = await this.sourceControlProvider.executeGitCommand(
        mountPoint.id,
        'branch'
      );
      
      if (branchResult.exitCode !== 0) {
        this.notificationService.showNotification(
          `Failed to get branches: ${branchResult.stderr}`,
          NotificationLevel.Error
        );
        return;
      }
      
      // Parse branches
      const branches = branchResult.stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(line => line.startsWith('*') ? line.substring(1).trim() : line.trim());
      
      // Add option to create a new branch
      branches.push('Create new branch...');
      
      // Show quick pick with branch options
      const selectedBranch = await vscode.window.showQuickPick(branches, {
        placeHolder: 'Select a branch to checkout',
        ignoreFocusOut: true
      });
      
      if (!selectedBranch) {
        return;
      }
      
      if (selectedBranch === 'Create new branch...') {
        // Ask for new branch name
        const newBranchName = await vscode.window.showInputBox({
          prompt: 'Enter new branch name',
          placeHolder: 'Branch name',
          ignoreFocusOut: true
        });
        
        if (!newBranchName) {
          return;
        }
        
        // Execute git checkout -b command
        const result = await this.sourceControlProvider.executeGitCommand(
          mountPoint.id,
          'checkout',
          '-b',
          newBranchName
        );
        
        if (result.exitCode === 0) {
          this.notificationService.showNotification(
            `Created and switched to branch: ${newBranchName}`,
            NotificationLevel.Info
          );
          
          // Refresh the source control view
          await this.sourceControlProvider.refreshSourceControl(mountPoint.id);
        } else {
          this.notificationService.showNotification(
            `Failed to create branch: ${result.stderr}`,
            NotificationLevel.Error
          );
        }
      } else {
        // Execute git checkout command
        const result = await this.sourceControlProvider.executeGitCommand(
          mountPoint.id,
          'checkout',
          selectedBranch
        );
        
        if (result.exitCode === 0) {
          this.notificationService.showNotification(
            `Switched to branch: ${selectedBranch}`,
            NotificationLevel.Info
          );
          
          // Refresh the source control view
          await this.sourceControlProvider.refreshSourceControl(mountPoint.id);
        } else {
          this.notificationService.showNotification(
            `Failed to switch branch: ${result.stderr}`,
            NotificationLevel.Error
          );
        }
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to checkout branch: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Create or list branches
   */
  private async gitBranch(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    // Show quick pick with branch options
    const options = ['List branches', 'Create new branch'];
    const selectedOption = await vscode.window.showQuickPick(options, {
      placeHolder: 'Select an action',
      ignoreFocusOut: true
    });
    
    if (!selectedOption) {
      return;
    }
    
    try {
      if (selectedOption === 'List branches') {
        // Execute git branch command
        const result = await this.sourceControlProvider.executeGitCommand(
          mountPoint.id,
          'branch',
          '-a'
        );
        
        if (result.exitCode === 0) {
          // Show the branches in an output channel
          const outputChannel = vscode.window.createOutputChannel(`Git Branches: ${mountPoint.name}`);
          outputChannel.append(result.stdout);
          outputChannel.show();
        } else {
          this.notificationService.showNotification(
            `Failed to list branches: ${result.stderr}`,
            NotificationLevel.Error
          );
        }
      } else if (selectedOption === 'Create new branch') {
        // Ask for new branch name
        const newBranchName = await vscode.window.showInputBox({
          prompt: 'Enter new branch name',
          placeHolder: 'Branch name',
          ignoreFocusOut: true
        });
        
        if (!newBranchName) {
          return;
        }
        
        // Execute git branch command
        const result = await this.sourceControlProvider.executeGitCommand(
          mountPoint.id,
          'branch',
          newBranchName
        );
        
        if (result.exitCode === 0) {
          this.notificationService.showNotification(
            `Created branch: ${newBranchName}`,
            NotificationLevel.Info
          );
        } else {
          this.notificationService.showNotification(
            `Failed to create branch: ${result.stderr}`,
            NotificationLevel.Error
          );
        }
      }
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to execute branch command: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Refresh the source control view
   */
  private async refreshSourceControl(): Promise<void> {
    // Get the mount point for the current file
    const mountPoint = await this.getMountPointForCurrentFile();
    if (!mountPoint) {
      return;
    }
    
    try {
      // Refresh the source control view
      await this.sourceControlProvider.refreshSourceControl(mountPoint.id);
      
      this.notificationService.showNotification(
        'Source control refreshed',
        NotificationLevel.Info
      );
    } catch (error) {
      this.notificationService.showNotification(
        `Failed to refresh source control: ${error}`,
        NotificationLevel.Error
      );
    }
  }
  
  /**
   * Get the mount point for the current file
   * @returns The mount point or undefined if not found
   */
  private async getMountPointForCurrentFile(): Promise<{ id: string; name: string } | undefined> {
    // Get the active text editor
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      // If no active editor, show a list of mounts
      return this.selectMountPoint();
    }
    
    // Get the file path
    const filePath = activeEditor.document.uri.fsPath;
    
    // Check if the file is in a mounted folder
    for (const mount of this.mountManager.getMounts()) {
      const mountUri = this.mountManager.getMountUri(mount);
      
      if (filePath.startsWith(mountUri.fsPath)) {
        return mount;
      }
    }
    
    // If not in a mounted folder, show a list of mounts
    return this.selectMountPoint();
  }
  
  /**
   * Show a quick pick to select a mount point
   * @returns The selected mount point or undefined if cancelled
   */
  private async selectMountPoint(): Promise<{ id: string; name: string } | undefined> {
    // Get all active mounts
    const mounts = this.mountManager.getMounts().filter(m => m.isActive);
    if (mounts.length === 0) {
      this.notificationService.showNotification('No active mounted folders', NotificationLevel.Info);
      return undefined;
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
      placeHolder: 'Select a mounted folder',
      ignoreFocusOut: true
    });
    
    return selected ? selected.mount : undefined;
  }
  
  /**
   * Get the current file path relative to the mount
   * @param mountPoint The mount point
   * @returns The relative path or undefined if not found
   */
  private async getCurrentFileRelativePath(mountPoint: { id: string; name: string }): Promise<string | undefined> {
    // Get the active text editor
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      this.notificationService.showNotification('No active file', NotificationLevel.Info);
      return undefined;
    }
    
    // Get the file path
    const filePath = activeEditor.document.uri.fsPath;
    
    // Get the mount URI
    const mount = this.mountManager.getMountById(mountPoint.id);
    if (!mount) {
      return undefined;
    }
    
    const mountUri = this.mountManager.getMountUri(mount);
    
    // Check if the file is in the mount
    if (!filePath.startsWith(mountUri.fsPath)) {
      this.notificationService.showNotification(
        'Current file is not in the selected mounted folder',
        NotificationLevel.Info
      );
      return undefined;
    }
    
    // Get the relative path
    return path.relative(mountUri.fsPath, filePath);
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}