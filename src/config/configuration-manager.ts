import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SSHHostConfig, SSHConfig } from '../interfaces/ssh';
import { ConfigurationManager as IConfigurationManager, SecureStorage } from '../interfaces/configuration';
import { VSCodeSecureStorage } from './secure-storage';

export interface UserPreferences {
  defaultTerminalShell: string;
  defaultTerminalCols: number;
  defaultTerminalRows: number;
  enableFileCache: boolean;
  cacheMaxSize: number;
  cacheMaxAge: number;
  autoReconnect: boolean;
  reconnectAttempts: number;
  reconnectBackoffFactor: number;
  showConnectionStatus: boolean;
  enableCompression: boolean;
  keepAliveInterval: number;
  connectionTimeout: number;
}

export interface WorkspaceSettings {
  defaultHostId?: string;
  autoConnectOnOpen: boolean;
  rememberLastConnection: boolean;
  workspaceSpecificConfig: boolean;
}

export interface ExtensionConfig {
  userPreferences: UserPreferences;
  workspaceSettings: WorkspaceSettings;
  hosts: SSHHostConfig[];
}

/**
 * ConfigurationManager implementation that handles SSH host configurations
 * and secure credential storage
 */
export class ConfigurationManager implements IConfigurationManager {
  private configPath: string;
  private workspaceConfigPath: string;
  private config: ExtensionConfig;
  private defaultPreferences: UserPreferences;
  private defaultWorkspaceSettings: WorkspaceSettings;
  private secureStorage: SecureStorage | undefined;

  constructor(configDir: string, workspaceRoot?: string, secureStorage?: SecureStorage) {
    this.secureStorage = secureStorage;
    this.configPath = path.join(configDir, 'ssh-remote-config.json');
    this.workspaceConfigPath = workspaceRoot 
      ? path.join(workspaceRoot, '.vscode', 'ssh-remote-settings.json')
      : '';
    
    this.defaultPreferences = {
      defaultTerminalShell: '/bin/bash',
      defaultTerminalCols: 80,
      defaultTerminalRows: 24,
      enableFileCache: true,
      cacheMaxSize: 100 * 1024 * 1024, // 100MB
      cacheMaxAge: 30 * 60 * 1000, // 30 minutes
      autoReconnect: true,
      reconnectAttempts: 5,
      reconnectBackoffFactor: 2,
      showConnectionStatus: true,
      enableCompression: true,
      keepAliveInterval: 30,
      connectionTimeout: 30000
    };

    this.defaultWorkspaceSettings = {
      autoConnectOnOpen: false,
      rememberLastConnection: true,
      workspaceSpecificConfig: false
    };

    this.config = {
      userPreferences: { ...this.defaultPreferences },
      workspaceSettings: { ...this.defaultWorkspaceSettings },
      hosts: []
    };

    this.loadConfiguration();
  }

  async loadConfiguration(): Promise<void> {
    try {
      // Load global configuration
      if (fs.existsSync(this.configPath)) {
        const data = await fs.promises.readFile(this.configPath, 'utf8');
        const loadedConfig = JSON.parse(data);
        this.config = this.mergeConfigurations(loadedConfig);
      }

      // Load workspace-specific configuration
      if (this.workspaceConfigPath && fs.existsSync(this.workspaceConfigPath)) {
        const workspaceData = await fs.promises.readFile(this.workspaceConfigPath, 'utf8');
        const workspaceConfig = JSON.parse(workspaceData);
        this.config = this.mergeWorkspaceConfig(workspaceConfig);
      }
    } catch (error) {
      console.warn('Failed to load configuration:', error);
      // Use defaults if loading fails
    }
  }

