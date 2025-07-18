import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionStateManagerImpl } from './connection-state-manager';
import { ConnectionState, ConnectionStatus, SSHConfig } from '../interfaces/ssh';

describe('ConnectionStateManager', () => {
  let stateManager: ConnectionStateManagerImpl;
  let mockContext: any;
  let mockGlobalState: any;
  let storedStates: ConnectionState[] = [];
  
  beforeEach(() => {
    // Reset stored states
    storedStates = [];
    
    // Create mock for VS Code extension context
    mockGlobalState = {
      get: vi.fn((key: string, defaultValue: any) => {
        return storedStates;
      }),
      update: vi.fn((key: string, value: any) => {
        storedStates = value;
        return Promise.resolve();
      })
    };
    
    mockContext = {
      globalState: mockGlobalState
    };
    
    stateManager = new ConnectionStateManagerImpl(mockContext as any);
  });
  
  describe('saveConnectionState', () => {
    it('should save a new connection state', async () => {
      const state: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password',
          password: 'testpass'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      await stateManager.saveConnectionState(state);
      
      expect(mockGlobalState.update).toHaveBeenCalled();
      expect(storedStates).toHaveLength(1);
      expect(storedStates[0]).toEqual(state);
    });
    
    it('should update an existing connection state', async () => {
      // Add initial state
      const initialState: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password',
          password: 'testpass'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      storedStates = [initialState];
      
      // Update the state
      const updatedState: ConnectionState = {
        ...initialState,
        status: ConnectionStatus.Disconnected,
        reconnectAttempts: 2
      };
      
      await stateManager.saveConnectionState(updatedState);
      
      expect(mockGlobalState.update).toHaveBeenCalled();
      expect(storedStates).toHaveLength(1);
      expect(storedStates[0]).toEqual(updatedState);
    });
  });
  
  describe('getConnectionState', () => {
    it('should retrieve a connection state by ID', async () => {
      const state: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password',
          password: 'testpass'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      storedStates = [state];
      
      const retrievedState = await stateManager.getConnectionState('test-connection-1');
      
      expect(retrievedState).toEqual(state);
    });
    
    it('should return undefined for non-existent connection ID', async () => {
      const retrievedState = await stateManager.getConnectionState('non-existent');
      
      expect(retrievedState).toBeUndefined();
    });
  });
  
  describe('getAllConnectionStates', () => {
    it('should retrieve all connection states', async () => {
      const state1: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example1.com',
          port: 22,
          username: 'testuser1',
          authMethod: 'password',
          password: 'testpass1'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      const state2: ConnectionState = {
        connectionId: 'test-connection-2',
        status: ConnectionStatus.Disconnected,
        config: {
          host: 'example2.com',
          port: 22,
          username: 'testuser2',
          authMethod: 'password',
          password: 'testpass2'
        },
        lastActivity: new Date(),
        reconnectAttempts: 1
      };
      
      storedStates = [state1, state2];
      
      const retrievedStates = await stateManager.getAllConnectionStates();
      
      expect(retrievedStates).toHaveLength(2);
      expect(retrievedStates).toEqual([state1, state2]);
    });
    
    it('should return empty array when no states exist', async () => {
      const retrievedStates = await stateManager.getAllConnectionStates();
      
      expect(retrievedStates).toHaveLength(0);
    });
  });
  
  describe('updateConnectionState', () => {
    it('should update an existing connection state', async () => {
      const initialState: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password',
          password: 'testpass'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      storedStates = [initialState];
      
      await stateManager.updateConnectionState('test-connection-1', {
        status: ConnectionStatus.Reconnecting,
        reconnectAttempts: 1
      });
      
      expect(storedStates[0].status).toBe(ConnectionStatus.Reconnecting);
      expect(storedStates[0].reconnectAttempts).toBe(1);
      expect(storedStates[0].config).toEqual(initialState.config);
    });
    
    it('should create new state for non-existent connection ID', async () => {
      await stateManager.updateConnectionState('non-existent', { status: ConnectionStatus.Connected });
      const states = await stateManager.getAllConnectionStates();
      const newState = states.find(s => s.connectionId === 'non-existent');
      expect(newState).toBeDefined();
      expect(newState?.status).toBe(ConnectionStatus.Connected);
    });
    
    it('should update lastActivity when not explicitly provided', async () => {
      const initialDate = new Date(2023, 0, 1);
      const initialState: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password',
          password: 'testpass'
        },
        lastActivity: initialDate,
        reconnectAttempts: 0
      };
      
      storedStates = [initialState];
      
      await stateManager.updateConnectionState('test-connection-1', {
        status: ConnectionStatus.Reconnecting
      });
      
      expect(storedStates[0].lastActivity).not.toEqual(initialDate);
    });
  });
  
  describe('deleteConnectionState', () => {
    it('should delete a connection state by ID', async () => {
      const state1: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example1.com',
          port: 22,
          username: 'testuser1',
          authMethod: 'password',
          password: 'testpass1'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      const state2: ConnectionState = {
        connectionId: 'test-connection-2',
        status: ConnectionStatus.Disconnected,
        config: {
          host: 'example2.com',
          port: 22,
          username: 'testuser2',
          authMethod: 'password',
          password: 'testpass2'
        },
        lastActivity: new Date(),
        reconnectAttempts: 1
      };
      
      storedStates = [state1, state2];
      
      await stateManager.deleteConnectionState('test-connection-1');
      
      expect(storedStates).toHaveLength(1);
      expect(storedStates[0].connectionId).toBe('test-connection-2');
    });
    
    it('should do nothing for non-existent connection ID', async () => {
      const state: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password',
          password: 'testpass'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      storedStates = [state];
      
      await stateManager.deleteConnectionState('non-existent');
      
      expect(storedStates).toHaveLength(1);
    });
  });
  
  describe('clearConnectionStates', () => {
    it('should clear all connection states', async () => {
      const state1: ConnectionState = {
        connectionId: 'test-connection-1',
        status: ConnectionStatus.Connected,
        config: {
          host: 'example1.com',
          port: 22,
          username: 'testuser1',
          authMethod: 'password',
          password: 'testpass1'
        },
        lastActivity: new Date(),
        reconnectAttempts: 0
      };
      
      const state2: ConnectionState = {
        connectionId: 'test-connection-2',
        status: ConnectionStatus.Disconnected,
        config: {
          host: 'example2.com',
          port: 22,
          username: 'testuser2',
          authMethod: 'password',
          password: 'testpass2'
        },
        lastActivity: new Date(),
        reconnectAttempts: 1
      };
      
      storedStates = [state1, state2];
      
      await stateManager.clearConnectionStates();
      
      expect(storedStates).toHaveLength(0);
    });
  });
});