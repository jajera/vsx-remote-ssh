import * as vscode from 'vscode';
import { MountOptions, MountPoint } from '../interfaces/mount';
import { SecureStorage } from '../interfaces/configuration';

/**
 * Interface for managing mount options
 */
export interface MountOptionsManager {
  /**
   * Get options for a mount point
   * @param mountId ID of the mount point
   * @returns Mount options
   */
  getOptions(mountId: string): Promise<MountOptions | undefined>;
  
  /**
   * Update options for a mount point
   * @param mountId ID of the mount point
   * @param options New options
   */
  updateOptions(mountId: string, options: MountOptions): Promise<void>;
  
  /**
   * Show UI for configuring mount options
   * @param mountPoint Mount point to configure
   * @returns Updated options if changed, undefined if cancelled
   */
  showOptionsUI(mountPoint: MountPoint): Promise<MountOptions | undefined>;
  
  /**
   * Get default options for new mount points
   * @returns Default mount options
   */
  getDefaultOptions(): MountOptions;
}

/**
 * Default mount options
 */
export const DefaultMountOptions: MountOptions = {
  autoReconnect: true,
  cacheEnabled: true,
  watchEnabled: true,
  watchExcludePatterns: ['**/node_modules/**', '**/.git/**']
};

/**
 * Implementation of MountOptionsManager
 */
export class MountOptionsManagerImpl implements MountOptionsManager {
  private secureStorage: SecureStorage;
  private readonly STORAGE_KEY_PREFIX = 'mount-options-';
  
  constructor(secureStorage: SecureStorage) {
    this.secureStorage = secureStorage;
  }
  
  /**
   * Get options for a mount point
   * @param mountId ID of the mount point
   * @returns Mount options
   */
  async getOptions(mountId: string): Promise<MountOptions | undefined> {
    try {
      const optionsStr = await this.secureStorage.retrieve(`${this.STORAGE_KEY_PREFIX}${mountId}`);
      if (optionsStr) {
        return JSON.parse(optionsStr) as MountOptions;
      }
      return undefined;
    } catch (error) {
      console.error(`Failed to get options for mount ${mountId}:`, error);
      return undefined;
    }
  }
  
  /**
   * Update options for a mount point
   * @param mountId ID of the mount point
   * @param options New options
   */
  async updateOptions(mountId: string, options: MountOptions): Promise<void> {
    try {
      await this.secureStorage.store(
        `${this.STORAGE_KEY_PREFIX}${mountId}`,
        JSON.stringify(options)
      );
    } catch (error) {
      console.error(`Failed to update options for mount ${mountId}:`, error);
      throw new Error(`Failed to update mount options: ${(error as Error).message}`);
    }
  }
  
  /**
   * Show UI for configuring mount options
   * @param mountPoint Mount point to configure
   * @returns Updated options if changed, undefined if cancelled
   */
  async showOptionsUI(mountPoint: MountPoint): Promise<MountOptions | undefined> {
    // Get current options
    const currentOptions = mountPoint.options;
    
    // Create quick pick items for boolean options
    const autoReconnectItem = {
      label: 'Auto Reconnect',
      description: currentOptions.autoReconnect ? 'Enabled' : 'Disabled',
      picked: currentOptions.autoReconnect,
      alwaysShow: true,
      option: 'autoReconnect'
    };
    
    const cacheEnabledItem = {
      label: 'File Caching',
      description: currentOptions.cacheEnabled ? 'Enabled' : 'Disabled',
      picked: currentOptions.cacheEnabled,
      alwaysShow: true,
      option: 'cacheEnabled'
    };
    
    const watchEnabledItem = {
      label: 'File Watching',
      description: currentOptions.watchEnabled ? 'Enabled' : 'Disabled',
      picked: currentOptions.watchEnabled,
      alwaysShow: true,
      option: 'watchEnabled'
    };
    
    // Show quick pick for boolean options
    const selectedItems = await vscode.window.showQuickPick(
      [autoReconnectItem, cacheEnabledItem, watchEnabledItem],
      {
        canPickMany: true,
        title: `Configure Options for ${mountPoint.displayName}`,
        placeHolder: 'Select options to enable'
      }
    );
    
    if (selectedItems === undefined) {
      // User cancelled
      return undefined;
    }
    
    // Create new options object
    const newOptions: MountOptions = {
      ...currentOptions,
      autoReconnect: selectedItems.some(item => item.option === 'autoReconnect'),
      cacheEnabled: selectedItems.some(item => item.option === 'cacheEnabled'),
      watchEnabled: selectedItems.some(item => item.option === 'watchEnabled')
    };
    
    // If file watching is enabled, show input box for exclude patterns
    if (newOptions.watchEnabled) {
      const excludePatternsStr = await vscode.window.showInputBox({
        title: 'File Watch Exclude Patterns',
        prompt: 'Enter comma-separated patterns to exclude from file watching',
        value: newOptions.watchExcludePatterns.join(', '),
        placeHolder: '**/node_modules/**, **/.git/**'
      });
      
      if (excludePatternsStr !== undefined) {
        // User provided patterns
        newOptions.watchExcludePatterns = excludePatternsStr
          .split(',')
          .map(pattern => pattern.trim())
          .filter(pattern => pattern.length > 0);
      }
    }
    
    // Save the updated options
    await this.updateOptions(mountPoint.id, newOptions);
    
    return newOptions;
  }
  
  /**
   * Get default options for new mount points
   * @returns Default mount options
   */
  getDefaultOptions(): MountOptions {
    return { ...DefaultMountOptions };
  }
}