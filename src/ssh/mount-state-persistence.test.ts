import * as vscode from 'vscode';
import { MountStatePersistenceImpl } from './mount-state-persistence';
import { MountPoint, MountStatus } from '../interfaces/mount';
import { SecureStorage } from '../interfaces/configuration';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock VS Code extension context
const mockContext = {
  globalState: {
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockReturnValue([])
  }
} as any;

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

describe('MountStatePersistenceImpl', () => {
  let persistence: MountStatePersistenceImpl;
  let secureStorage: MockSecureStorage;
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    secureStorage = new MockSecureStorage();
    persistence = new MountStatePersistenceImpl(mockContext, secureStorage);
  });
  
  describe('saveMountPoints', () => {
    it('should save mount points to global state and secure storage', async () => {
      // Create test mount points
      const mountPoints: MountPoint[] = [
        {
          id: 'mount1',
          connectionId: 'conn1',
          remotePath: '/remote/path1',
          displayName: 'Remote Path 1',
          uri: vscode.Uri.parse('ssh-mount://mount1/'),
          status: MountStatus.Connected,
          lastConnected: new Date(),
          options: {
            autoReconnect: true,
            cacheEnabled: true,
            watchEnabled: true,
            watchExcludePatterns: ['**/node_modules/**']
          }
        },
        {
          id: 'mount2',
          connectionId: 'conn2',
          remotePath: '/remote/path2',
          displayName: 'Remote Path 2',
          uri: vscode.Uri.parse('ssh-mount://mount2/'),
          status: MountStatus.Disconnected,
          lastConnected: new Date(0),
          options: {
            autoReconnect: false,
            cacheEnabled: false,
            watchEnabled: false,
            watchExcludePatterns: []
          }
        }
      ];
      
      // Save mount points
      await persistence.saveMountPoints(mountPoints);
      
      // Verify global state was updated
      expect(mockContext.globalState.update).toHaveBeenCalledTimes(1);
      
      // Verify the data saved to global state
      const savedData = mockContext.globalState.update.mock.calls[0][1];
      expect(savedData).toHaveLength(2);
      expect(savedData[0].id).toBe('mount1');
      expect(savedData[0].connectionId).toBe('conn1');
      expect(savedData[0].remotePath).toBe('/remote/path1');
      expect(savedData[0].displayName).toBe('Remote Path 1');
      expect(savedData[0].options.autoReconnect).toBe(true);
      expect(savedData[0].options.watchEnabled).toBe(true);
      
      // Verify sensitive data was not saved to global state
      expect(savedData[0].options.cacheEnabled).toBeUndefined();
      
      // Verify secure storage was used
      const secureData1 = await secureStorage.retrieve('mount-config-mount1');
      expect(secureData1).toBeDefined();
      const parsedData1 = JSON.parse(secureData1!);
      expect(parsedData1.cacheEnabled).toBe(true);
      
      const secureData2 = await secureStorage.retrieve('mount-config-mount2');
      expect(secureData2).toBeDefined();
      const parsedData2 = JSON.parse(secureData2!);
      expect(parsedData2.cacheEnabled).toBe(false);
    });
  });
  
  describe('loadMountPoints', () => {
    it('should load mount points from global state and secure storage', async () => {
      // Mock global state data
      mockContext.globalState.get.mockReturnValue([
        {
          id: 'mount1',
          connectionId: 'conn1',
          remotePath: '/remote/path1',
          displayName: 'Remote Path 1',
          options: {
            autoReconnect: true,
            watchEnabled: true,
            watchExcludePatterns: ['**/node_modules/**']
          }
        },
        {
          id: 'mount2',
          connectionId: 'conn2',
          remotePath: '/remote/path2',
          displayName: 'Remote Path 2',
          options: {
            autoReconnect: false,
            watchEnabled: false,
            watchExcludePatterns: []
          }
        }
      ]);
      
      // Add secure storage data
      await secureStorage.store('mount-config-mount1', JSON.stringify({ cacheEnabled: true }));
      await secureStorage.store('mount-config-mount2', JSON.stringify({ cacheEnabled: false }));
      
      // Load mount points
      const loadedMountPoints = await persistence.loadMountPoints();
      
      // Verify loaded data
      expect(loadedMountPoints).toHaveLength(2);
      
      // Check first mount point
      expect(loadedMountPoints[0].id).toBe('mount1');
      expect(loadedMountPoints[0].connectionId).toBe('conn1');
      expect(loadedMountPoints[0].remotePath).toBe('/remote/path1');
      expect(loadedMountPoints[0].displayName).toBe('Remote Path 1');
      expect(loadedMountPoints[0].uri.toString()).toBe('ssh-mount://mount1/');
      expect(loadedMountPoints[0].status).toBe(MountStatus.Disconnected);
      expect(loadedMountPoints[0].options.autoReconnect).toBe(true);
      expect(loadedMountPoints[0].options.watchEnabled).toBe(true);
      expect(loadedMountPoints[0].options.cacheEnabled).toBe(true);
      expect(loadedMountPoints[0].options.watchExcludePatterns).toEqual(['**/node_modules/**']);
      
      // Check second mount point
      expect(loadedMountPoints[1].id).toBe('mount2');
      expect(loadedMountPoints[1].options.autoReconnect).toBe(false);
      expect(loadedMountPoints[1].options.watchEnabled).toBe(false);
      expect(loadedMountPoints[1].options.cacheEnabled).toBe(false);
      expect(loadedMountPoints[1].options.watchExcludePatterns).toEqual([]);
    });
    
    it('should handle missing secure data gracefully', async () => {
      // Mock global state data with no secure storage data
      mockContext.globalState.get.mockReturnValue([
        {
          id: 'mount1',
          connectionId: 'conn1',
          remotePath: '/remote/path1',
          displayName: 'Remote Path 1',
          options: {
            autoReconnect: true,
            watchEnabled: true,
            watchExcludePatterns: ['**/node_modules/**']
          }
        }
      ]);
      
      // Load mount points (no secure data available)
      const loadedMountPoints = await persistence.loadMountPoints();
      
      // Verify loaded data uses defaults for missing secure data
      expect(loadedMountPoints).toHaveLength(1);
      expect(loadedMountPoints[0].id).toBe('mount1');
      expect(loadedMountPoints[0].options.cacheEnabled).toBe(true); // Default value
    });
    
    it('should handle empty state gracefully', async () => {
      // Mock empty global state
      mockContext.globalState.get.mockReturnValue(null);
      
      // Load mount points
      const loadedMountPoints = await persistence.loadMountPoints();
      
      // Verify empty array is returned
      expect(loadedMountPoints).toEqual([]);
    });
  });
  
  describe('clearMountPoints', () => {
    it('should clear mount points from global state and secure storage', async () => {
      // Mock global state data
      mockContext.globalState.get.mockReturnValue([
        { id: 'mount1' },
        { id: 'mount2' }
      ]);
      
      // Add secure storage data
      await secureStorage.store('mount-config-mount1', JSON.stringify({ cacheEnabled: true }));
      await secureStorage.store('mount-config-mount2', JSON.stringify({ cacheEnabled: false }));
      
      // Clear mount points
      await persistence.clearMountPoints();
      
      // Verify global state was cleared
      expect(mockContext.globalState.update).toHaveBeenCalledWith('remoteFolderMounts', []);
      
      // Verify secure storage was cleared
      expect(await secureStorage.retrieve('mount-config-mount1')).toBeUndefined();
      expect(await secureStorage.retrieve('mount-config-mount2')).toBeUndefined();
    });
  });
});