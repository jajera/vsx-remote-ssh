import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { MountStatusBarIntegration } from './mount-status-bar-integration';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';

// Mock VS Code API
vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(),
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn()
  },
  commands: {
    executeCommand: vi.fn(),
    registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() })
  },
  StatusBarAlignment: {
    Right: 2
  },
  ThemeColor: vi.fn().mockImplementation((id: string) => ({ id })),
  Uri: {
    parse: vi.fn().mockImplementation((uri: string) => ({
      scheme: uri.split(':')[0],
      authority: uri.split('://')[1]?.split('/')[0] || '',
      path: uri.split('://')[1]?.split('/').slice(1).join('/') || '',
      toString: () => uri
    }))
  }
}));

describe('MountStatusBarIntegration', () => {
  let mockStatusBarItem: any;
  let mockMountManager: MountManager;
  let statusBarIntegration: MountStatusBarIntegration;
  let mockEventEmitter: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock status bar item
    mockStatusBarItem = {
      text: '',
      tooltip: '',
      command: '',
      backgroundColor: undefined,
      show: vi.fn(),
      dispose: vi.fn()
    };

    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue(mockStatusBarItem);

    // Mock event emitter
    mockEventEmitter = {
      event: vi.fn(),
      fire: vi.fn(),
      dispose: vi.fn()
    };

    // Mock mount manager
    mockMountManager = {
      mountRemoteFolder: vi.fn(),
      unmountFolder: vi.fn(),
      getMountPoints: vi.fn().mockReturnValue([]),
      getMountPointByUri: vi.fn(),
      getMountPointById: vi.fn(),
      restoreMounts: vi.fn(),
      updateMountStatus: vi.fn(),
      configureMountOptions: vi.fn(),
      updateMountOptions: vi.fn(),
      onDidChangeMountPoints: mockEventEmitter.event
    };

    // Create integration instance
    statusBarIntegration = new MountStatusBarIntegration(mockMountManager);
  });

  afterEach(() => {
    statusBarIntegration?.dispose();
  });

  describe('constructor', () => {
    it('should create status bar item with correct properties', () => {
      expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
        vscode.StatusBarAlignment.Right,
        95
      );
      expect(mockStatusBarItem.command).toBe('remote-ssh.manageMounts');
      expect(mockStatusBarItem.show).toHaveBeenCalled();
    });

    it('should register for mount point changes', () => {
      expect(mockEventEmitter.event).toHaveBeenCalled();
    });

    it('should update status bar initially', () => {
      expect(mockStatusBarItem.text).toBe('$(folder-library) Mounts');
      expect(mockStatusBarItem.tooltip).toBe('No remote folders mounted\nClick to manage mounts');
    });
  });

  describe('updateStatusBar', () => {
    it('should show no mounts message when no mount points exist', () => {
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue([]);
      
      // Trigger update by creating new instance
      statusBarIntegration.dispose();
      statusBarIntegration = new MountStatusBarIntegration(mockMountManager);

      expect(mockStatusBarItem.text).toBe('$(folder-library) Mounts');
      expect(mockStatusBarItem.tooltip).toBe('No remote folders mounted\nClick to manage mounts');
      expect(mockStatusBarItem.backgroundColor).toBeUndefined();
    });

    it('should show connected status when all mounts are connected', () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Connected),
        createMockMountPoint('2', 'Project B', MountStatus.Connected)
      ];
      
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      
      // Trigger update
      statusBarIntegration.dispose();
      statusBarIntegration = new MountStatusBarIntegration(mockMountManager);

      expect(mockStatusBarItem.text).toBe('$(folder-library) 2');
      expect(mockStatusBarItem.backgroundColor).toBeUndefined();
      expect(mockStatusBarItem.tooltip).toContain('Remote Folder Mounts (2)');
      expect(mockStatusBarItem.tooltip).toContain('$(check) 2 connected');
    });

    it('should show error status when mounts have errors', () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Connected),
        createMockMountPoint('2', 'Project B', MountStatus.Error)
      ];
      
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      
      // Trigger update
      statusBarIntegration.dispose();
      statusBarIntegration = new MountStatusBarIntegration(mockMountManager);

      expect(mockStatusBarItem.text).toBe('$(error) 2');
      expect(mockStatusBarItem.backgroundColor).toEqual({ id: 'statusBarItem.errorBackground' });
      expect(mockStatusBarItem.tooltip).toContain('$(check) 1 connected');
      expect(mockStatusBarItem.tooltip).toContain('$(error) 1 error');
    });

    it('should show connecting status when mounts are connecting', () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Connecting)
      ];
      
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      
      // Trigger update
      statusBarIntegration.dispose();
      statusBarIntegration = new MountStatusBarIntegration(mockMountManager);

      expect(mockStatusBarItem.text).toBe('$(sync~spin) 1');
      expect(mockStatusBarItem.backgroundColor).toEqual({ id: 'statusBarItem.warningBackground' });
      expect(mockStatusBarItem.tooltip).toContain('$(sync~spin) 1 connecting');
    });

    it('should show disconnected status when mounts are disconnected', () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Disconnected)
      ];
      
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      
      // Trigger update
      statusBarIntegration.dispose();
      statusBarIntegration = new MountStatusBarIntegration(mockMountManager);

      expect(mockStatusBarItem.text).toBe('$(debug-disconnect) 1');
      expect(mockStatusBarItem.backgroundColor).toEqual({ id: 'statusBarItem.warningBackground' });
      expect(mockStatusBarItem.tooltip).toContain('$(debug-disconnect) 1 disconnected');
    });

    it('should truncate long mount names in tooltip', () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Very Long Project Name That Should Be Truncated', MountStatus.Connected)
      ];
      
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      
      // Trigger update
      statusBarIntegration.dispose();
      statusBarIntegration = new MountStatusBarIntegration(mockMountManager);

      expect(mockStatusBarItem.tooltip).toContain('Very Long Project...');
    });

    it('should limit tooltip to 5 recent mounts', () => {
      const mockMounts: MountPoint[] = Array.from({ length: 7 }, (_, i) => 
        createMockMountPoint(`${i + 1}`, `Project ${i + 1}`, MountStatus.Connected)
      );
      
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      
      // Trigger update
      statusBarIntegration.dispose();
      statusBarIntegration = new MountStatusBarIntegration(mockMountManager);

      expect(mockStatusBarItem.tooltip).toContain('... and 2 more');
    });
  });

  describe('registerQuickActions', () => {
    it('should register quick action command', () => {
      statusBarIntegration.registerQuickActions();

      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'remote-ssh.quickMountAction',
        expect.any(Function)
      );
      expect(mockStatusBarItem.command).toBe('remote-ssh.quickMountAction');
    });
  });

  describe('showQuickActions', () => {
    beforeEach(() => {
      statusBarIntegration.registerQuickActions();
    });

    it('should show mount folder option when no mounts exist', async () => {
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue([]);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(plus) Mount Remote Folder'
      } as any);

      // Get the registered command function
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      expect(commandCall).toBeDefined();
      
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            label: '$(plus) Mount Remote Folder'
          })
        ]),
        expect.any(Object)
      );
    });

    it('should show additional options when mounts exist', async () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Connected)
      ];
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

      // Get the registered command function
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: '$(plus) Mount Remote Folder' }),
          expect.objectContaining({ label: '$(settings-gear) Manage Mounts' }),
          expect.objectContaining({ label: '$(refresh) Refresh All Mounts' })
        ]),
        expect.any(Object)
      );
    });

    it('should show reconnect option when disconnected mounts exist', async () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Disconnected),
        createMockMountPoint('2', 'Project B', MountStatus.Error)
      ];
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

      // Get the registered command function
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            label: '$(debug-disconnect) Reconnect Mounts',
            description: 'Reconnect 2 disconnected mounts'
          })
        ]),
        expect.any(Object)
      );
    });

    it('should execute mount folder command when selected', async () => {
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(plus) Mount Remote Folder'
      } as any);

      // Get the registered command function
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('remote-ssh.mountFolder');
    });

    it('should execute manage mounts command when selected', async () => {
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(settings-gear) Manage Mounts'
      } as any);

      // Get the registered command function
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith('remote-ssh.manageMounts');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(plus) Mount Remote Folder'
      } as any);
      vi.mocked(vscode.commands.executeCommand).mockRejectedValue(new Error('Test error'));

      // Get the registered command function
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to execute action: Error: Test error'
      );
    });
  });

  describe('refreshAllMounts', () => {
    it('should show message when no mounts to refresh', async () => {
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue([]);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(refresh) Refresh All Mounts'
      } as any);

      statusBarIntegration.registerQuickActions();

      // Get the registered command function and execute refresh
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      expect(commandCall).toBeDefined();
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No mounts to refresh');
    });

    it('should refresh all mounts when they exist', async () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Connected),
        createMockMountPoint('2', 'Project B', MountStatus.Disconnected)
      ];
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(refresh) Refresh All Mounts'
      } as any);

      statusBarIntegration.registerQuickActions();

      // Get the registered command function and execute refresh
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Refreshing 2 mounted folders...'
      );
      expect(mockMountManager.updateMountStatus).toHaveBeenCalledTimes(2);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Mount refresh completed');
    });
  });

  describe('reconnectDisconnectedMounts', () => {
    it('should show message when no disconnected mounts exist', async () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Connected)
      ];
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(debug-disconnect) Reconnect Mounts'
      } as any);

      statusBarIntegration.registerQuickActions();

      // Get the registered command function and execute reconnect
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'No disconnected mounts to reconnect'
      );
    });

    it('should attempt to reconnect disconnected mounts', async () => {
      const mockMounts: MountPoint[] = [
        createMockMountPoint('1', 'Project A', MountStatus.Disconnected),
        createMockMountPoint('2', 'Project B', MountStatus.Error)
      ];
      vi.mocked(mockMountManager.getMountPoints).mockReturnValue(mockMounts);
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: '$(debug-disconnect) Reconnect Mounts'
      } as any);

      // Mock Math.random to always succeed
      vi.spyOn(Math, 'random').mockReturnValue(0.8);

      statusBarIntegration.registerQuickActions();

      // Get the registered command function and execute reconnect
      const commandCall = vi.mocked(vscode.commands.registerCommand).mock.calls.find(
        call => call[0] === 'remote-ssh.quickMountAction'
      );
      const commandFunction = commandCall![1] as Function;
      await commandFunction();

      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'Reconnecting 2 mounts...'
      );
      expect(mockMountManager.updateMountStatus).toHaveBeenCalledWith('1', MountStatus.Connecting);
      expect(mockMountManager.updateMountStatus).toHaveBeenCalledWith('2', MountStatus.Connecting);
    });
  });

  describe('dispose', () => {
    it('should dispose status bar item and all disposables', () => {
      statusBarIntegration.registerQuickActions();
      statusBarIntegration.dispose();

      expect(mockStatusBarItem.dispose).toHaveBeenCalled();
      expect(vscode.commands.registerCommand).toHaveBeenCalled();
    });
  });

  // Helper function to create mock mount points
  function createMockMountPoint(
    id: string, 
    displayName: string, 
    status: MountStatus
  ): MountPoint {
    return {
      id,
      connectionId: 'conn-1',
      remotePath: `/home/user/${displayName.toLowerCase().replace(' ', '-')}`,
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
    };
  }
});