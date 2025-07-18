import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSHConnection, ConnectionStatus } from '../interfaces/ssh';

// Mock vscode module before importing the implementation
vi.mock('vscode', () => {
  return {
    EventEmitter: class {
      constructor() {
        this.fire = vi.fn();
        this.event = vi.fn();
        this.dispose = vi.fn();
      }
      fire;
      event;
      dispose;
    }
  };
});

// Import the implementation after mocking
import { RemoteTerminalProviderImpl, RemoteTerminalImpl } from './remote-terminal-provider';

// Mock SSH Connection
const createMockConnection = (id: string, connected: boolean = true): SSHConnection => ({
  id,
  config: {
    host: 'test.example.com',
    port: 22,
    username: 'testuser',
    authMethod: 'password' as const,
    password: 'testpass'
  },
  status: connected ? ConnectionStatus.Connected : ConnectionStatus.Disconnected,
  lastConnected: new Date(),
  execute: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  createSFTP: vi.fn().mockResolvedValue({}),
  reconnect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(connected)
});

// Mock SSH Shell
class MockShell {
  write = vi.fn();
  resize = vi.fn();
  end = vi.fn();
  on = vi.fn();
}

describe('RemoteTerminalProvider', () => {
  let provider: RemoteTerminalProviderImpl;
  let connection: SSHConnection;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock connection
    connection = createMockConnection('test-connection');
    
    // Create provider
    provider = new RemoteTerminalProviderImpl();
    
    // Mock the _createShell method to return a MockShell
    vi.spyOn(provider as any, '_createShell').mockImplementation(() => {
      return Promise.resolve(new MockShell());
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should create a new terminal session', async () => {
    const terminal = await provider.createTerminal(connection);
    
    expect(terminal).toBeDefined();
    expect(terminal.connection).toBe(connection);
    
    // Verify the terminal was added to the active terminals
    const activeTerminals = provider.getActiveTerminals();
    expect(activeTerminals.length).toBe(1);
    expect(activeTerminals[0]).toBe(terminal);
  });
  
  it('should throw an error if the connection is not established', async () => {
    const disconnectedConnection = createMockConnection('disconnected', false);
    
    await expect(provider.createTerminal(disconnectedConnection)).rejects.toThrow(
      'Cannot create terminal: SSH connection is not established'
    );
  });
  
  it('should close a terminal session', async () => {
    // Create a terminal
    const terminal = await provider.createTerminal(connection);
    const terminalId = terminal.id;
    
    // Close the terminal
    await provider.closeTerminal(terminalId);
    
    // Verify the terminal was removed from active terminals
    const activeTerminals = provider.getActiveTerminals();
    expect(activeTerminals.length).toBe(0);
  });
});

describe('RemoteTerminal', () => {
  let connection: SSHConnection;
  let shell: MockShell;
  let terminal: RemoteTerminalImpl;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock connection
    connection = createMockConnection('test-connection');
    
    // Create mock shell
    shell = new MockShell();
    
    // Create terminal
    terminal = new RemoteTerminalImpl(connection, shell);
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should write data to the shell', async () => {
    await terminal.write('test data');
    
    expect(shell.write).toHaveBeenCalledWith('test data');
  });
  
  it('should resize the shell', async () => {
    await terminal.resize(120, 40);
    
    expect(shell.resize).toHaveBeenCalledWith(120, 40);
  });
  
  it('should dispose resources', () => {
    terminal.dispose();
    
    expect(shell.end).toHaveBeenCalled();
  });
});