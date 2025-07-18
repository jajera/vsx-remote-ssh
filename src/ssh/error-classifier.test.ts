import { describe, it, expect, vi } from 'vitest';
import { classifySSHError, createFileSystemError, classifyAndCreateFileSystemError, getTroubleshootingSteps } from './error-classifier';
import { SSHErrorType } from '../interfaces/ssh';

// Mock vscode module
vi.mock('vscode', () => {
  return {
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64
    },
    Uri: {
      parse: (value: string) => ({
        scheme: 'ssh',
        authority: value.split('://')[1]?.split('/')[0] || '',
        path: '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
        query: '',
        fragment: '',
        fsPath: '/' + (value.split('://')[1]?.split('/').slice(1).join('/') || ''),
        with: vi.fn().mockImplementation((params: any) => {
          const parsedValue = typeof value === 'string' ? value : '';
          return {
            scheme: 'ssh',
            authority: parsedValue.split('://')[1]?.split('/')[0] || '',
            path: params.path || parsedValue.split('://')[1]?.split('/').slice(1).join('/') || '',
            query: '',
            fragment: '',
            fsPath: params.path || parsedValue.split('://')[1]?.split('/').slice(1).join('/') || '',
            with: vi.fn(),
            toString: vi.fn().mockReturnValue(`ssh://${parsedValue.split('://')[1]?.split('/')[0] || ''}${params.path || parsedValue.split('://')[1]?.split('/').slice(1).join('/') || ''}`),
            toJSON: vi.fn()
          };
        }),
        toString: vi.fn().mockReturnValue(value),
        toJSON: vi.fn()
      })
    }
  };
});

// Import after mocking
import * as vscode from 'vscode';

// Helper function to create mock URIs
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

