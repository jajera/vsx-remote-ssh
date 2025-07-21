import * as vscode from 'vscode';
import { MountManager, MountPoint, MountStatus } from '../interfaces/mount';
import { SSHConnectionManager } from '../interfaces/ssh';

/**
 * Configuration for reconnection handling
 */
export interface ReconnectionConfig {
  /**
   * Maximum number of reconnection attempts
   */
  maxReconnectionAttempts: number;
  
  /**
   * Initial delay before first reconnection attempt (ms)
   */
  initialReconnectionDelay: number;
  
  /**
   * Maximum delay between reconnection attempts (ms)
   */
  maxReconnectionDelay: number;
  
  /**
   * Factor to increase delay by after each attempt
   */
  reconnectionBackoffFactor: number;
  
  /**
   * Whether to show notifications for reconnection attempts
   */
  showReconnectionNotifications: boolean;
  
  /**
   * Whether to automatically reconnect when connection is lost
   */
  autoReconnect: boolean;
}

/**
 * Default configuration for reconnection handling
 */
export const DefaultReconnectionConfig: ReconnectionConfig = {
  maxReconnectionAttempts: 5,
  initialReconnectionDelay: 1000, // 1 second
  maxReconnectionDelay: 30000, // 30 seconds
  reconnectionBackoffFactor: 1.5,
  showReconnectionNotifications: true,
  autoReconnect: true
};

/**
 * Status of a reconnection attempt
 */
export enum ReconnectionStatus {
  NotAttempted = 'not_attempted',
  InProgress = 'in_progress',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Cancelled = 'cancelled'
}

/**
 * Information about a reconnection attempt
 */
export interface ReconnectionAttempt {
  mountId: string;
  connectionId: string;
  attemptNumber: number;
  status: ReconnectionStatus;
  startTime: Date;
  endTime?: Date;
  error?: Error;
}

/**
 * Handler for reconnecting to remote mounts when connection is lost
 */
export class ReconnectionHandler {
  private mountManager: MountManager;
  private connectionManager: SSHConnectionManager;
  private config: ReconnectionConfig;
  private reconnectionAttempts: Map<string, ReconnectionAttempt> = new Map();
  private reconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly _onDidChangeReconnectionStatus = new vscode.EventEmitter<ReconnectionAttempt>();
  readonly onDidChangeReconnectionStatus = this._onDidChangeReconnectionStatus.event;
  
  /**
   * Create a new ReconnectionHandler
   * @param mountManager Mount manager
   * @param connectionManager SSH connection manager
   * @param config Configuration for reconnection handling
   */
  constructor(
    mountManager: MountManager,
    connectionManager: SSHConnectionManager,
    config: Partial<ReconnectionConfig> = {}
  ) {
    this.mountManager = mountManager;
    this.connectionManager = connectionManager;
    this.config = {
      ...DefaultReconnectionConfig,
      ...config
    };
    
    // Listen for mount status changes
    this.mountManager.onDidChangeMountPoints(this.handleMountPointsChanged.bind(this));
    
    // Note: Connection status changes will be handled by the connection manager
    // when it implements proper event emission
  }
  
  /**
   * Handle changes to mount points
   * @param mountPoints Updated mount points
   */
  private handleMountPointsChanged(mountPoints: MountPoint[]): void {
    // Check for disconnected mounts that need reconnection
    for (const mountPoint of mountPoints) {
      if (mountPoint.status === MountStatus.Disconnected && 
          mountPoint.options.autoReconnect &&
          this.config.autoReconnect) {
        this.scheduleReconnection(mountPoint);
      }
    }
  }
  
  /**
   * Handle changes to connection status
   * @param connectionId ID of the connection
   * @param status New status
   */
  private handleConnectionStatusChanged(connectionId: string, status: string): void {
    // If connection is disconnected, check for affected mounts
    if (status === 'disconnected') {
      const mountPoints = this.mountManager.getMountPoints();
      
      for (const mountPoint of mountPoints) {
        if (mountPoint.connectionId === connectionId && 
            mountPoint.status === MountStatus.Connected) {
          // Update mount status to disconnected
          this.mountManager.updateMountStatus(mountPoint.id, MountStatus.Disconnected);
          
          // Schedule reconnection if auto-reconnect is enabled
          if (mountPoint.options.autoReconnect && this.config.autoReconnect) {
            this.scheduleReconnection(mountPoint);
          }
        }
      }
    } else if (status === 'connected') {
      // If connection is connected, check for affected mounts
      const mountPoints = this.mountManager.getMountPoints();
      
      for (const mountPoint of mountPoints) {
        if (mountPoint.connectionId === connectionId && 
            mountPoint.status === MountStatus.Disconnected) {
          // Update mount status to connected
          this.mountManager.updateMountStatus(mountPoint.id, MountStatus.Connected);
          
          // Cancel any pending reconnection attempts
          this.cancelReconnection(mountPoint.id);
        }
      }
    }
  }
  
