import * as vscode from 'vscode';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';
import { SSHConnection } from '../interfaces/ssh';

// This file is kept for backward compatibility
// All mount-related functions have been moved to MountCommandPaletteIntegration class

/**
 * Mount a remote folder
 * @param mountManager Mount manager
 * @param connectionManager Connection manager
 * @deprecated Use MountCommandPaletteIntegration.mountRemoteFolder instead
 */
export async function mountRemoteFolder(
  mountManager: MountManager,
  connectionManager: { getConnections: () => SSHConnection[] }
): Promise<void> {
  // Forward to command
  await vscode.commands.executeCommand('remote-ssh.mountFolder');
}

/**
 * Unmount a remote folder
 * @param mountManager Mount manager
 * @deprecated Use MountCommandPaletteIntegration.unmountRemoteFolder instead
 */
export async function unmountRemoteFolder(mountManager: MountManager): Promise<void> {
  // Forward to command
  await vscode.commands.executeCommand('remote-ssh.unmountFolder');
}

/**
 * Manage mounted folders
 * @param mountManager Mount manager
 * @deprecated Use MountCommandPaletteIntegration.manageMountedFolders instead
 */
export async function manageMountedFolders(mountManager: MountManager): Promise<void> {
  // Forward to command
  await vscode.commands.executeCommand('remote-ssh.manageMounts');
}

/**
 * Refresh a mounted folder
 * @param mountManager Mount manager
 * @param mountId Optional mount ID to refresh
 * @deprecated Use MountCommandPaletteIntegration.refreshMountedFolder instead
 */
export async function refreshMountedFolder(
  mountManager: MountManager,
  mountId?: string
): Promise<void> {
  // Forward to command
  await vscode.commands.executeCommand('remote-ssh.refreshMount', mountId);
}

/**
 * Reconnect a mount
 * @param mountManager Mount manager
 * @param mountId Optional mount ID to reconnect
 * @deprecated Use MountCommandPaletteIntegration.reconnectMountedFolder instead
 */
export async function reconnectMount(
  mountManager: MountManager,
  mountId?: string
): Promise<void> {
  // Forward to command
  await vscode.commands.executeCommand('remote-ssh.reconnectMount', mountId);
}

/**
 * Show mount status
 * @param mountManager Mount manager
 * @deprecated Use MountCommandPaletteIntegration.showMountStatus instead
 */
export async function showMountStatus(mountManager: MountManager): Promise<void> {
  // Forward to command
  await vscode.commands.executeCommand('remote-ssh.showMountStatus');
}