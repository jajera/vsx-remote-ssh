import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSHConnectionManager, SSHConnection, ConnectionStatus } from '../interfaces/ssh';

// Define FileChangeType constants before mocking
const FileChangeType = {
  Created: 1,
  Changed: 2,
  Deleted: 3
};

// Set NODE_ENV to test to avoid firing events in tests
process.env.NODE_ENV = 'test';

// Mock vscode module before importing the implementation
vi.mock('vscode', () => {
  return {
    EventEmitter: class {
      constructor() {
        this.fire = vi.fn();
      }
      event = vi.fn();
      fire;
      dispose = vi.fn();
    },
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64
    },
    FileChangeType: {
      Created: 1,
      Changed: 2,
      Deleted: 3
    },
    Uri: {
      parse: (value: string) => ({
        scheme: 'ssh',
        authority: value.split('://')[1]?.split('/')[0] || '',
        path: '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
        query: '',
        fragment: '',
        fsPath: '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
        with: vi.fn().mockImplementation((params) => {
          return {
            scheme: 'ssh',
            authority: value.split('://')[1]?.split('/')[0] || '',
            path: params.path || '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
            query: '',
            fragment: '',
            fsPath: params.path || '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
            with: vi.fn().mockImplementation(() => { return this; }),
            toString: vi.fn().mockReturnValue(`ssh://${value.split('://')[1]?.split('/')[0] || ''}${params.path || '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || '')}`)
          };
        }),
        toString: vi.fn().mockReturnValue(value),
        toJSON: vi.fn()
      })
    }
  };
});

// Patch for missing FileChangeType in test environment
import * as vscode from 'vscode';
if (!vscode.FileChangeType) {
  (vscode as any).FileChangeType = { Created: 1, Changed: 2, Deleted: 3 };
}

// Import after mocking
import { RemoteFileSystemProviderImpl } from './remote-file-system-provider';

// Mock SftpClient
class MockSftpClient {
  stat = vi.fn();
  list = vi.fn();
  get = vi.fn();
  put = vi.fn();
  mkdir = vi.fn();
  rmdir = vi.fn();
  delete = vi.fn();
  rename = vi.fn();
  end = vi.fn();
}

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
  createSFTP: vi.fn().mockResolvedValue(new MockSftpClient()),
  reconnect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(connected)
});

// Mock SSH Connection Manager
const createMockConnectionManager = (): SSHConnectionManager => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  getActiveConnections: vi.fn().mockReturnValue([]),
  reconnect: vi.fn(),
  getConnection: vi.fn().mockImplementation((id: string) => {
    if (id === 'test-connection') {
      return createMockConnection('test-connection');
    }
    if (id === 'disconnected-connection') {
      return createMockConnection('disconnected-connection', false);
    }
    return undefined;
  }),
  disconnectAll: vi.fn(),
  restoreConnections: vi.fn(),
  dispose: vi.fn()
});

// Mock Uri helper function
const mockUri = (connectionId: string, path: string): vscode.Uri => {
  return {
    scheme: 'ssh',
    authority: connectionId,
    path,
    query: '',
    fragment: '',
    fsPath: path,
    with: vi.fn().mockImplementation((params) => {
      return {
        scheme: 'ssh',
        authority: connectionId,
        path: params.path || path,
        query: '',
        fragment: '',
        fsPath: params.path || path,
        with: vi.fn(),
        toString: vi.fn().mockReturnValue(`ssh://${connectionId}${params.path || path}`)
      };
    }),
    toString: vi.fn().mockReturnValue(`ssh://${connectionId}${path}`),
    toJSON: vi.fn()
  } as vscode.Uri;
};

describe('RemoteFileSystemProvider Watch', () => {
  let provider: RemoteFileSystemProviderImpl;
  let connectionManager: SSHConnectionManager;
  let mockSftpClient: MockSftpClient;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock connection manager
    connectionManager = createMockConnectionManager();
    
    // Create provider
    provider = new RemoteFileSystemProviderImpl(connectionManager);
    
    // Get the mock SFTP client that will be returned by createSFTP
    mockSftpClient = new MockSftpClient();
    const mockConnection = createMockConnection('test-connection');
    (mockConnection.createSFTP as any).mockResolvedValue(mockSftpClient);
    (connectionManager.getConnection as any).mockImplementation((id: string) => {
      if (id === 'test-connection') {
        return mockConnection;
      }
      if (id === 'disconnected-connection') {
        return createMockConnection('disconnected-connection', false);
      }
      return undefined;
    });
    
    // Mock setTimeout to execute immediately in tests
    vi.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0 as any;
    });
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('watch', () => {
    it('should return a disposable object', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const disposable = provider.watch(uri, { recursive: true, excludes: [] });
      
      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
    });
    
    it('should track watched paths', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      provider.watch(uri, { recursive: true, excludes: [] });
      
      // Access private property for testing
      const watchedPaths = (provider as any).watchedPaths;
      expect(watchedPaths.has('test-connection')).toBe(true);
      expect(watchedPaths.get('test-connection').has('/path/to/file.txt')).toBe(true);
    });
    
    it('should increment reference count for already watched paths', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      provider.watch(uri, { recursive: true, excludes: [] });
      provider.watch(uri, { recursive: true, excludes: [] });
      
      // Access private property for testing
      const watchedPaths = (provider as any).watchedPaths;
      const watchInfo = watchedPaths.get('test-connection').get('/path/to/file.txt');
      expect(watchInfo.refCount).toBe(2);
    });
    
    it('should decrement reference count when disposing a watch', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const disposable1 = provider.watch(uri, { recursive: true, excludes: [] });
      const disposable2 = provider.watch(uri, { recursive: true, excludes: [] });
      
      // Dispose one watch
      disposable1.dispose();
      
      // Access private property for testing
      const watchedPaths = (provider as any).watchedPaths;
      const watchInfo = watchedPaths.get('test-connection').get('/path/to/file.txt');
      expect(watchInfo.refCount).toBe(1);
    });
  });
  
  describe('isExcluded', () => {
    it('should match exact filenames', () => {
      // Access private method for testing
      const isExcluded = (provider as any).isExcluded;
      
      expect(isExcluded('file.txt', ['file.txt'])).toBe(true);
      expect(isExcluded('file.txt', ['other.txt'])).toBe(false);
    });
    
    it('should match prefix patterns', () => {
      // Access private method for testing
      const isExcluded = (provider as any).isExcluded;
      
      expect(isExcluded('file.txt', ['file*'])).toBe(true);
      expect(isExcluded('other.txt', ['file*'])).toBe(false);
    });
    
    it('should match suffix patterns', () => {
      // Access private method for testing
      const isExcluded = (provider as any).isExcluded;
      
      expect(isExcluded('file.txt', ['*.txt'])).toBe(true);
      expect(isExcluded('file.log', ['*.txt'])).toBe(false);
    });
    
    it('should match substring patterns', () => {
      // Access private method for testing
      const isExcluded = (provider as any).isExcluded;
      
      expect(isExcluded('file.txt', ['*ile*'])).toBe(true);
      expect(isExcluded('document.pdf', ['*ile*'])).toBe(false);
    });
  });
});