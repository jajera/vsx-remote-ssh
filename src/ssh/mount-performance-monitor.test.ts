/**
 * Tests for MountPerformanceMonitor
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MountPerformanceMonitor, MountOperationType, NetworkQuality } from './mount-performance-monitor';

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: '',
      tooltip: '',
      command: '',
      show: vi.fn(),
      dispose: vi.fn()
    })),
    showInformationMessage: vi.fn(),
    createWebviewPanel: vi.fn(() => ({
      webview: {
        html: '',
        cspSource: 'test',
        onDidReceiveMessage: vi.fn()
      },
      onDidDispose: vi.fn(),
      visible: true
    }))
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() }))
  },
  StatusBarAlignment: {
    Right: 2
  },
  ViewColumn: {
    One: 1
  },
  Uri: {
    parse: vi.fn((uri: string) => ({
      path: uri.replace('mount://', '/'),
      scheme: 'mount'
    }))
  }
}));

describe('MountPerformanceMonitor', () => {
  let monitor: MountPerformanceMonitor;

  beforeEach(() => {
    // Reset singleton instance
    (MountPerformanceMonitor as any).instance = undefined;
    monitor = MountPerformanceMonitor.getInstance();
  });

  afterEach(() => {
    monitor.dispose();
    vi.clearAllMocks();
  });

  describe('Performance Metrics Collection', () => {
    it('should record mount operation metrics', () => {
      const mountId = 'test-mount-1';
      const operationType = MountOperationType.MountRead;
      const duration = 150;
      const dataSize = 1024;

      monitor.recordMountOperation(
        operationType,
        duration,
        true,
        'mount://test/file.txt',
        'ssh://user@host/file.txt',
        mountId,
        dataSize,
        undefined,
        true
      );

      // Verify metrics were recorded
      const pattern = monitor.getUsagePattern(mountId);
      expect(pattern).toBeDefined();
      expect(pattern!.mountId).toBe(mountId);
    });

    it('should track usage patterns correctly', () => {
      const mountId = 'test-mount-2';
      
      // Record multiple operations
      for (let i = 0; i < 5; i++) {
        monitor.recordMountOperation(
          MountOperationType.MountRead,
          100 + i * 10,
          true,
          `mount://test/file${i}.txt`,
          `ssh://user@host/file${i}.txt`,
          mountId,
          1024 * (i + 1),
          undefined,
          i % 2 === 0
        );
      }

      const pattern = monitor.getUsagePattern(mountId);
      expect(pattern).toBeDefined();
      expect(pattern!.frequentFiles.length).toBeGreaterThan(0);
      expect(pattern!.readWriteRatio).toBeGreaterThan(0);
      expect(pattern!.averageFileSize).toBeGreaterThan(0);
    });

    it('should update hourly activity patterns', () => {
      const mountId = 'test-mount-3';
      const currentHour = new Date().getHours();

      monitor.recordMountOperation(
        MountOperationType.MountList,
        50,
        true,
        'mount://test/',
        'ssh://user@host/',
        mountId
      );

      const pattern = monitor.getUsagePattern(mountId);
      expect(pattern).toBeDefined();
      expect(pattern!.hourlyActivity[currentHour]).toBeGreaterThan(0);
    });
  });

  describe('Network Condition Monitoring', () => {
    it('should record network conditions', () => {
      const mountId = 'test-mount-4';
      const latency = 75;
      const bandwidth = 8_000_000; // 8 MB/s
      const packetLoss = 0.5;

      monitor.recordNetworkCondition(mountId, latency, bandwidth, packetLoss);

      const stats = monitor.getNetworkStatistics(mountId);
      expect(stats).toBeDefined();
      expect(stats!.currentCondition.latency).toBe(latency);
      expect(stats!.currentCondition.bandwidth).toBe(bandwidth);
      expect(stats!.currentCondition.quality).toBe(NetworkQuality.Good);
    });

    it('should classify network quality correctly', () => {
      const mountId = 'test-mount-5';

      // Test excellent quality
      monitor.recordNetworkCondition(mountId, 25, 15_000_000, 0.05);
      let stats = monitor.getNetworkStatistics(mountId);
      expect(stats!.currentCondition.quality).toBe(NetworkQuality.Excellent);

      // Test poor quality
      monitor.recordNetworkCondition(mountId, 500, 500_000, 10);
      stats = monitor.getNetworkStatistics(mountId);
      expect(stats!.currentCondition.quality).toBe(NetworkQuality.Poor);

      // Test offline
      monitor.recordNetworkCondition(mountId, 2000, 0, 100);
      stats = monitor.getNetworkStatistics(mountId);
      expect(stats!.currentCondition.quality).toBe(NetworkQuality.Offline);
    });

    it('should calculate network trends', () => {
      const mountId = 'test-mount-6';

      // Record improving trend (decreasing latency)
      monitor.recordNetworkCondition(mountId, 200, 1_000_000, 1);
      monitor.recordNetworkCondition(mountId, 150, 1_000_000, 1);
      monitor.recordNetworkCondition(mountId, 100, 1_000_000, 1);

      const stats = monitor.getNetworkStatistics(mountId);
      expect(stats!.trend).toBe('improving');
    });
  });

  describe('Adaptive Caching', () => {
    it('should initialize default cache settings', () => {
      const mountId = 'test-mount-7';
      const settings = monitor.getAdaptiveCacheSettings(mountId);

      expect(settings.mountId).toBe(mountId);
      expect(settings.cacheSizeLimit).toBe(50 * 1024 * 1024); // 50MB
      expect(settings.cacheTtl).toBe(300000); // 5 minutes
      expect(settings.prefetchEnabled).toBe(false);
      expect(settings.compressionEnabled).toBe(false);
    });

    it('should generate optimization recommendations', () => {
      const mountId = 'test-mount-8';

      // Set up usage pattern with frequent directory access
      for (let i = 0; i < 10; i++) {
        monitor.recordMountOperation(
          MountOperationType.MountList,
          100,
          true,
          `mount://test/dir${i % 3}/`,
          `ssh://user@host/dir${i % 3}/`,
          mountId
        );
      }

      // Set up poor network conditions
      monitor.recordNetworkCondition(mountId, 800, 200_000, 15);

      const recommendations = monitor.generateOptimizationRecommendations(mountId);
      expect(recommendations.length).toBeGreaterThan(0);

      // Should recommend prefetching due to frequent directory access
      const prefetchRec = recommendations.find((r: any) => r.type === 'prefetch');
      expect(prefetchRec).toBeDefined();
      expect(prefetchRec!.recommendedValue).toBe(true);

      // Should recommend longer cache TTL due to poor network
      const cacheTtlRec = recommendations.find((r: any) => r.type === 'cache_ttl');
      expect(cacheTtlRec).toBeDefined();
    });
  });

  describe('Performance Benchmarks', () => {
    it('should measure operation performance accurately', async () => {
      const mountId = 'benchmark-mount';
      const operationCount = 100;
      const startTime = Date.now();

      // Simulate multiple operations
      for (let i = 0; i < operationCount; i++) {
        const operationId = monitor.startMountOperation(
          MountOperationType.MountRead,
          `mount://test/file${i}.txt`,
          `ssh://user@host/file${i}.txt`,
          mountId
        );

        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));

        monitor.endMountOperation(
          operationId,
          true,
          1024 * (i + 1)
        );
      }

      const totalTime = Date.now() - startTime;
      const pattern = monitor.getUsagePattern(mountId);

      expect(pattern).toBeDefined();
      expect(pattern!.frequentFiles.length).toBeGreaterThan(0);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle high-frequency operations efficiently', () => {
      const mountId = 'high-freq-mount';
      const operationCount = 1000;
      const startTime = Date.now();

      // Record many operations quickly
      for (let i = 0; i < operationCount; i++) {
        monitor.recordMountOperation(
          i % 2 === 0 ? MountOperationType.MountRead : MountOperationType.MountWrite,
          Math.random() * 100 + 50,
          Math.random() > 0.1, // 90% success rate
          `mount://test/file${i % 100}.txt`,
          `ssh://user@host/file${i % 100}.txt`,
          mountId,
          Math.floor(Math.random() * 10000) + 1000,
          undefined,
          Math.random() > 0.3 // 70% cache hit rate
        );
      }

      const processingTime = Date.now() - startTime;
      const pattern = monitor.getUsagePattern(mountId);

      expect(pattern).toBeDefined();
      expect(processingTime).toBeLessThan(1000); // Should process 1000 operations in under 1 second
      expect(pattern!.frequentFiles.length).toBeLessThanOrEqual(10); // Should limit to top 10
    });

    it('should optimize cache settings based on usage patterns', () => {
      const mountId = 'optimization-mount';

      // Simulate high-activity scenario
      for (let i = 0; i < 150; i++) {
        monitor.recordMountOperation(
          MountOperationType.MountRead,
          100,
          true,
          `mount://test/file${i % 20}.txt`,
          `ssh://user@host/file${i % 20}.txt`,
          mountId,
          2048,
          undefined,
          false // Low cache hit rate
        );
      }

      // Set up network conditions
      monitor.recordNetworkCondition(mountId, 100, 5_000_000, 1);

      const initialSettings = monitor.getAdaptiveCacheSettings(mountId);
      const recommendations = monitor.generateOptimizationRecommendations(mountId);

      expect(recommendations.length).toBeGreaterThan(0);

      // Should recommend cache size increase due to high activity and low cache hit rate
      const cacheSizeRec = recommendations.find((r: any) => r.type === 'cache_size');
      expect(cacheSizeRec).toBeDefined();
      expect(cacheSizeRec!.recommendedValue).toBeGreaterThan(initialSettings.cacheSizeLimit);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should limit metrics collection size', () => {
      const mountId = 'memory-test-mount';
      const maxMetrics = 1000;

      // Record more metrics than the limit
      for (let i = 0; i < maxMetrics + 100; i++) {
        monitor.recordMountOperation(
          MountOperationType.MountRead,
          100,
          true,
          `mount://test/file${i}.txt`,
          `ssh://user@host/file${i}.txt`,
          mountId
        );
      }

      // Access private metrics to verify size limit
      const mountMetrics = (monitor as any).mountMetrics.get(mountId);
      expect(mountMetrics.length).toBeLessThanOrEqual(maxMetrics);
    });

    it('should limit network condition history', () => {
      const mountId = 'network-limit-mount';
      const maxConditions = 100;

      // Record more conditions than the limit
      for (let i = 0; i < maxConditions + 20; i++) {
        monitor.recordNetworkCondition(mountId, 100 + i, 1_000_000, 1);
      }

      const networkConditions = (monitor as any).networkConditions.get(mountId);
      expect(networkConditions.length).toBeLessThanOrEqual(maxConditions);
    });

    it('should clean up resources on dispose', () => {
      const disposeSpy = vi.spyOn(monitor, 'dispose');
      
      monitor.dispose();
      
      expect(disposeSpy).toHaveBeenCalled();
      
      // Verify intervals are cleared
      expect((monitor as any).networkMonitoringInterval).toBeUndefined();
      expect((monitor as any).adaptiveCachingInterval).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid URIs gracefully', () => {
      const mountId = 'error-test-mount';

      expect(() => {
        monitor.recordMountOperation(
          MountOperationType.MountRead,
          100,
          true,
          'invalid-uri',
          'ssh://user@host/file.txt',
          mountId
        );
      }).not.toThrow();

      const pattern = monitor.getUsagePattern(mountId);
      expect(pattern).toBeDefined();
    });

    it('should handle missing mount data gracefully', () => {
      const nonExistentMountId = 'non-existent-mount';

      const stats = monitor.getNetworkStatistics(nonExistentMountId);
      expect(stats).toBeUndefined();

      const pattern = monitor.getUsagePattern(nonExistentMountId);
      expect(pattern).toBeUndefined();

      const recommendations = monitor.generateOptimizationRecommendations(nonExistentMountId);
      expect(recommendations).toEqual([]);
    });

    it('should handle disabled monitoring', () => {
      // Disable monitoring
      (monitor as any).isMonitoringEnabled = false;

      const operationId = monitor.startMountOperation(
        MountOperationType.MountRead,
        'mount://test/file.txt',
        'ssh://user@host/file.txt',
        'test-mount'
      );

      expect(operationId).toBe('');

      monitor.recordNetworkCondition('test-mount', 100, 1_000_000, 1);
      const stats = monitor.getNetworkStatistics('test-mount');
      expect(stats).toBeUndefined();
    });
  });
});