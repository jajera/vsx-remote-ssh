/**
 * Error classifier for SSH and file system operations
 * Helps identify and categorize errors for better error handling and user feedback
 */
import * as vscode from 'vscode';
import { SSHErrorType } from '../interfaces/ssh';
import { FileSystemError } from '../interfaces/filesystem';

/**
 * Classifies SSH errors based on error messages and codes
 * @param error The error to classify
 * @returns Classified SSH error type
 */
export function classifySSHError(error: Error): SSHErrorType {
  if (!error) {
    return SSHErrorType.Unknown;
  }

  const errorMessage = error.message.toLowerCase();
  const errorCode = (error as any).code;

  // Connection errors
  if (errorMessage.includes('connection refused') || errorCode === 'ECONNREFUSED') {
    return SSHErrorType.ConnectionRefused;
  }
  if (errorMessage.includes('host unreachable') || errorCode === 'EHOSTUNREACH') {
    return SSHErrorType.HostUnreachable;
  }
  if (errorMessage.includes('timeout') || errorCode === 'ETIMEDOUT') {
    return SSHErrorType.NetworkTimeout;
  }
  if (errorMessage.includes('dns') || errorCode === 'ENOTFOUND') {
    return SSHErrorType.DNSResolutionFailed;
  }
  if (errorMessage.includes('network') || errorMessage.includes('connection reset') || 
      errorCode === 'ENETUNREACH' || errorCode === 'ECONNRESET') {
    return SSHErrorType.NetworkTimeout;
  }

  // Authentication errors
  if (errorMessage.includes('authentication failed') || errorMessage.includes('auth failed')) {
    return SSHErrorType.AuthenticationFailed;
  }
  if (errorMessage.includes('permission denied') || errorCode === 'EACCES') {
    return SSHErrorType.PermissionDenied;
  }
  if (errorMessage.includes('key rejected')) {
    return SSHErrorType.KeyRejected;
  }
  if (errorMessage.includes('password rejected') || errorMessage.includes('incorrect password')) {
    return SSHErrorType.PasswordRejected;
  }

  // SSH protocol errors
  if (errorMessage.includes('protocol error')) {
    return SSHErrorType.ProtocolError;
  }
  if (errorMessage.includes('version mismatch')) {
    return SSHErrorType.VersionMismatch;
  }

  // File system errors
  if (errorMessage.includes('no such file') || errorCode === 'ENOENT') {
    return SSHErrorType.FileNotFound;
  }
  if (errorMessage.includes('permission denied') || errorCode === 'EACCES' || errorCode === 'EPERM') {
    return SSHErrorType.PermissionDenied;
  }
  if (errorMessage.includes('directory not empty') || errorCode === 'ENOTEMPTY') {
    return SSHErrorType.FilePermissionDenied;
  }
  if (errorMessage.includes('file exists') || errorCode === 'EEXIST') {
    return SSHErrorType.SFTPError;
  }
  if (errorMessage.includes('disk quota') || errorCode === 'EDQUOT') {
    return SSHErrorType.SFTPError;
  }
  if (errorMessage.includes('disk full') || errorCode === 'ENOSPC') {
    return SSHErrorType.SFTPError;
  }
  if (errorMessage.includes('operation not permitted') || errorCode === 'EPERM') {
    return SSHErrorType.PermissionDenied;
  }
  if (errorMessage.includes('read-only file system') || errorCode === 'EROFS') {
    return SSHErrorType.FilePermissionDenied;
  }
  if (errorMessage.includes('too many open files') || errorCode === 'EMFILE' || errorCode === 'ENFILE') {
    return SSHErrorType.SFTPError;
  }
  if (errorMessage.includes('file too large') || errorCode === 'EFBIG') {
    return SSHErrorType.SFTPError;
  }
  if (errorMessage.includes('broken pipe') || errorCode === 'EPIPE') {
    return SSHErrorType.NetworkTimeout;
  }
  if (errorMessage.includes('invalid argument') || errorCode === 'EINVAL') {
    return SSHErrorType.SFTPError;
  }

  // SFTP errors
  if (errorMessage.includes('sftp')) {
    return SSHErrorType.SFTPError;
  }

  return SSHErrorType.Unknown;
}

/**
 * Creates a standardized file system error with appropriate code and message
 * @param code Error code
 * @param uri The URI that caused the error
 * @param message Error message
 * @returns FileSystemError
 */
export function createFileSystemError(
  code: 'FileNotFound' | 'FileExists' | 'NoPermissions' | 'Unavailable' | 'Unknown',
  uri: vscode.Uri,
  message: string
): FileSystemError {
  const error = new Error(message) as FileSystemError;
  error.code = code;
  error.uri = uri;
  return error;
}

/**
 * Classifies an error and converts it to a FileSystemError
 * @param error Original error
 * @param uri URI of the file or directory
 * @param operation Description of the operation being performed
 * @returns FileSystemError
 */
