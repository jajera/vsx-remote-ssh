import * as vscode from 'vscode';
import { MountManagerImpl } from './mount-manager';
import { MountPoint, MountStatus, MountOptions, MountStatePersistence, WorkspaceIntegration } from '../interfaces/mount';
import { SSHConnection, SSHConnectionManager } from '../interfaces/ssh';
import { MountAwareFileSystemProvider } from '../interfaces/filesystem';
import { MountOptionsManager, DefaultMountOptions } from './mount-options-manager';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
class MockConnectionManager implements SSHConnectionManager {
  private connections: Map<string, SSHConnection> = new Map();
  
  addConnection(connection: SSHConnection): void {
    this.connections.set(connection.id, connection);
  }
  
  getConnection(id: string): SSHConnection | undefined {
    return this.connections.get(id);
  }
  
  getConnections(): SSHConnection[] {
    return Array.from(this.connections.values());
  }
  
  // Implement other required methods with empty implementations
  connect(): Promise<SSHConnection> { return Promise.resolve({} as SSHConnection); }
  disconnect(): Promise<void> { return Promise.resolve(); }
  getActiveConnections(): SSHConnection[] { return Array.from(this.connections.values()); }
  reconnect(): Promise<SSHConnection> { return Promise.resolve({} as SSHConnection); }
  disconnectAll(): Promise<void> { return Promise.resolve(); }
  restoreConnections(): Promise<SSHConnection[]> { return Promise.resolve([]); }
  dispose(): void { }
  onDidChangeConnections = {} as vscode.Event<SSHConnection[]>;
}

class MockStatePersistence implements MountStatePersistence {
  private mountPoints: MountPoint[] = [];
  
  async saveMountPoints(mountPoints: MountPoint[]): Promise<void> {
    this.mountPoints = [...mountPoints];
  }
  
  async loadMountPoints(): Promise<MountPoint[]> {
    return this.mountPoints;
  }
  
  async clearMountPoints(): Promise<void> {
    this.mountPoints = [];
  }
}

class MockWorkspaceIntegration implements WorkspaceIntegration {
  private mountsInWorkspace: Set<string> = new Set();
  
  async addMountToWorkspace(mountPoint: MountPoint): Promise<void> {
    this.mountsInWorkspace.add(mountPoint.id);
  }
  
  async removeMountFromWorkspace(mountPoint: MountPoint): Promise<void> {
    this.mountsInWorkspace.delete(mountPoint.id);
  }
  
  async updateMountInWorkspace(mountPoint: MountPoint): Promise<void> {
    // No-op
  }
  
  isMountInWorkspace(mountId: string): boolean {
    return this.mountsInWorkspace.has(mountId);
  }
}

class MockFileSystemProvider implements MountAwareFileSystemProvider {
  private mountPoints: Map<string, MountPoint> = new Map();
  private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._onDidChangeFile.event;
  
  registerMountPoint(mountPoint: MountPoint): void {
    this.mountPoints.set(mountPoint.id, mountPoint);
  }
  
  unregisterMountPoint(mountId: string): void {
    this.mountPoints.delete(mountId);
  }
  
  getMountPointForUri(uri: vscode.Uri): MountPoint | undefined {
    if (uri.scheme !== 'ssh-mount') {
      return undefined;
    }
    return this.mountPoints.get(uri.authority);
  }
  
  translateMountedUriToRemoteUri(uri: vscode.Uri): vscode.Uri {
    return uri; // Mock implementation
  }
  
  // Implement other required methods with empty implementations
  stat(): Promise<vscode.FileStat> { return Promise.resolve({} as vscode.FileStat); }
  readDirectory(): Promise<[string, vscode.FileType][]> { return Promise.resolve([]); }
  createDirectory(): Promise<void> { return Promise.resolve(); }
  readFile(): Promise<Uint8Array> { return Promise.resolve(new Uint8Array()); }
  writeFile(): Promise<void> { return Promise.resolve(); }
  delete(): Promise<void> { return Promise.resolve(); }
  rename(): Promise<void> { return Promise.resolve(); }
  copy?(): Promise<void> { return Promise.resolve(); }
  watch(): vscode.Disposable { return { dispose: () => {} }; }
}

