import * as vscode from 'vscode';
import { SecureStorage } from '../interfaces/configuration';

/**
 * Implementation of SecureStorage using VS Code's SecretStorage API
 * for secure credential management
 */
export class VSCodeSecureStorage implements SecureStorage {
  private secretStorage: vscode.SecretStorage;
  private readonly keyPrefix: string = 'vsx-remote-ssh-';

  constructor(context: vscode.ExtensionContext) {
    this.secretStorage = context.secrets;
  }

  /**
   * Store a value securely
   * @param key The key to store the value under
   * @param value The value to store
   */
  async store(key: string, value: string): Promise<void> {
    await this.secretStorage.store(`${this.keyPrefix}${key}`, value);
  }

  /**
   * Retrieve a securely stored value
   * @param key The key to retrieve
   * @returns The stored value or undefined if not found
   */
  async retrieve(key: string): Promise<string | undefined> {
    return await this.secretStorage.get(`${this.keyPrefix}${key}`);
  }

  /**
   * Delete a securely stored value
   * @param key The key to delete
   */
  async delete(key: string): Promise<void> {
    await this.secretStorage.delete(`${this.keyPrefix}${key}`);
  }

  /**
   * Clear all securely stored values for this extension
   */
  async clear(): Promise<void> {
    // VS Code doesn't provide a direct way to clear all secrets
    // This would require tracking all keys separately
    // For now, this is a placeholder
    console.warn('Clear all secrets not implemented');
  }
}