export function classifyAndCreateFileSystemError(
  error: Error,
  uri: vscode.Uri,
  operation: string
): FileSystemError {
  // If it's already a FileSystemError, just return it
  if ((error as any).code && (error as any).uri) {
    return error as FileSystemError;
  }

  const errorMessage = error.message.toLowerCase();
  const errorCode = (error as any).code;
  const errorType = classifySSHError(error);
  const troubleshootingSteps = getTroubleshootingSteps(errorType);
  const troubleshootingText = troubleshootingSteps.length > 0 
    ? `\n\nTroubleshooting:\n- ${troubleshootingSteps.join('\n- ')}` 
    : '';

  // Permission errors
  if (
    errorMessage.includes('permission denied') ||
    errorMessage.includes('access denied') ||
    errorMessage.includes('operation not permitted') ||
    errorCode === 'EACCES' ||
    errorCode === 'EPERM'
  ) {
    return createFileSystemError(
      'NoPermissions',
      uri,
      `Permission denied: Cannot ${operation}. You may not have the required permissions.${troubleshootingText}`
    );
  }

  // Read-only file system
  if (errorMessage.includes('read-only file system') || errorCode === 'EROFS') {
    return createFileSystemError(
      'NoPermissions',
      uri,
      `Read-only file system: Cannot ${operation} because the file system is read-only.${troubleshootingText}`
    );
  }

  // Directory not empty errors (special case for recursive delete)
  if (errorMessage.includes('directory not empty') || errorCode === 'ENOTEMPTY') {
    return createFileSystemError(
      'NoPermissions',
      uri,
      `Cannot delete non-empty directory. Use the recursive option to delete directories with content.${troubleshootingText}`
    );
  }

  // File not found errors
  if (
    errorMessage.includes('no such file') ||
    errorMessage.includes('not found') ||
    errorCode === 'ENOENT'
  ) {
    return createFileSystemError(
      'FileNotFound',
      uri,
      `File not found: The file or directory does not exist.${troubleshootingText}`
    );
  }

  // File exists errors
  if (errorMessage.includes('already exists') || errorCode === 'EEXIST') {
    return createFileSystemError(
      'FileExists',
      uri,
      `File already exists: Cannot create file or directory that already exists.${troubleshootingText}`
    );
  }

  // Disk quota errors
  if (errorMessage.includes('disk quota') || errorCode === 'EDQUOT') {
    return createFileSystemError(
      'NoPermissions',
      uri,
      `Disk quota exceeded: Cannot ${operation} because you've reached your storage limit.${troubleshootingText}`
    );
  }

  // Disk space errors
  if (errorMessage.includes('disk full') || errorCode === 'ENOSPC') {
    return createFileSystemError(
      'Unavailable',
      uri,
      `No space left on device: Cannot ${operation} because the remote disk is full.${troubleshootingText}`
    );
  }

  // File too large errors
  if (errorMessage.includes('file too large') || errorCode === 'EFBIG') {
    return createFileSystemError(
      'NoPermissions',
      uri,
      `File too large: Cannot ${operation} because the file exceeds the maximum allowed size.${troubleshootingText}`
    );
  }

  // Too many open files
  if (errorMessage.includes('too many open files') || errorCode === 'EMFILE' || errorCode === 'ENFILE') {
    return createFileSystemError(
      'Unavailable',
      uri,
      `Too many open files: Cannot ${operation} because the system has reached its limit of open files. Try closing some files or connections.${troubleshootingText}`
    );
  }

  // Invalid argument errors
  if (errorMessage.includes('invalid argument') || errorCode === 'EINVAL') {
    return createFileSystemError(
      'Unknown',
      uri,
      `Invalid argument: Cannot ${operation} due to an invalid parameter or path.${troubleshootingText}`
    );
  }

  // Connection/availability errors
  if (
    errorMessage.includes('connection') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('network') ||
    errorMessage.includes('reset') ||
    errorMessage.includes('broken pipe') ||
    errorCode === 'ECONNREFUSED' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ENETUNREACH' ||
    errorCode === 'ECONNRESET' ||
    errorCode === 'EPIPE'
  ) {
    return createFileSystemError(
      'Unavailable',
      uri,
      `Connection error: The remote server is unavailable or the connection was lost. The operation will be retried when the connection is restored.${troubleshootingText}`
    );
  }

  // SFTP protocol errors
  if (errorMessage.includes('sftp') || errorMessage.includes('protocol')) {
    return createFileSystemError(
      'Unavailable',
      uri,
      `SFTP protocol error: Failed to ${operation} due to an SFTP protocol issue.${troubleshootingText}`
    );
  }

  // Default to unknown error
  return createFileSystemError(
    'Unknown',
    uri,
    `Failed to ${operation}: ${error.message}${troubleshootingText}`
  );
}

