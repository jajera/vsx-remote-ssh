/**
 * Mount-specific error handler
 * Provides specialized error handling for mount operations
 */
import * as vscode from 'vscode';
import { SSHErrorType, SSHError } from '../interfaces/ssh';
import { MountPoint } from '../interfaces/mount';
import { FileSystemError } from '../interfaces/filesystem';
import { SSHErrorClassifier } from './error-classifier';

/**
 * Error types specific to mount operations
 */
export enum MountErrorType {
  // Mount creation errors
  MountCreationFailed = 'mount_creation_failed',
  MountPathInvalid = 'mount_path_invalid',
  MountAlreadyExists = 'mount_already_exists',
  
  // Mount access errors
  MountNotFound = 'mount_not_found',
  MountNotActive = 'mount_not_active',
  MountAccessDenied = 'mount_access_denied',
  
  // Mount operation errors
  MountOperationFailed = 'mount_operation_failed',
  MountConnectionLost = 'mount_connection_lost',
  
  // Source control errors
  GitNotInstalled = 'git_not_installed',
  NotGitRepository = 'not_git_repository',
  GitOperationFailed = 'git_operation_failed',
  
  // Terminal errors
  TerminalCreationFailed = 'terminal_creation_failed',
  TerminalPathResolutionFailed = 'terminal_path_resolution_failed',
  
  // Unknown errors
  Unknown = 'unknown'
}

/**
 * Mount-specific error interface
 */
export interface MountError {
  type: MountErrorType;
  message: string;
  originalError?: Error;
  mountId?: string;
  mountName?: string;
  timestamp: Date;
  troubleshootingSteps?: string[];
  recoveryOptions?: MountErrorRecoveryOption[];
}

/**
 * Recovery option for mount errors
 */
export interface MountErrorRecoveryOption {
  label: string;
  description?: string;
  action: () => Promise<void>;
}

/**
 * Mount error handler class
 * Provides specialized error handling for mount operations
 */
export class MountErrorHandler {
  private _sshErrorClassifier: SSHErrorClassifier;
  
  /**
   * Creates a new mount error handler
   */
  constructor() {
    this._sshErrorClassifier = new SSHErrorClassifier();
  }
  
  /**
   * Classify a mount error
   * @param error The error to classify
   * @param mountPoint Optional mount point related to the error
   * @returns Classified mount error
   */
  classifyError(error: Error, mountPoint?: MountPoint): MountError {
    // Default error type
    let errorType = MountErrorType.Unknown;
    
    // Check if it's an SSH error first
    const sshErrorType = this._sshErrorClassifier.classifyError(error);
    
    // Map SSH errors to mount errors
    if (sshErrorType !== SSHErrorType.Unknown) {
      errorType = this._mapSSHErrorToMountError(sshErrorType);
    } else {
      // Try to classify based on error message
      errorType = this._classifyByErrorMessage(error);
    }
    
    // Create the mount error
    const mountError: MountError = {
      type: errorType,
      message: error.message,
      originalError: error,
      timestamp: new Date()
    };
    
    // Add mount information if available
    if (mountPoint) {
      mountError.mountId = mountPoint.id;
      mountError.mountName = mountPoint.name;
    }
    
    // Add troubleshooting steps
    mountError.troubleshootingSteps = this._getTroubleshootingSteps(errorType);
    
    // Add recovery options
    mountError.recoveryOptions = this._getRecoveryOptions(errorType, mountPoint);
    
    return mountError;
  }
  
  /**
   * Create a user-friendly error message for a mount error
   * @param error The mount error
   * @returns User-friendly error message
   */
  createUserFriendlyErrorMessage(error: MountError): string {
    // Start with the basic error message
    let message = `Mount Error: ${error.message}`;
    
    // Add mount information if available
    if (error.mountName) {
      message = `Mount Error (${error.mountName}): ${error.message}`;
    }
    
    // Add troubleshooting steps if available
    if (error.troubleshootingSteps && error.troubleshootingSteps.length > 0) {
      message += '\n\nTroubleshooting steps:';
      error.troubleshootingSteps.forEach(step => {
        message += `\n• ${step}`;
      });
    }
    
    return message;
  }
  
