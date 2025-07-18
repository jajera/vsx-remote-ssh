/**
 * Core SSH connection interfaces
 */
import * as vscode from 'vscode';

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key' | 'agent';
  privateKeyPath?: string;
  password?: string;
  passphrase?: string;
  connectTimeout?: number;
  maxReconnectAttempts?: number;
  reconnectBackoffFactor?: number;
  reconnectMaxDelayMs?: number;
  reconnectInitialDelayMs?: number;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SSHConnection {
  id: string;
  config: SSHConfig;
  status: ConnectionStatus;
  lastConnected: Date;
  execute(command: string): Promise<CommandResult>;
  createSFTP(): Promise<any>; // Will be typed properly when implementing SFTP
  reconnect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export interface SSHConnectionManager {
  connect(config: SSHConfig): Promise<SSHConnection>;
  disconnect(connectionId: string): Promise<void>;
  getActiveConnections(): SSHConnection[];
  reconnect(connectionId: string): Promise<SSHConnection>;
  getConnection(connectionId: string): SSHConnection | undefined;
  disconnectAll(): Promise<void>;
  restoreConnections(): Promise<SSHConnection[]>;
  dispose(): void;
}

export interface SSHHostConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: 'password' | 'key' | 'agent';
  privateKeyPath?: string;
  remoteWorkspace?: string;
}

export enum ConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Error = 'error'
}

export interface ConnectionState {
  connectionId: string;
  status: ConnectionStatus;
  config: SSHConfig;
  lastActivity: Date;
  reconnectAttempts: number;
  workspaceUri?: string;
  lastError?: SSHError;
}

/**
 * SSH Error Types
 */
export enum SSHErrorType {
  // Connection errors
  ConnectionRefused = 'connection_refused',
  HostUnreachable = 'host_unreachable',
  NetworkTimeout = 'network_timeout',
  DNSResolutionFailed = 'dns_resolution_failed',
  
  // Authentication errors
  AuthenticationFailed = 'authentication_failed',
  PermissionDenied = 'permission_denied',
  KeyRejected = 'key_rejected',
  PasswordRejected = 'password_rejected',
  
  // SSH protocol errors
  ProtocolError = 'protocol_error',
  VersionMismatch = 'version_mismatch',
  
  // File system errors
  FileNotFound = 'file_not_found',
  FilePermissionDenied = 'file_permission_denied',
  
  // Command execution errors
  CommandExecutionFailed = 'command_execution_failed',
  
  // SFTP errors
  SFTPError = 'sftp_error',
  
  // Configuration errors
  ConfigurationError = 'configuration_error',
  
  // Unknown errors
  Unknown = 'unknown'
}

/**
 * SSH Error interface
 */
export interface SSHError {
  type: SSHErrorType;
  message: string;
  originalError?: Error;
  timestamp: Date;
  connectionId?: string;
  troubleshootingSteps?: string[];
}

/**
 * Remote Terminal Interfaces
 */
export interface RemoteTerminalProvider {
  createTerminal(connection: SSHConnection, options?: TerminalOptions): Promise<RemoteTerminal>;
  getActiveTerminals(): RemoteTerminal[];
  closeTerminal(terminalId: string): Promise<void>;
}

export interface RemoteTerminal {
  id: string;
  connection: SSHConnection;
  write(data: string): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  onData: vscode.Event<string>;
  onExit: vscode.Event<number>;
  dispose(): void;
}

export interface TerminalOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  shellPath?: string;
  shellArgs?: string[];
}