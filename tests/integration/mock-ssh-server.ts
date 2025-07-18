/**
 * Mock SSH Server for integration testing
 * 
 * This module provides a mock SSH server for testing SSH client functionality
 * without requiring an actual SSH server. It simulates authentication, file operations,
 * and terminal sessions.
 */
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { vi } from 'vitest';

/**
 * Mock SSH Server Configuration
 */
export interface MockSSHServerConfig {
  host: string;
  port: number;
  users: {
    [username: string]: {
      password?: string;
      publicKey?: string;
    };
  };
  filesystem: {
    [path: string]: {
      type: 'file' | 'directory';
      content?: Buffer | string;
      permissions?: number;
      owner?: string;
      group?: string;
      mtime?: Date;
      atime?: Date;
      ctime?: Date;
    };
  };
}

/**
 * Mock SSH Connection
 */
export class MockSSHConnection extends EventEmitter {
  public authenticated = false;
  public username: string | null = null;
  public sessionId: string;
  public terminals: Map<number, MockTerminal> = new Map();
  public sftp: MockSFTP | null = null;
  
  constructor(private server: MockSSHServer) {
    super();
    this.sessionId = crypto.randomUUID();
  }

  /**
   * Authenticate a user
   */
  authenticate(username: string, method: 'password' | 'publicKey', credential: string): boolean {
    const user = this.server.config.users[username];
    if (!user) {
      return false;
    }

    if (method === 'password' && user.password === credential) {
      this.authenticated = true;
      this.username = username;
      return true;
    }

    if (method === 'publicKey' && user.publicKey === credential) {
      this.authenticated = true;
      this.username = username;
      return true;
    }

    return false;
  }

  /**
   * Create a new terminal session
   */
  createTerminal(cols: number, rows: number): MockTerminal {
    const pid = Math.floor(Math.random() * 10000) + 1000;
    const terminal = new MockTerminal(pid, cols, rows);
    this.terminals.set(pid, terminal);
    return terminal;
  }

  /**
   * Create an SFTP session
   */
  createSFTP(): MockSFTP {
    this.sftp = new MockSFTP(this.server.config.filesystem);
    return this.sftp;
  }

  /**
   * Close the connection
   */
  close(): void {
    this.terminals.forEach(terminal => terminal.close());
    this.terminals.clear();
    if (this.sftp) {
      this.sftp.close();
      this.sftp = null;
    }
    this.emit('close');
  }

  /**
   * Execute a command
   */
  exec(command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    // Simple command execution simulation
    if (command === 'echo $HOME') {
      return Promise.resolve({
        stdout: `/home/${this.username}\n`,
        stderr: '',
        code: 0
      });
    }
    
    if (command === 'uname -a') {
      return Promise.resolve({
        stdout: 'Linux mockserver 5.15.0-1-amd64 #1 SMP Debian 5.15.1-1 (2021-11-10) x86_64 GNU/Linux\n',
        stderr: '',
        code: 0
      });
    }
    
    if (command.startsWith('ls ')) {
      const path = command.substring(3).trim();
      const files = Object.keys(this.server.config.filesystem)
        .filter(filePath => filePath.startsWith(path) && filePath !== path)
        .map(filePath => {
          const relativePath = filePath.substring(path.length + 1).split('/')[0];
          return relativePath;
        })
        .filter((value, index, self) => self.indexOf(value) === index);
      
      return Promise.resolve({
        stdout: files.join('\n') + '\n',
        stderr: '',
        code: 0
      });
    }
    
    return Promise.resolve({
      stdout: '',
      stderr: `command not found: ${command}\n`,
      code: 127
    });
  }
}

/**
 * Mock Terminal Session
 */
export class MockTerminal extends EventEmitter {
  private closed = false;
  private buffer = '';
  
  constructor(
    public pid: number,
    public cols: number,
    public rows: number
  ) {
    super();
  }

