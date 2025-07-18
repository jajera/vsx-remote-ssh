import * as vscode from 'vscode';
import { 
  SSHConnection, 
  ConnectionStatus, 
  ConnectionState,
  SSHError,
  SSHErrorType,
  SSHConfig
} from '../interfaces/ssh';
import { ConnectionStateManager } from './connection-state-manager';

// Default reconnection settings
const defaultMaxReconnectAttempts = 5;
const defaultReconnectBackoffFactor = 2;
const defaultReconnectInitialDelayMs = 1000;
const defaultReconnectMaxDelayMs = 60000;
const defaultReconnectTimeoutMs = 30000;

/**
 * Interface for the reconnection handler
 */
export interface ReconnectionHandler {
  /**
   * Attempts to reconnect to a disconnected SSH connection
   * @param connection The connection to reconnect
   * @returns Promise that resolves when reconnection is successful or rejects after max attempts
   */
  attemptReconnection(connection: SSHConnection): Promise<void>;
  
  /**
   * Handles SSH errors and determines if reconnection should be attempted
   * @param error The error that occurred
   * @param connection The connection that experienced the error
   * @returns Promise that resolves when error is handled
   */
  handleSSHError(error: Error, connection: SSHConnection): Promise<void>;
  
  /**
   * Checks if a connection is healthy and attempts reconnection if needed
   * @param connection The connection to check
   * @returns Promise that resolves when health check is complete
   */
  checkConnectionHealth(connection: SSHConnection): Promise<void>;
  
  /**
   * Shows troubleshooting steps for an SSH error
   * @param error The SSH error to show troubleshooting steps for
   */
  showTroubleshootingSteps(error: SSHError): void;
  
  /**
   * Attempts to reconnect with a timeout
   * @param connection The connection to reconnect
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that resolves when reconnection is successful or rejects after timeout
   */
  attemptReconnectionWithTimeout(connection: SSHConnection, timeoutMs?: number): Promise<void>;
  
  /**
   * Registers a callback to be called when a connection is reconnected
   * @param connectionId The ID of the connection to watch
   * @param callback The callback to call when the connection is reconnected
   * @returns A disposable that can be used to unregister the callback
   */
  onReconnected(connectionId: string, callback: () => void): { dispose: () => void };
}

/**
 * Implementation of the reconnection handler
 */
export class ReconnectionHandlerImpl implements ReconnectionHandler {
  private stateManager: ConnectionStateManager;
  private reconnectionCallbacks: Map<string, Set<() => void>> = new Map();
  private reconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly defaultMaxReconnectAttempts = 5;
  private readonly defaultReconnectBackoffFactor = 2;
  private readonly defaultReconnectInitialDelayMs = 1000;
  private readonly defaultReconnectMaxDelayMs = 60000;
  
  // Track active reconnection attempts to prevent duplicates
  private activeReconnections: Set<string> = new Set();
  
  /**
   * Creates a new reconnection handler
   * @param stateManager The connection state manager
   */
  constructor(stateManager: ConnectionStateManager) {
    this.stateManager = stateManager;
  }
  
  /**
   * Calculates the delay for reconnection attempts using exponential backoff with jitter
   * @param attemptCount Current attempt number (0-based)
   * @param initialDelayMs Initial delay in milliseconds
   * @param backoffFactor Factor to multiply delay by for each attempt
   * @param maxDelayMs Maximum delay in milliseconds
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(
    attemptCount: number,
    initialDelayMs: number,
    backoffFactor: number,
    maxDelayMs: number
  ): number {
    // Calculate base delay using exponential backoff
    const baseDelay = initialDelayMs * Math.pow(backoffFactor, attemptCount);
    
    // Apply jitter (random value between 0-50% of the base delay)
    // This helps prevent reconnection storms when multiple clients reconnect simultaneously
    const jitter = baseDelay * 0.5 * Math.random();
    
    // Return the delay with jitter, capped at maxDelayMs
    return Math.min(baseDelay + jitter, maxDelayMs);
  }
  
  /**
   * Determines if reconnection should be attempted based on error type
   * @param errorType The type of SSH error
   * @returns True if reconnection should be stopped, false if it should continue
   */
  private shouldStopRetrying(errorType: SSHErrorType): boolean {
    // Don't retry for certain error types
    const nonRetryableErrors = [
      SSHErrorType.AuthenticationFailed,
      SSHErrorType.PermissionDenied,
      SSHErrorType.KeyRejected,
      SSHErrorType.PasswordRejected,
      SSHErrorType.ConfigurationError
    ];
    
    return nonRetryableErrors.includes(errorType);
  }
  
