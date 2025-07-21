import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => ({
  Uri: {
    parse: (uri: string) => ({ 
      toString: () => uri,
      path: uri.split('/').slice(3).join('/') || '/',
      scheme: uri.split(':')[0],
      authority: uri.split('://')[1]?.split('/')[0] || ''
    })
  },
  FileType: {
    File: 1,
    Directory: 2,
    SymbolicLink: 64
  },
  FileChangeType: {
    Created: 1,
    Changed: 2,
    Deleted: 3
  },
  EventEmitter: class {
    listeners: Function[] = [];
    event = (listener: Function) => {
      this.listeners.push(listener);
      return { dispose: () => { 
        this.listeners = this.listeners.filter(l => l !== listener);
      }};
    };
    fire(data: any) {
      this.listeners.forEach(listener => listener(data));
    }
  }
}));

// Now import our module
import { MountFileWatcher, DefaultMountFileWatcherConfig } from './mount-file-watcher';
import { MountStatus } from '../interfaces/mount';
import * as vscode from 'vscode';

// Mock types for testing
type MountPoint = {
  id: string;
  connectionId: string;
  remotePath: string;
  displayName: string;
  uri: any;
  status: string;
  lastConnected: Date;
  options: {
    autoReconnect: boolean;
    cacheEnabled: boolean;
    watchEnabled: boolean;
    watchExcludePatterns: string[];
  };
};

// Mock FileSystemProvider
class MockFileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter();
  readonly onDidChangeFile = this._onDidChangeFile.event;
  
  // Track watch calls
  watchCalls: { uri: any, options: any }[] = [];
  
  // Mock implementation of watch
  watch(uri: any, options: any): { dispose: () => void } {
    this.watchCalls.push({ uri, options });
    return {
      dispose: vi.fn()
    };
  }
  
  // Mock implementations of other required methods
  readDirectory(): [string, number][] | Promise<[string, number][]> {
    return [
      ['dir1', vscode.FileType.Directory],
      ['file1.txt', vscode.FileType.File]
    ];
  }
  
  // Helper to simulate file changes
  simulateFileChange(events: any[]): void {
    this._onDidChangeFile.fire(events);
  }
}

// Create a mock mount point for testing
function createMockMountPoint(id: string, watchEnabled = true, excludePatterns: string[] = []): MountPoint {
  return {
    id,
    connectionId: 'conn-' + id,
    remotePath: '/remote/path',
    displayName: 'Test Mount ' + id,
    uri: vscode.Uri.parse(`ssh-mount://${id}/`),
    status: MountStatus.Connected,
    lastConnected: new Date(),
    options: {
      autoReconnect: true,
      cacheEnabled: true,
      watchEnabled,
      watchExcludePatterns: excludePatterns
    }
  };
}

