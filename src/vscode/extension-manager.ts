/**
 * Extension Manager Implementation
 * Handles remote extension installation, compatibility checking, and synchronization
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { 
  ExtensionManager, 
  RemoteExtension, 
  ExtensionKind, 
  ExtensionInstallStatus, 
  ExtensionInstallResult 
} from '../interfaces/extension';
import { SSHConnectionManager, SSHConnection } from '../interfaces/ssh';

/**
 * Implementation of the ExtensionManager interface
 */
export class ExtensionManagerImpl implements ExtensionManager {
  private remoteExtensionsCache: Map<string, RemoteExtension[]> = new Map();
  private compatibilityCache: Map<string, boolean> = new Map();
  
  constructor(private connectionManager: SSHConnectionManager) {}
  
  /**
   * Get all extensions installed on the remote host
   */
  async getRemoteExtensions(connectionId: string): Promise<RemoteExtension[]> {
    // Check cache first
    if (this.remoteExtensionsCache.has(connectionId)) {
      return this.remoteExtensionsCache.get(connectionId) || [];
    }
    
    const connection = this.getConnection(connectionId);
    
    try {
      // Get the remote extensions directory
      const result = await connection.execute('code --list-extensions --show-versions --category');
      
      if (result.exitCode !== 0) {
        throw new Error(`Failed to list remote extensions: ${result.stderr}`);
      }
      
      // Parse the output
      const extensions: RemoteExtension[] = [];
      const lines = result.stdout.split('\n').filter(line => line.trim().length > 0);
      
      for (const line of lines) {
        try {
          // Format is: publisher.name@version [kind]
          const match = line.match(/^([^@]+)@([^\s]+)\s+\[([^\]]+)\]$/);
          if (match) {
            const [, id, version, kindStr] = match;
            const [publisher, name] = id.split('.');
            
            // Parse extension kinds
            const kinds: ExtensionKind[] = [];
            if (kindStr.includes('ui')) {
              kinds.push(ExtensionKind.UI);
            }
            if (kindStr.includes('workspace')) {
              kinds.push(ExtensionKind.Workspace);
            }
            if (kindStr.includes('web')) {
              kinds.push(ExtensionKind.Web);
            }
            
            // Get extension path
            const pathResult = await connection.execute(`code --locate-extension ${id}`);
            const extensionPath = pathResult.stdout.trim();
            
            // Check if extension is active
            const isActive = true; // We can't easily determine this remotely
            
            // Get extension details
            const packageJsonPath = path.join(extensionPath, 'package.json');
            const packageJsonResult = await connection.execute(`cat ${packageJsonPath}`);
            let description = '';
            
            if (packageJsonResult.exitCode === 0) {
              try {
                const packageJson = JSON.parse(packageJsonResult.stdout);
                description = packageJson.description || '';
              } catch (e) {
                // Ignore JSON parsing errors
              }
            }
            
            // Check compatibility
            const isCompatible = kinds.includes(ExtensionKind.Workspace);
            
            extensions.push({
              id,
              name,
              publisher,
              version,
              description,
              isActive,
              path: extensionPath,
              isCompatible,
              extensionKind: kinds
            });
          }
        } catch (e) {
          console.error('Error parsing extension:', e);
        }
      }
      
      // Cache the results
      this.remoteExtensionsCache.set(connectionId, extensions);
      
      return extensions;
    } catch (error) {
      console.error('Error getting remote extensions:', error);
      return [];
    }
  }
  
  /**
   * Install an extension on the remote host
   */
  async installExtension(connectionId: string, extensionId: string): Promise<ExtensionInstallResult> {
    const connection = this.getConnection(connectionId);
    
    try {
      // Install the extension
      const result = await connection.execute(`code --install-extension ${extensionId}`);
      
      if (result.exitCode !== 0) {
        return {
          extensionId,
          status: ExtensionInstallStatus.Failed,
          error: result.stderr
        };
      }
      
      // Clear the cache
      this.remoteExtensionsCache.delete(connectionId);
      
      return {
        extensionId,
        status: ExtensionInstallStatus.Installed
      };
    } catch (error) {
      return {
        extensionId,
        status: ExtensionInstallStatus.Failed,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Uninstall an extension from the remote host
   */
  async uninstallExtension(connectionId: string, extensionId: string): Promise<boolean> {
    const connection = this.getConnection(connectionId);
    
    try {
      // Uninstall the extension
      const result = await connection.execute(`code --uninstall-extension ${extensionId}`);
      
      if (result.exitCode !== 0) {
        return false;
      }
      
      // Clear the cache
      this.remoteExtensionsCache.delete(connectionId);
      
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Check if an extension is compatible with remote execution
   */
  async isExtensionCompatible(extensionId: string): Promise<boolean> {
    // Check cache first
    if (this.compatibilityCache.has(extensionId)) {
      return this.compatibilityCache.get(extensionId) || false;
    }
    
    try {
      // Get the extension
      const extension = vscode.extensions.getExtension(extensionId);
      
      if (!extension) {
        return false;
      }
      
      // Check if the extension is compatible with remote execution
      // Extensions that can run in workspace are compatible
      const packageJson = extension.packageJSON;
      const extensionKind = packageJson.extensionKind;
      
      let isCompatible = false;
      
      if (Array.isArray(extensionKind)) {
        isCompatible = extensionKind.includes('workspace');
      } else if (typeof extensionKind === 'string') {
        isCompatible = extensionKind === 'workspace';
      } else {
        // Default to true for extensions without extensionKind
        isCompatible = true;
      }
      
      // Cache the result
      this.compatibilityCache.set(extensionId, isCompatible);
      
      return isCompatible;
    } catch (error) {
      console.error('Error checking extension compatibility:', error);
      return false;
    }
  }
  
  /**
   * Get locally installed extensions that are compatible with remote execution
   */
  async getCompatibleLocalExtensions(): Promise<vscode.Extension<any>[]> {
    const extensions = vscode.extensions.all;
    const compatibleExtensions: vscode.Extension<any>[] = [];
    
    for (const extension of extensions) {
      const isCompatible = await this.isExtensionCompatible(extension.id);
      
      if (isCompatible) {
        compatibleExtensions.push(extension);
      }
    }
    
    return compatibleExtensions;
  }
  
  /**
   * Synchronize compatible extensions from local to remote
   */
  async synchronizeExtensions(connectionId: string): Promise<ExtensionInstallResult[]> {
    const results: ExtensionInstallResult[] = [];
    
    try {
      // Get compatible local extensions
      const localExtensions = await this.getCompatibleLocalExtensions();
      
      // Get remote extensions
      const remoteExtensions = await this.getRemoteExtensions(connectionId);
      const remoteExtensionIds = new Set(remoteExtensions.map(ext => ext.id));
      
      // Install missing extensions
      for (const extension of localExtensions) {
        if (!remoteExtensionIds.has(extension.id)) {
          const result = await this.installExtension(connectionId, extension.id);
          results.push(result);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error synchronizing extensions:', error);
      return results;
    }
  }
  
  /**
   * Get a connection by ID
   */
  private getConnection(connectionId: string): SSHConnection {
    const connection = this.connectionManager.getConnection(connectionId);
    
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }
    
    return connection;
  }
  
  /**
   * Clear the extension cache for a connection
   */
  clearCache(connectionId: string): void {
    this.remoteExtensionsCache.delete(connectionId);
  }
  
  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.remoteExtensionsCache.clear();
    this.compatibilityCache.clear();
  }
}