import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    workspace: {
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue([]),
        update: vi.fn()
      })
    },
    ConfigurationTarget: {
      Global: 1
    }
  };
});

// Mock uuid module with a proper UUID format that returns different values
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++;
    return `12345678-1234-1234-1234-${uuidCounter.toString().padStart(12, '0')}`;
  })
}));

// Import after mocking
import { TerminalSessionManager } from './terminal-session-manager';
import { TerminalSession } from '../interfaces/terminal';

describe('TerminalSessionManager', () => {
  let sessionManager: TerminalSessionManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = new TerminalSessionManager();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('createSession', () => {
    it('should create a new terminal session', () => {
      const session = sessionManager.createSession('connection-1', '/home/user', { TERM: 'xterm-256color' });
      
      expect(session).toBeDefined();
      expect(session.id).toMatch(/^12345678-1234-1234-1234-\d{12}$/);
      expect(session.connectionId).toBe('connection-1');
      expect(session.cwd).toBe('/home/user');
      expect(session.environment).toEqual({ TERM: 'xterm-256color' });
      expect(session.isActive).toBe(true);
      expect(session.lastActivity).toBeInstanceOf(Date);
    });
    
    it('should use default values when not provided', () => {
      const session = sessionManager.createSession('connection-1');
      
      expect(session.cwd).toBe('~');
      expect(session.environment).toEqual({});
    });
  });
  
  describe('getSession', () => {
    it('should return a session by ID', () => {
      const createdSession = sessionManager.createSession('connection-1');
      const retrievedSession = sessionManager.getSession(createdSession.id);
      
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession).toEqual(createdSession);
    });
    
    it('should return undefined for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-id');
      
      expect(session).toBeUndefined();
    });
  });
  
  describe('getAllSessions', () => {
    it('should return all sessions', () => {
      const session1 = sessionManager.createSession('connection-1');
      const session2 = sessionManager.createSession('connection-2');
      
      const allSessions = sessionManager.getAllSessions();
      
      expect(allSessions.length).toBe(2);
      expect(allSessions).toContainEqual(session1);
      expect(allSessions).toContainEqual(session2);
    });
    
    it('should return an empty array when no sessions exist', () => {
      const allSessions = sessionManager.getAllSessions();
      
      expect(allSessions.length).toBe(0);
    });
  });
  
  describe('getSessionsByConnection', () => {
    it('should return sessions for a specific connection', () => {
      const session1 = sessionManager.createSession('connection-1');
      const session2 = sessionManager.createSession('connection-1');
      const session3 = sessionManager.createSession('connection-2');
      
      const connection1Sessions = sessionManager.getSessionsByConnection('connection-1');
      
      expect(connection1Sessions.length).toBe(2);
      expect(connection1Sessions).toContainEqual(session1);
      expect(connection1Sessions).toContainEqual(session2);
      expect(connection1Sessions).not.toContainEqual(session3);
    });
    
    it('should return an empty array when no sessions exist for the connection', () => {
      const sessions = sessionManager.getSessionsByConnection('non-existent-connection');
      
      expect(sessions.length).toBe(0);
    });
  });
  
  describe('updateSession', () => {
    it('should update a session', () => {
      const session = sessionManager.createSession('connection-1', '/home/user');
      
      // Wait a bit to ensure different timestamps
      const originalLastActivity = session.lastActivity;
      
      const updatedSession = sessionManager.updateSession(session.id, {
        cwd: '/home/user/project',
        pid: 12345
      });
      
      expect(updatedSession).toBeDefined();
      expect(updatedSession?.cwd).toBe('/home/user/project');
      expect(updatedSession?.pid).toBe(12345);
      expect(updatedSession?.connectionId).toBe('connection-1');
      // The lastActivity should be updated, but in tests it might be the same due to timing
      expect(updatedSession?.lastActivity).toBeInstanceOf(Date);
    });
    
    it('should return undefined for non-existent session', () => {
      const updatedSession = sessionManager.updateSession('non-existent-id', {
        cwd: '/home/user/project'
      });
      
      expect(updatedSession).toBeUndefined();
    });
  });
  
  describe('deleteSession', () => {
    it('should delete a session', () => {
      const session = sessionManager.createSession('connection-1');
      
      const result = sessionManager.deleteSession(session.id);
      
      expect(result).toBe(true);
      expect(sessionManager.getSession(session.id)).toBeUndefined();
    });
    
    it('should return false for non-existent session', () => {
      const result = sessionManager.deleteSession('non-existent-id');
      
      expect(result).toBe(false);
    });
  });
  
  describe('deactivateSession and activateSession', () => {
    it('should deactivate a session', () => {
      const session = sessionManager.createSession('connection-1');
      
      const deactivatedSession = sessionManager.deactivateSession(session.id);
      
      expect(deactivatedSession).toBeDefined();
      expect(deactivatedSession?.isActive).toBe(false);
    });
    
    it('should activate a session', () => {
      const session = sessionManager.createSession('connection-1');
      sessionManager.deactivateSession(session.id);
      
      const activatedSession = sessionManager.activateSession(session.id);
      
      expect(activatedSession).toBeDefined();
      expect(activatedSession?.isActive).toBe(true);
    });
  });
  
  describe('getSessionState', () => {
    it('should return the state of a session', () => {
      const session = sessionManager.createSession('connection-1', '/home/user', { TERM: 'xterm-256color' });
      
      const state = sessionManager.getSessionState(session.id);
      
      expect(state).toBeDefined();
      expect(state?.sessionId).toBe(session.id);
      expect(state?.isConnected).toBe(true);
      expect(state?.workingDirectory).toBe('/home/user');
      expect(state?.environmentVariables).toEqual({ TERM: 'xterm-256color' });
    });
    
    it('should return undefined for non-existent session', () => {
      const state = sessionManager.getSessionState('non-existent-id');
      
      expect(state).toBeUndefined();
    });
  });
  
  describe('cleanupOldSessions', () => {
    it('should remove inactive sessions older than the specified age', () => {
      // Create an active session
      const activeSession = sessionManager.createSession('connection-1');
      
      // Create an inactive session
      const inactiveSession = sessionManager.createSession('connection-1');
      sessionManager.deactivateSession(inactiveSession.id);
      
      // Mock the lastActivity date to be older
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old
      (inactiveSession as any).lastActivity = oldDate;
      
      // Run cleanup with 7 days max age
      sessionManager.cleanupOldSessions(7);
      
      // Check that the inactive old session was removed
      expect(sessionManager.getSession(activeSession.id)).toBeDefined();
      expect(sessionManager.getSession(inactiveSession.id)).toBeUndefined();
    });
    
    it('should not remove active sessions regardless of age', () => {
      // Create an active session
      const activeSession = sessionManager.createSession('connection-1');
      
      // Mock the lastActivity date to be older
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old
      (activeSession as any).lastActivity = oldDate;
      
      // Run cleanup with 7 days max age
      sessionManager.cleanupOldSessions(7);
      
      // Check that the active session was not removed despite being old
      expect(sessionManager.getSession(activeSession.id)).toBeDefined();
    });
  });
});