  async saveConfiguration(): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        await fs.promises.mkdir(configDir, { recursive: true });
      }

      const configToSave = {
        userPreferences: this.config.userPreferences,
        hosts: this.config.hosts
      };

      await fs.promises.writeFile(this.configPath, JSON.stringify(configToSave, null, 2));
    } catch (error) {
      console.error('Failed to save configuration:', error);
      throw error;
    }
  }

  async saveWorkspaceSettings(): Promise<void> {
    if (!this.workspaceConfigPath) {return;}

    try {
      const workspaceDir = path.dirname(this.workspaceConfigPath);
      if (!fs.existsSync(workspaceDir)) {
        await fs.promises.mkdir(workspaceDir, { recursive: true });
      }

      await fs.promises.writeFile(
        this.workspaceConfigPath, 
        JSON.stringify({ workspaceSettings: this.config.workspaceSettings }, null, 2)
      );
    } catch (error) {
      console.error('Failed to save workspace settings:', error);
      throw error;
    }
  }

  getUserPreferences(): UserPreferences {
    return { ...this.config.userPreferences };
  }

  getWorkspaceSettings(): WorkspaceSettings {
    return { ...this.config.workspaceSettings };
  }

  async updateUserPreferences(preferences: Partial<UserPreferences>): Promise<void> {
    this.config.userPreferences = { ...this.config.userPreferences, ...preferences };
    await this.saveConfiguration();
  }

  async updateWorkspaceSettings(settings: Partial<WorkspaceSettings>): Promise<void> {
    this.config.workspaceSettings = { ...this.config.workspaceSettings, ...settings };
    await this.saveWorkspaceSettings();
  }

  /**
   * Get all host configurations (synchronous version)
   * @returns Array of host configurations (without secure credentials)
   */
  getHostsSync(): SSHHostConfig[] {
    return [...this.config.hosts];
  }

  /**
   * Get a host configuration (synchronous version)
   * @param hostId The ID of the host to retrieve
   * @returns The host configuration without secure credentials
   */
  getHostSync(hostId: string): SSHHostConfig | undefined {
    return this.config.hosts.find(host => host.id === hostId);
  }

  /**
   * Save a host configuration and securely store any credentials
   * @param host The host configuration to save
   */
  async saveHost(host: SSHHostConfig): Promise<void> {
    if (!this.validateHostConfig(host)) {
      throw new Error('Invalid host configuration');
    }

    // Store password securely if provided
    if (host.authMethod === 'password' && (host as any).password) {
      if (!this.secureStorage) {
        throw new Error('Secure storage not available');
      }
      
      const password = (host as any).password;
      await this.secureStorage.store(`host_password_${host.id}`, password);
      
      // Remove password from the host config object
      const hostCopy = { ...host };
      delete (hostCopy as any).password;
      host = hostCopy;
    }
    
    // Store passphrase securely if provided
    if (host.authMethod === 'key' && (host as any).passphrase) {
      if (!this.secureStorage) {
        throw new Error('Secure storage not available');
      }
      
      const passphrase = (host as any).passphrase;
      await this.secureStorage.store(`host_passphrase_${host.id}`, passphrase);
      
      // Remove passphrase from the host config object
      const hostCopy = { ...host };
      delete (hostCopy as any).passphrase;
      host = hostCopy;
    }

    const existingIndex = this.config.hosts.findIndex(h => h.id === host.id);
    if (existingIndex >= 0) {
      this.config.hosts[existingIndex] = host;
    } else {
      this.config.hosts.push(host);
    }

    await this.saveConfiguration();
  }
  
  /**
   * Legacy method for backward compatibility
   * @deprecated Use saveHost instead
   */
  async addHost(host: SSHHostConfig): Promise<void> {
    return this.saveHost(host);
  }

  /**
   * Update an existing host configuration
   * @param hostId The ID of the host to update
   * @param updates The partial host configuration updates
   */
  async updateHost(hostId: string, updates: Partial<SSHHostConfig>): Promise<void> {
    const hostIndex = this.config.hosts.findIndex(h => h.id === hostId);
    if (hostIndex === -1) {
      throw new Error(`Host with ID ${hostId} not found`);
    }

    const currentHost = this.config.hosts[hostIndex];
    const updatedHost = { ...currentHost, ...updates };
    
    // Handle password updates
    if ((updates as any).password) {
      if (!this.secureStorage) {
        throw new Error('Secure storage not available');
      }
      
      const password = (updates as any).password;
      await this.secureStorage.store(`host_password_${hostId}`, password);
      
      // Remove password from the updates object
      delete (updatedHost as any).password;
    }
    
    // Handle passphrase updates
    if ((updates as any).passphrase) {
      if (!this.secureStorage) {
        throw new Error('Secure storage not available');
      }
      
      const passphrase = (updates as any).passphrase;
      await this.secureStorage.store(`host_passphrase_${hostId}`, passphrase);
      
      // Remove passphrase from the updates object
      delete (updatedHost as any).passphrase;
    }

    if (!this.validateHostConfig(updatedHost)) {
      throw new Error('Invalid host configuration');
    }

    this.config.hosts[hostIndex] = updatedHost;
    await this.saveConfiguration();
  }

  /**
   * Delete a host configuration and its associated secure credentials
   * @param hostId The ID of the host to delete
   */
  async deleteHost(hostId: string): Promise<void> {
    const hostIndex = this.config.hosts.findIndex(h => h.id === hostId);
    if (hostIndex === -1) {
      throw new Error(`Host with ID ${hostId} not found`);
    }

    // Delete any associated secure credentials
    if (this.secureStorage) {
      try {
        await this.secureStorage.delete(`host_password_${hostId}`);
        await this.secureStorage.delete(`host_passphrase_${hostId}`);
      } catch (error) {
        console.warn('Failed to delete secure credentials:', error);
      }
    }

    this.config.hosts.splice(hostIndex, 1);
    await this.saveConfiguration();
  }
  
  /**
   * Legacy method for backward compatibility
   * @deprecated Use deleteHost instead
   */
  async removeHost(hostId: string): Promise<void> {
    return this.deleteHost(hostId);
  }

  /**
   * Get a host configuration with secure credentials if available
   * @param hostId The ID of the host to retrieve
   * @returns The host configuration with secure credentials or undefined if not found
   */
  async getHost(hostId: string): Promise<SSHHostConfig | undefined> {
    const host = this.config.hosts.find(h => h.id === hostId);
    if (!host) {
      return undefined;
    }

    // Create a copy of the host to avoid modifying the stored config
    const hostCopy = { ...host };

    // Add secure credentials if available
    if (this.secureStorage) {
      if (host.authMethod === 'password') {
        const password = await this.secureStorage.retrieve(`host_password_${hostId}`);
        if (password) {
          (hostCopy as any).password = password;
        }
      }

      if (host.authMethod === 'key') {
        const passphrase = await this.secureStorage.retrieve(`host_passphrase_${hostId}`);
        if (passphrase) {
          (hostCopy as any).passphrase = passphrase;
        }
      }
    }

    return hostCopy;
  }

  /**
   * Get all host configurations
   * @returns Array of host configurations (without secure credentials)
   */
  async getHosts(): Promise<SSHHostConfig[]> {
    return [...this.config.hosts];
  }

  /**
   * Get a host configuration with connection settings
   * @param hostId The ID of the host to retrieve
   * @returns The SSH connection configuration or undefined if not found
   */
  async getHostConfig(hostId: string): Promise<SSHConfig | undefined> {
    const host = await this.getHost(hostId);
    if (!host) {return undefined;}

    const config: SSHConfig = {
      host: host.host,
      port: host.port,
      username: host.username,
      authMethod: host.authMethod,
      privateKeyPath: host.privateKeyPath,
      connectTimeout: this.config.userPreferences.connectionTimeout,
      maxReconnectAttempts: this.config.userPreferences.reconnectAttempts,
      reconnectBackoffFactor: this.config.userPreferences.reconnectBackoffFactor,
      reconnectMaxDelayMs: 30000,
      reconnectInitialDelayMs: 1000
    };

    // Add secure credentials if available
    if ((host as any).password) {
      config.password = (host as any).password;
    }

    if ((host as any).passphrase) {
      config.passphrase = (host as any).passphrase;
    }

    return config;
  }

  validateHostConfig(host: SSHHostConfig): boolean {
    if (!host.id || !host.name || !host.host || !host.username) {
      return false;
    }

    if (host.port < 1 || host.port > 65535) {
      return false;
    }

    if (!['password', 'key', 'agent'].includes(host.authMethod)) {
      return false;
    }

    if (host.authMethod === 'key' && !host.privateKeyPath) {
      return false;
    }

    return true;
  }

  private mergeConfigurations(loadedConfig: any): ExtensionConfig {
    return {
      userPreferences: {
        ...this.defaultPreferences,
        ...loadedConfig.userPreferences
      },
      workspaceSettings: { ...this.defaultWorkspaceSettings },
      hosts: loadedConfig.hosts || []
    };
  }

  private mergeWorkspaceConfig(workspaceConfig: any): ExtensionConfig {
    return {
      ...this.config,
      workspaceSettings: {
        ...this.config.workspaceSettings,
        ...workspaceConfig.workspaceSettings
      }
    };
  }

  /**
   * Get the default host configuration
   * @returns The default host configuration or undefined if none is set
   */
  async getDefaultHost(): Promise<SSHHostConfig | undefined> {
    if (this.config.workspaceSettings.defaultHostId) {
      return await this.getHost(this.config.workspaceSettings.defaultHostId);
    }
    return this.config.hosts.length > 0 ? await this.getHost(this.config.hosts[0].id) : undefined;
  }

  /**
   * Get the default host configuration (synchronous version)
   * @returns The default host configuration without secure credentials
   */
  getDefaultHostSync(): SSHHostConfig | undefined {
    if (this.config.workspaceSettings.defaultHostId) {
      return this.getHostSync(this.config.workspaceSettings.defaultHostId);
    }
    return this.config.hosts.length > 0 ? this.config.hosts[0] : undefined;
  }

  /**
   * Set the default host
   * @param hostId The ID of the host to set as default
   */
  async setDefaultHost(hostId: string): Promise<void> {
    const host = await this.getHost(hostId);
    if (!host) {
      throw new Error(`Host with ID ${hostId} not found`);
    }

    this.config.workspaceSettings.defaultHostId = hostId;
    await this.saveWorkspaceSettings();
  }

  exportConfiguration(): ExtensionConfig {
    return {
      userPreferences: { ...this.config.userPreferences },
      workspaceSettings: { ...this.config.workspaceSettings },
      hosts: [...this.config.hosts]
    };
  }

  importConfiguration(config: ExtensionConfig): void {
    this.config = {
      userPreferences: { ...this.defaultPreferences, ...config.userPreferences },
      workspaceSettings: { ...this.defaultWorkspaceSettings, ...config.workspaceSettings },
      hosts: config.hosts || []
    };
  }
} 