  /**
   * Schedule a reconnection attempt for a mount
   * @param mountPoint Mount point to reconnect
   * @param attemptNumber Current attempt number (defaults to 1)
   */
  private scheduleReconnection(mountPoint: MountPoint, attemptNumber: number = 1): void {
    // Check if we've reached the maximum number of attempts
    if (attemptNumber > this.config.maxReconnectionAttempts) {
      console.log(`Maximum reconnection attempts reached for mount ${mountPoint.id}`);
      
      // Create a failed reconnection attempt
      const attempt: ReconnectionAttempt = {
        mountId: mountPoint.id,
        connectionId: mountPoint.connectionId,
        attemptNumber,
        status: ReconnectionStatus.Failed,
        startTime: new Date(),
        endTime: new Date(),
        error: new Error('Maximum reconnection attempts reached')
      };
      
      this.reconnectionAttempts.set(mountPoint.id, attempt);
      this._onDidChangeReconnectionStatus.fire(attempt);
      
      // Show notification if enabled
      if (this.config.showReconnectionNotifications) {
        vscode.window.showErrorMessage(
          `Failed to reconnect to mount "${mountPoint.displayName}" after ${attemptNumber - 1} attempts.`,
          'Retry'
        ).then(selection => {
          if (selection === 'Retry') {
            // Reset attempt counter and try again
            this.scheduleReconnection(mountPoint, 1);
          }
        });
      }
      
      return;
    }
    
    // Calculate delay for this attempt using exponential backoff
    const delay = Math.min(
      this.config.initialReconnectionDelay * Math.pow(this.config.reconnectionBackoffFactor, attemptNumber - 1),
      this.config.maxReconnectionDelay
    );
    
    // Cancel any existing timer
    this.cancelReconnection(mountPoint.id);
    
    // Create a reconnection attempt
    const attempt: ReconnectionAttempt = {
      mountId: mountPoint.id,
      connectionId: mountPoint.connectionId,
      attemptNumber,
      status: ReconnectionStatus.NotAttempted,
      startTime: new Date()
    };
    
    this.reconnectionAttempts.set(mountPoint.id, attempt);
    
    // Schedule the reconnection
    const timer = setTimeout(() => {
      this.attemptReconnection(mountPoint, attemptNumber);
    }, delay);
    
    this.reconnectionTimers.set(mountPoint.id, timer);
    
    // Show notification if enabled and this is the first attempt
    if (this.config.showReconnectionNotifications && attemptNumber === 1) {
      vscode.window.showInformationMessage(
        `Connection lost to mount "${mountPoint.displayName}". Attempting to reconnect...`
      );
    }
    
    console.log(`Scheduled reconnection attempt ${attemptNumber} for mount ${mountPoint.id} in ${delay}ms`);
  }
  
