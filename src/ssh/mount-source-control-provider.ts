/**
 * Mount-aware Source Control Provider Implementation
 * Provides Git source control functionality for mounted remote folders
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { 
  SSHConnection, 
  MountPoint,
  MountManager,
  MountSourceControlProvider,
  GitFileStatus,
  GitRepositoryInfo
} from '../interfaces';
import { MountErrorHandler, MountErrorType } from './mount-error-handler';

/**
 * Implementation of mount-aware source control provider
 * Manages Git operations for mounted remote folders
 */
export class MountSourceControlProviderImpl implements MountSourceControlProvider {
  private _mountManager: MountManager;
  private _sourceControls: Map<string, vscode.SourceControl> = new Map();
  private _repositoryInfo: Map<string, GitRepositoryInfo> = new Map();
  private _disposables: vscode.Disposable[] = [];
  private _errorHandler: MountErrorHandler;
  
  /**
   * Creates a new mount-aware source control provider
   * @param mountManager The mount manager
   */
  constructor(mountManager: MountManager) {
    this._mountManager = mountManager;
    this._errorHandler = new MountErrorHandler();
    
    // Register event handlers
    this._registerEventHandlers();
  }
  
  /**
   * Initialize source control for a mount point
   * @param mountPoint The mount point to initialize source control for
   * @returns The source control instance
   */
  async initializeSourceControl(mountPoint: MountPoint): Promise<vscode.SourceControl> {
    // Check if source control already exists for this mount
    const existingSourceControl = this._sourceControls.get(mountPoint.id);
    if (existingSourceControl) {
      return existingSourceControl;
    }
    
    // Get the mount URI
    const mountUri = this._mountManager.getMountUri(mountPoint);
    
    // Create a source control instance for this mount
    const sourceControl = vscode.scm.createSourceControl(
      `git-mount-${mountPoint.id}`,
      `${mountPoint.name} (Git)`,
      mountUri
    );
    
    // Create source control groups
    const indexGroup = sourceControl.createResourceGroup('index', 'Staged Changes');
    const workingTreeGroup = sourceControl.createResourceGroup('workingTree', 'Changes');
    
    // Store the source control instance
    this._sourceControls.set(mountPoint.id, sourceControl);
    
    // Check if this is a Git repository
    try {
      // Try to get Git status
      await this.refreshSourceControl(mountPoint.id);
    } catch (error) {
      console.error(`Failed to initialize Git for mount ${mountPoint.name}:`, error);
      sourceControl.dispose();
      this._sourceControls.delete(mountPoint.id);
      
      // Handle the error with user-friendly feedback
      await this._errorHandler.handleError(
        error as Error, 
        mountPoint, 
        `initialize Git for mount ${mountPoint.name}`
      );
      
      throw error;
    }
    
    return sourceControl;
  }
  
  /**
   * Dispose of source control for a mount point
   * @param mountId The ID of the mount point
   */
  disposeSourceControl(mountId: string): void {
    const sourceControl = this._sourceControls.get(mountId);
    if (sourceControl) {
      sourceControl.dispose();
      this._sourceControls.delete(mountId);
      this._repositoryInfo.delete(mountId);
    }
  }
  
  /**
   * Get the source control instance for a mount point
   * @param mountId The ID of the mount point
   * @returns The source control instance or undefined if not found
   */
  getSourceControl(mountId: string): vscode.SourceControl | undefined {
    return this._sourceControls.get(mountId);
  }
  