  /**
   * Handle a mount error with appropriate UI feedback and recovery options
   * @param error The error to handle
   * @param mountPoint Optional mount point related to the error
   * @param operation Description of the operation that failed
   * @returns True if the error was handled, false otherwise
   */
  async handleError(error: Error, mountPoint?: MountPoint, operation?: string): Promise<boolean> {
    // Classify the error
    const mountError = this.classifyError(error, mountPoint);
    
    // Create a user-friendly error message
    let message = this.createUserFriendlyErrorMessage(mountError);
    
    // Add operation context if provided
    if (operation) {
      message = `Failed to ${operation}: ${message}`;
    }
    
    // Show error notification
    if (mountError.recoveryOptions && mountError.recoveryOptions.length > 0) {
      // Show error with recovery options
      const selected = await vscode.window.showErrorMessage(
        message,
        { modal: mountError.type === MountErrorType.MountConnectionLost },
        ...mountError.recoveryOptions.map(option => ({ title: option.label }))
      );
      
      // Execute the selected recovery option
      if (selected) {
        const recoveryOption = mountError.recoveryOptions.find(option => option.label === selected.title);
        if (recoveryOption) {
          try {
            await recoveryOption.action();
            return true;
          } catch (recoveryError) {
            // If recovery fails, show a new error
            const errorMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
            vscode.window.showErrorMessage(`Recovery failed: ${errorMessage}`);
          }
        }
      }
    } else {
      // Show simple error message
      vscode.window.showErrorMessage(message);
    }
    
    // Log the error for debugging
    console.error('Mount error:', mountError);
    
    return false;
  }
  
  /**
   * Create a file system error from a mount error
   * @param error The original error
   * @param uri The URI that caused the error
   * @param operation Description of the operation being performed
   * @param mountPoint Optional mount point related to the error
   * @returns A FileSystemError with mount-specific context
   */
  createFileSystemError(
    error: Error,
    uri: vscode.Uri,
    operation: string,
    mountPoint?: MountPoint
  ): FileSystemError {
    // First classify the mount error
    const mountError = this.classifyError(error, mountPoint);
    
    // Get troubleshooting steps
    const troubleshootingSteps = mountError.troubleshootingSteps || [];
    const troubleshootingText = troubleshootingSteps.length > 0 
      ? `\n\nTroubleshooting:\n• ${troubleshootingSteps.join('\n• ')}` 
      : '';
    
    // Add mount-specific context to the error message
    let contextMessage = '';
    if (mountPoint) {
      contextMessage = ` in mounted folder "${mountPoint.name}"`;
    }
    
    // Map mount error type to file system error code
    let fsErrorCode: 'FileNotFound' | 'FileExists' | 'NoPermissions' | 'Unavailable' | 'Unknown' = 'Unknown';
    
    switch (mountError.type) {
      case MountErrorType.MountNotFound:
      case MountErrorType.GitNotInstalled:
      case MountErrorType.NotGitRepository:
        fsErrorCode = 'FileNotFound';
        break;
        
      case MountErrorType.MountAlreadyExists:
        fsErrorCode = 'FileExists';
        break;
        
      case MountErrorType.MountAccessDenied:
        fsErrorCode = 'NoPermissions';
        break;
        
      case MountErrorType.MountConnectionLost:
      case MountErrorType.MountNotActive:
        fsErrorCode = 'Unavailable';
        break;
        
      default:
        fsErrorCode = 'Unknown';
    }
    
    // Create the file system error
    const fsError = new Error(`Failed to ${operation}${contextMessage}: ${error.message}${troubleshootingText}`) as FileSystemError;
    fsError.code = fsErrorCode;
    fsError.uri = uri;
    
    return fsError;
  }
  
