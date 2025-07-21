import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    window: {
      createTextEditorDecorationType: vi.fn().mockReturnValue({
        dispose: vi.fn()
      }),
      registerFileDecorationProvider: vi.fn().mockReturnValue({
        dispose: vi.fn()
      }),
      showQuickPick: vi.fn(),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn()
    },
    commands: {
      registerCommand: vi.fn().mockReturnValue({
        dispose: vi.fn()
      }),
      executeCommand: vi.fn()
    },
    workspace: {
      workspaceFolders: []
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
    ThemeColor: class {
      constructor(public id: string) {}
    },
    EventEmitter: class {
      private listeners: any[] = [];
      fire(data: any) {
        this.listeners.forEach(listener => listener(data));
      }
      event = (callback: any) => {
        this.listeners.push(callback);
        return { dispose: () => {
          const index = this.listeners.indexOf(callback);
          if (index > -1) {
            this.listeners.splice(index, 1);
          }
        }};
      };
    }
  };
});

import * as vscode from 'vscode';
import { ExplorerIntegrationImpl } from './explorer-integration';
import { MountPoint, MountStatus } from '../interfaces/mount';

// Mock mount manager
const createMockMountManager = () => {
  const mountPoints = new Map<string, MountPoint>();
  const onDidChangeMountPointsEmitter = new vscode.EventEmitter();
  
  return {
    mountRemoteFolder: vi.fn(),
    unmountFolder: vi.fn(),
    getMountPoints: vi.fn().mockImplementation(() => Array.from(mountPoints.values())),
    getMountPointByUri: vi.fn(),
    getMountPointById: vi.fn().mockImplementation((id: string) => mountPoints.get(id)),
    restoreMounts: vi.fn(),
    updateMountStatus: vi.fn(),
    configureMountOptions: vi.fn(),
    updateMountOptions: vi.fn(),
    onDidChangeMountPoints: onDidChangeMountPointsEmitter.event,
    
    // Helper methods for tests
    _addMountPoint: (mountPoint: MountPoint) => {
      mountPoints.set(mountPoint.id, mountPoint);
    },
    _removeMountPoint: (id: string) => {
      mountPoints.delete(id);
    },
    _fireMountPointsChanged: () => {
      onDidChangeMountPointsEmitter.fire(Array.from(mountPoints.values()));
    }
  };
};

// Helper function to create a mock mount point
const createMockMountPoint = (id: string, displayName: string, status: MountStatus = MountStatus.Connected): MountPoint => ({
  id,
  connectionId: 'conn1',
  remotePath: '/home/user/project',
  displayName,
  uri: vscode.Uri.parse(`ssh-mount://${id}/`),
  status,
  lastConnected: new Date(),
  options: {
    autoReconnect: true,
    cacheEnabled: true,
    watchEnabled: true,
    watchExcludePatterns: []
  }
});

