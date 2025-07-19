/**
 * File system interfaces for remote file operations
 */
import * as vscode from 'vscode';

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