/**
 * Generates user-friendly troubleshooting steps based on error type
 * @param errorType The type of error
 * @returns Array of troubleshooting steps
 */
export function getTroubleshootingSteps(errorType: SSHErrorType): string[] {
  switch (errorType) {
    case SSHErrorType.ConnectionRefused:
      return [
        'Verify the SSH server is running on the remote host',
        'Check if the port is correct and not blocked by a firewall',
        'Try connecting with a terminal SSH client to verify server availability'
      ];

    case SSHErrorType.HostUnreachable:
      return [
        'Check your network connection',
        'Verify the hostname or IP address is correct',
        'Check if the remote host is online and reachable'
      ];

    case SSHErrorType.NetworkTimeout:
      return [
        'The connection attempt timed out, the server might be slow or unreachable',
        'Check your network connection',
        'Try increasing the connection timeout in settings'
      ];

    case SSHErrorType.DNSResolutionFailed:
      return [
        'The hostname could not be resolved to an IP address',
        'Verify the hostname is spelled correctly',
        'Check your DNS settings'
      ];

    case SSHErrorType.AuthenticationFailed:
      return [
        'Verify your username and password or key are correct',
        'Check if the authentication method is supported by the server',
        'Ensure your SSH key has the correct permissions (chmod 600)'
      ];

    case SSHErrorType.PermissionDenied:
      return [
        'You do not have permission to access this resource',
        'Check file and directory permissions on the remote server',
        'Contact the system administrator for access'
      ];

    case SSHErrorType.KeyRejected:
      return [
        'The server rejected your SSH key',
        'Verify the key is added to authorized_keys on the server',
        'Check if the key format is supported by the server'
      ];

    case SSHErrorType.PasswordRejected:
      return [
        'The password was rejected by the server',
        'Verify your password is correct',
        'Check if password authentication is enabled on the server'
      ];

    case SSHErrorType.FileNotFound:
      return [
        'The specified file or directory does not exist',
        'Check the path and try again',
        'Verify the file has not been moved or deleted'
      ];

    case SSHErrorType.FilePermissionDenied:
      return [
        'You do not have permission to access this file or directory',
        'Check the file permissions on the remote server (use "ls -la" to view permissions)',
        'Try changing the file permissions with "chmod" if you own the file',
        'Contact the system administrator for access if needed'
      ];

    case SSHErrorType.SFTPError:
      return [
        'An SFTP protocol error occurred',
        'Check if the SFTP server is properly configured',
        'Verify the remote file system has sufficient space and resources',
        'Try reconnecting to the server'
      ];

    default:
      return [
        'Try reconnecting to the server',
        'Check the server logs for more information',
        'Verify your connection settings'
      ];
  }
}

/**
 * Class-based interface for SSH error classification
 * Provides a more object-oriented approach to error handling
 */
export class SSHErrorClassifier {
  /**
   * Classify an SSH error
   * @param error The error to classify
   * @returns The classified error type
   */
  classifyError(error: Error): SSHErrorType {
    return classifySSHError(error);
  }

  /**
   * Create a file system error from a generic error
   * @param error The original error
   * @param uri The URI that caused the error
   * @param operation Description of the operation being performed
   * @returns A FileSystemError
   */
  createFileSystemError(error: Error, uri: vscode.Uri, operation: string): FileSystemError {
    return classifyAndCreateFileSystemError(error, uri, operation);
  }

  /**
   * Get troubleshooting steps for an error type
   * @param errorType The type of error
   * @returns Array of troubleshooting steps
   */
  getTroubleshootingSteps(errorType: SSHErrorType): string[] {
    return getTroubleshootingSteps(errorType);
  }

  /**
   * Check if an error is a network-related error
   * @param error The error to check
   * @returns True if the error is network-related
   */
  isNetworkError(error: Error): boolean {
    const errorType = this.classifyError(error);
    return [
      SSHErrorType.ConnectionRefused,
      SSHErrorType.HostUnreachable,
      SSHErrorType.NetworkTimeout,
      SSHErrorType.DNSResolutionFailed
    ].includes(errorType);
  }

  /**
   * Check if an error is an authentication error
   * @param error The error to check
   * @returns True if the error is authentication-related
   */
  isAuthenticationError(error: Error): boolean {
    const errorType = this.classifyError(error);
    return [
      SSHErrorType.AuthenticationFailed,
      SSHErrorType.KeyRejected,
      SSHErrorType.PasswordRejected
    ].includes(errorType);
  }

  /**
   * Check if an error is a file system error
   * @param error The error to check
   * @returns True if the error is file system-related
   */
  isFileSystemError(error: Error): boolean {
    const errorType = this.classifyError(error);
    return [
      SSHErrorType.FileNotFound,
      SSHErrorType.FilePermissionDenied,
      SSHErrorType.SFTPError
    ].includes(errorType);
  }
}