  /**
   * Write data to the terminal
   */
  write(data: string): void {
    if (this.closed) {
      throw new Error('Terminal is closed');
    }
    
    this.buffer += data;
    
    // Process simple commands
    if (data.endsWith('\n') || data.endsWith('\r')) {
      const command = this.buffer.trim();
      this.buffer = '';
      
      if (command === 'exit') {
        this.emit('data', 'logout\r\n');
        this.close();
        return;
      }
      
      if (command === 'echo hello') {
        this.emit('data', 'hello\r\n');
        this.emit('data', '$ ');
        return;
      }
      
      if (command === 'pwd') {
        this.emit('data', '/home/user\r\n');
        this.emit('data', '$ ');
        return;
      }
      
      // Default prompt
      this.emit('data', `$ `);
    }
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    if (this.closed) {
      throw new Error('Terminal is closed');
    }
    
    this.cols = cols;
    this.rows = rows;
  }

  /**
   * Close the terminal
   */
  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.emit('exit', 0);
    }
  }
}

/**
 * Mock SFTP Session
 */
export class MockSFTP extends EventEmitter {
  private closed = false;
  private openFiles: Map<number, { path: string; flags: string }> = new Map();
  private nextHandle = 1;
  
  constructor(private filesystem: MockSSHServerConfig['filesystem']) {
    super();
  }

  /**
   * List directory contents
   */
  readdir(path: string): Promise<{ filename: string; longname: string; attrs: any }[]> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const normalizedPath = path.endsWith('/') ? path : path + '/';
    const files = Object.keys(this.filesystem)
      .filter(filePath => {
        if (path === '/') {
          return filePath.startsWith('/') && filePath !== '/' && !filePath.substring(1).includes('/');
        }
        return filePath.startsWith(normalizedPath) && filePath !== normalizedPath && 
               !filePath.substring(normalizedPath.length).includes('/');
      })
      .map(filePath => {
        const filename = filePath.split('/').pop() || '';
        const entry = this.filesystem[filePath];
        const attrs = {
          size: entry.type === 'file' && entry.content ? 
                (typeof entry.content === 'string' ? Buffer.from(entry.content).length : entry.content.length) : 0,
          uid: 1000,
          gid: 1000,
          mode: entry.permissions || (entry.type === 'directory' ? 0o755 : 0o644),
          atime: entry.atime || new Date(),
          mtime: entry.mtime || new Date()
        };
        
        const longname = `${entry.type === 'directory' ? 'd' : '-'}rw-r--r-- 1 ${entry.owner || 'user'} ${entry.group || 'user'} ${attrs.size} ${attrs.mtime.toDateString()} ${filename}`;
        
        return { filename, longname, attrs };
      });
    
