/**
 * Mount interfaces for remote folder mounting functionality
 */
import * as vscode from 'vscode';
import { SSHConnection } from './ssh';
import { TerminalOptions } from './terminal';

/**
 * Mount point configuration
 */
export interface MountPoint {
  id: string;
  name: string;
  connectionId: string;
  remotePath: string;
  mountPath: string;
  options: MountOptions;
  isActive: boolean;
  lastActivity: Date;
}

/**
 * Mount options
 */
export interface MountOptions {
  readOnly: boolean;
  autoReconnect: boolean;
  cacheEnabled: boolean;
  cacheTTL: number;
  watchEnabled: boolean;
  watchExcludes: string[];
}

/**
 * Mount manager interface
 */
export interface MountManager {
  getMounts(): MountPoint[];
  getMountById(id: string): MountPoint | undefined;
  getMountByUri(uri: vscode.Uri): MountPoint | undefined;
  addMount(connectionId: string, remotePath: string, name?: string, options?: Partial<MountOptions>): Promise<MountPoint>;
  removeMount(mountId: string): Promise<boolean>;
  updateMount(mountId: string, updates: Partial<MountPoint>): Promise<MountPoint | undefined>;
  translateUri(uri: vscode.Uri): vscode.Uri | undefined;
  getMountUri(mountPoint: MountPoint): vscode.Uri;
  getRemoteUri(mountPoint: MountPoint): vscode.Uri;
}

/**
 * Mount-aware terminal options
 */
export interface MountTerminalOptions extends TerminalOptions {
  mountId?: string;
  useWorkingDirectory?: boolean;
}

/**
 * Mount-aware terminal provider interface
 */
export interface MountAwareTerminalProvider {
  createTerminalForMount(mountId: string, options?: MountTerminalOptions): Promise<vscode.Terminal>;
  getTerminalsForMount(mountId: string): vscode.Terminal[];
  resolveWorkingDirectory(mountId: string, relativePath?: string): Promise<string>;
}