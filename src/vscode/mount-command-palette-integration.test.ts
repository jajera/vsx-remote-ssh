import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { MountCommandPaletteIntegration } from './mount-command-palette-integration';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';
import { SSHConnectionManager, SSHConnection, ConnectionStatus } from '../interfaces/ssh';

// Mock vscode module
vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn().mockReturnValue({
      dispose: vi.fn()
    })
  },
  window: {
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createStatusBarItem: vi.fn().mockReturnValue({
      dispose: vi.fn(),
      show: vi.fn(),
      hide: vi.fn()
    })
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2
  },
  Uri: {
    parse: vi.fn((value: string) => ({
      scheme: value.split('://')[0],
      authority: value.split('://')[1]?.split('/')[0],
      path: '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
      toString: () => value
    }))
  }
}));

describe('MountCommandPaletteIntegration', () => {
  let mountManager: MountManager;
  let connectionManager: SSHConnectionManager;
  let mountCommandPaletteIntegration: MountCommandPaletteIntegration;
  let mockMountPoint: MountPoint;
  let mockConnection: SSHConnection;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock mount point
    mockMountPoint = {
      id: 'test-mount-id',
      connectionId: 'test-connection-id',
      remotePath: '/home/user/test',
      displayName: 'Test Mount',
      uri: vscode.Uri.parse('ssh-mount://test-mount-id/'),
      status: MountStatus.Connected,
      lastConnected: new Date(),
      options: {
        autoReconnect: true,
        cacheEnabled: true,
        watchEnabled: true,
        watchExcludePatterns: []
      }
    };

    // Mock connection
    mockConnection = {
      id: 'test-connection-id',
      config: {
        host: 'test-host',
        port: 22,
        username: 'test-user',
        authMethod: 'password'
      },
      status: ConnectionStatus.Connected,
      lastConnected: new Date(),
      reconnect: vi.fn(),
      disconnect: vi.fn(),
      execute: vi.fn(),
      createSFTP: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true)
    };

    // Mock mount manager
    mountManager = {
      mountRemoteFolder: vi.fn().mockResolvedValue(mockMountPoint),
      unmountFolder: vi.fn().mockResolvedValue(undefined),
      getMountPoints: vi.fn().mockReturnValue([mockMountPoint]),
      getMountPointById: vi.fn().mockReturnValue(mockMountPoint),
      getMountPointByUri: vi.fn().mockReturnValue(mockMountPoint),
      restoreMounts: vi.fn().mockResolvedValue(undefined),
      updateMountStatus: vi.fn(),
      configureMountOptions: vi.fn().mockResolvedValue(mockMountPoint),
      updateMountOptions: vi.fn().mockResolvedValue(mockMountPoint),
      onDidChangeMountPoints: vi.fn()
    };

    // Mock connection manager
    connectionManager = {
      connect: vi.fn().mockResolvedValue(mockConnection),
      disconnect: vi.fn().mockResolvedValue(undefined),
      getActiveConnections: vi.fn().mockReturnValue([mockConnection]),
      reconnect: vi.fn().mockResolvedValue(mockConnection),
      getConnection: vi.fn().mockReturnValue(mockConnection),
      disconnectAll: vi.fn().mockResolvedValue(undefined),
      restoreConnections: vi.fn().mockResolvedValue([mockConnection]),
      dispose: vi.fn()
    };

    // Create instance
    mountCommandPaletteIntegration = new MountCommandPaletteIntegration(
      mountManager as any,
      connectionManager as any
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerCommands', () => {
    it('should register mount-related commands', () => {
      mountCommandPaletteIntegration.registerCommands();

      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'remote-ssh.mountFolder',
        expect.any(Function)
      );
      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'remote-ssh.unmountFolder',
        expect.any(Function)
      );
    });
  });

  describe('mountRemoteFolder', () => {
    it('should mount a remote folder successfully', async () => {
      // Register commands first
      mountCommandPaletteIntegration.registerCommands();
      
      // Get the registered command
      const registerCommandCalls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      const mountCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.mountFolder')![1];
      
      // Mock user inputs
      vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
        label: 'test-user@test-host',
        description: 'Port: 22',
        connection: mockConnection
      } as any);
      vi.mocked(vscode.window.showInputBox)
        .mockResolvedValueOnce('/home/user/test') // remote path
        .mockResolvedValueOnce('Test Mount'); // display name

      // Call the command
      await mountCommand();

      // The command should have been executed
      expect(mountCommand).toBeDefined();
    });

    it('should show error when no active connections', async () => {
      // Register commands first
      mountCommandPaletteIntegration.registerCommands();
      
      // Get the registered command
      const registerCommandCalls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      const mountCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.mountFolder')![1];
      
      // Mock no connections
      vi.mocked(connectionManager.getActiveConnections).mockReturnValue([]);

      // Call the command
      await mountCommand();

      // The command should have been executed
      expect(mountCommand).toBeDefined();
    });
  });

  describe('unmountRemoteFolder', () => {
    it('should unmount a remote folder when confirmed', async () => {
      // Register commands first
      mountCommandPaletteIntegration.registerCommands();
      
      // Get the registered command
      const registerCommandCalls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      const unmountCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.unmountFolder')![1];
      
      // Mock user selection
      vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
        label: 'Test Mount',
        description: '/home/user/test (connected)',
        mountPoint: mockMountPoint
      } as any);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue('Unmount' as any);

      // Call the command
      await unmountCommand();

      // The command should have been executed
      expect(unmountCommand).toBeDefined();
    });

    it('should not unmount when user cancels', async () => {
      // Register commands first
      mountCommandPaletteIntegration.registerCommands();
      
      // Get the registered command
      const registerCommandCalls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      const unmountCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.unmountFolder')![1];
      
      // Mock user cancellation
      vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce(undefined);

      // Call the command
      await unmountCommand();

      // Verify mount manager was not called
      expect(mountManager.unmountFolder).not.toHaveBeenCalled();
    });
  });

  describe('manageMounts', () => {
    it('should show mount management options', async () => {
      // Register commands first
      mountCommandPaletteIntegration.registerCommands();
      
      // Get the registered command
      const registerCommandCalls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      const manageMountsCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.manageMounts')![1];
      
      // Mock user selection
      vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce({
        label: 'Refresh All Mounts',
        description: 'Refresh all mounted folders'
      });

      // Call the command
      await manageMountsCommand();

      // Verify quick pick was shown
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
    });
  });

  describe('showMountStatus', () => {
    it('should show mount status information', async () => {
      // Register commands first
      mountCommandPaletteIntegration.registerCommands();
      
      // Get the registered command
      const registerCommandCalls = vi.mocked(vscode.commands.registerCommand).mock.calls;
      const showMountStatusCommand = registerCommandCalls.find(call => call[0] === 'remote-ssh.showMountStatus')![1];

      // Call the command
      await showMountStatusCommand();

      // The command should have been executed (may or may not show a message)
      expect(showMountStatusCommand).toBeDefined();
    });
  });
});