  /**
   * Refresh the source control status for a mount point
   * @param mountId The ID of the mount point
   */
  async refreshSourceControl(mountId: string): Promise<void> {
    // Get the mount point
    const mountPoint = this._mountManager.getMountById(mountId);
    if (!mountPoint) {
      const error = new Error(`Mount point with ID ${mountId} not found`);
      await this._errorHandler.handleError(error, undefined, "refresh source control");
      throw error;
    }
    
    // Get the source control instance
    const sourceControl = this._sourceControls.get(mountId);
    if (!sourceControl) {
      const error = new Error(`Source control for mount ${mountPoint.name} not initialized`);
      await this._errorHandler.handleError(error, mountPoint, "refresh source control");
      throw error;
    }
    
    try {
      // Get the connection for this mount
      const connection = await this._getConnectionForMount(mountPoint);
      
      // Check if this is a Git repository
      const isGitRepo = await this._isGitRepository(connection, mountPoint.remotePath);
      if (!isGitRepo) {
        // Not a Git repository, update the repository info
        this._repositoryInfo.set(mountId, {
          mountId,
          rootPath: mountPoint.remotePath,
          branch: '',
          remote: '',
          status: [],
          isValid: false
        });
        
        // Update the source control title
        sourceControl.inputBox.placeholder = 'Not a Git repository';
        sourceControl.count = 0;
        
        // Clear the resource groups
        const indexGroup = sourceControl.createResourceGroup('index', 'Staged Changes');
        const workingTreeGroup = sourceControl.createResourceGroup('workingTree', 'Changes');
        
        if (indexGroup) {
          indexGroup.resourceStates = [];
        }
        
        if (workingTreeGroup) {
          workingTreeGroup.resourceStates = [];
        }
        
        return;
      }
      
      // Get the current branch
      const branch = await this._getCurrentBranch(connection, mountPoint.remotePath);
      
      // Get the remote URL
      const remote = await this._getRemoteUrl(connection, mountPoint.remotePath);
      
      // Get the Git status
      const status = await this._getGitStatus(connection, mountPoint.remotePath);
      
      // Update the repository info
      this._repositoryInfo.set(mountId, {
        mountId,
        rootPath: mountPoint.remotePath,
        branch,
        remote,
        status,
        isValid: true
      });
      
      // Update the source control title
      sourceControl.inputBox.placeholder = `Message (${branch})`;
      
      // Update the resource groups
      const indexGroup = sourceControl.createResourceGroup('index', 'Staged Changes');
      const workingTreeGroup = sourceControl.createResourceGroup('workingTree', 'Changes');
      
      if (indexGroup && workingTreeGroup) {
        // Create resource states for staged changes
        const stagedChanges = status
          .filter(file => file.staged)
          .map(file => this._createResourceState(mountPoint, file));
        
        // Create resource states for unstaged changes
        const unstagedChanges = status
          .filter(file => !file.staged)
          .map(file => this._createResourceState(mountPoint, file));
        
        // Update the resource groups
        indexGroup.resourceStates = stagedChanges;
        workingTreeGroup.resourceStates = unstagedChanges;
        
        // Update the count badge
        sourceControl.count = stagedChanges.length + unstagedChanges.length;
      }
    } catch (error) {
      console.error(`Failed to refresh Git status for mount ${mountPoint.name}:`, error);
      
      // Handle the error with user-friendly feedback
      await this._errorHandler.handleError(
        error as Error, 
        mountPoint, 
        `refresh Git status for mount ${mountPoint.name}`
      );
      
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
    // Get the mount point
    const mountPoint = this._mountManager.getMountById(mountId);
    if (!mountPoint) {
      const error = new Error(`Mount point with ID ${mountId} not found`);
      await this._errorHandler.handleError(error, undefined, `execute Git command '${command}'`);
      throw error;
    }
    
    try {
      // Get the connection for this mount
      const connection = await this._getConnectionForMount(mountPoint);
      
      // Build the Git command
      const gitCommand = `cd "${mountPoint.remotePath}" && git ${command} ${args.join(' ')}`;
      
      // Execute the command
      const result = await connection.execute(gitCommand);
      
      // Check for Git errors in the result
      if (result.exitCode !== 0 && result.stderr) {
        const gitError = new Error(result.stderr.trim());
        
        // Handle specific Git errors with user-friendly messages
        if (result.stderr.includes('not a git repository')) {
          await this._errorHandler.handleError(
            gitError, 
            mountPoint, 
            `execute Git command '${command}'`
          );
        } else if (result.stderr.includes('Permission denied')) {
          await this._errorHandler.handleError(
            gitError, 
            mountPoint, 
            `execute Git command '${command}'`
          );
        } else if (result.stderr.includes('fatal: ')) {
          await this._errorHandler.handleError(
            gitError, 
            mountPoint, 
            `execute Git command '${command}'`
          );
        }
      }
      
      // Refresh the source control status after command execution
      try {
        await this.refreshSourceControl(mountId);
      } catch (error) {
        console.error(`Failed to refresh source control after Git command:`, error);
      }
      
      return result;
    } catch (error) {
      console.error(`Failed to execute Git command '${command}' for mount ${mountPoint.name}:`, error);
      
      // Handle the error with user-friendly feedback
      await this._errorHandler.handleError(
        error as Error, 
        mountPoint, 
        `execute Git command '${command}'`
      );
      
      throw error;
    }
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Dispose of all source controls
    for (const sourceControl of this._sourceControls.values()) {
      sourceControl.dispose();
    }
    
    // Clear the collections
    this._sourceControls.clear();
    this._repositoryInfo.clear();
    
    // Dispose of all disposables
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
  
  /**
   * Register event handlers
   */
  private _registerEventHandlers(): void {
    // Handle file system changes
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument(async document => {
        // Check if the saved document is in a mounted folder
        for (const [mountId, sourceControl] of this._sourceControls.entries()) {
          const mountPoint = this._mountManager.getMountById(mountId);
          if (mountPoint) {
            const mountUri = this._mountManager.getMountUri(mountPoint);
            
            if (document.uri.fsPath.startsWith(mountUri.fsPath)) {
              // Document is in this mount, refresh the source control
              try {
                await this.refreshSourceControl(mountId);
              } catch (error) {
                console.error(`Failed to refresh source control after file save:`, error);
              }
              break;
            }
          }
        }
      })
    );
  }
  
  /**
   * Create a source control resource state for a file
   * @param mountPoint The mount point
   * @param fileStatus The Git file status
   * @returns A source control resource state
   */
  private _createResourceState(mountPoint: MountPoint, fileStatus: GitFileStatus): vscode.SourceControlResourceState {
    // Get the mount URI
    const mountUri = this._mountManager.getMountUri(mountPoint);
    
    // Create the file URI
    const fileUri = vscode.Uri.joinPath(mountUri, fileStatus.path);
    
    // Determine the resource state based on the Git status
    let decorations: vscode.SourceControlResourceState['decorations'] = {
      strikeThrough: false,
      tooltip: `${fileStatus.status} ${fileStatus.path}`,
      iconPath: undefined,
      light: undefined,
      dark: undefined
    };
    
    switch (fileStatus.status) {
      case 'M':
        decorations = { 
          ...decorations,
          tooltip: `Modified: ${fileStatus.path}`,
          iconPath: new vscode.ThemeIcon('git-modified')
        };
        break;
      case 'A':
        decorations = { 
          ...decorations,
          tooltip: `Added: ${fileStatus.path}`,
          iconPath: new vscode.ThemeIcon('git-add')
        };
        break;
      case 'D':
        decorations = { 
          ...decorations,
          strikeThrough: true,
          tooltip: `Deleted: ${fileStatus.path}`,
          iconPath: new vscode.ThemeIcon('git-delete')
        };
        break;
      case 'R':
        decorations = { 
          ...decorations,
          tooltip: `Renamed: ${fileStatus.path}`,
          iconPath: new vscode.ThemeIcon('git-rename')
        };
        break;
      case 'C':
        decorations = { 
          ...decorations,
          tooltip: `Copied: ${fileStatus.path}`,
          iconPath: new vscode.ThemeIcon('git-modified')
        };
        break;
      case '??':
        decorations = { 
          ...decorations,
          tooltip: `Untracked: ${fileStatus.path}`,
          iconPath: new vscode.ThemeIcon('git-untracked')
        };
        break;
      case 'UU':
        decorations = { 
          ...decorations,
          tooltip: `Conflicted: ${fileStatus.path}`,
          iconPath: new vscode.ThemeIcon('git-conflict')
        };
        break;
    }
    
    return {
      resourceUri: fileUri,
      decorations: decorations,
      command: {
        title: 'Show Changes',
        command: 'vscode.diff',
        arguments: [
          fileUri.with({ scheme: 'git', query: 'HEAD' }),
          fileUri,
          `${path.basename(fileStatus.path)} (Working Tree)`
        ]
      }
    };
  }
  
  /**
   * Check if a remote path is a Git repository
   * @param connection The SSH connection
   * @param remotePath The remote path
   * @returns True if the path is a Git repository
   */
  private async _isGitRepository(connection: SSHConnection, remotePath: string): Promise<boolean> {
    try {
      const result = await connection.execute(`cd "${remotePath}" && git rev-parse --is-inside-work-tree`);
      return result.exitCode === 0 && result.stdout.trim() === 'true';
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get the current Git branch for a remote path
   * @param connection The SSH connection
   * @param remotePath The remote path
   * @returns The current branch name
   */
  private async _getCurrentBranch(connection: SSHConnection, remotePath: string): Promise<string> {
    try {
      const result = await connection.execute(`cd "${remotePath}" && git branch --show-current`);
      return result.exitCode === 0 ? result.stdout.trim() : '';
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Get the remote URL for a Git repository
   * @param connection The SSH connection
   * @param remotePath The remote path
   * @returns The remote URL
   */
  private async _getRemoteUrl(connection: SSHConnection, remotePath: string): Promise<string> {
    try {
      const result = await connection.execute(`cd "${remotePath}" && git remote get-url origin`);
      return result.exitCode === 0 ? result.stdout.trim() : '';
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Get the Git status for a remote path
   * @param connection The SSH connection
   * @param remotePath The remote path
   * @returns Array of file statuses
   */
  private async _getGitStatus(connection: SSHConnection, remotePath: string): Promise<GitFileStatus[]> {
    try {
      // Get the status of staged files
      const stagedResult = await connection.execute(`cd "${remotePath}" && git diff --name-status --cached`);
      
      // Get the status of unstaged files
      const unstagedResult = await connection.execute(`cd "${remotePath}" && git diff --name-status`);
      
      // Get the status of untracked files
      const untrackedResult = await connection.execute(`cd "${remotePath}" && git ls-files --others --exclude-standard`);
      
      const status: GitFileStatus[] = [];
      
      // Parse staged files
      if (stagedResult.exitCode === 0 && stagedResult.stdout.trim()) {
        const lines = stagedResult.stdout.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            const [statusCode, ...pathParts] = line.trim().split('\t');
            const filePath = pathParts.join('\t'); // Handle paths with tabs
            status.push({
              path: filePath,
              status: statusCode,
              staged: true
            });
          }
        }
      }
      
      // Parse unstaged files
      if (unstagedResult.exitCode === 0 && unstagedResult.stdout.trim()) {
        const lines = unstagedResult.stdout.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            const [statusCode, ...pathParts] = line.trim().split('\t');
            const filePath = pathParts.join('\t'); // Handle paths with tabs
            status.push({
              path: filePath,
              status: statusCode,
              staged: false
            });
          }
        }
      }
      
      // Parse untracked files
      if (untrackedResult.exitCode === 0 && untrackedResult.stdout.trim()) {
        const lines = untrackedResult.stdout.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            status.push({
              path: line.trim(),
              status: '??',
              staged: false
            });
          }
        }
      }
      
      return status;
    } catch (error) {
      console.error('Failed to get Git status:', error);
      return [];
    }
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