import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    workspace: {
      workspaceFolders: [],
      updateWorkspaceFolders: vi.fn().mockReturnValue(true),
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn(),
        update: vi.fn()
      })
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
    ConfigurationTarget: {
      Global: 1
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
import { WorkspaceIntegrationImpl } from './workspace-context-manager';
import { MountPoint, MountStatus } from '../interfaces/mount';

// Helper function to create a mock mount point
const createMockMountPoint = (id: string, displayName: string): MountPoint => ({
  id,
  connectionId: 'conn1',
  remotePath: '/home/user/project',
  displayName,
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

describe('WorkspaceIntegrationImpl', () => {
  let workspaceIntegration: WorkspaceIntegrationImpl;
  let mockWorkspaceFolders: any[];
  
  beforeEach(() => {
    // Reset mock workspace folders
    mockWorkspaceFolders = [];
    (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;
    
    // Reset updateWorkspaceFolders mock
    vi.mocked(vscode.workspace.updateWorkspaceFolders).mockReset().mockReturnValue(true);
    
    // Create instance
    workspaceIntegration = new WorkspaceIntegrationImpl();
  });
  
  describe('addMountToWorkspace', () => {
    it('should add a mount to an empty workspace', async () => {
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      
      await workspaceIntegration.addMountToWorkspace(mountPoint);
      
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
        0, 0, { uri: mountPoint.uri, name: mountPoint.displayName }
      );
    });
    
    it('should add a mount to a non-empty workspace', async () => {
      // Setup existing workspace folders
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///existing-folder'),
        name: 'Existing Folder',
        index: 0
      });
      
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      
      await workspaceIntegration.addMountToWorkspace(mountPoint);
      
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
        1, 0, { uri: mountPoint.uri, name: mountPoint.displayName }
      );
    });
    
    it('should update an existing mount in the workspace', async () => {
      // Setup existing workspace folder that matches the mount
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: 'Old Name',
        index: 0
      });
      
      await workspaceIntegration.addMountToWorkspace(mountPoint);
      
      // Should call updateMountInWorkspace instead
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
        0, 1, { uri: mountPoint.uri, name: mountPoint.displayName }
      );
    });
    
    it('should throw an error if adding the mount fails', async () => {
      vi.mocked(vscode.workspace.updateWorkspaceFolders).mockReturnValue(false);
      
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      
      await expect(workspaceIntegration.addMountToWorkspace(mountPoint))
        .rejects.toThrow(/Failed to add mount/);
    });
  });
  
  describe('removeMountFromWorkspace', () => {
    it('should remove a mount from the workspace', async () => {
      // Setup existing workspace folder that matches the mount
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: mountPoint.displayName,
        index: 0
      });
      
      await workspaceIntegration.removeMountFromWorkspace(mountPoint);
      
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(0, 1);
    });
    
    it('should do nothing if the mount is not in the workspace', async () => {
      // Setup existing workspace folder that doesn't match the mount
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///existing-folder'),
        name: 'Existing Folder',
        index: 0
      });
      
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      
      await workspaceIntegration.removeMountFromWorkspace(mountPoint);
      
      expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
    });
    
    it('should throw an error if removing the mount fails', async () => {
      // Setup existing workspace folder that matches the mount
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: mountPoint.displayName,
        index: 0
      });
      
      vi.mocked(vscode.workspace.updateWorkspaceFolders).mockReturnValue(false);
      
      await expect(workspaceIntegration.removeMountFromWorkspace(mountPoint))
        .rejects.toThrow(/Failed to remove mount/);
    });
  });
  
  describe('updateMountInWorkspace', () => {
    it('should update a mount in the workspace', async () => {
      // Setup existing workspace folder that matches the mount
      const mountPoint = createMockMountPoint('mount1', 'Updated Name');
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: 'Old Name',
        index: 0
      });
      
      await workspaceIntegration.updateMountInWorkspace(mountPoint);
      
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
        0, 1, { uri: mountPoint.uri, name: mountPoint.displayName }
      );
    });
    
    it('should add the mount if it is not in the workspace', async () => {
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      
      await workspaceIntegration.updateMountInWorkspace(mountPoint);
      
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
        0, 0, { uri: mountPoint.uri, name: mountPoint.displayName }
      );
    });
    
    it('should throw an error if updating the mount fails', async () => {
      // Setup existing workspace folder that matches the mount
      const mountPoint = createMockMountPoint('mount1', 'Updated Name');
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: 'Old Name',
        index: 0
      });
      
      vi.mocked(vscode.workspace.updateWorkspaceFolders).mockReturnValue(false);
      
      await expect(workspaceIntegration.updateMountInWorkspace(mountPoint))
        .rejects.toThrow(/Failed to update mount/);
    });
  });
  
  describe('isMountInWorkspace', () => {
    it('should return true if the mount is in the workspace', () => {
      // Setup existing workspace folder that matches the mount
      const mountId = 'mount1';
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse(`ssh-mount://${mountId}/`),
        name: 'Test Mount',
        index: 0
      });
      
      const result = workspaceIntegration.isMountInWorkspace(mountId);
      
      expect(result).toBe(true);
    });
    
    it('should return false if the mount is not in the workspace', () => {
      // Setup existing workspace folder that doesn't match the mount
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///existing-folder'),
        name: 'Existing Folder',
        index: 0
      });
      
      const result = workspaceIntegration.isMountInWorkspace('mount1');
      
      expect(result).toBe(false);
    });
    
    it('should return false if the workspace is empty', () => {
      const result = workspaceIntegration.isMountInWorkspace('mount1');
      
      expect(result).toBe(false);
    });
  });
  
  describe('getMountsInWorkspace', () => {
    it('should return all mount IDs in the workspace', () => {
      // Setup multiple mount points in workspace
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('ssh-mount://mount1/'),
        name: 'Mount 1',
        index: 0
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder'),
        name: 'Local Folder',
        index: 1
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('ssh-mount://mount2/'),
        name: 'Mount 2',
        index: 2
      });
      
      const result = workspaceIntegration.getMountsInWorkspace();
      
      expect(result).toEqual(['mount1', 'mount2']);
    });
    
    it('should return empty array if no mounts are in workspace', () => {
      // Setup workspace with no mounts
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder1'),
        name: 'Local Folder 1',
        index: 0
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder2'),
        name: 'Local Folder 2',
        index: 1
      });
      
      const result = workspaceIntegration.getMountsInWorkspace();
      
      expect(result).toEqual([]);
    });
    
    it('should return empty array if workspace is empty', () => {
      const result = workspaceIntegration.getMountsInWorkspace();
      
      expect(result).toEqual([]);
    });
  });
  
  describe('getMountWorkspaceFolder', () => {
    it('should return the workspace folder for a mount', () => {
      // Setup mount in workspace
      const mountId = 'mount1';
      const mountFolder = {
        uri: vscode.Uri.parse(`ssh-mount://${mountId}/`),
        name: 'Test Mount',
        index: 0
      };
      mockWorkspaceFolders.push(mountFolder);
      
      const result = workspaceIntegration.getMountWorkspaceFolder(mountId);
      
      expect(result).toEqual(mountFolder);
    });
    
    it('should return undefined if mount is not in workspace', () => {
      // Setup workspace without the mount
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder'),
        name: 'Local Folder',
        index: 0
      });
      
      const result = workspaceIntegration.getMountWorkspaceFolder('mount1');
      
      expect(result).toBeUndefined();
    });
  });
  
  describe('reorderWorkspaceFolders', () => {
    beforeEach(() => {
      // Setup mixed workspace with mounts and local folders
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder1'),
        name: 'Local Folder 1',
        index: 0
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('ssh-mount://mount1/'),
        name: 'Mount 1',
        index: 1
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder2'),
        name: 'Local Folder 2',
        index: 2
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('ssh-mount://mount2/'),
        name: 'Mount 2',
        index: 3
      });
    });
    
    it('should reorder workspace folders to put mounts at the end', async () => {
      await workspaceIntegration.reorderWorkspaceFolders('end');
      
      // Check that updateWorkspaceFolders was called with the correct order
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
        0, 4, // Remove all folders
        // Add back in new order: local folders first, then mounts
        { uri: mockWorkspaceFolders[0].uri, name: mockWorkspaceFolders[0].name },
        { uri: mockWorkspaceFolders[2].uri, name: mockWorkspaceFolders[2].name },
        { uri: mockWorkspaceFolders[1].uri, name: mockWorkspaceFolders[1].name },
        { uri: mockWorkspaceFolders[3].uri, name: mockWorkspaceFolders[3].name }
      );
    });
    
    it('should reorder workspace folders to put mounts at the start', async () => {
      await workspaceIntegration.reorderWorkspaceFolders('start');
      
      // Check that updateWorkspaceFolders was called with the correct order
      expect(vscode.workspace.updateWorkspaceFolders).toHaveBeenCalledWith(
        0, 4, // Remove all folders
        // Add back in new order: mounts first, then local folders
        { uri: mockWorkspaceFolders[1].uri, name: mockWorkspaceFolders[1].name },
        { uri: mockWorkspaceFolders[3].uri, name: mockWorkspaceFolders[3].name },
        { uri: mockWorkspaceFolders[0].uri, name: mockWorkspaceFolders[0].name },
        { uri: mockWorkspaceFolders[2].uri, name: mockWorkspaceFolders[2].name }
      );
    });
    
    it('should not reorder if current position is specified', async () => {
      await workspaceIntegration.reorderWorkspaceFolders('current');
      
      // Should not call updateWorkspaceFolders
      expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
    });
    
    it('should throw error if reordering fails', async () => {
      vi.mocked(vscode.workspace.updateWorkspaceFolders).mockReturnValue(false);
      
      await expect(workspaceIntegration.reorderWorkspaceFolders('end'))
        .rejects.toThrow(/Failed to reorder workspace folders/);
    });
    
    it('should not reorder if there are only mount folders', async () => {
      // Setup workspace with only mount folders
      mockWorkspaceFolders.length = 0;
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('ssh-mount://mount1/'),
        name: 'Mount 1',
        index: 0
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('ssh-mount://mount2/'),
        name: 'Mount 2',
        index: 1
      });
      
      await workspaceIntegration.reorderWorkspaceFolders('end');
      
      // Should not call updateWorkspaceFolders
      expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
    });
    
    it('should not reorder if there are only local folders', async () => {
      // Setup workspace with only local folders
      mockWorkspaceFolders.length = 0;
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder1'),
        name: 'Local Folder 1',
        index: 0
      });
      mockWorkspaceFolders.push({
        uri: vscode.Uri.parse('file:///local-folder2'),
        name: 'Local Folder 2',
        index: 1
      });
      
      await workspaceIntegration.reorderWorkspaceFolders('start');
      
      // Should not call updateWorkspaceFolders
      expect(vscode.workspace.updateWorkspaceFolders).not.toHaveBeenCalled();
    });
  });
  
  describe('Events', () => {
    it('should fire onDidChangeMountWorkspaceState when adding a mount', async () => {
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      const listener = vi.fn();
      
      // Subscribe to the event
      workspaceIntegration.onDidChangeMountWorkspaceState(listener);
      
      // Add mount to workspace
      await workspaceIntegration.addMountToWorkspace(mountPoint);
      
      // Check that the event was fired with the mount point
      expect(listener).toHaveBeenCalledWith(mountPoint);
    });
    
    it('should fire onDidChangeMountWorkspaceState when removing a mount', async () => {
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      const listener = vi.fn();
      
      // Setup mount in workspace
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: mountPoint.displayName,
        index: 0
      });
      
      // Subscribe to the event
      workspaceIntegration.onDidChangeMountWorkspaceState(listener);
      
      // Remove mount from workspace
      await workspaceIntegration.removeMountFromWorkspace(mountPoint);
      
      // Check that the event was fired with the mount point
      expect(listener).toHaveBeenCalledWith(mountPoint);
    });
    
    it('should fire onDidChangeMountWorkspaceState when updating a mount', async () => {
      const mountPoint = createMockMountPoint('mount1', 'Test Mount');
      const listener = vi.fn();
      
      // Setup mount in workspace
      mockWorkspaceFolders.push({
        uri: mountPoint.uri,
        name: 'Old Name',
        index: 0
      });
      
      // Subscribe to the event
      workspaceIntegration.onDidChangeMountWorkspaceState(listener);
      
      // Update mount in workspace
      await workspaceIntegration.updateMountInWorkspace(mountPoint);
      
      // Check that the event was fired with the mount point
      expect(listener).toHaveBeenCalledWith(mountPoint);
    });
  });
});