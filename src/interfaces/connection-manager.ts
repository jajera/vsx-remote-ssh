/**
 * Connection Manager Interface
 * Defines the interface for managing SSH connections
 */
import { SSHConnection } from './ssh';

/**
 * Interface for managing SSH connections
 */
export interface ConnectionManager {
  /**
   * Get a connection by ID
   * @param id The connection ID
   * @returns The connection or undefined if not found
   */
  getConnectionById(id: string): SSHConnection | undefined;
  
  /**
   * Get all active connections
   * @returns Array of active connections
   */
  getActiveConnections(): SSHConnection[];
}