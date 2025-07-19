// Test setup file for vitest
import { vi } from 'vitest';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
};

// Save real implementations
const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;
const realSetInterval = global.setInterval;
const realClearInterval = global.clearInterval;

// Mock setTimeout and clearTimeout for testing
global.setTimeout = vi.fn((callback: any, delay: number) => realSetTimeout(callback, delay)) as any;
global.clearTimeout = vi.fn((id: any) => realClearTimeout(id)) as any;

// Mock setInterval and clearInterval for testing
global.setInterval = vi.fn((callback: any, delay: number) => realSetInterval(callback, delay)) as any;
global.clearInterval = vi.fn((id: any) => realClearInterval(id)) as any; 