    return Promise.resolve(files);
  }

  /**
   * Get file stats
   */
  stat(path: string): Promise<any> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const entry = this.filesystem[path];
    if (!entry) {
      return Promise.reject(new Error(`No such file or directory: ${path}`));
    }
    
    return Promise.resolve({
      size: entry.type === 'file' && entry.content ? 
            (typeof entry.content === 'string' ? Buffer.from(entry.content).length : entry.content.length) : 0,
      uid: 1000,
      gid: 1000,
      mode: entry.permissions || (entry.type === 'directory' ? 0o755 : 0o644),
      atime: entry.atime || new Date(),
      mtime: entry.mtime || new Date(),
      isDirectory: () => entry.type === 'directory',
      isFile: () => entry.type === 'file'
    });
  }

  /**
   * Open a file
   */
  open(path: string, flags: string): Promise<number> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const entry = this.filesystem[path];
    if (!entry && !flags.includes('w') && !flags.includes('a')) {
      return Promise.reject(new Error(`No such file or directory: ${path}`));
    }
    
    if (entry && entry.type === 'directory') {
      return Promise.reject(new Error(`Cannot open directory: ${path}`));
    }
    
    const handle = this.nextHandle++;
    this.openFiles.set(handle, { path, flags });
    
    return Promise.resolve(handle);
  }

  /**
   * Read from a file
   */
  read(handle: number, buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number; buffer: Buffer }> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const file = this.openFiles.get(handle);
    if (!file) {
      return Promise.reject(new Error(`Invalid file handle: ${handle}`));
    }
    
    const entry = this.filesystem[file.path];
    if (!entry || entry.type !== 'file' || !entry.content) {
      return Promise.resolve({ bytesRead: 0, buffer });
    }
    
    const content = typeof entry.content === 'string' ? Buffer.from(entry.content) : entry.content;
    const bytesRead = Math.min(length, content.length - position);
    
    if (bytesRead <= 0) {
      return Promise.resolve({ bytesRead: 0, buffer });
    }
    
    content.copy(buffer, offset, position, position + bytesRead);
    
    return Promise.resolve({ bytesRead, buffer });
  }

  /**
   * Write to a file
   */
  write(handle: number, buffer: Buffer, offset: number, length: number, position: number): Promise<number> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const file = this.openFiles.get(handle);
    if (!file) {
      return Promise.reject(new Error(`Invalid file handle: ${handle}`));
    }
    
    let entry = this.filesystem[file.path];
    if (!entry) {
      entry = {
        type: 'file',
        content: Buffer.alloc(0),
        permissions: 0o644,
        mtime: new Date(),
        atime: new Date(),
        ctime: new Date()
      };
      this.filesystem[file.path] = entry;
    }
    
    if (entry.type !== 'file') {
      return Promise.reject(new Error(`Cannot write to directory: ${file.path}`));
    }
    
    let content = typeof entry.content === 'string' ? Buffer.from(entry.content) : 
                 (entry.content || Buffer.alloc(0));
    
    // Ensure the buffer is large enough
    if (position + length > content.length) {
      const newContent = Buffer.alloc(position + length);
      content.copy(newContent);
      content = newContent;
    }
    
    buffer.copy(content, position, offset, offset + length);
    entry.content = content;
    entry.mtime = new Date();
    
    return Promise.resolve(length);
  }

  /**
   * Close a file
   */
  closeFile(handle: number): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    if (!this.openFiles.has(handle)) {
      return Promise.reject(new Error(`Invalid file handle: ${handle}`));
    }
    
    this.openFiles.delete(handle);
    return Promise.resolve();
  }

  /**
   * Create a directory
   */
  mkdir(path: string): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    if (this.filesystem[path]) {
      return Promise.reject(new Error(`File or directory already exists: ${path}`));
    }
    
    this.filesystem[path] = {
      type: 'directory',
      permissions: 0o755,
      mtime: new Date(),
      atime: new Date(),
      ctime: new Date()
    };
    
    return Promise.resolve();
  }

  /**
   * Remove a directory
   */
  rmdir(path: string): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const entry = this.filesystem[path];
    if (!entry) {
      return Promise.reject(new Error(`No such directory: ${path}`));
    }
    
    if (entry.type !== 'directory') {
      return Promise.reject(new Error(`Not a directory: ${path}`));
    }
    
    // Check if directory is empty
    const hasChildren = Object.keys(this.filesystem).some(filePath => 
      filePath !== path && filePath.startsWith(path + '/'));
    
    if (hasChildren) {
      return Promise.reject(new Error(`Directory not empty: ${path}`));
    }
    
    delete this.filesystem[path];
    return Promise.resolve();
  }

  /**
   * Remove a file
   */
  unlink(path: string): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const entry = this.filesystem[path];
    if (!entry) {
      return Promise.reject(new Error(`No such file: ${path}`));
    }
    
    if (entry.type !== 'file') {
      return Promise.reject(new Error(`Not a file: ${path}`));
    }
    
    delete this.filesystem[path];
    return Promise.resolve();
  }

  /**
   * Rename a file or directory
   */
  rename(oldPath: string, newPath: string): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error('SFTP session is closed'));
    }
    
    const entry = this.filesystem[oldPath];
    if (!entry) {
      return Promise.reject(new Error(`No such file or directory: ${oldPath}`));
    }
    
    if (this.filesystem[newPath]) {
      return Promise.reject(new Error(`File or directory already exists: ${newPath}`));
    }
    
    this.filesystem[newPath] = { ...entry };
    delete this.filesystem[oldPath];
    
    return Promise.resolve();
  }

  /**
   * Close the SFTP session
   */
  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.openFiles.clear();
      this.emit('close');
    }
  }
}

