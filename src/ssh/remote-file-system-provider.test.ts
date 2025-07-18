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
      event = vi.fn();
      fire = vi.fn();
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
        with: vi.fn().mockReturnThis(),
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
    with: vi.fn().mockReturnThis(),
    toString: vi.fn().mockReturnValue(`ssh://${connectionId}${path}`),
    toJSON: vi.fn()
  } as vscode.Uri;
};

describe('RemoteFileSystemProvider', () => {
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
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('readFile', () => {
    it('should read a file successfully', async () => {
      // Setup mock responses
      const fileContent = Buffer.from('file content');
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: fileContent.length, mtime: Date.now() / 1000 });
      mockSftpClient.get.mockResolvedValue(fileContent);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const result = await provider.readFile(uri);
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/file.txt');
      expect(mockSftpClient.get).toHaveBeenCalledWith('/path/to/file.txt');
      expect(result).toEqual(new Uint8Array(fileContent));
    });
    
    it('should throw FileNotFound for non-existent files', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockRejectedValue({ code: 'ENOENT' });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/nonexistent.txt');
      await expect(provider.readFile(uri)).rejects.toMatchObject({
        code: 'FileNotFound',
        message: expect.stringContaining('File not found')
      });
    });
    
    it('should throw error when trying to read a directory as file', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true, isFile: false, size: 0, mtime: Date.now() / 1000 });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/directory');
      await expect(provider.readFile(uri)).rejects.toMatchObject({
        code: 'FileNotFound',
        message: expect.stringContaining('Cannot read directory as file')
      });
    });
  });
  
  describe('writeFile', () => {
    it('should write a file successfully', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist
      mockSftpClient.put.mockResolvedValue(undefined);
      mockSftpClient.mkdir.mockResolvedValue(undefined);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const content = new Uint8Array(Buffer.from('new content'));
      await provider.writeFile(uri, content, { create: true, overwrite: false });
      
      // Verify results
      expect(mockSftpClient.put).toHaveBeenCalledWith(expect.any(Buffer), '/path/to/file.txt');
    });
    
    it('should overwrite an existing file when overwrite is true', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      mockSftpClient.put.mockResolvedValue(undefined);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const content = new Uint8Array(Buffer.from('updated content'));
      await provider.writeFile(uri, content, { create: true, overwrite: true });
      
      // Verify results
      expect(mockSftpClient.put).toHaveBeenCalledWith(expect.any(Buffer), '/path/to/file.txt');
    });
    
    it('should throw FileExists when overwrite is false and file exists', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const content = new Uint8Array(Buffer.from('updated content'));
      await expect(provider.writeFile(uri, content, { create: false, overwrite: false })).rejects.toMatchObject({
        code: 'FileExists',
        message: expect.stringContaining('File already exists')
      });
      
      // Verify put was not called
      expect(mockSftpClient.put).not.toHaveBeenCalled();
    });
    
    it('should throw FileNotFound when create is false and file does not exist', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/nonexistent.txt');
      const content = new Uint8Array(Buffer.from('new content'));
      await expect(provider.writeFile(uri, content, { create: false, overwrite: false })).rejects.toMatchObject({
        code: 'FileNotFound',
        message: expect.stringContaining('File not found')
      });
      
      // Verify put was not called
      expect(mockSftpClient.put).not.toHaveBeenCalled();
    });
  });
  
  describe('createDirectory', () => {
    it('should create a directory successfully', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockRejectedValue({ code: 'ENOENT' }); // Directory doesn't exist
      mockSftpClient.mkdir.mockResolvedValue(undefined);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/new-directory');
      await provider.createDirectory(uri);
      
      // Verify results
      expect(mockSftpClient.mkdir).toHaveBeenCalledWith('/path/to/new-directory', true);
    });
    
    it('should do nothing if directory already exists', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true, isFile: false, size: 0, mtime: Date.now() / 1000 });
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/existing-directory');
      await provider.createDirectory(uri);
      
      // Verify mkdir was not called
      expect(mockSftpClient.mkdir).not.toHaveBeenCalled();
    });
    
    it('should throw FileExists if path exists but is not a directory', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/file.txt');
      await expect(provider.createDirectory(uri)).rejects.toMatchObject({
        code: 'FileExists',
        message: expect.stringContaining('Path exists but is not a directory')
      });
      
      // Verify mkdir was not called
      expect(mockSftpClient.mkdir).not.toHaveBeenCalled();
    });
  });
  
  describe('readDirectory', () => {
    it('should read directory contents successfully', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true, isFile: false, size: 0, mtime: Date.now() / 1000 });
      mockSftpClient.list.mockResolvedValue([
        { name: 'file1.txt', type: '-', size: 100, mtime: Date.now() / 1000 },
        { name: 'subdir', type: 'd', size: 0, mtime: Date.now() / 1000 },
        { name: 'symlink', type: 'l', size: 0, mtime: Date.now() / 1000 }
      ]);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/directory');
      const result = await provider.readDirectory(uri);
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/directory');
      expect(mockSftpClient.list).toHaveBeenCalledWith('/path/to/directory');
      expect(result).toEqual([
        ['file1.txt', vscode.FileType.File],
        ['subdir', vscode.FileType.Directory],
        ['symlink', vscode.FileType.SymbolicLink]
      ]);
    });
    
    it('should throw FileNotFound if directory does not exist', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockRejectedValue({ code: 'ENOENT' });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/nonexistent-directory');
      await expect(provider.readDirectory(uri)).rejects.toMatchObject({
        code: 'FileNotFound',
        message: expect.stringContaining('Directory not found')
      });
      
      // Verify list was not called
      expect(mockSftpClient.list).not.toHaveBeenCalled();
    });
    
    it('should throw FileNotFound if path is not a directory', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/file.txt');
      await expect(provider.readDirectory(uri)).rejects.toMatchObject({
        code: 'FileNotFound',
        message: expect.stringContaining('Path is not a directory')
      });
      
      // Verify list was not called
      expect(mockSftpClient.list).not.toHaveBeenCalled();
    });
  });
  
  describe('delete', () => {
    it('should delete a file successfully', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      mockSftpClient.delete.mockResolvedValue(undefined);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/file.txt');
      await provider.delete(uri, { recursive: false });
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/file.txt');
      expect(mockSftpClient.delete).toHaveBeenCalledWith('/path/to/file.txt');
    });
    
    it('should delete an empty directory successfully', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true, isFile: false, size: 0, mtime: Date.now() / 1000 });
      mockSftpClient.list.mockResolvedValue([]); // Empty directory
      mockSftpClient.rmdir.mockResolvedValue(undefined);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/empty-directory');
      await provider.delete(uri, { recursive: false });
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/empty-directory');
      expect(mockSftpClient.list).toHaveBeenCalledWith('/path/to/empty-directory');
      expect(mockSftpClient.rmdir).toHaveBeenCalledWith('/path/to/empty-directory');
    });
    
    it('should delete a non-empty directory when recursive is true', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true, isFile: false, size: 0, mtime: Date.now() / 1000 });
      mockSftpClient.rmdir.mockResolvedValue(undefined);
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/non-empty-directory');
      await provider.delete(uri, { recursive: true });
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/non-empty-directory');
      expect(mockSftpClient.rmdir).toHaveBeenCalledWith('/path/to/non-empty-directory', true);
    });
    
    it('should throw NoPermissions when trying to delete a non-empty directory without recursive option', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: true, isFile: false, size: 0, mtime: Date.now() / 1000 });
      mockSftpClient.list.mockResolvedValue([
        { name: 'file1.txt', type: '-', size: 100, mtime: Date.now() / 1000 }
      ]); // Non-empty directory
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/non-empty-directory');
      await expect(provider.delete(uri, { recursive: false })).rejects.toMatchObject({
        code: 'NoPermissions',
        message: expect.stringContaining('Cannot delete non-empty directory without recursive option')
      });
      
      // Verify rmdir was not called
      expect(mockSftpClient.rmdir).not.toHaveBeenCalled();
    });
    
    it('should throw FileNotFound if path does not exist', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockRejectedValue({ code: 'ENOENT' });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/nonexistent');
      await expect(provider.delete(uri, { recursive: false })).rejects.toMatchObject({
        code: 'FileNotFound',
        message: expect.stringContaining('Path not found')
      });
      
      // Verify delete and rmdir were not called
      expect(mockSftpClient.delete).not.toHaveBeenCalled();
      expect(mockSftpClient.rmdir).not.toHaveBeenCalled();
    });
  });
  
  describe('rename', () => {
    it('should rename a file successfully', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockImplementation(async (path) => {
        if (path === '/path/to/old-file.txt') {
          return { isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 };
        }
        const error = new Error('ENOENT');
        (error as any).code = 'ENOENT';
        throw error; // New path doesn't exist
      });
      mockSftpClient.rename.mockResolvedValue(undefined);
      
      // Call the method
      const oldUri = mockUri('test-connection', '/path/to/old-file.txt');
      const newUri = mockUri('test-connection', '/path/to/new-file.txt');
      await provider.rename(oldUri, newUri, { overwrite: false });
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/old-file.txt');
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/new-file.txt');
      expect(mockSftpClient.rename).toHaveBeenCalledWith('/path/to/old-file.txt', '/path/to/new-file.txt');
    });
    
    it('should overwrite destination when overwrite is true', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockImplementation(async (path) => {
        if (path === '/path/to/old-file.txt' || path === '/path/to/existing-file.txt') {
          return { isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 };
        }
        const error = new Error('ENOENT');
        (error as any).code = 'ENOENT';
        throw error;
      });
      mockSftpClient.delete.mockResolvedValue(undefined);
      mockSftpClient.rename.mockResolvedValue(undefined);
      
      // Call the method
      const oldUri = mockUri('test-connection', '/path/to/old-file.txt');
      const newUri = mockUri('test-connection', '/path/to/existing-file.txt');
      await provider.rename(oldUri, newUri, { overwrite: true });
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/old-file.txt');
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/existing-file.txt');
      expect(mockSftpClient.delete).toHaveBeenCalledWith('/path/to/existing-file.txt');
      expect(mockSftpClient.rename).toHaveBeenCalledWith('/path/to/old-file.txt', '/path/to/existing-file.txt');
    });
    
    it('should throw FileExists when overwrite is false and destination exists', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      
      // Call the method and expect error
      const oldUri = mockUri('test-connection', '/path/to/old-file.txt');
      const newUri = mockUri('test-connection', '/path/to/existing-file.txt');
      await expect(provider.rename(oldUri, newUri, { overwrite: false })).rejects.toMatchObject({
        code: 'FileExists',
        message: expect.stringContaining('Destination already exists')
      });
      
      // Verify rename was not called
      expect(mockSftpClient.rename).not.toHaveBeenCalled();
    });
    
    it('should throw FileNotFound when source does not exist', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockImplementation(async (path) => {
        if (path === '/path/to/nonexistent.txt') {
          const error = new Error('ENOENT');
          (error as any).code = 'ENOENT';
          throw error;
        }
        return { isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 };
      });
      
      // Call the method and expect error
      const oldUri = mockUri('test-connection', '/path/to/nonexistent.txt');
      const newUri = mockUri('test-connection', '/path/to/new-file.txt');
      await expect(provider.rename(oldUri, newUri, { overwrite: false })).rejects.toMatchObject({
        code: 'FileNotFound',
        message: expect.stringContaining('Source path not found')
      });
      
      // Verify rename was not called
      expect(mockSftpClient.rename).not.toHaveBeenCalled();
    });
    
    it('should throw Unavailable when trying to rename across different connections', async () => {
      // Call the method and expect error
      const oldUri = mockUri('test-connection', '/path/to/file.txt');
      const newUri = mockUri('other-connection', '/path/to/new-file.txt');
      await expect(provider.rename(oldUri, newUri, { overwrite: false })).rejects.toMatchObject({
        code: 'Unavailable',
        message: expect.stringContaining('Cannot rename across different connections')
      });
      
      // Verify stat and rename were not called
      expect(mockSftpClient.stat).not.toHaveBeenCalled();
      expect(mockSftpClient.rename).not.toHaveBeenCalled();
    });
  });
  
  describe('stat', () => {
    it('should get file stats successfully', async () => {
      // Setup mock responses
      const now = Date.now() / 1000; // Current time in seconds
      mockSftpClient.stat.mockResolvedValue({
        isDirectory: false,
        isFile: true,
        isSymbolicLink: false,
        size: 1024,
        mtime: now
      });
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const result = await provider.stat(uri);
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/file.txt');
      expect(result).toEqual({
        type: vscode.FileType.File,
        ctime: now * 1000, // Convert to milliseconds
        mtime: now * 1000,
        size: 1024
      });
    });
    
    it('should get directory stats successfully', async () => {
      // Setup mock responses
      const now = Date.now() / 1000; // Current time in seconds
      mockSftpClient.stat.mockResolvedValue({
        isDirectory: true,
        isFile: false,
        isSymbolicLink: false,
        size: 0,
        mtime: now
      });
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/directory');
      const result = await provider.stat(uri);
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/directory');
      expect(result).toEqual({
        type: vscode.FileType.Directory,
        ctime: now * 1000, // Convert to milliseconds
        mtime: now * 1000,
        size: 0
      });
    });
    
    it('should get symbolic link stats successfully', async () => {
      // Setup mock responses
      const now = Date.now() / 1000; // Current time in seconds
      mockSftpClient.stat.mockResolvedValue({
        isDirectory: false,
        isFile: false,
        isSymbolicLink: true,
        size: 0,
        mtime: now
      });
      
      // Call the method
      const uri = mockUri('test-connection', '/path/to/symlink');
      const result = await provider.stat(uri);
      
      // Verify results
      expect(mockSftpClient.stat).toHaveBeenCalledWith('/path/to/symlink');
      expect(result).toEqual({
        type: vscode.FileType.SymbolicLink,
        ctime: now * 1000, // Convert to milliseconds
        mtime: now * 1000,
        size: 0
      });
    });
    
    it('should throw FileNotFound for non-existent paths', async () => {
      // Setup mock responses
      mockSftpClient.stat.mockRejectedValue({ code: 'ENOENT' });
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/nonexistent');
      try {
        await provider.stat(uri);
        // If we get here, the test should fail
        expect(true).toBe(false); // This should not be reached
      } catch (error) {
        expect(error).toMatchObject({
          code: 'FileNotFound',
          message: expect.stringContaining('Path not found')
        });
      }
    });
  });
  
  describe('watch', () => {
    it('should return a disposable that does nothing', () => {
      // Call the method
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const disposable = provider.watch(uri, { recursive: true, excludes: [] });
      
      // Verify it's a disposable
      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
      
      // Call dispose (should not throw)
      expect(() => disposable.dispose()).not.toThrow();
    });
  });
  
  describe('error handling', () => {
    it('should handle connection not found error', async () => {
      // Setup mock responses
      const originalGetConnection = connectionManager.getConnection;
      (connectionManager.getConnection as any).mockImplementation((id: string) => {
        if (id === 'nonexistent-connection') {
          return undefined;
        }
        return originalGetConnection(id);
      });
      
      // Call the method and expect error
      const uri = mockUri('nonexistent-connection', '/path/to/file.txt');
      try {
        await provider.readFile(uri);
        // If we get here, the test should fail
        expect(true).toBe(false); // This should not be reached
      } catch (error) {
        expect(error).toMatchObject({
          code: 'Unavailable',
          message: expect.stringContaining('SSH connection not found')
        });
      }
    });
    
    it('should handle inactive connection error', async () => {
      // Call the method and expect error
      const uri = mockUri('disconnected-connection', '/path/to/file.txt');
      await expect(provider.readFile(uri)).rejects.toMatchObject({
        code: 'Unavailable',
        message: expect.stringContaining('SSH connection is not active')
      });
    });
    
    it('should handle permission denied errors', async () => {
      // Enable permission testing
      process.env.TEST_PERMISSIONS = 'true';
      
      // Setup mock responses
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      mockSftpClient.get.mockRejectedValue(new Error('Permission denied'));
      
      // Call the method and expect error
      const uri = mockUri('test-connection', '/path/to/file.txt');
      try {
        await provider.readFile(uri);
        expect.fail('Expected an error to be thrown');
      } catch (error: any) {
        expect(error.code).toBe('NoPermissions');
        expect(error.message).toContain('Permission denied');
      }
      
      // Clean up
      delete process.env.TEST_PERMISSIONS;
    });
  });
  
  describe('dispose', () => {
    it('should close all SFTP clients', async () => {
      // Setup by accessing an SFTP client first
      const uri = mockUri('test-connection', '/path/to/file.txt');
      mockSftpClient.stat.mockResolvedValue({ isDirectory: false, isFile: true, size: 100, mtime: Date.now() / 1000 });
      mockSftpClient.get.mockResolvedValue(Buffer.from('test'));
      
      // First make a call to ensure the SFTP client is created
      await provider.readFile(uri);
      
      // Call dispose
      provider.dispose();
      
      // Verify all SFTP clients were closed
      expect(mockSftpClient.end).toHaveBeenCalled();
    });
  });
});