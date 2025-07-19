import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the VS Code API
vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showOpenDialog: vi.fn().mockResolvedValue(undefined)
  },
  ConfigurationTarget: {
    Global: 1
  }
}));

// Import after mocking
import * as vscode from 'vscode';
import { ConfigurationManager } from './configuration-manager';
import { HostConfigurationUI } from './host-configuration-ui';
import { SSHHostConfig } from '../interfaces/ssh';


describe('HostConfigurationUI', () => {
  let configManager: ConfigurationManager;
  let hostConfigUI: HostConfigurationUI;
  let mockHosts: SSHHostConfig[];

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create mock hosts
    mockHosts = [
      {
        id: 'host1',
        name: 'Test Server 1',
        host: 'test1.example.com',
        port: 22,
        username: 'user1',
        authMethod: 'password'
      },
      {
        id: 'host2',
        name: 'Test Server 2',
        host: 'test2.example.com',
        port: 2222,
        username: 'user2',
        authMethod: 'key',
        privateKeyPath: '/path/to/key',
        remoteWorkspace: '/home/user2/projects'
      }
    ];
    
    // Mock configuration manager
    configManager = {
      getHosts: vi.fn().mockResolvedValue(mockHosts),
      getHost: vi.fn().mockImplementation(async (id) => mockHosts.find(h => h.id === id)),
      saveHost: vi.fn().mockImplementation(async (host) => {
        const index = mockHosts.findIndex(h => h.id === host.id);
        if (index >= 0) {
          mockHosts[index] = host;
        } else {
          mockHosts.push(host);
        }
      }),
      updateHost: vi.fn().mockImplementation(async (id, updates) => {
        const index = mockHosts.findIndex(h => h.id === id);
        if (index >= 0) {
          mockHosts[index] = { ...mockHosts[index], ...updates };
        }
      }),
      deleteHost: vi.fn().mockImplementation(async (id) => {
        const index = mockHosts.findIndex(h => h.id === id);
        if (index >= 0) {
          mockHosts.splice(index, 1);
        }
      }),
      setDefaultHost: vi.fn(),
      validateHostConfig: vi.fn().mockReturnValue(true),
      getWorkspaceSettings: vi.fn().mockReturnValue({
        defaultHostId: 'host1'
      })
    } as unknown as ConfigurationManager;
    
    // Create host configuration UI
    hostConfigUI = new HostConfigurationUI(configManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('showHostSelectionMenu', () => {
    it('should show a quick pick with all hosts', async () => {
      // Mock the quick pick to return the first host
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: '$(star) Test Server 1',
        description: 'user1@test1.example.com:22',
        host: mockHosts[0]
      });
      
      const result = await hostConfigUI.showHostSelectionMenu();
      
      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      expect(result).toEqual(mockHosts[0]);
    });

    it('should handle no hosts configured', async () => {
      // Mock empty hosts list
      (configManager.getHosts as any).mockResolvedValueOnce([]);
      
      // Mock user choosing to add a new host
      (vscode.window.showQuickPick as any).mockResolvedValueOnce('Yes');
      
      // Mock user inputs for adding a new host
      (vscode.window.showInputBox as any)
        .mockResolvedValueOnce('New Server') // name
        .mockResolvedValueOnce('new.example.com') // host
        .mockResolvedValueOnce('newuser') // username
        .mockResolvedValueOnce('22'); // port
      
      (vscode.window.showQuickPick as any)
        .mockResolvedValueOnce({ label: 'Password' }); // auth method
      
      await hostConfigUI.showHostSelectionMenu();
      
      expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(2);
      expect(vscode.window.showInputBox).toHaveBeenCalledTimes(6); // 4 for addNewHost + 2 for workspace and password
      expect(configManager.saveHost).toHaveBeenCalled();
    });

    it('should handle selecting "Add New Host"', async () => {
      // Mock selecting "Add New Host"
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: '$(add) Add New Host',
        isAddNew: true
      });
      
      // Mock cancelling the add new host flow
      (vscode.window.showInputBox as any).mockResolvedValueOnce(undefined);
      
      const result = await hostConfigUI.showHostSelectionMenu();
      
      expect(result).toBeUndefined();
    });

    it('should handle selecting "Manage Hosts"', async () => {
      // Mock selecting "Manage Hosts"
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: '$(gear) Manage Hosts',
        isManage: true
      });
      
      // Mock selecting a host to manage
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Server 1',
        host: mockHosts[0]
      });
      
      // Mock selecting an action
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: '$(star) Set as Default'
      });
      
      await hostConfigUI.showHostSelectionMenu();
      
      expect(vscode.window.showQuickPick).toHaveBeenCalledTimes(3);
      expect(configManager.setDefaultHost).toHaveBeenCalledWith('host1');
    });
  });

  describe('addNewHost', () => {
    it('should add a new host with password authentication', async () => {
      // Mock user inputs for adding a new host
      (vscode.window.showInputBox as any)
        .mockResolvedValueOnce('New Server') // name
        .mockResolvedValueOnce('new.example.com') // host
        .mockResolvedValueOnce('newuser') // username
        .mockResolvedValueOnce('22') // port
        .mockResolvedValueOnce('password') // password
        .mockResolvedValueOnce('/home/newuser/workspace'); // remote workspace
      
      (vscode.window.showQuickPick as any)
        .mockResolvedValueOnce({ label: 'Password' }); // auth method
      
      const result = await hostConfigUI.addNewHost();
      
      expect(result).toBeDefined();
      expect(configManager.saveHost).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Host New Server added successfully');
    });

    it('should handle validation errors', async () => {
      // Mock saveHost to throw an error
      (configManager.saveHost as any).mockRejectedValueOnce(new Error('Invalid host configuration'));
      
      // Mock user inputs for adding a new host
      (vscode.window.showInputBox as any)
        .mockResolvedValueOnce('Invalid Server') // name
        .mockResolvedValueOnce('invalid.example.com') // host
        .mockResolvedValueOnce('user') // username
        .mockResolvedValueOnce('22'); // port
      
      (vscode.window.showQuickPick as any)
        .mockResolvedValueOnce({ label: 'Password' }); // auth method
      
      const result = await hostConfigUI.addNewHost();
      
      expect(result).toBeUndefined();
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('Failed to add host: Error: Invalid host configuration');
    });
  });

  describe('editHost', () => {
    it('should edit an existing host', async () => {
      // Mock selecting a field to edit
      (vscode.window.showQuickPick as any)
        .mockResolvedValueOnce({ label: 'Name' }) // field to edit
        .mockResolvedValueOnce({ label: 'No' }); // don't edit more
      
      // Mock new name input
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Updated Server Name');
      
      await (hostConfigUI as any).editHost(mockHosts[0]);
      
      expect(configManager.updateHost).toHaveBeenCalledWith('host1', { name: 'Updated Server Name' });
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Host Test Server 1 updated successfully');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Host renamed to Updated Server Name');
    });
  });

  describe('deleteHost', () => {
    it('should delete a host after confirmation', async () => {
      // Mock confirmation
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({ label: 'Yes' });
      
      const result = await (hostConfigUI as any).deleteHost(mockHosts[0]);
      
      expect(configManager.deleteHost).toHaveBeenCalledWith('host1');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Host Test Server 1 deleted');
      expect(result).toBeUndefined(); // Should return undefined when deleted
    });

    it('should not delete a host if not confirmed', async () => {
      // Mock cancellation
      (vscode.window.showQuickPick as any).mockResolvedValueOnce('No');
      
      const result = await (hostConfigUI as any).deleteHost(mockHosts[0]);
      
      expect(configManager.deleteHost).not.toHaveBeenCalled();
      expect(result).toEqual(mockHosts[0]);
    });
  });

  describe('setDefaultHost', () => {
    it('should set a host as default', async () => {
      await (hostConfigUI as any).setDefaultHost(mockHosts[1]);
      
      expect(configManager.setDefaultHost).toHaveBeenCalledWith('host2');
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Test Server 2 set as default');
    });
  });

  describe('testConnection', () => {
    it('should show progress during connection test', async () => {
      // Mock the connection test to succeed
      (vscode.window.showInformationMessage as any).mockImplementation(() => {});
      
      await (hostConfigUI as any).testConnection(mockHosts[0]);
      
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });
  });
});