/**
 * Mock SSH Server
 */
export class MockSSHServer extends EventEmitter {
  private connections: Map<string, MockSSHConnection> = new Map();
  private running = false;
  
  constructor(public config: MockSSHServerConfig) {
    super();
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    if (this.running) {
      return Promise.resolve();
    }
    
    this.running = true;
    return Promise.resolve();
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    if (!this.running) {
      return Promise.resolve();
    }
    
    this.connections.forEach(connection => connection.close());
    this.connections.clear();
    this.running = false;
    
    return Promise.resolve();
  }

  /**
   * Create a new connection
   */
  createConnection(): MockSSHConnection {
    if (!this.running) {
      throw new Error('Server is not running');
    }
    
    const connection = new MockSSHConnection(this);
    this.connections.set(connection.sessionId, connection);
    
    connection.on('close', () => {
      this.connections.delete(connection.sessionId);
    });
    
    return connection;
  }

  /**
   * Get all active connections
   */
  getConnections(): MockSSHConnection[] {
    return Array.from(this.connections.values());
  }
}

/**
 * Create a default mock SSH server configuration
 */
export function createDefaultMockSSHServerConfig(): MockSSHServerConfig {
  return {
    host: 'localhost',
    port: 2222,
    users: {
      'testuser': {
        password: 'password',
        publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC0mEhwRSxTGGmC'
      },
      'admin': {
        password: 'admin123',
        publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDJlTVUH0Gk'
      }
    },
    filesystem: {
      '/': { type: 'directory' },
      '/home': { type: 'directory' },
      '/home/testuser': { type: 'directory' },
      '/home/testuser/.bashrc': { 
        type: 'file', 
        content: '# .bashrc\nexport PATH=$PATH:/usr/local/bin\n' 
      },
      '/home/testuser/test.txt': { 
        type: 'file', 
        content: 'This is a test file.\nIt has multiple lines.\n' 
      },
      '/home/testuser/project': { type: 'directory' },
      '/home/testuser/project/README.md': { 
        type: 'file', 
        content: '# Test Project\n\nThis is a test project.\n' 
      },
      '/home/testuser/project/src': { type: 'directory' },
      '/home/testuser/project/src/main.js': { 
        type: 'file', 
        content: 'console.log("Hello, world!");\n' 
      },
      '/home/admin': { type: 'directory' },
      '/home/admin/.bashrc': { 
        type: 'file', 
        content: '# .bashrc\nexport PATH=$PATH:/usr/local/bin\n' 
      },
      '/etc': { type: 'directory' },
      '/etc/hosts': { 
        type: 'file', 
        content: '127.0.0.1 localhost\n::1 localhost\n' 
      }
    }
  };
}

/**
 * Mock SSH2 Client
 */
export class MockSSH2Client extends EventEmitter {
  private connection: MockSSHConnection | null = null;
  private server: MockSSHServer;
  
  constructor(server: MockSSHServer) {
    super();
    this.server = server;
  }

