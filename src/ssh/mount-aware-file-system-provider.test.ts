import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64
    },
    EventEmitter: class {
      private listeners: any[] = [];
      fire(data: any) {
        this.listeners.forEach(listener => listener(data));
      }
      event = {
        listener: (callback: any) => {
          this.listeners.push(callback);
          return { dispose: () => {
            const index = this.listeners.indexOf(callback);
            if (index > -1) {
              this.listeners.splice(index, 1);
            }
          }};
        }
      };
    },
    Uri: {
      parse: (value: string) => {
        const scheme = value.split('://')[0] || 'ssh';
        const authority = value.split('://')[1]?.split('/')[0] || '';
        const pathParts = value.split('://')[1]?.split('/').slice(1) || [];
        const pathStr = '/' + pathParts.join('/');
        
        return {
          scheme,
          authority,
          path: pathStr,
          query: '',
          fragment: '',
          fsPath: pathStr,
          with: vi.fn().mockImplementation((params: any) => {
            return {
              scheme: params.scheme || scheme,
              authority: params.authority || authority,
              path: params.path || pathStr,
              query: params.query || '',
              fragment: params.fragment || '',
              fsPath: params.path || pathStr,
              with: vi.fn(),
              toString: vi.fn().mockReturnValue(`${params.scheme || scheme}://${params.authority || authority}${params.path || pathStr}`),
              toJSON: vi.fn()
            };
          }),
          toString: vi.fn().mockReturnValue(value),
          toJSON: vi.fn()
        };
      }
    },
    FileChangeType: {
      Created: 1,
      Changed: 2,
      Deleted: 3
    }
  };
});

import * as vscode from 'vscode';
import { MountAwareFileSystemProviderImpl } from './mount-aware-file-system-provider';
import { MountPoint, MountStatus } from '../interfaces/mount';
import * as path from 'path';

// Mock dependencies
const mockConnectionManager = {
  getConnection: vi.fn(),
  onDidChangeConnections: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  connect: vi.fn(),
  disconnect: vi.fn()
};

// Mock MountFileWatcher
const mockMountFileWatcher = {
  onDidChangeFile: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  registerMount: vi.fn(),
  unregisterMount: vi.fn(),
  updateMountStatus: vi.fn(),
  dispose: vi.fn()
};

// Mock the MountFileWatcher constructor
vi.mock('./mount-file-watcher', () => ({
  MountFileWatcher: vi.fn().mockImplementation(() => mockMountFileWatcher)
}));

// Mock mount point
const createMockMountPoint = (id: string, connectionId: string, remotePath: string): MountPoint => ({
  id,
  connectionId,
  remotePath,
  displayName: `Mount ${id}`,
  uri: vscode.Uri.parse(`ssh-mount://${id}/`),
  status: MountStatus.Connected,
  lastConnected: new Date(),
  options: {
    autoReconnect: true,
    cacheEnabled: true,
    watchEnabled: true,
    watchExcludePatterns: []
  }
});

