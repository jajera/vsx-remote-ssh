import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VSCodeSecureStorage } from './secure-storage';

// Mock VS Code API
const mockSecretStorage = {
  store: vi.fn(),
  get: vi.fn(),
  delete: vi.fn()
};

const mockContext = {
  secrets: mockSecretStorage
};

describe('VSCodeSecureStorage', () => {
  let secureStorage: VSCodeSecureStorage;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create a new secure storage for each test
    secureStorage = new VSCodeSecureStorage(mockContext as any);
  });

  it('should store a value securely', async () => {
    // Arrange
    const key = 'test-key';
    const value = 'test-value';
    mockSecretStorage.store.mockResolvedValue(undefined);
    
    // Act
    await secureStorage.store(key, value);
    
    // Assert
    expect(mockSecretStorage.store).toHaveBeenCalledWith('vsx-remote-ssh-test-key', value);
  });

  it('should retrieve a stored value', async () => {
    // Arrange
    const key = 'test-key';
    const value = 'test-value';
    mockSecretStorage.get.mockResolvedValue(value);
    
    // Act
    const result = await secureStorage.retrieve(key);
    
    // Assert
    expect(mockSecretStorage.get).toHaveBeenCalledWith('vsx-remote-ssh-test-key');
    expect(result).toBe(value);
  });

  it('should delete a stored value', async () => {
    // Arrange
    const key = 'test-key';
    mockSecretStorage.delete.mockResolvedValue(undefined);
    
    // Act
    await secureStorage.delete(key);
    
    // Assert
    expect(mockSecretStorage.delete).toHaveBeenCalledWith('vsx-remote-ssh-test-key');
  });

  it('should handle undefined when retrieving non-existent value', async () => {
    // Arrange
    const key = 'non-existent-key';
    mockSecretStorage.get.mockResolvedValue(undefined);
    
    // Act
    const result = await secureStorage.retrieve(key);
    
    // Assert
    expect(result).toBeUndefined();
  });
});