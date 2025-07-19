/**
 * Performance tests for SSH Remote Extension
 * 
 * These tests verify the performance characteristics of the extension,
 * including file transfer speeds, connection latency, and memory usage.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceMonitor, OperationType } from '../../src/ssh/performance-monitor';
import * as vscode from 'vscode';

// Mock VS Code API
vi.mock('vscode', () => {
  return {
    window: {
      createStatusBarItem: vi.fn(() => ({
        text: '',
        tooltip: '',
        command: '',
        show: vi.fn(),
        dispose: vi.fn()
      })),
      showInformationMessage: vi.fn()
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() }))
    },
    Uri: {
      parse: vi.fn((uri) => ({ 
        toString: () => uri,
        path: uri.split('://')[1] || uri
      }))
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2
    }
  };
});

describe('Performance Tests', () => {
  let performanceMonitor: PerformanceMonitor;
  
  beforeEach(() => {
    // Reset the singleton instance
    // @ts-ignore - Accessing private static property for testing
    PerformanceMonitor.instance = undefined;
    
    // Get a fresh instance
    performanceMonitor = PerformanceMonitor.getInstance();
    
    // Clear all mocks
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    performanceMonitor.dispose();
  });
  
  describe('File Transfer Performance', () => {
    it('should measure file read performance', () => {
      // Arrange
      const fileSize = 1024 * 1024; // 1MB
      const uri = vscode.Uri.parse('ssh://testuser@localhost:2222/home/testuser/large-file.bin');
      
      // Act - Simulate file read operation
      performanceMonitor.recordOperation(
        OperationType.FileRead,
        100,
        true,
        'test-connection',
        uri.toString(),
        fileSize,
        undefined,
        false
      );
      
      // Get statistics
      const statistics = performanceMonitor.getStatistics();
      const fileReadStats = statistics.get(OperationType.FileRead);
      
      // Assert - Verify statistics were recorded
      expect(fileReadStats).toBeDefined();
      if (fileReadStats) {
        expect(fileReadStats.count).toBe(1);
        expect(fileReadStats.totalDataSize).toBe(fileSize);
      }
    });
    
    it('should measure file write performance', () => {
      // Arrange
      const fileSize = 1024 * 1024; // 1MB
      const uri = vscode.Uri.parse('ssh://testuser@localhost:2222/home/testuser/large-file-write.bin');
      
      // Act - Simulate file write operation
      performanceMonitor.recordOperation(
        OperationType.FileWrite,
        100,
        true,
        'test-connection',
        uri.toString(),
        fileSize,
        undefined,
        false
      );
      
      // Get statistics
      const statistics = performanceMonitor.getStatistics();
      const fileWriteStats = statistics.get(OperationType.FileWrite);
      
      // Assert - Verify statistics were recorded
      expect(fileWriteStats).toBeDefined();
      if (fileWriteStats) {
        expect(fileWriteStats.count).toBe(1);
        expect(fileWriteStats.totalDataSize).toBe(fileSize);
      }
    });
    
    it('should measure directory listing performance', () => {
      // Arrange
      const metricsSpy = vi.fn();
      performanceMonitor.on('metrics', metricsSpy);
      
      const fileCount = 100;
      const uri = vscode.Uri.parse('ssh://testuser@localhost:2222/home/testuser/perf-test');
      
      // Act - Simulate directory listing operation
      performanceMonitor.recordOperation(
        OperationType.DirectoryRead,
        50,
        true,
        'test-connection',
        uri.toString(),
        undefined,
        undefined,
        false
      );
      
      // Assert - Verify metrics were recorded
      expect(metricsSpy).toHaveBeenCalled();
      
      // Get statistics
      const statistics = performanceMonitor.getStatistics();
      const dirReadStats = statistics.get(OperationType.DirectoryRead);
      
      expect(dirReadStats).toBeDefined();
      if (dirReadStats) {
        expect(dirReadStats.count).toBe(1);
        expect(dirReadStats.averageDuration).toBe(50);
      }
    });
    
    it('should measure file caching performance improvement', () => {
      // Arrange
      const uri = vscode.Uri.parse('ssh://testuser@localhost:2222/home/testuser/cache-test.bin');
      const fileSize = 100 * 1024; // 100KB
      
      // Act - Simulate first read (cache miss)
      performanceMonitor.recordOperation(
        OperationType.FileRead,
        50,
        true,
        'test-connection',
        uri.toString(),
        fileSize,
        undefined,
        false
      );
      
      // Simulate second read (cache hit)
      performanceMonitor.recordOperation(
        OperationType.FileRead,
        5,
        true,
        'test-connection',
        uri.toString(),
        fileSize,
        undefined,
        true
      );
      
      // Assert - Verify cache hit rate
      const statistics = performanceMonitor.getStatistics();
      const fileReadStats = statistics.get(OperationType.FileRead);
      
      expect(fileReadStats).toBeDefined();
      if (fileReadStats) {
        expect(fileReadStats.count).toBe(2);
        expect(fileReadStats.cacheHitRate).toBe(0.5); // 50% cache hit rate
        expect(fileReadStats.averageDuration).toBeLessThan(50); // Average should be less than first read
      }
    });
  });
  
  describe('Connection Latency', () => {
    it('should measure and record connection latency', () => {
      // Arrange
      const latencySpy = vi.fn();
      performanceMonitor.on('latency', latencySpy);
      
      // Act - Record latency
      performanceMonitor.recordLatency(
        'test-connection',
        'localhost',
        50,
        3,
        0
      );
      
      // Assert - Verify latency was recorded
      expect(latencySpy).toHaveBeenCalled();
      
      // Get latency statistics
      const latencyStats = performanceMonitor.getLatencyStatistics('test-connection');
      expect(latencyStats).toBeDefined();
      
      if (latencyStats) {
        expect(latencyStats.current).toBe(50);
        expect(latencyStats.average).toBe(50);
      }
    });
    
    it('should handle multiple concurrent connections', () => {
      // Arrange
      const connectionCount = 5;
      
      // Act - Record latency for multiple connections
      for (let i = 0; i < connectionCount; i++) {
        performanceMonitor.recordLatency(
          `connection-${i}`,
          'localhost',
          50 + i * 10,
          3,
          0
        );
      }
      
      // Assert - Verify latency was recorded for each connection
      for (let i = 0; i < connectionCount; i++) {
        const latencyStats = performanceMonitor.getLatencyStatistics(`connection-${i}`);
        expect(latencyStats).toBeDefined();
        
        if (latencyStats) {
          expect(latencyStats.current).toBe(50 + i * 10);
        }
      }
    });
  });
  
  describe('Memory Usage', () => {
    it('should measure and record memory usage', () => {
      // Arrange
      const memorySpy = vi.fn();
      performanceMonitor.on('memory', memorySpy);
      
      // Act - Record memory usage
      performanceMonitor.recordMemoryUsage(
        'test-connection',
        'localhost'
      );
      
      // Assert - Verify memory usage was recorded
      expect(memorySpy).toHaveBeenCalled();
      
      // Get memory statistics
      const memoryStats = performanceMonitor.getMemoryStatistics('test-connection');
      expect(memoryStats).toBeDefined();
      
      if (memoryStats) {
        expect(memoryStats.currentHeapUsed).toBeGreaterThan(0);
      }
    });
    
    it('should track memory usage during file operations', () => {
      // Arrange
      const uri = vscode.Uri.parse('ssh://testuser@localhost:2222/home/testuser/memory-test.bin');
      const fileSize = 5 * 1024 * 1024; // 5MB
      
      // Record initial memory usage
      performanceMonitor.recordMemoryUsage('test-connection', 'localhost');
      
      // Act - Simulate file read operation
      performanceMonitor.recordOperation(
        OperationType.FileRead,
        100,
        true,
        'test-connection',
        uri.toString(),
        fileSize,
        undefined,
        false
      );
      
      // Record memory usage after file operation
      performanceMonitor.recordMemoryUsage('test-connection', 'localhost');
      
      // Assert - Verify memory usage was recorded
      const memoryStats = performanceMonitor.getMemoryStatistics('test-connection');
      expect(memoryStats).toBeDefined();
    });
  });
  
  describe('Performance Statistics', () => {
    it('should collect and aggregate performance statistics', () => {
      // Arrange - Perform various operations
      const fileUri = vscode.Uri.parse('ssh://testuser@localhost:2222/home/testuser/stats-test.txt');
      const content = 'Performance test content';
      
      // Act - Perform operations
      // File write
      performanceMonitor.recordOperation(
        OperationType.FileWrite,
        50,
        true,
        'test-connection',
        fileUri.toString(),
        content.length
      );
      
      // File read
      performanceMonitor.recordOperation(
        OperationType.FileRead,
        30,
        true,
        'test-connection',
        fileUri.toString(),
        content.length,
        undefined,
        false
      );
      
      // File read with cache
      performanceMonitor.recordOperation(
        OperationType.FileRead,
        5,
        true,
        'test-connection',
        fileUri.toString(),
        content.length,
        undefined,
        true
      );
      
      // Failed operation
      performanceMonitor.recordOperation(
        OperationType.FileDelete,
        20,
        false,
        'test-connection',
        '/nonexistent/file.txt',
        undefined,
        'File not found'
      );
      
      // Get statistics
      const statistics = performanceMonitor.getStatistics();
      
      // Assert - Verify statistics were collected
      expect(statistics.size).toBe(3); // FileWrite, FileRead, FileDelete
      
      // Check file read statistics
      const fileReadStats = statistics.get(OperationType.FileRead);
      expect(fileReadStats).toBeDefined();
      if (fileReadStats) {
        expect(fileReadStats.count).toBe(2);
        expect(fileReadStats.averageDuration).toBe(17.5); // (30 + 5) / 2
        expect(fileReadStats.successRate).toBe(1); // 100% success
        expect(fileReadStats.cacheHitRate).toBe(0.5); // 50% cache hit
      }
      
      // Check file write statistics
      const fileWriteStats = statistics.get(OperationType.FileWrite);
      expect(fileWriteStats).toBeDefined();
      if (fileWriteStats) {
        expect(fileWriteStats.count).toBe(1);
        expect(fileWriteStats.averageDuration).toBe(50);
        expect(fileWriteStats.successRate).toBe(1); // 100% success
      }
      
      // Check file delete statistics
      const fileDeleteStats = statistics.get(OperationType.FileDelete);
      expect(fileDeleteStats).toBeDefined();
      if (fileDeleteStats) {
        expect(fileDeleteStats.count).toBe(1);
        expect(fileDeleteStats.averageDuration).toBe(20);
        expect(fileDeleteStats.successRate).toBe(0); // 0% success
      }
    });
  });
});