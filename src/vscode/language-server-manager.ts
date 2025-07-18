/**
 * Language Server Manager Implementation
 * Handles remote language servers for providing language features
 */
import * as vscode from 'vscode';
import { LanguageServerManager } from '../interfaces/extension';
import { SSHConnectionManager, SSHConnection } from '../interfaces/ssh';

/**
 * Implementation of the LanguageServerManager interface
 */
export class LanguageServerManagerImpl implements LanguageServerManager {
  private activeServers: Map<string, Set<string>> = new Map();
  private serverInstallCommands: Map<string, string> = new Map();
  
  constructor(private connectionManager: SSHConnectionManager) {
    // Initialize server installation commands for common languages
    this.initializeServerCommands();
  }
  
  /**
   * Start a language server on the remote host
   */
  async startLanguageServer(connectionId: string, languageId: string): Promise<boolean> {
    const connection = this.getConnection(connectionId);
    
    try {
      // Check if the language server is available
      const isAvailable = await this.isLanguageServerAvailable(connectionId, languageId);
      
      if (!isAvailable) {
        // Try to install the language server
        const installed = await this.installLanguageServer(connectionId, languageId);
        
        if (!installed) {
          return false;
        }
      }
      
      // Start the language server
      const command = this.getLanguageServerStartCommand(languageId);
      
      if (!command) {
        return false;
      }
      
      const result = await connection.execute(`${command} &`);
      
      if (result.exitCode !== 0) {
        console.error(`Failed to start language server: ${result.stderr}`);
        return false;
      }
      
      // Add to active servers
      this.addActiveServer(connectionId, languageId);
      
      return true;
    } catch (error) {
      console.error('Error starting language server:', error);
      return false;
    }
  }
  
  /**
   * Stop a language server
   */
  async stopLanguageServer(connectionId: string, languageId: string): Promise<void> {
    const connection = this.getConnection(connectionId);
    
    try {
      // Get the process name for the language server
      const processName = this.getLanguageServerProcessName(languageId);
      
      if (!processName) {
        return;
      }
      
      // Kill the language server process
      await connection.execute(`pkill -f "${processName}"`);
      
      // Remove from active servers
      this.removeActiveServer(connectionId, languageId);
    } catch (error) {
      console.error('Error stopping language server:', error);
    }
  }
  
  /**
   * Get active language servers
   */
  async getActiveLanguageServers(connectionId: string): Promise<string[]> {
    const servers = this.activeServers.get(connectionId);
    
    if (!servers) {
      return [];
    }
    
    return Array.from(servers);
  }
  
  /**
   * Check if a language server is available on the remote host
   */
  async isLanguageServerAvailable(connectionId: string, languageId: string): Promise<boolean> {
    const connection = this.getConnection(connectionId);
    
    try {
      // Check if the language server is installed
      const checkCommand = this.getLanguageServerCheckCommand(languageId);
      
      if (!checkCommand) {
        return false;
      }
      
      const result = await connection.execute(checkCommand);
      
      return result.exitCode === 0;
    } catch (error) {
      console.error('Error checking language server availability:', error);
      return false;
    }
  }
  
  /**
   * Install a language server on the remote host
   */
  async installLanguageServer(connectionId: string, languageId: string): Promise<boolean> {
    const connection = this.getConnection(connectionId);
    
    try {
      // Get the installation command for the language server
      const installCommand = this.serverInstallCommands.get(languageId);
      
      if (!installCommand) {
        return false;
      }
      
      // Install the language server
      const result = await connection.execute(installCommand);
      
      return result.exitCode === 0;
    } catch (error) {
      console.error('Error installing language server:', error);
      return false;
    }
  }
  
  /**
   * Get a connection by ID
   */
  private getConnection(connectionId: string): SSHConnection {
    const connection = this.connectionManager.getConnection(connectionId);
    
    if (!connection) {
      throw new Error(`Connection ${connectionId} not found`);
    }
    
    return connection;
  }
  
