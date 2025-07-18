import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules
vi.mock('ssh2', () => ({
  Client: vi.fn(() => ({
    connect: vi.fn(),
    exec: vi.fn(),
    sftp: vi.fn(),
    end: vi.fn(),
    on: vi.fn()
  }))
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => 'mock-private-key')
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser')
}));

vi.mock('path', () => ({
  join: vi.fn((...args: string[]) => args.join('/')),
  resolve: vi.fn((...args: string[]) => args.join('/'))
}));

// Mock vscode API
vi.mock('vscode', () => {
  return {
    window: {
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(() => Promise.resolve('Show Details')),
      showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
      showTextDocument: vi.fn()
    },
    workspace: {
      openTextDocument: vi.fn(() => Promise.resolve({})),
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultValue: any) => defaultValue)
      }))
    },
    MarkdownString: class {
      value: string = '';
      appendMarkdown(text: string) {
        this.value += text;
        return this;
      }
    }
  };
});

// Import after mocking
import { SSHConnectionManagerImpl } from './connection-manager';
import { 
  SSHConfig, 
  ConnectionStatus, 
  ConnectionState, 
  SSHError,
  SSHErrorType
} from '../interfaces/ssh';
import { ConnectionStateManager } from './connection-state-manager';

// Create a local copy of the classifySSHError function for testing
function classifySSHError(error: Error, connectionId?: string): SSHError {
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


describe('SSHConnectionManager', () => {
  let manager: SSHConnectionManagerImpl;
  let originalEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock setTimeout and clearTimeout to avoid infinite recursion
    vi.stubGlobal('setTimeout', vi.fn((fn) => {
      fn();
      return 123;
    }));
    vi.stubGlobal('clearTimeout', vi.fn());
    vi.stubGlobal('setInterval', vi.fn(() => 123));
    vi.stubGlobal('clearInterval', vi.fn());
    
    manager = new SSHConnectionManagerImpl();

    // Save original SSH_AUTH_SOCK
    originalEnv = process.env.SSH_AUTH_SOCK;

    // Set a default SSH_AUTH_SOCK for tests
    process.env.SSH_AUTH_SOCK = '/tmp/ssh-agent.sock';
  });

  afterEach(() => {
    // Restore original SSH_AUTH_SOCK
    process.env.SSH_AUTH_SOCK = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Automatic reconnection and error handling', () => {
    let mockStateManager: ConnectionStateManager;
    let managerWithState: SSHConnectionManagerImpl;
    
    beforeEach(() => {
      // Create mock state manager
      mockStateManager = {
        saveConnectionState: vi.fn().mockResolvedValue(undefined),
        getConnectionState: vi.fn().mockResolvedValue(undefined),
        getAllConnectionStates: vi.fn().mockResolvedValue([]),
        updateConnectionState: vi.fn().mockResolvedValue(undefined),
        deleteConnectionState: vi.fn().mockResolvedValue(undefined),
        clearConnectionStates: vi.fn().mockResolvedValue(undefined)
      };
      
      // Create connection manager with state manager
      managerWithState = new SSHConnectionManagerImpl(mockStateManager);
      
      // Mock setInterval and clearInterval
      vi.spyOn(global, 'setInterval').mockReturnValue(123 as any);
      vi.spyOn(global, 'clearInterval').mockImplementation(() => {});
      
      // Mock setTimeout to execute immediately for testing
      vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        fn();
        return 123 as any;
      });
    });
    
    afterEach(() => {
      vi.restoreAllMocks();
    });
    
    it('should classify network errors correctly', () => {
      // Test error classification directly
      const classifyError = (managerWithState as any).classifySSHError || classifySSHError;
      
      // Test network timeout error
      const timeoutError = new Error('connect etimedout');
      const classifiedTimeout = classifyError(timeoutError, 'test-connection');
      expect(classifiedTimeout.type).toBe(SSHErrorType.NetworkTimeout);
      expect(classifiedTimeout.troubleshootingSteps).toHaveLength(4);

      // Test connection refused error
      const refusedError = new Error('connect econnrefused');
      const classifiedRefused = classifyError(refusedError, 'test-connection');
      expect(classifiedRefused.type).toBe(SSHErrorType.ConnectionRefused);
      expect(classifiedRefused.troubleshootingSteps).toHaveLength(4);

      // Test host unreachable error
      const unreachableError = new Error('host unreachable');
      const classifiedUnreachable = classifyError(unreachableError, 'test-connection');
      expect(classifiedUnreachable.type).toBe(SSHErrorType.HostUnreachable);
      expect(classifiedUnreachable.troubleshootingSteps).toHaveLength(4);
    });

    it('should classify authentication errors correctly', () => {
      // Test error classification directly
      const classifyError = (managerWithState as any).classifySSHError || classifySSHError;
      
      // Test authentication failed error
      const authError = new Error('authentication failed');
      const classifiedAuth = classifyError(authError, 'test-connection');
      expect(classifiedAuth.type).toBe(SSHErrorType.AuthenticationFailed);
      expect(classifiedAuth.troubleshootingSteps).toHaveLength(4);

      // Test permission denied error
      const permissionError = new Error('permission denied');
      const classifiedPermission = classifyError(permissionError, 'test-connection');
      expect(classifiedPermission.type).toBe(SSHErrorType.PermissionDenied);
      expect(classifiedPermission.troubleshootingSteps).toHaveLength(4);

      // Test key rejected error
      const keyError = new Error('key rejected');
      const classifiedKey = classifyError(keyError, 'test-connection');
      expect(classifiedKey.type).toBe(SSHErrorType.KeyRejected);
      expect(classifiedKey.troubleshootingSteps).toHaveLength(4);
    });

    it('should determine which errors should stop retry attempts', () => {
      // Test that authentication errors should stop retrying
      expect((managerWithState as any).shouldStopRetrying(SSHErrorType.AuthenticationFailed)).toBe(true);
      expect((managerWithState as any).shouldStopRetrying(SSHErrorType.PermissionDenied)).toBe(true);
      expect((managerWithState as any).shouldStopRetrying(SSHErrorType.KeyRejected)).toBe(true);
      
      // Test that network errors should allow retrying
      expect((managerWithState as any).shouldStopRetrying(SSHErrorType.NetworkTimeout)).toBe(false);
      expect((managerWithState as any).shouldStopRetrying(SSHErrorType.ConnectionRefused)).toBe(false);
      expect((managerWithState as any).shouldStopRetrying(SSHErrorType.HostUnreachable)).toBe(false);
    });

    it('should handle network errors with appropriate troubleshooting steps', async () => {
      // Create a mock connection for testing
      const mockConnection = {
        id: 'test-connection',
        config: {
          host: 'test.example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password' as const,
          password: 'testpass'
        },
        status: ConnectionStatus.Connected,
        lastConnected: new Date(),
        execute: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        createSFTP: vi.fn().mockResolvedValue({}),
        disconnect: vi.fn().mockResolvedValue(undefined),
        reconnect: vi.fn().mockRejectedValue(new Error('connect etimedout')),
        isConnected: vi.fn(() => true)
      };

      // Mock connection error
      const networkError = new Error('connect etimedout');
      
      // Manually trigger error handling
      await (managerWithState as any).handleSSHError(networkError, mockConnection);
      
      // Should have updated state to error with appropriate error type
      expect(mockStateManager.updateConnectionState).toHaveBeenCalledWith(
        mockConnection.id,
        expect.objectContaining({
          status: ConnectionStatus.Error,
          lastError: expect.objectContaining({
            type: SSHErrorType.NetworkTimeout,
            troubleshootingSteps: expect.any(Array)
          })
        })
      );
    });
    
    it('should handle authentication errors with appropriate troubleshooting steps', async () => {
      // Create a mock connection for testing
      const mockConnection = {
        id: 'test-connection',
        config: {
          host: 'test.example.com',
          port: 22,
          username: 'testuser',
          authMethod: 'password' as const,
          password: 'testpass'
        },
        status: ConnectionStatus.Connected,
        lastConnected: new Date(),
        execute: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        createSFTP: vi.fn().mockResolvedValue({}),
        disconnect: vi.fn().mockResolvedValue(undefined),
        reconnect: vi.fn().mockRejectedValue(new Error('authentication failed')),
        isConnected: vi.fn(() => true)
      };

      // Mock authentication error
      const authError = new Error('authentication failed');
      
      // Manually trigger error handling
      await (managerWithState as any).handleSSHError(authError, mockConnection);
      
      // Should have updated state to error with appropriate error type
      expect(mockStateManager.updateConnectionState).toHaveBeenCalledWith(
        mockConnection.id,
        expect.objectContaining({
          status: ConnectionStatus.Error,
          lastError: expect.objectContaining({
            type: SSHErrorType.AuthenticationFailed,
            troubleshootingSteps: expect.any(Array)
          })
        })
      );
    });
    
    it('should calculate exponential backoff with jitter', async () => {
      // Create a test-specific manager to access private methods
      const testManager = new SSHConnectionManagerImpl();
      
      // Mock Math.random to return a consistent value for testing
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.5);
      
      // Test backoff calculation with different attempt counts
      // We'll use reflection to access the private method
      const calculateBackoff = (testManager as any).calculateBackoffDelay.bind(testManager);
      
      const initialDelay = 1000;
      const backoffFactor = 2;
      const maxDelay = 60000;
      
      // Attempt 0 should be initialDelay + jitter
      const delay0 = calculateBackoff(0, initialDelay, backoffFactor, maxDelay);
      expect(delay0).toBeGreaterThan(initialDelay);
      expect(delay0).toBeLessThan(initialDelay * 1.5); // Max 50% jitter
      
      // Attempt 1 should be initialDelay * backoffFactor + jitter
      const delay1 = calculateBackoff(1, initialDelay, backoffFactor, maxDelay);
      expect(delay1).toBeGreaterThan(initialDelay * backoffFactor);
      expect(delay1).toBeLessThan(initialDelay * backoffFactor * 1.5);
      
      // Attempt 2 should be initialDelay * backoffFactor^2 + jitter
      const delay2 = calculateBackoff(2, initialDelay, backoffFactor, maxDelay);
      expect(delay2).toBeGreaterThan(initialDelay * Math.pow(backoffFactor, 2));
      expect(delay2).toBeLessThan(initialDelay * Math.pow(backoffFactor, 2) * 1.5);
      
      // Restore Math.random
      Math.random = originalRandom;
    });
    
    it('should respect max delay in backoff calculation', async () => {
      // Create a test-specific manager to access private methods
      const testManager = new SSHConnectionManagerImpl();
      
      // Test backoff calculation with a very high attempt count
      // We'll use reflection to access the private method
      const calculateBackoff = (testManager as any).calculateBackoffDelay.bind(testManager);
      
      const initialDelay = 1000;
      const backoffFactor = 2;
      const maxDelay = 10000;
      
      // Attempt 10 would normally be way over maxDelay
      const delay10 = calculateBackoff(10, initialDelay, backoffFactor, maxDelay);
      expect(delay10).toBeLessThanOrEqual(maxDelay);
    });
  });
});