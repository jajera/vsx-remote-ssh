/**
 * Performance monitoring system for SSH operations
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';

/**
 * Types of operations that can be monitored
 */
export enum OperationType {
  FileRead = 'file_read',
  FileWrite = 'file_write',
  FileDelete = 'file_delete',
  DirectoryRead = 'directory_read',
  DirectoryCreate = 'directory_create',
  CommandExecution = 'command_execution',
  Connection = 'connection',
  Authentication = 'authentication',
  Reconnection = 'reconnection'
}

/**
 * Performance metrics for an operation
 */
export interface PerformanceMetrics {
  /** Operation type */
  operationType: OperationType;
  /** Start time of the operation */
  startTime: number;
  /** End time of the operation */
  endTime: number;
  /** Duration of the operation in milliseconds */
  duration: number;
  /** Size of data transferred in bytes (if applicable) */
  dataSize?: number;
  /** Connection ID associated with the operation */
  connectionId?: string;
  /** Path or resource identifier (if applicable) */
  path?: string;
  /** Whether the operation was successful */
  success: boolean;
  /** Error message if the operation failed */
  errorMessage?: string;
  /** Whether the operation used cache */
  usedCache?: boolean;
}

/**
 * Connection latency metrics
 */
export interface ConnectionLatencyMetrics {
  /** Connection ID */
  connectionId: string;
  /** Host name or IP address */
  host: string;
  /** Timestamp of the measurement */
  timestamp: number;
  /** Round-trip time in milliseconds */
  rtt: number;
  /** Number of hops (if available) */
  hops?: number;
  /** Packet loss percentage (if available) */
  packetLoss?: number;
}

/**
 * Memory usage metrics
 */
export interface MemoryUsageMetrics {
  /** Connection ID */
  connectionId: string;
  /** Host name or IP address */
  host: string;
  /** Timestamp of the measurement */
  timestamp: number;
  /** Heap used in bytes */
  heapUsed: number;
  /** Heap total in bytes */
  heapTotal: number;
  /** External memory in bytes */
  external: number;
  /** Array buffers in bytes */
  arrayBuffers: number;
}

/**
 * Performance statistics for a specific operation type
 */
export interface PerformanceStatistics {
  /** Operation type */
  operationType: OperationType;
  /** Total number of operations */
  count: number;
  /** Total duration of all operations in milliseconds */
  totalDuration: number;
  /** Average duration per operation in milliseconds */
  averageDuration: number;
  /** Minimum duration of any operation in milliseconds */
  minDuration: number;
  /** Maximum duration of any operation in milliseconds */
  maxDuration: number;
  /** Number of successful operations */
  successCount: number;
  /** Number of failed operations */
  failureCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total data size transferred in bytes (if applicable) */
  totalDataSize?: number;
  /** Average data size per operation in bytes (if applicable) */
  averageDataSize?: number;
  /** Cache hit rate (0-1) (if applicable) */
  cacheHitRate?: number;
}

/**
 * Performance monitor for SSH operations
 */
export class PerformanceMonitor extends EventEmitter {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private latencyMetrics: Map<string, ConnectionLatencyMetrics[]> = new Map();
  private memoryMetrics: Map<string, MemoryUsageMetrics[]> = new Map();
  private readonly MAX_METRICS_PER_TYPE = 1000;
  private readonly MAX_LATENCY_METRICS_PER_CONNECTION = 100;
  private readonly MAX_MEMORY_METRICS_PER_CONNECTION = 100;
  private statusBarItem: vscode.StatusBarItem | undefined;
  private disposables: vscode.Disposable[] = [];
  private isMonitoringEnabled: boolean = true;
  private latencyMonitoringInterval: NodeJS.Timeout | undefined;
  private memoryMonitoringInterval: NodeJS.Timeout | undefined;
  private readonly LATENCY_MONITORING_INTERVAL_MS = 60000; // 1 minute
  private readonly MEMORY_MONITORING_INTERVAL_MS = 60000; // 1 minute

