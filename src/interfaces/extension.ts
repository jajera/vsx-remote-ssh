/**
 * Extension Host Bridge Interfaces
 * Defines interfaces for managing remote extensions and extension host communication
 */
import * as vscode from 'vscode';
import { SSHConnection } from './ssh';

/**
 * Represents a remote extension
 */
export interface RemoteExtension {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  isActive: boolean;
  path: string;
  isCompatible: boolean;
  extensionKind: ExtensionKind[];
}

/**
 * Extension kind, matching VS Code's ExtensionKind
 */
export enum ExtensionKind {
  UI = 'ui',
  Workspace = 'workspace',
  Web = 'web'
}

/**
 * Extension installation status
 */
export enum ExtensionInstallStatus {
  Installing = 'installing',
  Installed = 'installed',
  Failed = 'failed'
}

/**
 * Extension installation result
 */
export interface ExtensionInstallResult {
  extensionId: string;
  status: ExtensionInstallStatus;
  error?: string;
}

/**
 * Extension manager interface for handling remote extensions
 */
export interface ExtensionManager {
  /**
   * Get all extensions installed on the remote host
   */
  getRemoteExtensions(connectionId: string): Promise<RemoteExtension[]>;
  
  /**
   * Install an extension on the remote host
   */
  installExtension(connectionId: string, extensionId: string): Promise<ExtensionInstallResult>;
  
  /**
   * Uninstall an extension from the remote host
   */
  uninstallExtension(connectionId: string, extensionId: string): Promise<boolean>;
  
  /**
   * Check if an extension is compatible with remote execution
   */
  isExtensionCompatible(extensionId: string): Promise<boolean>;
  
  /**
   * Get locally installed extensions that are compatible with remote execution
   */
  getCompatibleLocalExtensions(): Promise<vscode.Extension<any>[]>;
  
  /**
   * Synchronize compatible extensions from local to remote
   */
  synchronizeExtensions(connectionId: string): Promise<ExtensionInstallResult[]>;
}

/**
 * Debug session manager interface for remote debugging
 */
export interface DebugSessionManager {
  /**
   * Start a debug session on the remote host
   */
  startDebugSession(connectionId: string, config: vscode.DebugConfiguration): Promise<vscode.DebugSession>;
  
  /**
   * Stop a debug session
   */
  stopDebugSession(sessionId: string): Promise<void>;
  
  /**
   * Get active debug sessions
   */
  getActiveDebugSessions(connectionId: string): Promise<vscode.DebugSession[]>;
  
  /**
   * Forward debugging protocol messages
   */
  forwardDebugMessage(connectionId: string, message: any): Promise<void>;
}

/**
 * Language server manager interface for remote language servers
 */
export interface LanguageServerManager {
  /**
   * Start a language server on the remote host
   */
  startLanguageServer(connectionId: string, languageId: string): Promise<boolean>;
  
  /**
   * Stop a language server
   */
  stopLanguageServer(connectionId: string, languageId: string): Promise<void>;
  
  /**
   * Get active language servers
   */
  getActiveLanguageServers(connectionId: string): Promise<string[]>;
  
  /**
   * Check if a language server is available on the remote host
   */
  isLanguageServerAvailable(connectionId: string, languageId: string): Promise<boolean>;
  
  /**
   * Install a language server on the remote host
   */
  installLanguageServer(connectionId: string, languageId: string): Promise<boolean>;
}