class MockOptionsManager implements MountOptionsManager {
  private options: Map<string, MountOptions> = new Map();
  
  async getOptions(mountId: string): Promise<MountOptions | undefined> {
    return this.options.get(mountId);
  }
  
  async updateOptions(mountId: string, options: MountOptions): Promise<void> {
    this.options.set(mountId, { ...options });
  }
  
  async showOptionsUI(mountPoint: MountPoint): Promise<MountOptions | undefined> {
    // Mock UI interaction - return updated options
    return {
      autoReconnect: !mountPoint.options.autoReconnect,
      cacheEnabled: !mountPoint.options.cacheEnabled,
      watchEnabled: !mountPoint.options.watchEnabled,
      watchExcludePatterns: ['**/test/**']
    };
  }
  
  getDefaultOptions(): MountOptions {
    return { ...DefaultMountOptions };
  }
}

// Create a test version of MountManagerImpl that overrides the event emitter
class TestMountManagerImpl extends MountManagerImpl {
  constructor(
    connectionManager: SSHConnectionManager,
    persistence: MountStatePersistence,
    workspaceIntegration: WorkspaceIntegration,
    fileSystemProvider?: MountAwareFileSystemProvider,
    optionsManager?: MountOptionsManager
  ) {
    super(connectionManager, persistence, workspaceIntegration, fileSystemProvider, optionsManager);
    
    // Override the event emitter with a mock
    (this as any)._onDidChangeMountPoints = {
      fire: vi.fn()
    };
    (this as any).onDidChangeMountPoints = vi.fn();
  }
}

