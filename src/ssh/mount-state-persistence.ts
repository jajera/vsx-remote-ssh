import * as vscode from 'vscode';
import { MountPoint, MountStatePersistence, MountStatus } from '../interfaces/mount';
import { SecureStorage } from '../interfaces/configuration';

/**
 * Implementation of MountStatePersistence for saving and loading mount points
 */
export class MountStatePersistenceImpl implements MountStatePersistence {
  private context: vscode.ExtensionContext;
  private secureStorage: SecureStorage;
  private readonly STORAGE_KEY = 'remoteFolderMounts';
  private readonly SECURE_STORAGE_PREFIX = 'mount-config-';
  
  constructor(context: vscode.ExtensionContext, secureStorage: SecureStorage) {
    this.context = context;
    this.secureStorage = secureStorage;
  }
  
  /**
   * Save mount points to persistent storage
   * @param mountPoints Mount points to save
   */
  async saveMountPoints(mountPoints: MountPoint[]): Promise<void> {
    // Convert mount points to serializable format for non-sensitive data
    const serialized = await Promise.all(mountPoints.map(async mp => {
      // Store sensitive configuration data in secure storage
      await this.saveSecureData(mp.id, mp);
      
      // Return non-sensitive data for global state
      return {
        id: mp.id,
        connectionId: mp.connectionId,
        remotePath: mp.remotePath,
        displayName: mp.displayName,
        // Store only non-sensitive options in global state
        options: {
          autoReconnect: mp.options.autoReconnect,
          watchEnabled: mp.options.watchEnabled,
          watchExcludePatterns: mp.options.watchExcludePatterns
        }
      };
    }));
    
    // Save to global state
    await this.context.globalState.update(this.STORAGE_KEY, serialized);
  }
  
  /**
   * Load mount points from persistent storage
   * @returns Loaded mount points
   */
  async loadMountPoints(): Promise<MountPoint[]> {
    // Load from global state
    const serialized = this.context.globalState.get<any[]>(this.STORAGE_KEY) || [];
    
    // Convert to mount points with secure data
    const mountPoints = await Promise.all(serialized.map(async s => {
      // Create basic mount point
      const mountPoint: MountPoint = {
        id: s.id,
        connectionId: s.connectionId,
        remotePath: s.remotePath,
        displayName: s.displayName,
        uri: vscode.Uri.parse(`ssh-mount://${s.id}/`),
        status: MountStatus.Disconnected,
        lastConnected: new Date(0),
        options: {
          autoReconnect: true,
          cacheEnabled: true,
          watchEnabled: true,
          watchExcludePatterns: ['**/node_modules/**', '**/.git/**']
        }
      };
      
      // Merge with options from global state
      if (s.options) {
        mountPoint.options = {
          ...mountPoint.options,
          ...s.options
        };
      }
      
      // Load secure data
      await this.loadSecureData(s.id, mountPoint);
      
      return mountPoint;
    }));
    
    return mountPoints;
  }
  
  /**
   * Clear all saved mount points
   */
  async clearMountPoints(): Promise<void> {
    // Get current mount points to clear their secure storage
    const serialized = this.context.globalState.get<any[]>(this.STORAGE_KEY) || [];
    
    // Clear secure storage for each mount
    for (const s of serialized) {
      await this.clearSecureData(s.id);
    }
    
    // Clear global state
    await this.context.globalState.update(this.STORAGE_KEY, []);
  }
  
  /**
   * Save sensitive mount data to secure storage
   * @param mountId Mount ID
   * @param mountPoint Mount point data
   */
  private async saveSecureData(mountId: string, mountPoint: MountPoint): Promise<void> {
    // Store sensitive configuration data
    const sensitiveData = {
      // Add any sensitive configuration here
      cacheEnabled: mountPoint.options.cacheEnabled,
      // Add other sensitive fields as needed
    };
    
    await this.secureStorage.store(
      `${this.SECURE_STORAGE_PREFIX}${mountId}`,
      JSON.stringify(sensitiveData)
    );
  }
  
  /**
   * Load sensitive mount data from secure storage
   * @param mountId Mount ID
   * @param mountPoint Mount point to update with secure data
   */
  private async loadSecureData(mountId: string, mountPoint: MountPoint): Promise<void> {
    try {
      const secureDataStr = await this.secureStorage.retrieve(
        `${this.SECURE_STORAGE_PREFIX}${mountId}`
      );
      
      if (secureDataStr) {
        const secureData = JSON.parse(secureDataStr);
        
        // Update mount point with secure data
        if (secureData.cacheEnabled !== undefined) {
          mountPoint.options.cacheEnabled = secureData.cacheEnabled;
        }
        
        // Add other sensitive fields as needed
      }
    } catch (error) {
      console.error(`Failed to load secure data for mount ${mountId}:`, error);
    }
  }
  
  /**
   * Clear sensitive mount data from secure storage
   * @param mountId Mount ID
   */
  private async clearSecureData(mountId: string): Promise<void> {
    try {
      await this.secureStorage.delete(`${this.SECURE_STORAGE_PREFIX}${mountId}`);
    } catch (error) {
      console.error(`Failed to clear secure data for mount ${mountId}:`, error);
    }
  }
}