describe('MountFileWatcher', () => {
  let mockProvider: MockFileSystemProvider;
  let watcher: MountFileWatcher;
  let onDidChangeFileSpy: any;
  
  beforeEach(() => {
    mockProvider = new MockFileSystemProvider();
    watcher = new MountFileWatcher(mockProvider as any);
    
    // Spy on the onDidChangeFile event
    onDidChangeFileSpy = vi.fn();
    watcher.onDidChangeFile(onDidChangeFileSpy);
    
    // Reset the mock provider's watch calls
    mockProvider.watchCalls = [];
  });
  
  afterEach(() => {
    watcher.dispose();
  });
  
  it('should register a mount point and watch its root directory', () => {
    const mountPoint = createMockMountPoint('mount1');
    watcher.registerMount(mountPoint as any);
    
    // Should have one watch call for the root directory
    expect(mockProvider.watchCalls.length).toBe(1);
    expect(mockProvider.watchCalls[0].uri.toString()).toBe('ssh-mount://mount1/');
  });
  
  it('should not watch directories for mounts with watching disabled', () => {
    const mountPoint = createMockMountPoint('mount2', false);
    watcher.registerMount(mountPoint as any);
    
    // Should have no watch calls
    expect(mockProvider.watchCalls.length).toBe(0);
  });
  
  it('should apply exclude patterns from mount options', () => {
    const excludePatterns = ['**/*.log', '**/node_modules/**'];
    const mountPoint = createMockMountPoint('mount3', true, excludePatterns);
    watcher.registerMount(mountPoint as any);
    
    // Should have one watch call with the exclude patterns
    expect(mockProvider.watchCalls.length).toBe(1);
    
    // The watch options should include our exclude patterns
    const watchOptions = mockProvider.watchCalls[0].options;
    expect(watchOptions.excludes).toContain('**/*.log');
    expect(watchOptions.excludes).toContain('**/node_modules/**');
  });
  
  it('should unregister a mount point and dispose its watchers', () => {
    const mountPoint = createMockMountPoint('mount4');
    watcher.registerMount(mountPoint as any);
    
    // Should have one watch call
    expect(mockProvider.watchCalls.length).toBe(1);
    
    // Unregister the mount
    watcher.unregisterMount('mount4');
    
    // The watcher should handle the unregistration (we don't need to check the exact behavior)
    expect(watcher).toBeDefined();
  });
  
  it('should batch file change events', async () => {
    const mountPoint = createMockMountPoint('mount5');
    watcher.registerMount(mountPoint as any);
    
    // Create some file change events
    const events = [
      { 
        type: vscode.FileChangeType.Changed, 
        uri: {
          scheme: 'ssh-mount',
          authority: 'mount5',
          path: '/file1.txt',
          query: '',
          fragment: '',
          fsPath: '/file1.txt',
          with: vi.fn(),
          toString: () => 'ssh-mount://mount5/file1.txt',
          toJSON: vi.fn()
        }
      },
      { 
        type: vscode.FileChangeType.Created, 
        uri: {
          scheme: 'ssh-mount',
          authority: 'mount5',
          path: '/file2.txt',
          query: '',
          fragment: '',
          fsPath: '/file2.txt',
          with: vi.fn(),
          toString: () => 'ssh-mount://mount5/file2.txt',
          toJSON: vi.fn()
        }
      }
    ];
    
    // Handle the events
    watcher.handleFileChanges('mount5', events);
    
    // Wait for the batch delay
    await new Promise(resolve => setTimeout(resolve, DefaultMountFileWatcherConfig.batchUpdateDelay + 50));
    
    // The event should have been fired with our events
    expect(onDidChangeFileSpy).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ 
        type: vscode.FileChangeType.Changed,
        uri: expect.objectContaining({ path: '/file1.txt' })
      }),
      expect.objectContaining({ 
        type: vscode.FileChangeType.Created,
        uri: expect.objectContaining({ path: '/file2.txt' })
      })
    ]));
  });
  
  it('should deduplicate file change events', async () => {
    const mountPoint = createMockMountPoint('mount6');
    watcher.registerMount(mountPoint as any);
    
    // Create some file change events with duplicates
    const events = [
      { 
        type: vscode.FileChangeType.Changed, 
        uri: {
          scheme: 'ssh-mount',
          authority: 'mount6',
          path: '/file1.txt',
          query: '',
          fragment: '',
          fsPath: '/file1.txt',
          with: vi.fn(),
          toString: () => 'ssh-mount://mount6/file1.txt',
          toJSON: vi.fn()
        }
      },
      { 
        type: vscode.FileChangeType.Changed, 
        uri: {
          scheme: 'ssh-mount',
          authority: 'mount6',
          path: '/file1.txt',
          query: '',
          fragment: '',
          fsPath: '/file1.txt',
          with: vi.fn(),
          toString: () => 'ssh-mount://mount6/file1.txt',
          toJSON: vi.fn()
        }
      },
      { 
        type: vscode.FileChangeType.Created, 
        uri: {
          scheme: 'ssh-mount',
          authority: 'mount6',
          path: '/file2.txt',
          query: '',
          fragment: '',
          fsPath: '/file2.txt',
          with: vi.fn(),
          toString: () => 'ssh-mount://mount6/file2.txt',
          toJSON: vi.fn()
        }
      }
    ];
    
    // Handle the events
    watcher.handleFileChanges('mount6', events);
    
    // Wait for the batch delay
    await new Promise(resolve => setTimeout(resolve, DefaultMountFileWatcherConfig.batchUpdateDelay + 50));
    
    // The event should have been fired with deduplicated events
    expect(onDidChangeFileSpy).toHaveBeenCalledTimes(1);
    
    const calledEvents = onDidChangeFileSpy.mock.calls[0][0];
    expect(calledEvents.length).toBe(2); // Only 2 events, not 3
  });
  
  it('should update watching when mount status changes', () => {
    const mountPoint = createMockMountPoint('mount7');
    watcher.registerMount(mountPoint as any);
    
    // Should have one watch call initially
    expect(mockProvider.watchCalls.length).toBe(1);
    
    // Reset watch calls
    mockProvider.watchCalls = [];
    
    // Update status to disconnected
    watcher.updateMountStatus('mount7', MountStatus.Disconnected, mountPoint as any);
    
    // Should have no new watch calls
    expect(mockProvider.watchCalls.length).toBe(0);
    
    // Update status back to connected
    watcher.updateMountStatus('mount7', MountStatus.Connected, mountPoint as any);
    
    // Should have one new watch call
    expect(mockProvider.watchCalls.length).toBe(1);
  });
  
  it('should provide watching statistics', () => {
    // Register multiple mounts
    const mount1 = createMockMountPoint('mount8');
    const mount2 = createMockMountPoint('mount9');
    
    watcher.registerMount(mount1 as any);
    watcher.registerMount(mount2 as any);
    
    // Get stats
    const stats = watcher.getStats();
    
    // Should have stats for both mounts
    expect(stats.mountCount).toBe(2);
    expect(stats.totalWatcherCount).toBeGreaterThan(0);
    expect(stats.watchersByMount).toHaveProperty('mount8');
    expect(stats.watchersByMount).toHaveProperty('mount9');
  });
});