  /**
   * Initialize server installation commands for common languages
   */
  private initializeServerCommands(): void {
    // TypeScript
    this.serverInstallCommands.set('typescript', 'npm install -g typescript-language-server typescript');
    
    // JavaScript
    this.serverInstallCommands.set('javascript', 'npm install -g typescript-language-server typescript');
    
    // Python
    this.serverInstallCommands.set('python', 'pip install python-language-server[all]');
    
    // Java
    this.serverInstallCommands.set('java', 'curl -L https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz | tar xz -C /tmp/ && mkdir -p ~/.local/share/jdtls && mv /tmp/plugins ~/.local/share/jdtls/ && mv /tmp/features ~/.local/share/jdtls/ && mv /tmp/bin ~/.local/share/jdtls/ && mv /tmp/config_linux ~/.local/share/jdtls/');
    
    // Go
    this.serverInstallCommands.set('go', 'go get -u golang.org/x/tools/gopls');
    
    // Rust
    this.serverInstallCommands.set('rust', 'curl --proto \'=https\' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && source $HOME/.cargo/env && rustup component add rls rust-analysis rust-src');
    
    // C/C++
    this.serverInstallCommands.set('cpp', 'apt-get update && apt-get install -y clangd');
    this.serverInstallCommands.set('c', 'apt-get update && apt-get install -y clangd');
    
    // HTML/CSS/JSON
    this.serverInstallCommands.set('html', 'npm install -g vscode-html-languageserver-bin');
    this.serverInstallCommands.set('css', 'npm install -g vscode-css-languageserver-bin');
    this.serverInstallCommands.set('json', 'npm install -g vscode-json-languageserver-bin');
  }
  
  /**
   * Get the command to check if a language server is installed
   */
  private getLanguageServerCheckCommand(languageId: string): string | undefined {
    switch (languageId) {
      case 'typescript':
      case 'javascript':
        return 'which typescript-language-server';
      case 'python':
        return 'which pyls';
      case 'java':
        return 'test -d ~/.local/share/jdtls';
      case 'go':
        return 'which gopls';
      case 'rust':
        return 'which rls';
      case 'cpp':
      case 'c':
        return 'which clangd';
      case 'html':
        return 'which html-languageserver';
      case 'css':
        return 'which css-languageserver';
      case 'json':
        return 'which json-languageserver';
      default:
        return undefined;
    }
  }
  
  /**
   * Get the command to start a language server
   */
  private getLanguageServerStartCommand(languageId: string): string | undefined {
    switch (languageId) {
      case 'typescript':
      case 'javascript':
        return 'typescript-language-server --stdio';
      case 'python':
        return 'pyls';
      case 'java':
        return 'java -jar ~/.local/share/jdtls/plugins/org.eclipse.equinox.launcher_*.jar -configuration ~/.local/share/jdtls/config_linux';
      case 'go':
        return 'gopls';
      case 'rust':
        return 'rls';
      case 'cpp':
      case 'c':
        return 'clangd';
      case 'html':
        return 'html-languageserver --stdio';
      case 'css':
        return 'css-languageserver --stdio';
      case 'json':
        return 'json-languageserver --stdio';
      default:
        return undefined;
    }
  }
  
  /**
   * Get the process name for a language server
   */
  private getLanguageServerProcessName(languageId: string): string | undefined {
    switch (languageId) {
      case 'typescript':
      case 'javascript':
        return 'typescript-language-server';
      case 'python':
        return 'pyls';
      case 'java':
        return 'org.eclipse.equinox.launcher';
      case 'go':
        return 'gopls';
      case 'rust':
        return 'rls';
      case 'cpp':
      case 'c':
        return 'clangd';
      case 'html':
        return 'html-languageserver';
      case 'css':
        return 'css-languageserver';
      case 'json':
        return 'json-languageserver';
      default:
        return undefined;
    }
  }
  
  /**
   * Add a language server to the active servers list
   */
  private addActiveServer(connectionId: string, languageId: string): void {
    let servers = this.activeServers.get(connectionId);
    
    if (!servers) {
      servers = new Set<string>();
      this.activeServers.set(connectionId, servers);
    }
    
    servers.add(languageId);
  }
  
  /**
   * Remove a language server from the active servers list
   */
  private removeActiveServer(connectionId: string, languageId: string): void {
    const servers = this.activeServers.get(connectionId);
    
    if (servers) {
      servers.delete(languageId);
      
      if (servers.size === 0) {
        this.activeServers.delete(connectionId);
      }
    }
  }
  
  /**
   * Dispose of all resources
   */
  async dispose(): Promise<void> {
    // Stop all language servers
    for (const [connectionId, servers] of this.activeServers.entries()) {
      for (const languageId of servers) {
        await this.stopLanguageServer(connectionId, languageId);
      }
    }
    
    this.activeServers.clear();
  }
}