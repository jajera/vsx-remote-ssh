/**
 * Terminal interfaces for remote terminal operations
 */
import * as vscode from 'vscode';
import { SSHConnection } from './ssh';

export interface TerminalOptions {
  name?: string;
  cwd?: string;
  env?: Record<string, string>;
  shellPath?: string;
  shellArgs?: string[];
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

export interface RemoteTerminalProvider {
  createTerminal(connection: SSHConnection, options?: TerminalOptions): Promise<RemoteTerminal>;
  getActiveTerminals(): RemoteTerminal[];
  closeTerminal(terminalId: string): Promise<void>;
}

export interface TerminalSession {
  id: string;
  connectionId: string;
  pid: number;
  cwd: string;
  environment: Record<string, string>;
  isActive: boolean;
  lastActivity: Date;
}

export interface TerminalState {
  sessionId: string;
  isConnected: boolean;
  lastCommand?: string;
  workingDirectory: string;
  environmentVariables: Record<string, string>;
}