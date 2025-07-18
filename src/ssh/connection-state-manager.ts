import * as vscode from 'vscode';
import { ConnectionState, ConnectionStatus, SSHConfig } from '../interfaces/ssh';

/**
 * Interface for the connection state manager
 */
export interface ConnectionStateManager {
  /**
   * Saves the state of a connection
   * @param state The connection state to save
   */
  saveConnectionState(state: ConnectionState): Promise<void>;
  
  /**
   * Gets the state of a connection by ID
   * @param connectionId The ID of the connection
   * @returns The connection state or undefined if not found
   */
  getConnectionState(connectionId: string): Promise<ConnectionState | undefined>;
  
  /**
   * Gets all saved connection states
   * @returns Array of connection states
   */
  getAllConnectionStates(): Promise<ConnectionState[]>;
  
  /**
   * Updates the state of a connection
   * @param connectionId The ID of the connection
   * @param updates Partial updates to apply to the connection state
   */
  updateConnectionState(connectionId: string, updates: Partial<ConnectionState>): Promise<void>;
  
  /**
   * Deletes the state of a connection
   * @param connectionId The ID of the connection to delete
   */
  deleteConnectionState(connectionId: string): Promise<void>;
  
  /**
   * Clears all connection states
   */
  clearConnectionStates(): Promise<void>;
}

/**
 * Implementation of the connection state manager
 * Handles saving and restoring connection states using VS Code's extension context
 */
export class ConnectionStateManagerImpl implements ConnectionStateManager {
  private static readonly CONNECTION_STATES_KEY = 'vsx-remote-ssh.connectionStates';
  private context: vscode.ExtensionContext;
  
  /**
   * Creates a new connection state manager
   * @param context VS Code extension context
   */
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  
  /**
   * Saves the state of a connection
   * @param state The connection state to save
   */
  async saveConnectionState(state: ConnectionState): Promise<void> {
    const states = await this.getAllConnectionStates();
    const existingIndex = states.findIndex(s => s.connectionId === state.connectionId);
    
    if (existingIndex >= 0) {
      states[existingIndex] = state;
    } else {
      states.push(state);
    }
    
    await this.context.globalState.update(ConnectionStateManagerImpl.CONNECTION_STATES_KEY, states);
  }
  
  /**
   * Gets the state of a connection by ID
   * @param connectionId The ID of the connection
   * @returns The connection state or undefined if not found
   */
  async getConnectionState(connectionId: string): Promise<ConnectionState | undefined> {
    const states = await this.getAllConnectionStates();
    return states.find(state => state.connectionId === connectionId);
  }
  
  /**
   * Gets all saved connection states
   * @returns Array of connection states
   */
  async getAllConnectionStates(): Promise<ConnectionState[]> {
    const states = this.context.globalState.get<ConnectionState[]>(
      ConnectionStateManagerImpl.CONNECTION_STATES_KEY, 
      []
    );
    return states ?? [];
  }
  
  /**
   * Updates the state of a connection
   * @param connectionId The ID of the connection
   * @param updates Partial updates to apply to the connection state
   */
  async updateConnectionState(connectionId: string, updates: Partial<ConnectionState>): Promise<void> {
    const states = await this.getAllConnectionStates();
    const existingIndex = states.findIndex(s => s.connectionId === connectionId);
    
    if (existingIndex >= 0) {
      states[existingIndex] = {
        ...states[existingIndex],
        ...updates,
        // Always update lastActivity when updating state
        lastActivity: updates.lastActivity || new Date()
      };
    } else {
      // Create new state if it doesn't exist
      const newState: ConnectionState = {
        connectionId,
        status: updates.status || ConnectionStatus.Disconnected,
        config: updates.config || {} as SSHConfig,
        lastActivity: new Date(),
        reconnectAttempts: 0,
        lastError: updates.lastError
      };
      states.push(newState);
    }
    
    await this.context.globalState.update(ConnectionStateManagerImpl.CONNECTION_STATES_KEY, states);
  }
  
  /**
   * Deletes the state of a connection
   * @param connectionId The ID of the connection to delete
   */
  async deleteConnectionState(connectionId: string): Promise<void> {
    const states = await this.getAllConnectionStates();
    const filteredStates = states.filter(state => state.connectionId !== connectionId);
    
    if (filteredStates.length !== states.length) {
      await this.context.globalState.update(ConnectionStateManagerImpl.CONNECTION_STATES_KEY, filteredStates);
    }
  }
  
  /**
   * Clears all connection states
   */
  async clearConnectionStates(): Promise<void> {
    await this.context.globalState.update(ConnectionStateManagerImpl.CONNECTION_STATES_KEY, []);
  }
}