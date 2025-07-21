/**
 * File system interfaces for remote file operations
 */
import * as vscode from 'vscode';
import { MountPoint } from './mount';

export interface RemoteFileSystemProvider extends vscode.FileSystemProvider {
  readFile(uri: vscode.Uri): Promise<Uint8Array>;
  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean }): Promise<void>;
  readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]>;
  createDirectory(uri: vscode.Uri): Promise<void>;
  delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void>;
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void>;
  stat(uri: vscode.Uri): Promise<vscode.FileStat>;
  watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable;
}

/**
 * Extension of RemoteFileSystemProvider that is aware of mount points
 */
export interface MountAwareFileSystemProvider extends RemoteFileSystemProvider {
  /**
   * Register a mount point with the file system provider
   * @param mountPoint Mount point to register
   */
  registerMountPoint(mountPoint: MountPoint): void;
  
  /**
   * Unregister a mount point from the file system provider
   * @param mountId ID of the mount point to unregister
   */
  unregisterMountPoint(mountId: string): void;
  
  /**
   * Get the mount point for a URI
   * @param uri URI to look up
   * @returns Mount point if found, undefined otherwise
   */
  getMountPointForUri(uri: vscode.Uri): MountPoint | undefined;
  
  /**
   * Translate a mounted URI to a remote URI
   * @param uri Mounted URI (ssh-mount scheme)
   * @returns Remote URI (ssh scheme)
   */
  translateMountedUriToRemoteUri(uri: vscode.Uri): vscode.Uri;
}

export interface FileSystemCache {
  uri: string;
  stat: vscode.FileStat;
  children?: Map<string, FileSystemCache>;
  lastUpdated: Date;
  isDirty: boolean;
}

export interface FileOperation {
  type: 'read' | 'write' | 'create' | 'delete' | 'rename' | 'stat';
  uri: vscode.Uri;
  targetUri?: vscode.Uri; // For rename operations
  content?: Uint8Array; // For write operations
  options?: any;
  timestamp: Date;
}

export interface FileSystemError extends Error {
  code: 'FileNotFound' | 'FileExists' | 'NoPermissions' | 'Unavailable' | 'Unknown';
  uri: vscode.Uri;
}