  /**
   * Attempt to reconnect to a mount
   * @param mountPoint Mount point to reconnect
   * @param attemptNumber Current attempt number
   */
  private async attemptReconnection(mountPoint: MountPoint, attemptNumber: number): Promise<void> {
    console.log(`Attempting reconnection ${attemptNumber} for mount ${mountPoint.id}`);
    
    // Update the reconnection attempt status
    const attempt = this.reconnectionAttempts.get(mountPoint.id);
    if (attempt) {
      attempt.status = ReconnectionStatus.InProgress;
      this._onDidChangeReconnectionStatus.fire(attempt);
    }
    
    try {
      // Get the connection
      const connection = this.connectionManager.getConnection(mountPoint.connectionId);
      
      if (!connection) {
        throw new Error(`Connection ${mountPoint.connectionId} not found`);
      }
      
      // Check if the connection is already connected
      if (connection.status === 'connected') {
        // Update mount status
        this.mountManager.updateMountStatus(mountPoint.id, MountStatus.Connected);
        
        // Update the reconnection attempt status
        if (attempt) {
          attempt.status = ReconnectionStatus.Succeeded;
          attempt.endTime = new Date();
          this._onDidChangeReconnectionStatus.fire(attempt);
        }
        
<<<<<<< HEAD
        // Show progress notification for current attempt
        vscode.window.showInformationMessage(
          `Reconnection attempt ${attempt}/${maxAttempts} to ${connection.config.host}...`
        );
        
        // Attempt to connect
        await connection.reconnect();
        console.log(`Successfully reconnected to ${connection.config.host}`);
        
        // Show success notification
          vscode.window.showInformationMessage(
          `Successfully reconnected to ${connection.config.host}`
        );
        
        // Update connection state
        if (this.stateManager) {
          await this.stateManager.updateConnectionState(connection.id, {
            status: ConnectionStatus.Connected,
            lastActivity: new Date(),
            reconnectAttempts: 0
          });
        }
        
        return;
      } catch (error) {
        console.warn(`Reconnection attempt ${attempt} failed for ${connection.config.host}:`, error);
        
        // Get error type to determine if we should continue retrying
        const sshError = this.classifySSHError(error as Error, connection.id);
        
        // If this is a non-retryable error, stop reconnection attempts
        if (this.shouldStopRetrying(sshError.type)) {
          console.error(`Stopping reconnection attempts due to non-retryable error: ${sshError.type}`);
          connection.status = ConnectionStatus.Error;
          
          // Show error notification with details
          vscode.window.showErrorMessage(
            `Cannot reconnect to ${connection.config.host}: ${sshError.message}`,
            'Show Details'
          ).then(selection => {
            if (selection === 'Show Details') {
              this.showTroubleshootingSteps(sshError);
            }
          });
          
          // Update connection state
          if (this.stateManager) {
            await this.stateManager.updateConnectionState(connection.id, {
              status: ConnectionStatus.Error,
              lastError: sshError,
              reconnectAttempts: attempt
            });
          }
          
          throw error;
        }
        
        // If this is the last attempt, give up
        if (attempt === maxAttempts) {
          console.error(`Failed to reconnect to ${connection.config.host} after ${maxAttempts} attempts`);
          connection.status = ConnectionStatus.Error;
          
          // Show error notification with retry option
          vscode.window.showErrorMessage(
            `Failed to reconnect to ${connection.config.host} after ${maxAttempts} attempts`,
            'Retry',
            'Show Details'
          ).then(selection => {
            if (selection === 'Retry') {
              // Reset reconnect attempts and try again
              this.attemptReconnection(connection).catch(err => {
                console.error('Retry failed:', err);
              });
            } else if (selection === 'Show Details') {
              this.showTroubleshootingSteps(sshError);
            }
          });
          
          // Update connection state
          if (this.stateManager) {
            await this.stateManager.updateConnectionState(connection.id, {
              status: ConnectionStatus.Error,
              lastError: sshError,
              reconnectAttempts: attempt
            });
          }
          
          throw error;
        }
        
        // Wait before next attempt using exponential backoff with jitter
        const delay = this.calculateBackoffDelay(attempt, initialDelay, backoffFactor, maxDelay);
        console.log(`Waiting ${delay}ms before next reconnection attempt`);
        
        // Update connection state with current attempt count
        if (this.stateManager) {
          await this.stateManager.updateConnectionState(connection.id, {
            reconnectAttempts: attempt
          });
        }
        
        // Wait for the calculated delay
        await new Promise(resolve => {
          setTimeout(resolve, delay);
        });
      }
    }
  } finally {
    // Always remove from active reconnections
    this.activeReconnections.delete(connection.id);
    }
  }
  
  /**
   * Handles SSH errors and determines if reconnection should be attempted
   * @param error The error that occurred
   * @param connection The connection that experienced the error
   * @returns Promise that resolves when error is handled
   */
  public async handleSSHError(error: Error, connection: SSHConnection): Promise<void> {
    const sshError = this.classifySSHError(error, connection.id);
    
    // Update connection state with error
    if (this.stateManager) {
      await this.stateManager.updateConnectionState(connection.id, {
        status: ConnectionStatus.Error,
        lastError: sshError
      });
    }
    
    // Show error to user
    vscode.window.showErrorMessage(
      `SSH Connection Error: ${sshError.message}`,
      'Show Details',
      'Retry'
    ).then(selection => {
      if (selection === 'Show Details') {
        this.showTroubleshootingSteps(sshError);
      } else if (selection === 'Retry') {
        this.attemptReconnection(connection).catch(err => {
          console.error('Retry failed:', err);
        });
      }
    });
    
    // Log error for debugging
    console.error(`SSH Error for connection ${connection.id}:`, {
      type: sshError.type,
      message: sshError.message,
      originalError: sshError.originalError?.message
    });
  }
  
  /**
   * Checks if a connection is healthy and attempts reconnection if needed
   * @param connection The connection to check
   * @returns Promise that resolves when health check is complete
   */
  public async checkConnectionHealth(connection: SSHConnection): Promise<void> {
    if (connection.status === ConnectionStatus.Connected) {
      try {
        // Try to execute a simple command to check if connection is still alive
        await connection.execute('echo "health_check"');
      } catch (error) {
        console.warn(`Connection ${connection.id} appears to be dead, marking as reconnecting`);
        connection.status = ConnectionStatus.Reconnecting;
        
        // Attempt automatic reconnection
        this.attemptReconnection(connection).catch(err => {
          console.error(`Failed to reconnect to ${connection.id}:`, err);
        });
      }
    }
  }
  
  /**
   * Shows troubleshooting steps for an SSH error
   * @param sshError The SSH error to show troubleshooting steps for
   */
  public showTroubleshootingSteps(sshError: SSHError): void {
    try {
      // Create a markdown string with troubleshooting information
      let markdown = new vscode.MarkdownString();
      markdown.appendMarkdown(`# SSH Connection Error\n\n`);
      markdown.appendMarkdown(`**Error**: ${sshError.message}\n\n`);
      
      if (sshError.troubleshootingSteps && sshError.troubleshootingSteps.length > 0) {
        markdown.appendMarkdown('## Suggested steps:\n\n');
        sshError.troubleshootingSteps.forEach(step => {
          markdown.appendMarkdown(`- ${step}\n`);
        });
=======
        // Show notification if enabled
        if (this.config.showReconnectionNotifications) {
          vscode.window.showInformationMessage(
            `Successfully reconnected to mount "${mountPoint.displayName}".`
          );
        }
        
        return;
>>>>>>> 3679f3c (feat: add remote folder mount feature)
      }
      
      // Try to reconnect
      await this.connectionManager.reconnect(mountPoint.connectionId);
      
      // Update mount status
      this.mountManager.updateMountStatus(mountPoint.id, MountStatus.Connected);
      
      // Update the reconnection attempt status
      if (attempt) {
        attempt.status = ReconnectionStatus.Succeeded;
        attempt.endTime = new Date();
        this._onDidChangeReconnectionStatus.fire(attempt);
      }
      
      // Show notification if enabled
      if (this.config.showReconnectionNotifications) {
        vscode.window.showInformationMessage(
          `Successfully reconnected to mount "${mountPoint.displayName}".`
        );
      }
    } catch (error) {
      console.error(`Reconnection attempt ${attemptNumber} failed for mount ${mountPoint.id}:`, error);
      
      // Update the reconnection attempt status
      if (attempt) {
        attempt.status = ReconnectionStatus.Failed;
        attempt.endTime = new Date();
        attempt.error = error as Error;
        this._onDidChangeReconnectionStatus.fire(attempt);
      }
      
      // Schedule another attempt
      this.scheduleReconnection(mountPoint, attemptNumber + 1);
    }
  }
  
  /**
   * Cancel a reconnection attempt
   * @param mountId ID of the mount
   */
  cancelReconnection(mountId: string): void {
    // Clear the timer
    const timer = this.reconnectionTimers.get(mountId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectionTimers.delete(mountId);
    }
    
    // Update the reconnection attempt status
    const attempt = this.reconnectionAttempts.get(mountId);
    if (attempt && attempt.status !== ReconnectionStatus.Succeeded) {
      attempt.status = ReconnectionStatus.Cancelled;
      attempt.endTime = new Date();
      this._onDidChangeReconnectionStatus.fire(attempt);
    }
  }
  
  /**
   * Manually trigger a reconnection attempt for a mount
   * @param mountId ID of the mount to reconnect
   */
  async reconnect(mountId: string): Promise<void> {
    const mountPoint = this.mountManager.getMountPointById(mountId);
    if (!mountPoint) {
      throw new Error(`Mount point not found: ${mountId}`);
    }
    
    // Cancel any pending reconnection attempts
    this.cancelReconnection(mountId);
    
    // Update mount status
    this.mountManager.updateMountStatus(mountId, MountStatus.Connecting);
    
    // Attempt reconnection
    await this.attemptReconnection(mountPoint, 1);
  }
  
  /**
   * Get the current reconnection status for a mount
   * @param mountId ID of the mount
   * @returns Reconnection attempt if available, undefined otherwise
   */
  getReconnectionStatus(mountId: string): ReconnectionAttempt | undefined {
    return this.reconnectionAttempts.get(mountId);
  }
  
  /**
   * Get all current reconnection attempts
   * @returns Map of mount IDs to reconnection attempts
   */
  getAllReconnectionAttempts(): Map<string, ReconnectionAttempt> {
    return new Map(this.reconnectionAttempts);
  }
  
  /**
   * Dispose the reconnection handler
   */
  dispose(): void {
    // Clear all timers
    for (const timer of this.reconnectionTimers.values()) {
      clearTimeout(timer);
    }
    
    this.reconnectionTimers.clear();
    this.reconnectionAttempts.clear();
  }
}