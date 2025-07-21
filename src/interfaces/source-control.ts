/**
 * Source control interfaces for remote folder mounting functionality
 */
import * as vscode from 'vscode';
import { MountPoint } from './mount';

/**
 * Source control provider for mounted folders
 */
export interface MountSourceControlProvider {
  /**
   * Initialize source control for a mount point
   * @param mountPoint The mount point to initialize source control for
   * @returns The source control instance
   */
  initializeSourceControl(mountPoint: MountPoint): Promise<vscode.SourceControl>;
  
  /**
   * Dispose of source control for a mount point
   * @param mountId The ID of the mount point
   */
  disposeSourceControl(mountId: string): void;
  
  /**
   * Get the source control instance for a mount point
   * @param mountId The ID of the mount point
   * @returns The source control instance or undefined if not found
   */
  getSourceControl(mountId: string): vscode.SourceControl | undefined;
  
  /**
   * Refresh the source control status for a mount point
   * @param mountId The ID of the mount point
   */
  refreshSourceControl(mountId: string): Promise<void>;
  
  /**
   * Execute a Git command on a mounted folder
   * @param mountId The ID of the mount point
   * @param command The Git command to execute
   * @param args The arguments for the Git command
   * @returns The result of the command execution
   */
  executeGitCommand(mountId: string, command: string, ...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  
  /**
   * Dispose of all resources
   */
  dispose(): void;
}

/**
 * Git status for a file in a mounted folder
 */
export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

/**
 * Git repository information for a mounted folder
 */
export interface GitRepositoryInfo {
  mountId: string;
  rootPath: string;
  branch: string;
  remote: string;
  status: GitFileStatus[];
  isValid: boolean;
}