describe('Error Classifier', () => {
  describe('classifySSHError', () => {
    it('should classify connection refused errors', () => {
      const error = new Error('Connection refused');
      expect(classifySSHError(error)).toBe(SSHErrorType.ConnectionRefused);
      
      const errorWithCode = new Error('Some error');
      (errorWithCode as any).code = 'ECONNREFUSED';
      expect(classifySSHError(errorWithCode)).toBe(SSHErrorType.ConnectionRefused);
    });
    
    it('should classify host unreachable errors', () => {
      const error = new Error('Host unreachable');
      expect(classifySSHError(error)).toBe(SSHErrorType.HostUnreachable);
      
      const errorWithCode = new Error('Some error');
      (errorWithCode as any).code = 'EHOSTUNREACH';
      expect(classifySSHError(errorWithCode)).toBe(SSHErrorType.HostUnreachable);
    });
    
    it('should classify timeout errors', () => {
      const error = new Error('Connection timeout');
      expect(classifySSHError(error)).toBe(SSHErrorType.NetworkTimeout);
      
      const errorWithCode = new Error('Some error');
      (errorWithCode as any).code = 'ETIMEDOUT';
      expect(classifySSHError(errorWithCode)).toBe(SSHErrorType.NetworkTimeout);
    });
    
    it('should classify network errors', () => {
      const error = new Error('Network unreachable');
      expect(classifySSHError(error)).toBe(SSHErrorType.NetworkTimeout);
      
      const resetError = new Error('Connection reset by peer');
      expect(classifySSHError(resetError)).toBe(SSHErrorType.NetworkTimeout);
      
      const errorWithCode = new Error('Some error');
      (errorWithCode as any).code = 'ENETUNREACH';
      expect(classifySSHError(errorWithCode)).toBe(SSHErrorType.NetworkTimeout);
      
      const resetErrorWithCode = new Error('Some error');
      (resetErrorWithCode as any).code = 'ECONNRESET';
      expect(classifySSHError(resetErrorWithCode)).toBe(SSHErrorType.NetworkTimeout);
    });
    
    it('should classify authentication errors', () => {
      const error = new Error('Authentication failed');
      expect(classifySSHError(error)).toBe(SSHErrorType.AuthenticationFailed);
      
      const passwordError = new Error('Password rejected');
      expect(classifySSHError(passwordError)).toBe(SSHErrorType.PasswordRejected);
      
      const keyError = new Error('Key rejected');
      expect(classifySSHError(keyError)).toBe(SSHErrorType.KeyRejected);
    });
    
    it('should classify file system errors', () => {
      const notFoundError = new Error('No such file or directory');
      expect(classifySSHError(notFoundError)).toBe(SSHErrorType.FileNotFound);
      
      const notFoundWithCode = new Error('Some error');
      (notFoundWithCode as any).code = 'ENOENT';
      expect(classifySSHError(notFoundWithCode)).toBe(SSHErrorType.FileNotFound);
      
      const permissionError = new Error('Permission denied');
      expect(classifySSHError(permissionError)).toBe(SSHErrorType.PermissionDenied);
      
      const permissionWithCode = new Error('Some error');
      (permissionWithCode as any).code = 'EACCES';
      expect(classifySSHError(permissionWithCode)).toBe(SSHErrorType.PermissionDenied);
      
      const permWithCode = new Error('Some error');
      (permWithCode as any).code = 'EPERM';
      expect(classifySSHError(permWithCode)).toBe(SSHErrorType.PermissionDenied);
    });
    
    it('should classify directory not empty errors', () => {
      const dirNotEmptyError = new Error('Directory not empty');
      expect(classifySSHError(dirNotEmptyError)).toBe(SSHErrorType.FilePermissionDenied);
      
      const dirNotEmptyWithCode = new Error('Some error');
      (dirNotEmptyWithCode as any).code = 'ENOTEMPTY';
      expect(classifySSHError(dirNotEmptyWithCode)).toBe(SSHErrorType.FilePermissionDenied);
    });
    
    it('should classify disk quota and space errors', () => {
      const quotaError = new Error('Disk quota exceeded');
      expect(classifySSHError(quotaError)).toBe(SSHErrorType.SFTPError);
      
      const quotaWithCode = new Error('Some error');
      (quotaWithCode as any).code = 'EDQUOT';
      expect(classifySSHError(quotaWithCode)).toBe(SSHErrorType.SFTPError);
      
      const spaceError = new Error('Disk full');
      expect(classifySSHError(spaceError)).toBe(SSHErrorType.SFTPError);
      
      const spaceWithCode = new Error('Some error');
      (spaceWithCode as any).code = 'ENOSPC';
      expect(classifySSHError(spaceWithCode)).toBe(SSHErrorType.SFTPError);
    });
    
    it('should return Unknown for unrecognized errors', () => {
      const error = new Error('Some unknown error');
      expect(classifySSHError(error)).toBe(SSHErrorType.Unknown);
    });
  });
  
  describe('createFileSystemError', () => {
    it('should create a FileSystemError with the specified code and message', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = createFileSystemError('FileNotFound', uri, 'File not found');
      
      expect(error).toBeInstanceOf(Error);
      expect(error.code).toBe('FileNotFound');
      expect(error.message).toBe('File not found');
      expect(error.uri).toBe(uri);
    });
  });
  
  describe('classifyAndCreateFileSystemError', () => {
    it('should return the original error if it is already a FileSystemError', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const originalError = createFileSystemError('FileNotFound', uri, 'Original error');
      
      const result = classifyAndCreateFileSystemError(originalError, uri, 'read file');
      
      expect(result).toBe(originalError);
    });
    
    it('should classify permission errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('Permission denied');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'read file');
      
      expect(result.code).toBe('NoPermissions');
      expect(result.message).toContain('Permission denied');
    });
    
    it('should classify directory not empty errors', () => {
      const uri = mockUri('test-connection', '/path/to/directory');
      const error = new Error('Directory not empty');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'delete directory');
      
      expect(result.code).toBe('NoPermissions');
      expect(result.message).toContain('Cannot delete non-empty directory');
    });
    
    it('should classify file not found errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('No such file or directory');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'read file');
      
      expect(result.code).toBe('FileNotFound');
      expect(result.message).toContain('File not found');
    });
    
    it('should classify file exists errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('File already exists');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'create file');
      
      expect(result.code).toBe('FileExists');
      expect(result.message).toContain('already exists');
    });
    
    it('should classify disk quota errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('Disk quota exceeded');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'write file');
      
      expect(result.code).toBe('NoPermissions');
      expect(result.message).toContain('Disk quota exceeded');
    });
    
    it('should classify disk space errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('No space left on device');
      (error as any).code = 'ENOSPC';
      
      const result = classifyAndCreateFileSystemError(error, uri, 'write file');
      
      expect(result.code).toBe('Unavailable');
      expect(result.message).toContain('No space left on device');
    });
    
    it('should classify connection errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('Connection timeout');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'read file');
      
      expect(result.code).toBe('Unavailable');
      expect(result.message).toContain('Connection error');
    });
    
    it('should classify network errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('Connection reset by peer');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'read file');
      
      expect(result.code).toBe('Unavailable');
      expect(result.message).toContain('Connection error');
    });
    
    it('should classify SFTP protocol errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('SFTP protocol error');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'read file');
      
      expect(result.code).toBe('Unavailable');
      expect(result.message).toContain('SFTP protocol error');
    });
    
    it('should include troubleshooting steps in error messages', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('Connection refused');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'read file');
      
      expect(result.message).toContain('Troubleshooting');
    });
    
    it('should default to Unknown for unrecognized errors', () => {
      const uri = mockUri('test-connection', '/path/to/file.txt');
      const error = new Error('Some unknown error');
      
      const result = classifyAndCreateFileSystemError(error, uri, 'read file');
      
      expect(result.code).toBe('Unknown');
      expect(result.message).toContain('Failed to read file');
    });
  });
  
  describe('getTroubleshootingSteps', () => {
    it('should return appropriate troubleshooting steps for connection errors', () => {
      const steps = getTroubleshootingSteps(SSHErrorType.ConnectionRefused);
      
      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('Verify the SSH server is running');
    });
    
    it('should return appropriate troubleshooting steps for authentication errors', () => {
      const steps = getTroubleshootingSteps(SSHErrorType.AuthenticationFailed);
      
      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('Verify your username and password');
    });
    
    it('should return appropriate troubleshooting steps for file system errors', () => {
      const steps = getTroubleshootingSteps(SSHErrorType.FilePermissionDenied);
      
      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('You do not have permission');
    });
    
    it('should return appropriate troubleshooting steps for file not found errors', () => {
      const steps = getTroubleshootingSteps(SSHErrorType.FileNotFound);
      
      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('The specified file or directory does not exist');
    });
    
    it('should return generic steps for unknown errors', () => {
      const steps = getTroubleshootingSteps(SSHErrorType.Unknown);
      
      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]).toContain('Try reconnecting');
    });
  });
});