  /**
   * Get the singleton instance of PerformanceMonitor
   */
  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    super();
    this.setupStatusBar();
    this.registerCommands();
  }

  /**
   * Set up the status bar item
   */
  private setupStatusBar(): void {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    this.statusBarItem.text = '$(dashboard) SSH Perf';
    this.statusBarItem.tooltip = 'SSH Performance Monitoring';
    this.statusBarItem.command = 'ssh-remote.showPerformanceStats';
    this.statusBarItem.show();
    this.disposables.push(this.statusBarItem);
  }

  /**
   * Register commands
   */
  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand('ssh-remote.showPerformanceStats', () => {
        this.showPerformanceStats();
      }),
      vscode.commands.registerCommand('ssh-remote.togglePerformanceMonitoring', () => {
        this.toggleMonitoring();
      }),
      vscode.commands.registerCommand('ssh-remote.clearPerformanceMetrics', () => {
        this.clearMetrics();
      })
    );
  }

  /**
   * Start monitoring an operation
   * @param operationType The type of operation
   * @param connectionId Optional connection ID
   * @param path Optional path or resource identifier
   * @returns Operation ID to be used with endOperation
   */
  startOperation(
    operationType: OperationType,
    connectionId?: string,
    path?: string
  ): string {
    if (!this.isMonitoringEnabled) {
      return '';
    }

    const operationId = `${operationType}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Store start time in a map keyed by operation ID
    this.emit('operation-start', {
      operationId,
      operationType,
      connectionId,
      path,
      startTime: Date.now()
    });
    
    return operationId;
  }

  /**
   * End monitoring an operation
   * @param operationId The operation ID returned by startOperation
   * @param success Whether the operation was successful
   * @param dataSize Optional size of data transferred in bytes
   * @param errorMessage Optional error message if the operation failed
   * @param usedCache Optional flag indicating whether the operation used cache
   */
  endOperation(
    operationId: string,
    success: boolean,
    dataSize?: number,
    errorMessage?: string,
    usedCache?: boolean
  ): void {
    if (!operationId || !this.isMonitoringEnabled) {
      return;
    }

    const endTime = Date.now();
    
    this.emit('operation-end', {
      operationId,
      endTime,
      success,
      dataSize,
      errorMessage,
      usedCache
    });
  }

  /**
   * Record a complete operation in one call
   * @param operationType The type of operation
   * @param duration Duration of the operation in milliseconds
   * @param success Whether the operation was successful
   * @param connectionId Optional connection ID
   * @param path Optional path or resource identifier
   * @param dataSize Optional size of data transferred in bytes
   * @param errorMessage Optional error message if the operation failed
   * @param usedCache Optional flag indicating whether the operation used cache
   */
  recordOperation(
    operationType: OperationType,
    duration: number,
    success: boolean,
    connectionId?: string,
    path?: string,
    dataSize?: number,
    errorMessage?: string,
    usedCache?: boolean
  ): void {
    if (!this.isMonitoringEnabled) {
      return;
    }

    const now = Date.now();
    const metrics: PerformanceMetrics = {
      operationType,
      startTime: now - duration,
      endTime: now,
      duration,
      dataSize,
      connectionId,
      path,
      success,
      errorMessage,
      usedCache
    };

    this.addMetrics(metrics);
  }

  /**
   * Add metrics to the collection
   * @param metrics The metrics to add
   */
  private addMetrics(metrics: PerformanceMetrics): void {
    // Add to metrics collection
    this.metrics.push(metrics);
    
    // Limit collection size by operation type
    const metricsOfType = this.metrics.filter(m => m.operationType === metrics.operationType);
    if (metricsOfType.length > this.MAX_METRICS_PER_TYPE) {
      // Remove oldest metrics of this type
      const excessCount = metricsOfType.length - this.MAX_METRICS_PER_TYPE;
      const oldestMetricsIndices = this.metrics
        .map((m, index) => ({ index, metric: m }))
        .filter(item => item.metric.operationType === metrics.operationType)
        .sort((a, b) => a.metric.startTime - b.metric.startTime)
        .slice(0, excessCount)
        .map(item => item.index)
        .sort((a, b) => b - a); // Sort in descending order to avoid index shifting
      
      // Remove from end to start to avoid index shifting
      for (const index of oldestMetricsIndices) {
        this.metrics.splice(index, 1);
      }
    }
    
    // Emit metrics event
    this.emit('metrics', metrics);
  }

  /**
   * Record connection latency metrics
   * @param connectionId The connection ID
   * @param host The host name or IP address
   * @param rtt Round-trip time in milliseconds
   * @param hops Optional number of hops
   * @param packetLoss Optional packet loss percentage
   */
  recordLatency(
    connectionId: string,
    host: string,
    rtt: number,
    hops?: number,
    packetLoss?: number
  ): void {
    if (!this.isMonitoringEnabled) {
      return;
    }

    const latencyMetrics: ConnectionLatencyMetrics = {
      connectionId,
      host,
      timestamp: Date.now(),
      rtt,
      hops,
      packetLoss
    };

    // Get or create array for this connection
    if (!this.latencyMetrics.has(connectionId)) {
      this.latencyMetrics.set(connectionId, []);
    }

    const metricsArray = this.latencyMetrics.get(connectionId)!;
    metricsArray.push(latencyMetrics);

    // Limit array size
    if (metricsArray.length > this.MAX_LATENCY_METRICS_PER_CONNECTION) {
      metricsArray.shift(); // Remove oldest
    }

    // Emit latency event
    this.emit('latency', latencyMetrics);
  }

  /**
   * Record memory usage metrics
   * @param connectionId The connection ID
   * @param host The host name or IP address
   */
  recordMemoryUsage(connectionId: string, host: string): void {
    if (!this.isMonitoringEnabled) {
      return;
    }

    // Get current memory usage
    const memoryUsage = process.memoryUsage();

    const memoryMetrics: MemoryUsageMetrics = {
      connectionId,
      host,
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers || 0
    };

    // Get or create array for this connection
    if (!this.memoryMetrics.has(connectionId)) {
      this.memoryMetrics.set(connectionId, []);
    }

    const metricsArray = this.memoryMetrics.get(connectionId)!;
    metricsArray.push(memoryMetrics);

    // Limit array size
    if (metricsArray.length > this.MAX_MEMORY_METRICS_PER_CONNECTION) {
      metricsArray.shift(); // Remove oldest
    }

    // Emit memory usage event
    this.emit('memory', memoryMetrics);
  }

  /**
   * Start monitoring connection latency
   * @param connectionManager The connection manager
   */
  startLatencyMonitoring(connectionManager: any): void {
    if (this.latencyMonitoringInterval) {
      clearInterval(this.latencyMonitoringInterval);
    }

    this.latencyMonitoringInterval = setInterval(() => {
      if (!this.isMonitoringEnabled) {
        return;
      }

      const connections = connectionManager.getActiveConnections();
      for (const connection of connections) {
        this.measureLatency(connection);
      }
    }, this.LATENCY_MONITORING_INTERVAL_MS);
  }

  /**
   * Measure latency for a connection
   * @param connection The connection object
   */
  private async measureLatency(connection: any): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Execute a simple command to measure round-trip time
      await connection.execute('echo ping');
      
      const endTime = Date.now();
      const rtt = endTime - startTime;
      
      this.recordLatency(
        connection.id,
        connection.config.host,
        rtt
      );
    } catch (error) {
      console.error(`Error measuring latency for ${connection.config.host}:`, error);
    }
  }

  /**
   * Start monitoring memory usage
   * @param connectionManager The connection manager
   */
  startMemoryMonitoring(connectionManager: any): void {
    if (this.memoryMonitoringInterval) {
      clearInterval(this.memoryMonitoringInterval);
    }

    this.memoryMonitoringInterval = setInterval(() => {
      if (!this.isMonitoringEnabled) {
        return;
      }

      const connections = connectionManager.getActiveConnections();
      for (const connection of connections) {
        this.recordMemoryUsage(connection.id, connection.config.host);
      }
    }, this.MEMORY_MONITORING_INTERVAL_MS);
  }

  /**
   * Stop all monitoring
   */
  stopMonitoring(): void {
    if (this.latencyMonitoringInterval) {
      clearInterval(this.latencyMonitoringInterval);
      this.latencyMonitoringInterval = undefined;
    }

    if (this.memoryMonitoringInterval) {
      clearInterval(this.memoryMonitoringInterval);
      this.memoryMonitoringInterval = undefined;
    }
  }

  /**
   * Toggle monitoring on/off
   */
  toggleMonitoring(): void {
    this.isMonitoringEnabled = !this.isMonitoringEnabled;
    
    if (this.statusBarItem) {
      if (this.isMonitoringEnabled) {
        this.statusBarItem.text = '$(dashboard) SSH Perf';
        this.statusBarItem.tooltip = 'SSH Performance Monitoring (Enabled)';
        vscode.window.showInformationMessage('SSH Performance Monitoring enabled');
      } else {
        this.statusBarItem.text = '$(dashboard-disabled) SSH Perf';
        this.statusBarItem.tooltip = 'SSH Performance Monitoring (Disabled)';
        vscode.window.showInformationMessage('SSH Performance Monitoring disabled');
      }
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
    this.latencyMetrics.clear();
    this.memoryMetrics.clear();
    vscode.window.showInformationMessage('SSH Performance Metrics cleared');
  }

  /**
   * Get performance statistics for all operation types
   * @returns Map of operation type to statistics
   */
  getStatistics(): Map<OperationType, PerformanceStatistics> {
    const statistics = new Map<OperationType, PerformanceStatistics>();
    
    // Group metrics by operation type
    const metricsByType = new Map<OperationType, PerformanceMetrics[]>();
    for (const metrics of this.metrics) {
      if (!metricsByType.has(metrics.operationType)) {
        metricsByType.set(metrics.operationType, []);
      }
      metricsByType.get(metrics.operationType)!.push(metrics);
    }
    
    // Calculate statistics for each operation type
    for (const [operationType, metricsArray] of metricsByType.entries()) {
      const count = metricsArray.length;
      const totalDuration = metricsArray.reduce((sum, m) => sum + m.duration, 0);
      const averageDuration = count > 0 ? totalDuration / count : 0;
      const minDuration = count > 0 ? Math.min(...metricsArray.map(m => m.duration)) : 0;
      const maxDuration = count > 0 ? Math.max(...metricsArray.map(m => m.duration)) : 0;
      const successCount = metricsArray.filter(m => m.success).length;
      const failureCount = count - successCount;
      const successRate = count > 0 ? successCount / count : 0;
      
      // Calculate data size statistics if applicable
      let totalDataSize: number | undefined;
      let averageDataSize: number | undefined;
      const metricsWithDataSize = metricsArray.filter(m => m.dataSize !== undefined);
      if (metricsWithDataSize.length > 0) {
        totalDataSize = metricsWithDataSize.reduce((sum, m) => sum + (m.dataSize || 0), 0);
        averageDataSize = totalDataSize / metricsWithDataSize.length;
      }
      
      // Calculate cache hit rate if applicable
      let cacheHitRate: number | undefined;
      const metricsWithCacheInfo = metricsArray.filter(m => m.usedCache !== undefined);
      if (metricsWithCacheInfo.length > 0) {
        const cacheHits = metricsWithCacheInfo.filter(m => m.usedCache).length;
        cacheHitRate = cacheHits / metricsWithCacheInfo.length;
      }
      
      statistics.set(operationType, {
        operationType,
        count,
        totalDuration,
        averageDuration,
        minDuration,
        maxDuration,
        successCount,
        failureCount,
        successRate,
        totalDataSize,
        averageDataSize,
        cacheHitRate
      });
    }
    
    return statistics;
  }

  /**
   * Get latency statistics for a connection
   * @param connectionId The connection ID
   * @returns Latency statistics or undefined if no metrics exist
   */
  getLatencyStatistics(connectionId: string): {
    average: number;
    min: number;
    max: number;
    current: number;
    trend: 'improving' | 'stable' | 'degrading';
  } | undefined {
    const metrics = this.latencyMetrics.get(connectionId);
    if (!metrics || metrics.length === 0) {
      return undefined;
    }
    
    const rtts = metrics.map(m => m.rtt);
    const average = rtts.reduce((sum, rtt) => sum + rtt, 0) / rtts.length;
    const min = Math.min(...rtts);
    const max = Math.max(...rtts);
    const current = metrics[metrics.length - 1].rtt;
    
    // Calculate trend based on recent metrics
    let trend: 'improving' | 'stable' | 'degrading' = 'stable';
    if (metrics.length >= 3) {
      const recentMetrics = metrics.slice(-3);
      const firstRtt = recentMetrics[0].rtt;
      const lastRtt = recentMetrics[recentMetrics.length - 1].rtt;
      const percentChange = ((lastRtt - firstRtt) / firstRtt) * 100;
      
      if (percentChange < -10) {
        trend = 'improving';
      } else if (percentChange > 10) {
        trend = 'degrading';
      }
    }
    
    return {
      average,
      min,
      max,
      current,
      trend
    };
  }

  /**
   * Get memory usage statistics for a connection
   * @param connectionId The connection ID
   * @returns Memory usage statistics or undefined if no metrics exist
   */
  getMemoryStatistics(connectionId: string): {
    averageHeapUsed: number;
    maxHeapUsed: number;
    currentHeapUsed: number;
    averageHeapTotal: number;
    maxHeapTotal: number;
    trend: 'stable' | 'increasing' | 'decreasing';
  } | undefined {
    const metrics = this.memoryMetrics.get(connectionId);
    if (!metrics || metrics.length === 0) {
      return undefined;
    }
    
    const heapUsed = metrics.map(m => m.heapUsed);
    const heapTotal = metrics.map(m => m.heapTotal);
    
    const averageHeapUsed = heapUsed.reduce((sum, val) => sum + val, 0) / heapUsed.length;
    const maxHeapUsed = Math.max(...heapUsed);
    const currentHeapUsed = metrics[metrics.length - 1].heapUsed;
    
    const averageHeapTotal = heapTotal.reduce((sum, val) => sum + val, 0) / heapTotal.length;
    const maxHeapTotal = Math.max(...heapTotal);
    
    // Calculate trend based on recent metrics
    let trend: 'stable' | 'increasing' | 'decreasing' = 'stable';
    if (metrics.length >= 3) {
      const recentMetrics = metrics.slice(-3);
      const firstHeapUsed = recentMetrics[0].heapUsed;
      const lastHeapUsed = recentMetrics[recentMetrics.length - 1].heapUsed;
      const percentChange = ((lastHeapUsed - firstHeapUsed) / firstHeapUsed) * 100;
      
      if (percentChange < -10) {
        trend = 'decreasing';
      } else if (percentChange > 10) {
        trend = 'increasing';
      }
    }
    
    return {
      averageHeapUsed,
      maxHeapUsed,
      currentHeapUsed,
      averageHeapTotal,
      maxHeapTotal,
      trend
    };
  }

  /**
   * Show performance statistics in a webview
   */
  async showPerformanceStats(): Promise<void> {
    // Create webview panel
    const panel = vscode.window.createWebviewPanel(
      'sshPerformanceStats',
      'SSH Performance Statistics',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    
    // Generate HTML content
    panel.webview.html = this.generateStatsHtml(panel.webview);
    
    // Update stats every 5 seconds while panel is visible
    const updateInterval = setInterval(() => {
      if (panel.visible) {
        panel.webview.html = this.generateStatsHtml(panel.webview);
      }
    }, 5000);
    
    // Clean up when panel is disposed
    panel.onDidDispose(() => {
      clearInterval(updateInterval);
    });
  }

  /**
   * Generate HTML content for performance statistics
   * @param webview The webview to generate HTML for
   * @returns HTML content as string
   */
  private generateStatsHtml(webview: vscode.Webview): string {
    // Create a nonce to whitelist scripts
    const nonce = this.getNonce();
    
    // Get statistics
    const statistics = this.getStatistics();
    
    // Format statistics as HTML
    let operationStatsHtml = '';
    if (statistics.size === 0) {
      operationStatsHtml = '<p>No operation metrics collected yet.</p>';
    } else {
      operationStatsHtml = '<table class="stats-table">';
      operationStatsHtml += `
        <tr>
          <th>Operation Type</th>
          <th>Count</th>
          <th>Avg Duration (ms)</th>
          <th>Min (ms)</th>
          <th>Max (ms)</th>
          <th>Success Rate</th>
          <th>Avg Size (bytes)</th>
          <th>Cache Hit Rate</th>
        </tr>
      `;
      
      for (const [operationType, stats] of statistics.entries()) {
        operationStatsHtml += `
          <tr>
            <td>${this.formatOperationType(operationType)}</td>
            <td>${stats.count}</td>
            <td>${stats.averageDuration.toFixed(2)}</td>
            <td>${stats.minDuration.toFixed(2)}</td>
            <td>${stats.maxDuration.toFixed(2)}</td>
            <td>${(stats.successRate * 100).toFixed(1)}%</td>
            <td>${stats.averageDataSize ? this.formatBytes(stats.averageDataSize) : 'N/A'}</td>
            <td>${stats.cacheHitRate ? (stats.cacheHitRate * 100).toFixed(1) + '%' : 'N/A'}</td>
          </tr>
        `;
      }
      
      operationStatsHtml += '</table>';
    }
    
    // Format latency statistics as HTML
    let latencyStatsHtml = '';
    if (this.latencyMetrics.size === 0) {
      latencyStatsHtml = '<p>No latency metrics collected yet.</p>';
    } else {
      latencyStatsHtml = '<table class="stats-table">';
      latencyStatsHtml += `
        <tr>
          <th>Host</th>
          <th>Current (ms)</th>
          <th>Avg (ms)</th>
          <th>Min (ms)</th>
          <th>Max (ms)</th>
          <th>Trend</th>
        </tr>
      `;
      
      for (const [connectionId, metrics] of this.latencyMetrics.entries()) {
        if (metrics.length === 0) {
          continue;
        }
        
        const host = metrics[0].host;
        const stats = this.getLatencyStatistics(connectionId);
        
        if (stats) {
          let trendIcon = '';
          if (stats.trend === 'improving') {
            trendIcon = '$(arrow-down) Improving';
          } else if (stats.trend === 'degrading') {
            trendIcon = '$(arrow-up) Degrading';
          } else {
            trendIcon = '$(dash) Stable';
          }
          
          latencyStatsHtml += `
            <tr>
              <td>${host}</td>
              <td>${stats.current.toFixed(2)}</td>
              <td>${stats.average.toFixed(2)}</td>
              <td>${stats.min.toFixed(2)}</td>
              <td>${stats.max.toFixed(2)}</td>
              <td>${trendIcon}</td>
            </tr>
          `;
        }
      }
      
      latencyStatsHtml += '</table>';
    }
    
    // Format memory statistics as HTML
    let memoryStatsHtml = '';
    if (this.memoryMetrics.size === 0) {
      memoryStatsHtml = '<p>No memory metrics collected yet.</p>';
    } else {
      memoryStatsHtml = '<table class="stats-table">';
      memoryStatsHtml += `
        <tr>
          <th>Host</th>
          <th>Current Heap</th>
          <th>Avg Heap</th>
          <th>Max Heap</th>
          <th>Trend</th>
        </tr>
      `;
      
      for (const [connectionId, metrics] of this.memoryMetrics.entries()) {
        if (metrics.length === 0) {
          continue;
        }
        
        const host = metrics[0].host;
        const stats = this.getMemoryStatistics(connectionId);
        
        if (stats) {
          let trendIcon = '';
          if (stats.trend === 'decreasing') {
            trendIcon = '$(arrow-down) Decreasing';
          } else if (stats.trend === 'increasing') {
            trendIcon = '$(arrow-up) Increasing';
          } else {
            trendIcon = '$(dash) Stable';
          }
          
          memoryStatsHtml += `
            <tr>
              <td>${host}</td>
              <td>${this.formatBytes(stats.currentHeapUsed)}</td>
              <td>${this.formatBytes(stats.averageHeapUsed)}</td>
              <td>${this.formatBytes(stats.maxHeapUsed)}</td>
              <td>${trendIcon}</td>
            </tr>
          `;
        }
      }
      
      memoryStatsHtml += '</table>';
    }
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>SSH Performance Statistics</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
    }
    h1, h2 {
      color: var(--vscode-editor-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    .stats-container {
      margin-bottom: 30px;
    }
    .stats-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .stats-table th, .stats-table td {
      padding: 8px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .stats-table th {
      background-color: var(--vscode-editor-background);
      font-weight: bold;
    }
    .stats-table tr:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
    }
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 2px;
      cursor: pointer;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    .monitoring-status {
      margin-top: 10px;
      padding: 10px;
      background-color: var(--vscode-editor-background);
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>SSH Performance Statistics</h1>
  
  <div class="monitoring-status">
    Monitoring Status: <strong>${this.isMonitoringEnabled ? 'Enabled' : 'Disabled'}</strong>
  </div>
  
  <div class="actions">
    <button onclick="executeCommand('ssh-remote.togglePerformanceMonitoring')">
      ${this.isMonitoringEnabled ? 'Disable Monitoring' : 'Enable Monitoring'}
    </button>
    <button onclick="executeCommand('ssh-remote.clearPerformanceMetrics')">
      Clear Metrics
    </button>
  </div>
  
  <div class="stats-container">
    <h2>Operation Performance</h2>
    ${operationStatsHtml}
  </div>
  
  <div class="stats-container">
    <h2>Connection Latency</h2>
    ${latencyStatsHtml}
  </div>
  
  <div class="stats-container">
    <h2>Memory Usage</h2>
    ${memoryStatsHtml}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    function executeCommand(command) {
      vscode.postMessage({
        command: command
      });
    }
  </script>
</body>
</html>`;
  }

  /**
   * Format operation type for display
   * @param operationType The operation type
   * @returns Formatted operation type string
   */
  private formatOperationType(operationType: OperationType): string {
    // Convert snake_case to Title Case with spaces
    return operationType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Format bytes for display
   * @param bytes The number of bytes
   * @returns Formatted string with appropriate unit
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 B';
    }
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  /**
   * Generate a nonce for content security policy
   * @returns Random nonce string
   */
  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stopMonitoring();
    
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
    
    this.disposables.forEach(d => d.dispose());
  }
}