  /**
   * Map SSH error types to mount error types
   * @param sshErrorType The SSH error type
   * @returns The corresponding mount error type
   */
  private _mapSSHErrorToMountError(sshErrorType: SSHErrorType): MountErrorType {
    switch (sshErrorType) {
      case SSHErrorType.ConnectionRefused:
      case SSHErrorType.HostUnreachable:
      case SSHErrorType.NetworkTimeout:
      case SSHErrorType.DNSResolutionFailed:
        return MountErrorType.MountConnectionLost;
        
      case SSHErrorType.AuthenticationFailed:
      case SSHErrorType.PermissionDenied:
      case SSHErrorType.KeyRejected:
      case SSHErrorType.PasswordRejected:
        return MountErrorType.MountAccessDenied;
        
      case SSHErrorType.FileNotFound:
        return MountErrorType.MountNotFound;
        
      case SSHErrorType.FilePermissionDenied:
        return MountErrorType.MountAccessDenied;
        
      case SSHErrorType.CommandExecutionFailed:
        return MountErrorType.MountOperationFailed;
        
      case SSHErrorType.SFTPError:
        return MountErrorType.MountOperationFailed;
        
      case SSHErrorType.ConfigurationError:
        return MountErrorType.MountCreationFailed;
        
      default:
        return MountErrorType.Unknown;
    }
  }
  
  /**
   * Classify an error based on its message
   * @param error The error to classify
   * @returns The mount error type
   */
  private _classifyByErrorMessage(error: Error): MountErrorType {
    const message = error.message.toLowerCase();
    
    if (message.includes('mount') && message.includes('create')) {
      return MountErrorType.MountCreationFailed;
    }
    
    if (message.includes('mount') && message.includes('path') && 
        (message.includes('invalid') || message.includes('not found'))) {
      return MountErrorType.MountPathInvalid;
    }
    
    if (message.includes('mount') && message.includes('already exists')) {
      return MountErrorType.MountAlreadyExists;
    }
    
    if (message.includes('mount') && message.includes('not found')) {
      return MountErrorType.MountNotFound;
    }
    
    if (message.includes('mount') && message.includes('not active')) {
      return MountErrorType.MountNotActive;
    }
    
    if (message.includes('permission denied') || message.includes('access denied')) {
      return MountErrorType.MountAccessDenied;
    }
    
    if (message.includes('connection') && 
        (message.includes('lost') || message.includes('closed') || message.includes('reset'))) {
      return MountErrorType.MountConnectionLost;
    }
    
    if (message.includes('git') && message.includes('not installed')) {
      return MountErrorType.GitNotInstalled;
    }
    
    if (message.includes('not a git repository')) {
      return MountErrorType.NotGitRepository;
    }
    
    if (message.includes('git') && message.includes('failed')) {
      return MountErrorType.GitOperationFailed;
    }
    
    if (message.includes('terminal') && message.includes('create')) {
      return MountErrorType.TerminalCreationFailed;
    }
    
    if (message.includes('terminal') && message.includes('path')) {
      return MountErrorType.TerminalPathResolutionFailed;
    }
    
    return MountErrorType.Unknown;
  }
  