describe('ExplorerIntegrationImpl', () => {
  let explorerIntegration: ExplorerIntegrationImpl;
  let mockMountManager: ReturnType<typeof createMockMountManager>;
  let mockWorkspaceFolders: any[];
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup mock workspace folders
    mockWorkspaceFolders = [];
    (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;
    
    // Create mock mount manager
    mockMountManager = createMockMountManager();
    
    // Create instance
    explorerIntegration = new ExplorerIntegrationImpl(mockMountManager as any);
  });
  
  afterEach(() => {
    explorerIntegration.dispose();
  });
  
  describe('registerExplorerIntegration', () => {
    it('should register file decoration provider', () => {
      explorerIntegration.registerExplorerIntegration();
      
      expect(vscode.window.registerFileDecorationProvider).toHaveBeenCalled();
    });
    
    it('should register context menu commands', () => {
      explorerIntegration.registerExplorerIntegration();
      
      // Should register 4 commands
      expect(vscode.commands.registerCommand).toHaveBeenCalledTimes(4);
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith('remote-ssh.unmountFolder', expect.any(Function));
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith('remote-ssh.reconnectMount', expect.any(Function));
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith('remote-ssh.refreshMount', expect.any(Function));
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith('remote-ssh.configureMountOptions', expect.any(Function));
    });
  });
  
  describe('updateMountDecorations', () => {
    it('should refresh file explorer', () => {
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      
      explorerIntegration.updateMountDecorations(mountPoint);
      
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.files.action.refreshFilesExplorer');
    });
  });
  
  describe('file decoration provider', () => {
    let decorationProvider: any;
    
    beforeEach(() => {
      // Register explorer integration
      explorerIntegration.registerExplorerIntegration();
      
      // Get the decoration provider callback
      decorationProvider = vi.mocked(vscode.window.registerFileDecorationProvider).mock.calls[0][0];
      
      // Add a mount point to the manager
      const mountPoint = createMockMountPoint('mount1', 'Test Mount', MountStatus.Connected);
      mockMountManager._addMountPoint(mountPoint);
      
      // Add the mount to workspace folders
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: mountPoint.displayName,
        index: 0
      });
    });
    
    it('should provide decoration for connected mount', () => {
      const uri = vscode.Uri.parse('ssh-mount://mount1/');
      const decoration = decorationProvider.provideFileDecoration(uri);
      
      expect(decoration).toEqual({
        badge: '✓',
        tooltip: 'Connected',
        color: expect.any(vscode.ThemeColor)
      });
      expect(decoration.color.id).toBe('gitDecoration.addedResourceForeground');
    });
    
    it('should provide decoration for disconnected mount', () => {
      // Update mount status
      const mountPoint = createMockMountPoint('mount2', 'Disconnected Mount', MountStatus.Disconnected);
      mockMountManager._addMountPoint(mountPoint);
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: mountPoint.displayName,
        index: 1
      });
      
      const uri = vscode.Uri.parse('ssh-mount://mount2/');
      const decoration = decorationProvider.provideFileDecoration(uri);
      
      expect(decoration).toEqual({
        badge: '✗',
        tooltip: 'Disconnected',
        color: expect.any(vscode.ThemeColor)
      });
      expect(decoration.color.id).toBe('gitDecoration.deletedResourceForeground');
    });
    
    it('should provide decoration for connecting mount', () => {
      // Update mount status
      const mountPoint = createMockMountPoint('mount3', 'Connecting Mount', MountStatus.Connecting);
      mockMountManager._addMountPoint(mountPoint);
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: mountPoint.displayName,
        index: 2
      });
      
      const uri = vscode.Uri.parse('ssh-mount://mount3/');
      const decoration = decorationProvider.provideFileDecoration(uri);
      
      expect(decoration).toEqual({
        badge: '⟳',
        tooltip: 'Connecting...',
        color: expect.any(vscode.ThemeColor)
      });
      expect(decoration.color.id).toBe('gitDecoration.modifiedResourceForeground');
    });
    
    it('should provide decoration for error mount', () => {
      // Update mount status
      const mountPoint = createMockMountPoint('mount4', 'Error Mount', MountStatus.Error);
      mockMountManager._addMountPoint(mountPoint);
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: mountPoint.displayName,
        index: 3
      });
      
      const uri = vscode.Uri.parse('ssh-mount://mount4/');
      const decoration = decorationProvider.provideFileDecoration(uri);
      
      expect(decoration).toEqual({
        badge: '!',
        tooltip: 'Error',
        color: expect.any(vscode.ThemeColor)
      });
      expect(decoration.color.id).toBe('errorForeground');
    });
    
    it('should not provide decoration for non-workspace folders', () => {
      const uri = vscode.Uri.parse('ssh-mount://mount1/subfolder');
      const decoration = decorationProvider.provideFileDecoration(uri);
      
      expect(decoration).toBeUndefined();
    });
    
    it('should not provide decoration for non-mount URIs', () => {
      // Add a non-mount workspace folder
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder'),
        name: 'Local Folder',
        index: 1
      });
      
      const uri = vscode.Uri.parse('file:///local-folder');
      const decoration = decorationProvider.provideFileDecoration(uri);
      
      expect(decoration).toBeUndefined();
    });
    
    it('should not provide decoration for unknown mount IDs', () => {
      const uri = vscode.Uri.parse('ssh-mount://unknown/');
      mockWorkspaceFolders.push({
        uri,
        name: 'Unknown Mount',
        index: 1
      });
      
      const decoration = decorationProvider.provideFileDecoration(uri);
      
      expect(decoration).toBeUndefined();
    });
  });
  
  describe('context menu commands', () => {
    let unmountCommand: Function;
    let reconnectCommand: Function;
    let refreshCommand: Function;
    let configureCommand: Function;
    
    beforeEach(() => {
      // Register explorer integration
      explorerIntegration.registerExplorerIntegration();
      
      // Get the command callbacks
      const registerCommandCalls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      unmountCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.unmountFolder')![1];
      reconnectCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.reconnectMount')![1];
      refreshCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.refreshMount')![1];
      configureCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.configureMountOptions')![1];
      
      // Add mount points to the manager
      const connectedMount = createMockMountPoint('mount1', 'Connected Mount', MountStatus.Connected);
      const disconnectedMount = createMockMountPoint('mount2', 'Disconnected Mount', MountStatus.Disconnected);
      mockMountManager._addMountPoint(connectedMount);
      mockMountManager._addMountPoint(disconnectedMount);
    });
    
    describe('unmount command', () => {
      it('should unmount folder when URI is provided', async () => {
        const uri = vscode.Uri.parse('ssh-mount://mount1/');
        
        await unmountCommand(uri);
        
        expect(mockMountManager.unmountFolder).toHaveBeenCalledWith('mount1');
      });
      
      it('should show quick pick when no URI is provided', async () => {
        // Mock quick pick to return a selection
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
          label: 'Connected Mount',
          description: '/home/user/project',
          mountId: 'mount1'
        } as any);
        
        await unmountCommand();
        
        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        expect(mockMountManager.unmountFolder).toHaveBeenCalledWith('mount1');
      });
      
      it('should do nothing when quick pick is cancelled', async () => {
        // Mock quick pick to return undefined (cancelled)
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);
        
        await unmountCommand();
        
        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        expect(mockMountManager.unmountFolder).not.toHaveBeenCalled();
      });
      
      it('should show message when no mounts are available', async () => {
        // Clear mount points
        vi.mocked(mockMountManager.getMountPoints).mockReturnValueOnce([]);
        
        await unmountCommand();
        
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No mounted folders to unmount.');
        expect(vscode.window.showQuickPick).not.toHaveBeenCalled();
      });
    });
    
    describe('reconnect command', () => {
      it('should attempt to reconnect when URI is provided', async () => {
        const uri = vscode.Uri.parse('ssh-mount://mount2/');
        
        await reconnectCommand(uri);
        
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Reconnecting Disconnected Mount...');
      });
      
      it('should show quick pick with disconnected mounts when no URI is provided', async () => {
        // Mock quick pick to return a selection
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
          label: 'Disconnected Mount',
          description: '/home/user/project',
          mountId: 'mount2'
        } as any);
        
        await reconnectCommand();
        
        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        // Should only show disconnected mounts
        expect(vi.mocked(vscode.window.showQuickPick).mock.calls[0][0]).toHaveLength(1);
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Reconnecting Disconnected Mount...');
      });
      
      it('should show error when mount is not found', async () => {
        const uri = vscode.Uri.parse('ssh-mount://unknown/');
        
        await reconnectCommand(uri);
        
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Mount unknown not found.');
      });
    });
    
    describe('refresh command', () => {
      it('should attempt to refresh when URI is provided', async () => {
        const uri = vscode.Uri.parse('ssh-mount://mount1/');
        
        await refreshCommand(uri);
        
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Refreshing Connected Mount...');
      });
      
      it('should show quick pick when no URI is provided', async () => {
        // Mock quick pick to return a selection
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
          label: 'Connected Mount',
          description: '/home/user/project',
          mountId: 'mount1'
        } as any);
        
        await refreshCommand();
        
        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Refreshing Connected Mount...');
      });
    });
    
    describe('configure command', () => {
      it('should attempt to configure when URI is provided', async () => {
        const uri = vscode.Uri.parse('ssh-mount://mount1/');
        
        // Mock configureMountOptions to return an updated mount point
        mockMountManager.configureMountOptions.mockResolvedValueOnce({
          id: 'mount1',
          displayName: 'Connected Mount',
          options: {}
        } as any);
        
        await configureCommand(uri);
        
        expect(mockMountManager.configureMountOptions).toHaveBeenCalledWith('mount1');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Configuration updated for Connected Mount.');
      });
      
      it('should show quick pick when no URI is provided', async () => {
        // Mock quick pick to return a selection
        vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
          label: 'Connected Mount',
          description: '/home/user/project',
          mountId: 'mount1'
        } as any);
        
        // Mock configureMountOptions to return an updated mount point
        mockMountManager.configureMountOptions.mockResolvedValueOnce({
          id: 'mount1',
          displayName: 'Connected Mount',
          options: {}
        } as any);
        
        await configureCommand();
        
        expect(vscode.window.showQuickPick).toHaveBeenCalled();
        expect(mockMountManager.configureMountOptions).toHaveBeenCalledWith('mount1');
        expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Configuration updated for Connected Mount.');
      });
    });
  });
  
  describe('mount points changed event', () => {
    it('should refresh explorer when mount points change', () => {
      // Register explorer integration
      explorerIntegration.registerExplorerIntegration();
      
      // Fire mount points changed event
      mockMountManager._fireMountPointsChanged();
      
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.files.action.refreshFilesExplorer');
    });
  });
});