  /**
   * Connect to the server
   */
  connect(config: any): void {
    try {
      this.connection = this.server.createConnection();
      
      // Simulate network delay
      setTimeout(() => {
        this.emit('ready');
      }, 50);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Authenticate with password
   */
  auth(username: string, method: { type: string; password?: string; publicKey?: string }, callback: (err: Error | null) => void): void {
    if (!this.connection) {
      callback(new Error('Not connected'));
      return;
    }
    
    try {
      const authenticated = this.connection.authenticate(
        username,
        method.type === 'password' ? 'password' : 'publicKey',
        method.type === 'password' ? method.password! : method.publicKey!
      );
      
      if (authenticated) {
        callback(null);
      } else {
        callback(new Error('Authentication failed'));
      }
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Create a shell session
   */
  shell(callback: (err: Error | null, stream: any) => void): void {
    if (!this.connection) {
      callback(new Error('Not connected'), null);
      return;
    }
    
    if (!this.connection.authenticated) {
      callback(new Error('Not authenticated'), null);
      return;
    }
    
    try {
      const terminal = this.connection.createTerminal(80, 24);
      const stream = new MockStream(terminal);
      callback(null, stream);
    } catch (error) {
      callback(error as Error, null);
    }
  }

  /**
   * Execute a command
   */
  exec(command: string, callback: (err: Error | null, stream: any) => void): void {
    if (!this.connection) {
      callback(new Error('Not connected'), null);
      return;
    }
    
    if (!this.connection.authenticated) {
      callback(new Error('Not authenticated'), null);
      return;
    }
    
    try {
      this.connection.exec(command).then(result => {
        const stream = new MockExecStream(result);
        callback(null, stream);
      }).catch(error => {
        callback(error, null);
      });
    } catch (error) {
      callback(error as Error, null);
    }
  }

  /**
   * Create an SFTP session
   */
  sftp(callback: (err: Error | null, sftp: any) => void): void {
    if (!this.connection) {
      callback(new Error('Not connected'), null);
      return;
    }
    
    if (!this.connection.authenticated) {
      callback(new Error('Not authenticated'), null);
      return;
    }
    
    try {
      const sftp = this.connection.createSFTP();
      callback(null, sftp);
    } catch (error) {
      callback(error as Error, null);
    }
  }

  /**
   * End the connection
   */
  end(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }
}

/**
 * Mock Stream for terminal sessions
 */
class MockStream extends EventEmitter {
  constructor(private terminal: MockTerminal) {
    super();
    
    terminal.on('data', (data) => {
      this.emit('data', data);
    });
    
    terminal.on('exit', (code) => {
      this.emit('exit', code);
      this.emit('close');
    });
    
    // Send initial prompt
    setTimeout(() => {
      this.emit('data', '$ ');
    }, 10);
  }

  /**
   * Write data to the terminal
   */
  write(data: string): boolean {
    try {
      this.terminal.write(data);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Set the terminal size
   */
  setWindow(rows: number, cols: number): boolean {
    try {
      this.terminal.resize(cols, rows);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * End the stream
   */
  end(): void {
    this.terminal.close();
  }
}

/**
 * Mock Stream for command execution
 */
class MockExecStream extends EventEmitter {
  constructor(private result: { stdout: string; stderr: string; code: number }) {
    super();
    
    // Simulate command execution
    setTimeout(() => {
      if (result.stdout) {
        this.emit('data', result.stdout);
      }
      
      if (result.stderr) {
        this.emit('stderr', result.stderr);
      }
      
      this.emit('exit', result.code);
      this.emit('close');
    }, 10);
  }
}

/**
 * Create a mock SSH2 client factory
 */
export function createMockSSH2ClientFactory(server: MockSSHServer): () => MockSSH2Client {
  return () => new MockSSH2Client(server);
}

// Global variable to store the mock server instance
let globalMockServer: MockSSHServer | null = null;

/**
 * Set the global mock server instance
 */
export function setGlobalMockServer(server: MockSSHServer): void {
  globalMockServer = server;
}

/**
 * Mock the SSH2 module
 */
export function mockSSH2Module(server: MockSSHServer): void {
  setGlobalMockServer(server);
  
  vi.mock('ssh2', () => {
    return {
      Client: class {
        constructor() {
          if (!globalMockServer) {
            throw new Error('Mock server not initialized');
          }
          return new MockSSH2Client(globalMockServer);
        }
      }
    };
  });
}