  /**
   * Get troubleshooting steps for a mount error type
   * @param errorType The mount error type
   * @returns Array of troubleshooting steps
   */
  private _getTroubleshootingSteps(errorType: MountErrorType): string[] {
    switch (errorType) {
      case MountErrorType.MountCreationFailed:
        return [
          'Verify that the remote path exists on the server',
          'Check if you have permission to access the remote path',
          'Ensure the SSH connection is active and working',
          'Try mounting a different folder to isolate the issue'
        ];
        
      case MountErrorType.MountPathInvalid:
        return [
          'Verify that the path exists on the remote server',
          'Check the path syntax (use forward slashes for paths)',
          'Try using an absolute path instead of a relative path',
          'Use the terminal to verify the path exists: ls -la /path/to/folder'
        ];
        
      case MountErrorType.MountAlreadyExists:
        return [
          'Use a different name for the mount point',
          'Unmount the existing folder first before remounting',
          'Check the mount manager to see existing mounts'
        ];
        
      case MountErrorType.MountNotFound:
        return [
          'Verify that the mount ID is correct',
          'Check if the mount has been removed',
          'Try refreshing the mount list',
          'Create a new mount if needed'
        ];
        
      case MountErrorType.MountNotActive:
        return [
          'Try reconnecting to the mount',
          'Check if the SSH connection is active',
          'Verify that the remote server is online',
          'Try remounting the folder'
        ];
        
      case MountErrorType.MountAccessDenied:
        return [
          'Check if you have permission to access the remote folder',
          'Verify your SSH credentials',
          'Check file permissions on the remote server (use "ls -la")',
          'Contact the system administrator if needed'
        ];
        
      case MountErrorType.MountOperationFailed:
        return [
          'Check if the operation is supported on the remote file system',
          'Verify that the remote server has sufficient resources',
          'Try the operation again after a short delay',
          'Check the server logs for more information'
        ];
        
      case MountErrorType.MountConnectionLost:
        return [
          'Check your network connection',
          'Verify that the remote server is online',
          'Try reconnecting to the SSH server',
          'Check if the SSH service is running on the remote server',
          'Wait a moment and try again as the connection might be temporarily unavailable'
        ];
        
      case MountErrorType.GitNotInstalled:
        return [
          'Install Git on the remote server',
          'Verify the Git installation path is in the PATH environment variable',
          'Try running "which git" in the terminal to check if Git is installed',
          'Install Git using the package manager: sudo apt-get install git (Ubuntu/Debian) or sudo yum install git (CentOS/RHEL)'
        ];
        
      case MountErrorType.NotGitRepository:
        return [
          'Initialize a Git repository in the folder using "git init"',
          'Check if you are in the correct folder',
          'Verify that the .git directory exists in the folder',
          'Clone an existing repository instead'
        ];
        
      case MountErrorType.GitOperationFailed:
        return [
          'Check if you have permission to perform the Git operation',
          'Verify that the Git repository is not corrupted',
          'Try running the Git command manually in the terminal',
          'Check for conflicts or other Git-specific issues'
        ];
        
      case MountErrorType.TerminalCreationFailed:
        return [
          'Check if the SSH connection is active',
          'Verify that the remote server allows terminal sessions',
          'Try reconnecting to the SSH server',
          'Check if you have reached the maximum number of terminal sessions'
        ];
        
      case MountErrorType.TerminalPathResolutionFailed:
        return [
          'Verify that the path exists on the remote server',
          'Check if you have permission to access the path',
          'Try using an absolute path instead of a relative path',
          'Use the terminal to verify the path exists: ls -la /path/to/folder'
        ];
        
      default:
        return [
          'Try the operation again',
          'Check your network connection',
          'Verify that the remote server is online',
          'Try reconnecting to the SSH server',
          'Check the logs for more information'
        ];
    }
  }
  