describe('MountManagerImpl', () => {
  let mountManager: TestMountManagerImpl;
  let connectionManager: MockConnectionManager;
  let persistence: MockStatePersistence;
  let workspaceIntegration: MockWorkspaceIntegration;
  let fileSystemProvider: MockFileSystemProvider;
  let optionsManager: MockOptionsManager;
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create dependencies
    connectionManager = new MockConnectionManager();
    persistence = new MockStatePersistence();
    workspaceIntegration = new MockWorkspaceIntegration();
    fileSystemProvider = new MockFileSystemProvider();
    optionsManager = new MockOptionsManager();
    
    // Create mount manager
    mountManager = new TestMountManagerImpl(
      connectionManager,
      persistence,
      workspaceIntegration,
      fileSystemProvider,
      optionsManager
    );
    
    // Add a test connection
    connectionManager.addConnection({
      id: 'conn1',
      config: {
        host: 'test-host',
        username: 'test-user',
        port: 22,
        authMethod: 'password'
      },
      status: 'connected',
      lastConnected: new Date(),
      reconnect: vi.fn(),
      disconnect: vi.fn(),
      execute: vi.fn(),
      createSFTP: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true)
    } as SSHConnection);
  });
  
  describe('configureMountOptions', () => {
    it('should throw error if mount point not found', async () => {
      await expect(mountManager.configureMountOptions('non-existent')).rejects.toThrow('Mount point not found');
    });
    
    it('should update mount options when configured', async () => {
      // Create a mount point
      const mountPoint = await mountManager.mountRemoteFolder(
        connectionManager.getConnection('conn1')!,
        '/remote/path',
        'Remote Path'
      );
      
      // Get the initial options
      const initialAutoReconnect = mountPoint.options.autoReconnect;
      const initialCacheEnabled = mountPoint.options.cacheEnabled;
      const initialWatchEnabled = mountPoint.options.watchEnabled;
      
      // Configure options
      const updatedMountPoint = await mountManager.configureMountOptions(mountPoint.id);
      
      // Verify options were updated
      expect(updatedMountPoint).toBeDefined();
      expect(updatedMountPoint!.options.autoReconnect).toBe(!initialAutoReconnect);
      expect(updatedMountPoint!.options.cacheEnabled).toBe(!initialCacheEnabled);
      expect(updatedMountPoint!.options.watchEnabled).toBe(!initialWatchEnabled);
      expect(updatedMountPoint!.options.watchExcludePatterns).toEqual(['**/test/**']);
    });
    
    it('should return undefined if user cancels configuration', async () => {
      // Create a mount point
      const mountPoint = await mountManager.mountRemoteFolder(
        connectionManager.getConnection('conn1')!,
        '/remote/path',
        'Remote Path'
      );
      
      // Mock user cancellation
      vi.spyOn(optionsManager, 'showOptionsUI').mockResolvedValueOnce(undefined);
      
      // Configure options
      const updatedMountPoint = await mountManager.configureMountOptions(mountPoint.id);
      
      // Verify no changes
      expect(updatedMountPoint).toBeUndefined();
    });
  });
  
  describe('updateMountOptions', () => {
    it('should throw error if mount point not found', async () => {
      await expect(mountManager.updateMountOptions('non-existent', DefaultMountOptions)).rejects.toThrow('Mount point not found');
    });
    
    it('should update mount options', async () => {
      // Create a mount point
      const mountPoint = await mountManager.mountRemoteFolder(
        connectionManager.getConnection('conn1')!,
        '/remote/path',
        'Remote Path'
      );
      
      // New options
      const newOptions: MountOptions = {
        autoReconnect: false,
        cacheEnabled: false,
        watchEnabled: false,
        watchExcludePatterns: ['**/test/**']
      };
      
      // Update options
      const updatedMountPoint = await mountManager.updateMountOptions(mountPoint.id, newOptions);
      
      // Verify options were updated
      expect(updatedMountPoint.options).toEqual(newOptions);
      
      // Verify mount point in manager was updated
      const retrievedMountPoint = mountManager.getMountPointById(mountPoint.id);
      expect(retrievedMountPoint!.options).toEqual(newOptions);
    });
    
    it('should save updated options to persistence', async () => {
      // Spy on persistence
      const saveSpy = vi.spyOn(persistence, 'saveMountPoints');
      
      // Create a mount point
      const mountPoint = await mountManager.mountRemoteFolder(
        connectionManager.getConnection('conn1')!,
        '/remote/path',
        'Remote Path'
      );
      
      // New options
      const newOptions: MountOptions = {
        autoReconnect: false,
        cacheEnabled: false,
        watchEnabled: false,
        watchExcludePatterns: ['**/test/**']
      };
      
      // Update options
      await mountManager.updateMountOptions(mountPoint.id, newOptions);
      
      // Verify persistence was called
      expect(saveSpy).toHaveBeenCalled();
      
      // Verify the saved mount points have the updated options
      const savedMountPoints = saveSpy.mock.calls[saveSpy.mock.calls.length - 1][0];
      const savedMountPoint = savedMountPoints.find(mp => mp.id === mountPoint.id);
      expect(savedMountPoint!.options).toEqual(newOptions);
    });
    
    it('should update file system provider with new options', async () => {
      // Spy on file system provider
      const registerSpy = vi.spyOn(fileSystemProvider, 'registerMountPoint');
      
      // Create a mount point
      const mountPoint = await mountManager.mountRemoteFolder(
        connectionManager.getConnection('conn1')!,
        '/remote/path',
        'Remote Path'
      );
      
      // New options
      const newOptions: MountOptions = {
        autoReconnect: false,
        cacheEnabled: false,
        watchEnabled: false,
        watchExcludePatterns: ['**/test/**']
      };
      
      // Update options
      await mountManager.updateMountOptions(mountPoint.id, newOptions);
      
      // Verify file system provider was updated
      expect(registerSpy).toHaveBeenCalled();
      
      // Verify the mount point passed to the file system provider has the updated options
      const updatedMountPoint = registerSpy.mock.calls[registerSpy.mock.calls.length - 1][0];
      expect(updatedMountPoint.options).toEqual(newOptions);
    });
  });
});