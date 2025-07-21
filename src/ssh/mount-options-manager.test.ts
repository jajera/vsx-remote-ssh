import * as vscode from 'vscode';
import { MountOptionsManagerImpl, DefaultMountOptions } from './mount-options-manager';
import { MountPoint, MountStatus } from '../interfaces/mount';
import { SecureStorage } from '../interfaces/configuration';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock VS Code API
vi.mock('vscode', () => {
  return {
    window: {
      showQuickPick: vi.fn(),
      showInputBox: vi.fn()
    }
  };
});

// Mock secure storage
class MockSecureStorage implements SecureStorage {
  private storage: Map<string, string> = new Map();
  
  async store(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }
  
  async retrieve(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }
  
  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }
  
  async clear(): Promise<void> {
    this.storage.clear();
  }
}

describe('MountOptionsManagerImpl', () => {
  let optionsManager: MountOptionsManagerImpl;
  let secureStorage: MockSecureStorage;
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    secureStorage = new MockSecureStorage();
    optionsManager = new MountOptionsManagerImpl(secureStorage);
  });
  
  describe('getOptions', () => {
    it('should return undefined if no options are stored', async () => {
      const options = await optionsManager.getOptions('mount1');
      expect(options).toBeUndefined();
    });
    
    it('should return stored options', async () => {
      // Store options
      const testOptions = {
        autoReconnect: false,
        cacheEnabled: true,
        watchEnabled: false,
        watchExcludePatterns: ['**/test/**']
      };
      await secureStorage.store('mount-options-mount1', JSON.stringify(testOptions));
      
      // Get options
      const options = await optionsManager.getOptions('mount1');
      
      // Verify
      expect(options).toEqual(testOptions);
    });
  });
  
  describe('updateOptions', () => {
    it('should store options in secure storage', async () => {
      // Test options
      const testOptions = {
        autoReconnect: false,
        cacheEnabled: true,
        watchEnabled: false,
        watchExcludePatterns: ['**/test/**']
      };
      
      // Update options
      await optionsManager.updateOptions('mount1', testOptions);
      
      // Verify stored in secure storage
      const storedOptionsStr = await secureStorage.retrieve('mount-options-mount1');
      expect(storedOptionsStr).toBeDefined();
      
      const storedOptions = JSON.parse(storedOptionsStr!);
      expect(storedOptions).toEqual(testOptions);
    });
  });
  
  describe('getDefaultOptions', () => {
    it('should return a copy of default options', () => {
      const options = optionsManager.getDefaultOptions();
      expect(options).toEqual(DefaultMountOptions);
      expect(options).not.toBe(DefaultMountOptions); // Should be a copy
    });
  });
  
  describe('showOptionsUI', () => {
    it('should return undefined if user cancels', async () => {
      // Mock user cancellation
      (vscode.window.showQuickPick as any).mockResolvedValue(undefined);
      
      // Test mount point
      const mountPoint: MountPoint = {
        id: 'mount1',
        connectionId: 'conn1',
        remotePath: '/remote/path',
        displayName: 'Remote Path',
        uri: {} as vscode.Uri,
        status: MountStatus.Connected,
        lastConnected: new Date(),
        options: { ...DefaultMountOptions }
      };
      
      // Show UI
      const result = await optionsManager.showOptionsUI(mountPoint);
      
      // Verify
      expect(result).toBeUndefined();
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });
    
    it('should update options based on user selection', async () => {
      // Mock user selection
      (vscode.window.showQuickPick as any).mockResolvedValue([
        { option: 'autoReconnect' },
        { option: 'watchEnabled' }
      ]);
      (vscode.window.showInputBox as any).mockResolvedValue('**/test/**, **/build/**');
      
      // Test mount point
      const mountPoint: MountPoint = {
        id: 'mount1',
        connectionId: 'conn1',
        remotePath: '/remote/path',
        displayName: 'Remote Path',
        uri: {} as vscode.Uri,
        status: MountStatus.Connected,
        lastConnected: new Date(),
        options: { ...DefaultMountOptions }
      };
      
      // Show UI
      const result = await optionsManager.showOptionsUI(mountPoint);
      
      // Verify
      expect(result).toBeDefined();
      expect(result!.autoReconnect).toBe(true);
      expect(result!.cacheEnabled).toBe(false);
      expect(result!.watchEnabled).toBe(true);
      expect(result!.watchExcludePatterns).toEqual(['**/test/**', '**/build/**']);
      
      // Verify options were stored
      const storedOptionsStr = await secureStorage.retrieve('mount-options-mount1');
      expect(storedOptionsStr).toBeDefined();
      
      const storedOptions = JSON.parse(storedOptionsStr!);
      expect(storedOptions).toEqual(result);
    });
    
    it('should not prompt for exclude patterns if watch is disabled', async () => {
      // Mock user selection
      (vscode.window.showQuickPick as any).mockResolvedValue([
        { option: 'autoReconnect' },
        { option: 'cacheEnabled' }
      ]);
      
      // Test mount point
      const mountPoint: MountPoint = {
        id: 'mount1',
        connectionId: 'conn1',
        remotePath: '/remote/path',
        displayName: 'Remote Path',
        uri: {} as vscode.Uri,
        status: MountStatus.Connected,
        lastConnected: new Date(),
        options: { ...DefaultMountOptions }
      };
      
      // Show UI
      const result = await optionsManager.showOptionsUI(mountPoint);
      
      // Verify
      expect(result).toBeDefined();
      expect(result!.autoReconnect).toBe(true);
      expect(result!.cacheEnabled).toBe(true);
      expect(result!.watchEnabled).toBe(false);
      
      // Verify input box was not shown
      expect(vscode.window.showInputBox).not.toHaveBeenCalled();
    });
  });
});