  /**
   * Classifies an SSH error by type and provides troubleshooting steps
   * @param error The error to classify
   * @param connectionId Optional connection ID
   * @returns Classified SSH error
   */
  private classifySSHError(error: Error, connectionId?: string): SSHError {
    const errorMessage = error.message.toLowerCase();
    const timestamp = new Date();
    
    // Connection errors
    if (errorMessage.includes('connect etimedout') || errorMessage.includes('timeout')) {
      return {
        type: SSHErrorType.NetworkTimeout,
        message: 'Connection timed out while trying to reach the server',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Check if the server is online and reachable',
          'Verify that the hostname and port are correct',
          'Check if there are any firewalls blocking the connection',
          'Try increasing the connection timeout in settings'
        ]
      };
    }
    
    if (errorMessage.includes('connect econnrefused') || errorMessage.includes('connection refused')) {
      return {
        type: SSHErrorType.ConnectionRefused,
        message: 'Connection refused by the server',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Verify that the SSH service is running on the server',
          'Check if the port number is correct',
          'Ensure that the server\'s firewall allows SSH connections',
          'Try connecting with a different SSH client to verify the issue'
        ]
      };
    }
    
    if (errorMessage.includes('host unreachable') || errorMessage.includes('no route to host')) {
      return {
        type: SSHErrorType.HostUnreachable,
        message: 'Cannot reach the host server',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Check your network connection',
          'Verify that the hostname is correct',
          'Try connecting to the server from another network',
          'Check if the server is behind a VPN or firewall'
        ]
      };
    }
    
    if (errorMessage.includes('getaddrinfo') || errorMessage.includes('dns')) {
      return {
        type: SSHErrorType.DNSResolutionFailed,
        message: 'Failed to resolve the hostname',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Check if the hostname is spelled correctly',
          'Verify your DNS settings',
          'Try using an IP address instead of a hostname',
          'Check if your DNS server is functioning properly'
        ]
      };
    }
    
    // Authentication errors
    if (errorMessage.includes('authentication failed') || errorMessage.includes('auth failed')) {
      return {
        type: SSHErrorType.AuthenticationFailed,
        message: 'Authentication failed',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Verify that your username is correct',
          'Check if your password or SSH key is correct',
          'Ensure that your SSH key is properly configured on the server',
          'Check if the server allows your authentication method'
        ]
      };
    }
    
    if (errorMessage.includes('permission denied')) {
      return {
        type: SSHErrorType.PermissionDenied,
        message: 'Permission denied by the server',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Verify that your user account has permission to access the server',
          'Check if your SSH key is added to the authorized_keys file on the server',
          'Ensure that the permissions on your SSH key files are correct (chmod 600)',
          'Check the server\'s SSH configuration for any restrictions'
        ]
      };
    }
    
    if (errorMessage.includes('key') && (errorMessage.includes('rejected') || errorMessage.includes('invalid'))) {
      return {
        type: SSHErrorType.KeyRejected,
        message: 'SSH key was rejected by the server',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Verify that the correct SSH key is being used',
          'Check if the key is added to the authorized_keys file on the server',
          'Ensure that the key format is supported by the server',
          'Try regenerating your SSH key pair'
        ]
      };
    }
    
    if (errorMessage.includes('password') && (errorMessage.includes('rejected') || errorMessage.includes('incorrect'))) {
      return {
        type: SSHErrorType.PasswordRejected,
        message: 'Password was rejected by the server',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Verify that your password is correct',
          'Check if the server allows password authentication',
          'Ensure that your account is not locked due to too many failed attempts',
          'Try resetting your password on the server'
        ]
      };
    }
    
    // Protocol errors
    if (errorMessage.includes('protocol') || errorMessage.includes('handshake')) {
      return {
        type: SSHErrorType.ProtocolError,
        message: 'SSH protocol error occurred',
        originalError: error,
        timestamp,
        connectionId,
        troubleshootingSteps: [
          'Check if the server supports the SSH protocol version',
          'Verify that the server is configured correctly',
          'Try connecting with a different SSH client',
          'Check server logs for more details'
        ]
      };
    }
    
    // Default unknown error
    return {
      type: SSHErrorType.Unknown,
      message: error.message,
      originalError: error,
      timestamp,
      connectionId,
      troubleshootingSteps: [
        'Check the error message for clues',
        'Verify your connection settings',
        'Try connecting with a different SSH client',
        'Contact your system administrator if the problem persists'
      ]
    };
  }
  
  /**
   * Gets the maximum number of reconnection attempts from configuration
   * @returns Maximum number of reconnection attempts
   */
  private getMaxReconnectAttempts(): number {
    return vscode.workspace.getConfiguration('remote-ssh').get('reconnectAttempts', this.defaultMaxReconnectAttempts);
  }
  
  /**
   * Gets the reconnection backoff factor from configuration
   * @returns Reconnection backoff factor
   */
  private getReconnectBackoffFactor(): number {
    return vscode.workspace.getConfiguration('remote-ssh').get('reconnectBackoffFactor', this.defaultReconnectBackoffFactor);
  }
  
  /**
   * Gets the initial reconnection delay from configuration
   * @returns Initial reconnection delay in milliseconds
   */
  private getReconnectInitialDelayMs(): number {
    return vscode.workspace.getConfiguration('remote-ssh').get('reconnectInitialDelayMs', this.defaultReconnectInitialDelayMs);
  }
  
  /**
   * Gets the maximum reconnection delay from configuration
   * @returns Maximum reconnection delay in milliseconds
   */
  private getReconnectMaxDelayMs(): number {
    return vscode.workspace.getConfiguration('remote-ssh').get('reconnectMaxDelayMs', this.defaultReconnectMaxDelayMs);
  }
  
  /**
   * Updates the connection state with the provided updates
   * @param connection The connection to update
   * @param updates Partial updates to apply to the connection state
   * @returns Promise that resolves when the state is updated
   */
  private async updateConnectionState(
    connection: SSHConnection, 
    updates: Partial<ConnectionState> = {}
  ): Promise<void> {
    if (this.stateManager) {
      await this.stateManager.updateConnectionState(connection.id, {
        status: connection.status,
        lastActivity: new Date(),
        ...updates
      });
    }
  }
  
  /**
   * Attempts to reconnect to a disconnected SSH connection using exponential backoff
   * @param connection The connection to reconnect
   * @returns Promise that resolves when reconnection is successful or rejects after max attempts
   */
  public async attemptReconnection(connection: SSHConnection): Promise<void> {
    // Prevent multiple reconnection attempts for the same connection
    if (this.activeReconnections.has(connection.id)) {
      console.log(`Reconnection already in progress for ${connection.config.host}`);
      return;
    }
    
    // Mark this connection as having an active reconnection attempt
    this.activeReconnections.add(connection.id);
    
    try {
      // Get reconnection settings from config or use defaults
      const maxAttempts = connection.config.maxReconnectAttempts || this.getMaxReconnectAttempts();
      const initialDelay = connection.config.reconnectInitialDelayMs || this.getReconnectInitialDelayMs();
      const backoffFactor = connection.config.reconnectBackoffFactor || this.getReconnectBackoffFactor();
      const maxDelay = connection.config.reconnectMaxDelayMs || this.getReconnectMaxDelayMs();
      
      // Get current reconnect attempts from state manager or use 0
      let reconnectAttempts = 0;
      if (this.stateManager) {
        const state = await this.stateManager.getConnectionState(connection.id);
        reconnectAttempts = state?.reconnectAttempts || 0;
      }

      // Update connection status to reconnecting
      connection.status = ConnectionStatus.Reconnecting;
      
      // Notify user that reconnection is being attempted
      const cancelPromise = vscode.window.showInformationMessage(
        `Attempting to reconnect to ${connection.config.host}...`,
        'Cancel'
      ).then(selection => {
        if (selection === 'Cancel') {
          // If user cancels, stop reconnection attempts
          connection.status = ConnectionStatus.Disconnected;
          console.log(`Reconnection to ${connection.config.host} cancelled by user`);
          return true;
        }
        return false;
      });
      
      // Update connection state
      if (this.stateManager) {
        await this.stateManager.updateConnectionState(connection.id, {
          status: ConnectionStatus.Reconnecting,
          reconnectAttempts
        });
      }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check if reconnection was cancelled
      if (connection.status !== ConnectionStatus.Reconnecting) {
        throw new Error('Reconnection cancelled by user');
      }
      
      try {
        console.log(`Attempting to reconnect to ${connection.config.host} (attempt ${attempt}/${maxAttempts})`);
        
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
      }
      
      // Add error details
      markdown.appendMarkdown('\n## Error details:\n\n');
      markdown.appendMarkdown(`- **Error type**: ${sshError.type}\n`);
      markdown.appendMarkdown(`- **Timestamp**: ${sshError.timestamp.toLocaleString()}\n`);
      
      // Show the troubleshooting information in a new editor
      vscode.workspace.openTextDocument({
        content: markdown.value,
        language: 'markdown'
      }).then(doc => {
        vscode.window.showTextDocument(doc);
      });
    } catch (error) {
      // Fallback for tests or if vscode API is not available
      console.log('Troubleshooting steps:');
      console.log(sshError.troubleshootingSteps);
    }
  }

  /**
   * Attempts to reconnect with a timeout
   * @param connection The connection to reconnect
   * @param timeoutMs Timeout in milliseconds
   * @returns Promise that resolves when reconnection is successful or rejects after timeout
   */
  public async attemptReconnectionWithTimeout(connection: SSHConnection, timeoutMs: number = defaultReconnectTimeoutMs): Promise<void> {
    // Create a promise that rejects after the timeout
    const timeoutPromise = new Promise<void>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Reconnection to ${connection.config.host} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Ensure the timeout is cleared if the reconnection succeeds
      return () => clearTimeout(timeoutId);
    });

    // Create a promise for the reconnection attempt
    const reconnectPromise = this.attemptReconnection(connection);

    // Race the reconnection against the timeout
    try {
      await Promise.race([reconnectPromise, timeoutPromise]);
      
      // If reconnection succeeded before timeout, make sure we notify any callbacks
      if (connection.status === ConnectionStatus.Connected) {
        this.notifyReconnected(connection.id);
      }
    } catch (error) {
      // If the error is from the timeout, update the connection status
      if ((error as Error).message.includes('timed out')) {
        connection.status = ConnectionStatus.Error;
        
        // Update connection state
        if (this.stateManager) {
          await this.stateManager.updateConnectionState(connection.id, {
            status: ConnectionStatus.Error,
            lastError: {
              type: SSHErrorType.NetworkTimeout,
              message: `Reconnection timed out after ${timeoutMs}ms`,
              timestamp: new Date(),
              connectionId: connection.id,
              troubleshootingSteps: [
                'Check if the server is online and reachable',
                'Verify that the hostname and port are correct',
                'Check if there are any firewalls blocking the connection',
                'Try increasing the connection timeout in settings'
              ]
            }
          });
        }
        
        // Show error notification
        vscode.window.showErrorMessage(
          `Reconnection to ${connection.config.host} timed out after ${timeoutMs / 1000} seconds`,
          'Retry',
          'Cancel'
        ).then(selection => {
          if (selection === 'Retry') {
            this.attemptReconnectionWithTimeout(connection, timeoutMs).catch(err => {
              console.error('Retry failed:', err);
            });
          }
        });
      }
      
      throw error;
    }
  }

  /**
   * Registers a callback to be called when a connection is reconnected
   * @param connectionId The ID of the connection to watch
   * @param callback The callback to call when the connection is reconnected
   * @returns A disposable that can be used to unregister the callback
   */
  public onReconnected(connectionId: string, callback: () => void): { dispose: () => void } {
    // Initialize the set of callbacks for this connection if it doesn't exist
    if (!this.reconnectionCallbacks.has(connectionId)) {
      this.reconnectionCallbacks.set(connectionId, new Set());
    }
    
    // Add the callback to the set
    this.reconnectionCallbacks.get(connectionId)!.add(callback);
    
    // Return a disposable that removes the callback when disposed
    return {
      dispose: () => {
        const callbacks = this.reconnectionCallbacks.get(connectionId);
        if (callbacks) {
          callbacks.delete(callback);
          
          // Clean up the map entry if there are no more callbacks
          if (callbacks.size === 0) {
            this.reconnectionCallbacks.delete(connectionId);
          }
        }
      }
    };
  }

  /**
   * Notifies all registered callbacks that a connection has been reconnected
   * @param connectionId The ID of the connection that was reconnected
   */
  private notifyReconnected(connectionId: string): void {
    const callbacks = this.reconnectionCallbacks.get(connectionId);
    if (callbacks) {
      // Call each callback
      callbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error(`Error in reconnection callback for connection ${connectionId}:`, error);
        }
      });
    }
  }
}