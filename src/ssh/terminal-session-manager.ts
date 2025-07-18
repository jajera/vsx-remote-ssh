/**
 * Terminal Session Manager
 * Manages terminal sessions and provides persistence across reconnections
 */
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { TerminalSession, TerminalState } from '../interfaces/terminal';
import { SSHConnection } from '../interfaces/ssh';

/**
 * Manages terminal sessions and provides persistence across reconnections
 */
export class TerminalSessionManager {
  private _sessions: Map<string, TerminalSession>;
  private _stateStorageKey = 'vsx-remote-ssh.terminal-sessions';
  
  /**
   * Creates a new terminal session manager
   */
  constructor() {
    this._sessions = new Map<string, TerminalSession>();
    this._loadSessions();
  }
  
  /**
   * Create a new terminal session
   * @param connectionId The ID of the SSH connection
   * @param cwd The working directory for the terminal
   * @param environment Environment variables for the terminal
   * @returns The created terminal session
   */
  createSession(connectionId: string, cwd: string = '~', environment: Record<string, string> = {}): TerminalSession {
    const session: TerminalSession = {
      id: uuidv4(),
      connectionId,
      pid: -1, // Will be set when the terminal is actually created
      cwd,
      environment,
      isActive: true,
      lastActivity: new Date()
    };
    
    this._sessions.set(session.id, session);
    this._saveSessions();
    
    return session;
  }
  
  /**
   * Get a terminal session by ID
   * @param sessionId The ID of the session to get
   * @returns The terminal session or undefined if not found
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this._sessions.get(sessionId);
  }
  
  /**
   * Get all terminal sessions
   * @returns Array of all terminal sessions
   */
  getAllSessions(): TerminalSession[] {
    return Array.from(this._sessions.values());
  }
  
  /**
   * Get all terminal sessions for a specific connection
   * @param connectionId The ID of the connection
   * @returns Array of terminal sessions for the connection
   */
  getSessionsByConnection(connectionId: string): TerminalSession[] {
    return Array.from(this._sessions.values()).filter(session => session.connectionId === connectionId);
  }
  
  /**
   * Update a terminal session
   * @param sessionId The ID of the session to update
   * @param updates The updates to apply to the session
   * @returns The updated session or undefined if not found
   */
  updateSession(sessionId: string, updates: Partial<TerminalSession>): TerminalSession | undefined {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    
    // Apply updates
    Object.assign(session, updates);
    
    // Always update the last activity timestamp
    session.lastActivity = new Date();
    
    this._saveSessions();
    
    return session;
  }
  
  /**
   * Delete a terminal session
   * @param sessionId The ID of the session to delete
   * @returns True if the session was deleted, false otherwise
   */
  deleteSession(sessionId: string): boolean {
    const result = this._sessions.delete(sessionId);
    if (result) {
      this._saveSessions();
    }
    return result;
  }
  
  /**
   * Mark a terminal session as inactive
   * @param sessionId The ID of the session to mark as inactive
   * @returns The updated session or undefined if not found
   */
  deactivateSession(sessionId: string): TerminalSession | undefined {
    return this.updateSession(sessionId, { isActive: false });
  }
  
  /**
   * Mark a terminal session as active
   * @param sessionId The ID of the session to mark as active
   * @returns The updated session or undefined if not found
   */
  activateSession(sessionId: string): TerminalSession | undefined {
    return this.updateSession(sessionId, { isActive: true });
  }
  
  /**
   * Get the current state of a terminal session
   * @param sessionId The ID of the session
   * @returns The terminal state or undefined if not found
   */
  getSessionState(sessionId: string): TerminalState | undefined {
    const session = this._sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    
    return {
      sessionId,
      isConnected: session.isActive,
      workingDirectory: session.cwd,
      environmentVariables: session.environment
    };
  }
  
  /**
   * Save terminal sessions to persistent storage
   */
  private _saveSessions(): void {
    try {
      // Convert sessions to a serializable format
      const sessionsArray = Array.from(this._sessions.values()).map(session => ({
        ...session,
        lastActivity: session.lastActivity.toISOString()
      }));
      
      // Save to VS Code global state
      vscode.workspace.getConfiguration('vsx-remote-ssh').update(
        'terminalSessions',
        sessionsArray,
        vscode.ConfigurationTarget.Global
      );
    } catch (error) {
      console.error('Failed to save terminal sessions:', error);
    }
  }
  
  /**
   * Load terminal sessions from persistent storage
   */
  private _loadSessions(): void {
    try {
      // Load from VS Code global state
      const sessionsArray = vscode.workspace.getConfiguration('vsx-remote-ssh').get<any[]>(
        'terminalSessions',
        []
      );
      
      // Convert to TerminalSession objects
      sessionsArray.forEach(sessionData => {
        const session: TerminalSession = {
          ...sessionData,
          lastActivity: new Date(sessionData.lastActivity)
        };
        
        this._sessions.set(session.id, session);
      });
    } catch (error) {
      console.error('Failed to load terminal sessions:', error);
    }
  }
  
  /**
   * Clean up old terminal sessions
   * @param maxAgeDays Maximum age of sessions in days
   */
  cleanupOldSessions(maxAgeDays: number = 7): void {
    const now = new Date();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    
    // Find sessions older than maxAgeDays
    const oldSessionIds = Array.from(this._sessions.entries())
      .filter(([_, session]) => {
        const age = now.getTime() - session.lastActivity.getTime();
        return !session.isActive && age > maxAgeMs;
      })
      .map(([id, _]) => id);
    
    // Delete old sessions
    if (oldSessionIds.length > 0) {
      oldSessionIds.forEach(id => this._sessions.delete(id));
      this._saveSessions();
    }
  }
}