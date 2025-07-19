import * as vscode from 'vscode';
import { SecureStorage } from '../interfaces/configuration';

/**
 * Implementation of SecureStorage using VS Code's SecretStorage API
 * for secure credential management
 */
export class VSCodeSecureStorage implements SecureStorage {
  private secretStorage: vscode.SecretStorage;
  private readonly keyPrefix: string = 'vsx-remote-ssh-';
  private storedKeys: Set<string> = new Set();

  constructor(context: vscode.ExtensionContext) {
    this.secretStorage = context.secrets;
  }

  /**
   * Store a value securely
   * @param key The key to store the value under
   * @param value The value to store
   */
  async store(key: string, value: string): Promise<void> {
    const fullKey = `${this.keyPrefix}${key}`;
    await this.secretStorage.store(fullKey, value);
    this.storedKeys.add(fullKey);
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
    const fullKey = `${this.keyPrefix}${key}`;
    await this.secretStorage.delete(fullKey);
    this.storedKeys.delete(fullKey);
  }

  /**
   * Clear all securely stored values for this extension
   */
  async clear(): Promise<void> {
    // Delete all tracked keys
    const deletePromises = Array.from(this.storedKeys).map(key => 
      this.secretStorage.delete(key)
    );
    await Promise.all(deletePromises);
    this.storedKeys.clear();
  }
}