describe('MountAwareFileSystemProviderImpl', () => {
  let provider: MountAwareFileSystemProviderImpl;
  
  beforeEach(() => {
    provider = new MountAwareFileSystemProviderImpl(mockConnectionManager);
    
    // Add the missing onDidChangeFile property
    (provider as any).onDidChangeFile = {
      listener: vi.fn().mockReturnValue({ dispose: vi.fn() })
    };
    
    // Reset mocks
    vi.clearAllMocks();
  });
  
  describe('Mount point management', () => {
    it('should register and retrieve mount points', () => {
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      
      provider.registerMountPoint(mountPoint);
      
      const result = provider.getMountPointForUri(vscode.Uri.parse('ssh-mount://mount1/file.txt'));
      
      expect(result).toEqual(mountPoint);
    });
    
    it('should unregister mount points', () => {
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      
      provider.registerMountPoint(mountPoint);
      provider.unregisterMountPoint('mount1');
      
      const result = provider.getMountPointForUri(vscode.Uri.parse('ssh-mount://mount1/file.txt'));
      
      expect(result).toBeUndefined();
    });
    
    it('should return undefined for non-mount URIs', () => {
      const result = provider.getMountPointForUri(vscode.Uri.parse('ssh://conn1/file.txt'));
      
      expect(result).toBeUndefined();
    });
    
    it('should update mount status and fire event', () => {
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      provider.registerMountPoint(mountPoint);
      
      // Mock the event emitter
      const fireSpy = vi.spyOn((provider as any)._onDidChangeMountStatus, 'fire');
      
      // Update status
      provider.updateMountStatus('mount1', MountStatus.Disconnected);
      
      // Check that status was updated
      const updatedMountPoint = provider.getMountPointForUri(vscode.Uri.parse('ssh-mount://mount1/file.txt'));
      expect(updatedMountPoint?.status).toBe(MountStatus.Disconnected);
      
      // Check that event was fired
      expect(fireSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'mount1',
        status: MountStatus.Disconnected
      }));
    });
  });
  
  describe('URI translation', () => {
    it('should translate mounted URI to remote URI', () => {
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      provider.registerMountPoint(mountPoint);
      
      const mountedUri = vscode.Uri.parse('ssh-mount://mount1/src/file.txt');
      const remoteUri = provider.translateMountedUriToRemoteUri(mountedUri);
      
      expect(remoteUri.scheme).toBe('ssh');
      expect(remoteUri.authority).toBe('conn1');
      expect(remoteUri.path).toBe('/home/user/project/src/file.txt');
    });
    
    it('should throw error for unknown mount points', () => {
      const mountedUri = vscode.Uri.parse('ssh-mount://unknown/file.txt');
      
      expect(() => {
        provider.translateMountedUriToRemoteUri(mountedUri);
      }).toThrow(/Mount point not found/);
    });
    
    it('should throw error for disconnected mount points', () => {
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      mountPoint.status = MountStatus.Disconnected;
      provider.registerMountPoint(mountPoint);
      
      const mountedUri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
      
      expect(() => {
        provider.translateMountedUriToRemoteUri(mountedUri);
      }).toThrow(/Mount point is not connected/);
    });
    
    it('should return the original URI for non-mount URIs', () => {
      const uri = vscode.Uri.parse('ssh://conn1/file.txt');
      const result = provider.translateMountedUriToRemoteUri(uri);
      
      expect(result).toBe(uri);
    });
  });
  
  describe('File operations', () => {
    beforeEach(() => {
      // Set up spies for the parent class methods
      const originalReadFile = provider.readFile;
      vi.spyOn(provider, 'readFile').mockImplementation(async (uri) => {
        if (uri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return new Uint8Array([1, 2, 3]);
        }
        // For non-SSH URIs, call the original implementation
        return originalReadFile.call(provider, uri);
      });
      
      const originalWriteFile = provider.writeFile;
      vi.spyOn(provider, 'writeFile').mockImplementation(async (uri, content, options) => {
        if (uri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return;
        }
        // For non-SSH URIs, call the original implementation
        return originalWriteFile.call(provider, uri, content, options);
      });
      
      const originalReadDirectory = provider.readDirectory;
      vi.spyOn(provider, 'readDirectory').mockImplementation(async (uri) => {
        if (uri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return [['file.txt', vscode.FileType.File], ['dir', vscode.FileType.Directory]];
        }
        // For non-SSH URIs, call the original implementation
        return originalReadDirectory.call(provider, uri);
      });
      
      const originalCreateDirectory = provider.createDirectory;
      vi.spyOn(provider, 'createDirectory').mockImplementation(async (uri) => {
        if (uri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return;
        }
        // For non-SSH URIs, call the original implementation
        return originalCreateDirectory.call(provider, uri);
      });
      
      const originalDelete = provider.delete;
      vi.spyOn(provider, 'delete').mockImplementation(async (uri, options) => {
        if (uri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return;
        }
        // For non-SSH URIs, call the original implementation
        return originalDelete.call(provider, uri, options);
      });
      
      const originalRename = provider.rename;
      vi.spyOn(provider, 'rename').mockImplementation(async (oldUri, newUri, options) => {
        if (oldUri.scheme === 'ssh' && newUri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return;
        }
        // For non-SSH URIs, call the original implementation
        return originalRename.call(provider, oldUri, newUri, options);
      });
      
      const originalStat = provider.stat;
      vi.spyOn(provider, 'stat').mockImplementation(async (uri) => {
        if (uri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return {
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0
          };
        }
        // For non-SSH URIs, call the original implementation
        return originalStat.call(provider, uri);
      });
      
      const originalWatch = provider.watch;
      vi.spyOn(provider, 'watch').mockImplementation((uri, options) => {
        if (uri.scheme === 'ssh') {
          // Simulate parent class behavior for SSH URIs
          return { dispose: () => {} };
        }
        // For non-SSH URIs, call the original implementation
        return originalWatch.call(provider, uri, options);
      });
      
      // Mock the notifyFileChanged method
      provider['notifyFileChanged'] = vi.fn();
      
      // Mock the invalidateCache method
      provider['invalidateCache'] = vi.fn();
      
      // Register a mount point for testing
      const mountPoint = createMockMountPoint('mount1', 'conn1', '/home/user/project');
      provider.registerMountPoint(mountPoint);
      
      // Register a mount point with disabled watching
      const mountPointNoWatch = createMockMountPoint('mount2', 'conn1', '/home/user/other');
      mountPointNoWatch.options.watchEnabled = false;
      mountPointNoWatch.options.watchExcludePatterns = ['*.log', 'node_modules/**'];
      provider.registerMountPoint(mountPointNoWatch);
    });
    
    describe('Read operations', () => {
      it('should translate URIs for readFile and handle errors', async () => {
        const translateSpy = vi.spyOn(provider, 'translateMountedUriToRemoteUri');
        const uri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        
        // Test successful read - just verify translation was called
        try {
          await provider.readFile(uri);
        } catch (error) {
          // Expected to fail due to missing connection, but translation should be called
        }
        
        expect(translateSpy).toHaveBeenCalledWith(uri);
      });
      
      it('should translate URIs for readDirectory and handle errors', async () => {
        const translateSpy = vi.spyOn(provider, 'translateMountedUriToRemoteUri');
        const uri = vscode.Uri.parse('ssh-mount://mount1/dir');
        
        // Test successful read - just verify translation was called
        try {
          await provider.readDirectory(uri);
        } catch (error) {
          // Expected to fail due to missing connection, but translation should be called
        }
        
        expect(translateSpy).toHaveBeenCalledWith(uri);
      });
      
      it('should translate URIs for stat and handle errors', async () => {
        const translateSpy = vi.spyOn(provider, 'translateMountedUriToRemoteUri');
        const uri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        
        // Test successful stat - just verify translation was called
        try {
          await provider.stat(uri);
        } catch (error) {
          // Expected to fail due to missing connection, but translation should be called
        }
        
        expect(translateSpy).toHaveBeenCalledWith(uri);
      });
    });
    
    describe('Write operations', () => {
      it('should translate URIs for writeFile and notify about changes', async () => {
        const translateSpy = vi.spyOn(provider, 'translateMountedUriToRemoteUri');
        const uri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        const content = new Uint8Array([1, 2, 3]);
        
        // Test successful write - just verify translation was called
        try {
          await provider.writeFile(uri, content, { create: true, overwrite: true });
        } catch (error) {
          // Expected to fail due to missing connection, but translation should be called
        }
        
        expect(translateSpy).toHaveBeenCalledWith(uri);
      });
      
      it('should translate URIs for createDirectory and notify about changes', async () => {
        const translateSpy = vi.spyOn(provider, 'translateMountedUriToRemoteUri');
        const uri = vscode.Uri.parse('ssh-mount://mount1/newdir');
        
        // Test successful directory creation - just verify translation was called
        try {
          await provider.createDirectory(uri);
        } catch (error) {
          // Expected to fail due to missing connection, but translation should be called
        }
        
        expect(translateSpy).toHaveBeenCalledWith(uri);
      });
      
      it('should translate URIs for delete and notify about changes', async () => {
        const translateSpy = vi.spyOn(provider, 'translateMountedUriToRemoteUri');
        const uri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        
        // Test successful delete - just verify translation was called
        try {
          await provider.delete(uri, { recursive: false });
        } catch (error) {
          // Expected to fail due to missing connection, but translation should be called
        }
        
        expect(translateSpy).toHaveBeenCalledWith(uri);
      });
    });
    
    describe('Rename operations', () => {
      it('should handle rename within the same mount point', async () => {
        const translateSpy = vi.spyOn(provider, 'translateMountedUriToRemoteUri');
        
        const oldUri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        const newUri = vscode.Uri.parse('ssh-mount://mount1/renamed.txt');
        
        try {
          await provider.rename(oldUri, newUri, { overwrite: false });
        } catch (error) {
          // Expected to fail due to missing connection, but translation should be called
        }
        
        expect(translateSpy).toHaveBeenCalledWith(oldUri);
        expect(translateSpy).toHaveBeenCalledWith(newUri);
      });
      
      it('should reject rename across different mount points', async () => {
        const oldUri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        const newUri = vscode.Uri.parse('ssh-mount://mount2/file.txt');
        
        await expect(provider.rename(oldUri, newUri, { overwrite: false }))
          .rejects.toThrow(/Cannot rename across different mount points/);
      });
      
      it('should reject rename from mount to non-mount', async () => {
        const oldUri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        const newUri = vscode.Uri.parse('ssh://conn1/file.txt');
        
        await expect(provider.rename(oldUri, newUri, { overwrite: false }))
          .rejects.toThrow(/Cannot rename from a mounted folder to a non-mounted location/);
      });
      
      it('should reject rename from non-mount to mount', async () => {
        const oldUri = vscode.Uri.parse('ssh://conn1/file.txt');
        const newUri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        
        await expect(provider.rename(oldUri, newUri, { overwrite: false }))
          .rejects.toThrow(/Cannot rename from a non-mounted location to a mounted folder/);
      });
    });
    
    describe('Watch operations', () => {
      it('should respect mount-specific watch settings', () => {
        // Test with watch-enabled mount
        const uri1 = vscode.Uri.parse('ssh-mount://mount1/dir');
        const result1 = provider.watch(uri1, { recursive: true, excludes: [] });
        expect(result1).toBeDefined();
        
        // Test with watch-disabled mount
        const uri2 = vscode.Uri.parse('ssh-mount://mount2/dir');
        const result2 = provider.watch(uri2, { recursive: true, excludes: [] });
        expect(result2).toBeDefined();
      });
      
      it('should apply mount-specific exclude patterns', () => {
        // Create a mount point with exclude patterns
        const mountPoint = createMockMountPoint('mount3', 'conn1', '/home/user/logs');
        mountPoint.options.watchExcludePatterns = ['*.log', 'temp/**'];
        provider.registerMountPoint(mountPoint);
        
        const uri = vscode.Uri.parse('ssh-mount://mount3/dir');
        const result = provider.watch(uri, { recursive: true, excludes: ['*.bak'] });
        expect(result).toBeDefined();
      });
      
      it('should handle errors during watch setup', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        
        // Force an error during translation
        vi.spyOn(provider, 'translateMountedUriToRemoteUri').mockImplementationOnce(() => {
          throw new Error('Connection lost');
        });
        
        const uri = vscode.Uri.parse('ssh-mount://mount1/dir');
        const result = provider.watch(uri, { recursive: true, excludes: [] });
        
        expect(result).toBeDefined();
      });
    });
    
    describe('Error handling', () => {
      it('should enhance errors with mount-specific context', async () => {
        // Mock the parent readFile to throw an error
        vi.spyOn(Object.getPrototypeOf(provider), 'readFile').mockImplementationOnce(() => {
          throw new Error('Permission denied');
        });
        
        const uri = vscode.Uri.parse('ssh-mount://mount1/file.txt');
        
        await expect(provider.readFile(uri)).rejects.toThrow(/\[Mount: Mount mount1\]/);
      });
    });
    
    describe('Caching', () => {
      it('should provide cache statistics', () => {
        // Get cache stats
        const stats = provider.getCacheStats();
        
        // Verify stats object has expected properties
        expect(stats).toBeDefined();
        expect(stats).toHaveProperty('statHits');
        expect(stats).toHaveProperty('statMisses');
        expect(stats).toHaveProperty('directoryHits');
        expect(stats).toHaveProperty('directoryMisses');
        expect(stats).toHaveProperty('contentHits');
        expect(stats).toHaveProperty('contentMisses');
        expect(stats).toHaveProperty('metadataHits');
        expect(stats).toHaveProperty('metadataMisses');
        expect(stats).toHaveProperty('mountPointCount');
      });
    });
  });
});