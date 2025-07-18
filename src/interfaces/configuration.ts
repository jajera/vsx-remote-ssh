/**
 * Configuration management interfaces
 */
import { SSHHostConfig } from './ssh';

export interface ConfigurationManager {
  saveHost(config: SSHHostConfig): Promise<void>;
  getHosts(): Promise<SSHHostConfig[]>;
  deleteHost(hostId: string): Promise<void>;
  updateHost(hostId: string, config: Partial<SSHHostConfig>): Promise<void>;
  getHost(hostId: string): Promise<SSHHostConfig | undefined>;
}

export interface SecureStorage {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | undefined>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface ExtensionConfiguration {
  defaultPort: number;
  connectTimeout: number;
  reconnectAttempts: number;
  maxConcurrentConnections: number;
  enableFileSystemCache: boolean;
  cacheTimeout: number;
}