  /**
   * Get recovery options for a mount error
   * @param errorType The mount error type
   * @param mountPoint Optional mount point related to the error
   * @returns Array of recovery options
   */
  private _getRecoveryOptions(errorType: MountErrorType, mountPoint?: MountPoint): MountErrorRecoveryOption[] {
    // Common recovery options
    const commonOptions: MountErrorRecoveryOption[] = [
      {
        label: 'Retry',
        description: 'Try the operation again',
        action: async () => {
          // This is a placeholder action that will be replaced by the caller
          vscode.window.showInformationMessage('Retrying operation...');
        }
      }
    ];
    
    // Error-specific recovery options
    switch (errorType) {
      case MountErrorType.MountConnectionLost:
        return [
          {
            label: 'Reconnect',
            description: 'Try to reconnect to the SSH server',
            action: async () => {
              if (mountPoint?.connectionId) {
                // This would typically call a reconnect method
                vscode.window.showInformationMessage(`Reconnecting to ${mountPoint.name}...`);
                
                // Execute the reconnect command if available
                await vscode.commands.executeCommand('remote-ssh.reconnect', mountPoint.connectionId);
              }
            }
          },
          {
            label: 'Remount',
            description: 'Try to remount the folder',
            action: async () => {
              if (mountPoint) {
                // This would typically call a remount method
                vscode.window.showInformationMessage(`Remounting ${mountPoint.name}...`);
                
                // Execute the remount command if available
                await vscode.commands.executeCommand('remote-ssh.remountFolder', mountPoint.id);
              }
            }
          },
          ...commonOptions
        ];
        
      case MountErrorType.MountNotActive:
        return [
          {
            label: 'Activate',
            description: 'Activate the mount',
            action: async () => {
              if (mountPoint) {
                // This would typically call an activate method
                vscode.window.showInformationMessage(`Activating ${mountPoint.name}...`);
                
                // Execute the activate command if available
                await vscode.commands.executeCommand('remote-ssh.activateMount', mountPoint.id);
              }
            }
          },
          ...commonOptions
        ];
        
      case MountErrorType.GitNotInstalled:
        return [
          {
            label: 'Install Git',
            description: 'Install Git on the remote server',
            action: async () => {
              if (mountPoint) {
                // Show a quick pick to select the package manager
                const packageManager = await vscode.window.showQuickPick(
                  ['apt-get (Debian/Ubuntu)', 'yum (CentOS/RHEL)', 'dnf (Fedora)', 'zypper (openSUSE)', 'pacman (Arch)', 'Other'],
                  { placeHolder: 'Select the package manager on the remote server' }
                );
                
                if (!packageManager) {
                  return;
                }
                
                // Build the install command based on the package manager
                let installCommand = '';
                switch (packageManager) {
                  case 'apt-get (Debian/Ubuntu)':
                    installCommand = 'sudo apt-get update && sudo apt-get install -y git';
                    break;
                  case 'yum (CentOS/RHEL)':
                    installCommand = 'sudo yum install -y git';
                    break;
                  case 'dnf (Fedora)':
                    installCommand = 'sudo dnf install -y git';
                    break;
                  case 'zypper (openSUSE)':
                    installCommand = 'sudo zypper install -y git';
                    break;
                  case 'pacman (Arch)':
                    installCommand = 'sudo pacman -S --noconfirm git';
                    break;
                  default:
                    // Show a message with manual instructions
                    vscode.window.showInformationMessage(
                      'Please install Git manually on the remote server and then try again.'
                    );
                    return;
                }
                
                // Execute the install command
                vscode.window.showInformationMessage(`Installing Git on the remote server...`);
                
                // Execute the command in a terminal
                const terminal = await vscode.commands.executeCommand('remote-ssh.createTerminalForMount', mountPoint.id);
                if (terminal) {
                  // Send the install command to the terminal
                  await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: `${installCommand}\n` });
                }
              }
            }
          },
          ...commonOptions
        ];
        
      case MountErrorType.NotGitRepository:
        return [
          {
            label: 'Initialize Git Repository',
            description: 'Initialize a new Git repository in this folder',
            action: async () => {
              if (mountPoint) {
                // Execute the git init command
                vscode.window.showInformationMessage(`Initializing Git repository in ${mountPoint.name}...`);
                
                // Execute the git init command if available
                await vscode.commands.executeCommand('remote-ssh.initializeGitRepository', mountPoint.id);
              }
            }
          },
          ...commonOptions
        ];
        
      default:
        return commonOptions;
    }
  }
}