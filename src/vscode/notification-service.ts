import * as vscode from 'vscode';

/**
 * Notification level for different types of messages
 */
export enum NotificationLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error'
}

/**
 * Interface for notification options
 */
export interface NotificationOptions {
  /** Whether to show buttons on the notification */
  showButtons?: boolean;
  /** Custom buttons to show on the notification */
  buttons?: string[];
  /** Whether to show a "Don't show again" option */
  showDoNotShowAgain?: boolean;
  /** Modal dialog instead of notification */
  modal?: boolean;
  /** Duration in milliseconds (for transient notifications) */
  duration?: number;
  /** Category for grouping related notifications */
  category?: string;
}

/**
 * Interface for progress options
 */
export interface ProgressOptions {
  /** Title of the progress notification */
  title: string;
  /** Location of the progress indicator */
  location?: vscode.ProgressLocation;
  /** Whether the operation is cancellable */
  cancellable?: boolean;
  /** Initial progress percentage (0-100) */
  initialValue?: number;
}

/**
 * Interface for connection status notification
 */
export interface ConnectionStatusNotification {
  /** Host name or IP address */
  host: string;
  /** Connection status message */
  status: string;
  /** Timestamp of the notification */
  timestamp: Date;
  /** Whether the notification has been read */
  read: boolean;
}

/**
 * Interface for setup guidance step
 */
export interface SetupGuidanceStep {
  /** Step title */
  title: string;
  /** Step description */
  description: string;
  /** Optional command to execute */
  command?: string;
  /** Optional command arguments */
  commandArgs?: any[];
  /** Optional documentation link */
  documentationLink?: string;
}

/**
 * Service for managing notifications and progress indicators
 */
export class NotificationService {
  private static instance: NotificationService;
  private doNotShowAgainSettings: Set<string> = new Set();
  private connectionStatusHistory: ConnectionStatusNotification[] = [];
  private statusBarItem: vscode.StatusBarItem | undefined;
  private notificationCount: number = 0;
  private readonly MAX_HISTORY_SIZE = 100;

  /**
   * Get the singleton instance of NotificationService
   */
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }
  
  constructor() {
    // Create status bar item for notifications
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'ssh-remote.showNotificationHistory';
    this.updateStatusBarItem();
    this.statusBarItem.show();
  }

  /**
   * Show a notification message
   * @param message The message to show
   * @param level The notification level
   * @param options Additional notification options
   * @returns Promise that resolves to the selected button or undefined
   */
  async showNotification(
    message: string,
    level: NotificationLevel = NotificationLevel.Info,
    options: NotificationOptions = {}
  ): Promise<string | undefined> {
    // Check if this notification should be suppressed
    const notificationKey = this.getNotificationKey(message);
    if (options.showDoNotShowAgain && this.doNotShowAgainSettings.has(notificationKey)) {
      return undefined;
    }

    const buttons = options.showButtons ? options.buttons || ['OK'] : [];
    
    if (options.showDoNotShowAgain) {
      buttons.push("Don't show again");
    }

    let result: string | undefined;

    switch (level) {
      case NotificationLevel.Info:
        result = await vscode.window.showInformationMessage(
          message,
          options.modal ? { modal: true } : {},
          ...buttons
        );
        break;
      case NotificationLevel.Warning:
        result = await vscode.window.showWarningMessage(
          message,
          options.modal ? { modal: true } : {},
          ...buttons
        );
        break;
      case NotificationLevel.Error:
        result = await vscode.window.showErrorMessage(
          message,
          options.modal ? { modal: true } : {},
          ...buttons
        );
        break;
    }

    // Handle "Don't show again" option
    if (result === "Don't show again" && options.showDoNotShowAgain) {
      this.doNotShowAgainSettings.add(notificationKey);
      await this.saveDoNotShowAgainSettings();
      return undefined;
    }

    return result;
  }

  /**
   * Show a notification with troubleshooting guidance
   * @param message The error message
   * @param troubleshootingSteps Array of troubleshooting steps
   * @returns Promise that resolves when the user dismisses the notification
   */
  async showTroubleshootingNotification(
    message: string,
    troubleshootingSteps: string[]
  ): Promise<void> {
    const viewDetails = 'View Troubleshooting Steps';
    
    const result = await vscode.window.showErrorMessage(
      message,
      viewDetails
    );

    if (result === viewDetails) {
      // Create a markdown document with troubleshooting steps
      const troubleshootingContent = `# Troubleshooting Guide\n\n${message}\n\n## Steps to Resolve\n\n${
        troubleshootingSteps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')
      }`;

      const doc = await vscode.workspace.openTextDocument({
        content: troubleshootingContent,
        language: 'markdown'
      });
      
      await vscode.window.showTextDocument(doc);
    }
  }

  /**
   * Show a progress notification for a long-running operation
   * @param options Progress options
   * @param task The task to run with progress
   * @returns Promise that resolves with the result of the task
   */
  async withProgress<T>(
    options: ProgressOptions,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken
    ) => Thenable<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: options.location || vscode.ProgressLocation.Notification,
        title: options.title,
        cancellable: options.cancellable || false
      },
      task
    );
  }

  /**
   * Show a status bar notification that automatically disappears after a duration
   * @param message The message to show
   * @param duration Duration in milliseconds
   */
  showTransientStatusMessage(message: string, duration: number = 3000): void {
    vscode.window.setStatusBarMessage(message, duration);
  }

  /**
   * Reset "Don't show again" settings for all notifications
   */
  async resetDoNotShowAgainSettings(): Promise<void> {
    this.doNotShowAgainSettings.clear();
    await this.saveDoNotShowAgainSettings();
  }

  /**
   * Get a unique key for a notification message
   */
  private getNotificationKey(message: string): string {
    // Create a simple hash of the message
    return `notification_${message.replace(/\s+/g, '_').substring(0, 50)}`;
  }

  /**
   * Save "Don't show again" settings
   */
  private async saveDoNotShowAgainSettings(): Promise<void> {
    // In a real implementation, this would save to workspace or global settings
    // For now, we just keep it in memory
  }

  /**
   * Show a connection status notification and add it to history
   * @param host The host name or IP address
   * @param status The connection status message
   * @param level The notification level
   * @returns Promise that resolves when the notification is shown
   */
  async showConnectionStatusNotification(
    host: string,
    status: string,
    level: NotificationLevel = NotificationLevel.Info
  ): Promise<void> {
    // Add to history
    this.addConnectionStatusToHistory(host, status);
    
    // Show notification
    await this.showNotification(
      `SSH Connection: ${host} - ${status}`,
      level,
      { category: 'connection' }
    );
  }

  /**
   * Add a connection status to history
   * @param host The host name or IP address
   * @param status The connection status message
   */
  private addConnectionStatusToHistory(host: string, status: string): void {
    // Add to history
    this.connectionStatusHistory.unshift({
      host,
      status,
      timestamp: new Date(),
      read: false
    });
    
    // Limit history size
    if (this.connectionStatusHistory.length > this.MAX_HISTORY_SIZE) {
      this.connectionStatusHistory.pop();
    }
    
    // Update notification count and status bar
    this.notificationCount = this.connectionStatusHistory.filter(n => !n.read).length;
    this.updateStatusBarItem();
  }

  /**
   * Update the status bar item with current notification count
   */
  private updateStatusBarItem(): void {
    if (this.statusBarItem) {
      if (this.notificationCount > 0) {
        this.statusBarItem.text = `$(bell) ${this.notificationCount}`;
        this.statusBarItem.tooltip = `${this.notificationCount} unread SSH notifications`;
      } else {
        this.statusBarItem.text = `$(bell-dot)`;
        this.statusBarItem.tooltip = 'No unread SSH notifications';
      }
    }
  }

  /**
   * Show connection status history
   * @returns Promise that resolves when the history is shown
   */
  async showConnectionStatusHistory(): Promise<void> {
    if (this.connectionStatusHistory.length === 0) {
      await this.showNotification('No connection status history', NotificationLevel.Info);
      return;
    }

    // Create a markdown document with history
    let historyContent = '# SSH Connection History\n\n';
    
    this.connectionStatusHistory.forEach((notification, index) => {
      const date = notification.timestamp.toLocaleString();
      historyContent += `## ${index + 1}. ${notification.host}\n`;
      historyContent += `**Status:** ${notification.status}\n`;
      historyContent += `**Time:** ${date}\n\n`;
      
      // Mark as read
      notification.read = true;
    });
    
    // Reset notification count and update status bar
    this.notificationCount = 0;
    this.updateStatusBarItem();
    
    // Show history in a document
    const doc = await vscode.workspace.openTextDocument({
      content: historyContent,
      language: 'markdown'
    });
    
    await vscode.window.showTextDocument(doc);
  }

  /**
   * Show a setup guidance notification with interactive steps
   * @param title The title of the guidance
   * @param steps Array of setup guidance steps
   * @returns Promise that resolves when the guidance is shown
   */
  async showSetupGuidance(title: string, steps: SetupGuidanceStep[]): Promise<void> {
    const viewGuide = 'View Setup Guide';
    
    const result = await vscode.window.showInformationMessage(
      title,
      viewGuide
    );

    if (result === viewGuide) {
      // Create a webview panel for interactive guidance
      const panel = vscode.window.createWebviewPanel(
        'sshSetupGuide',
        'SSH Setup Guide',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );
      
      // Generate HTML content for the webview
      panel.webview.html = this.generateSetupGuidanceHtml(title, steps, panel.webview);
      
      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(async message => {
        if (message.command && message.args) {
          try {
            await vscode.commands.executeCommand(message.command, ...message.args);
          } catch (error) {
            console.error(`Error executing command ${message.command}:`, error);
          }
        }
      });
    }
  }

  /**
   * Generate HTML content for setup guidance webview
   * @param title The title of the guidance
   * @param steps Array of setup guidance steps
   * @param webview The webview to generate HTML for
   * @returns HTML content as string
   */
  private generateSetupGuidanceHtml(
    title: string,
    steps: SetupGuidanceStep[],
    webview: vscode.Webview
  ): string {
    // Create a nonce to whitelist scripts
    const nonce = this.getNonce();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${title}</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
    }
    h1 {
      color: var(--vscode-editor-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    .step {
      margin-bottom: 20px;
      padding: 15px;
      background-color: var(--vscode-editor-background);
      border-left: 4px solid var(--vscode-activityBarBadge-background);
      border-radius: 4px;
    }
    .step-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: var(--vscode-editor-foreground);
    }
    .step-description {
      margin-bottom: 10px;
    }
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 14px;
      border-radius: 2px;
      cursor: pointer;
      margin-right: 8px;
      margin-top: 8px;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .completed {
      opacity: 0.6;
      border-left-color: var(--vscode-terminal-ansiGreen);
    }
    .completed::before {
      content: "✓ ";
      color: var(--vscode-terminal-ansiGreen);
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  
  <div id="steps">
    ${steps.map((step, index) => `
      <div class="step" id="step-${index}">
        <div class="step-title">${index + 1}. ${step.title}</div>
        <div class="step-description">${step.description}</div>
        ${step.command ? `<button onclick="executeCommand('${step.command}', ${JSON.stringify(step.commandArgs || [])})">Execute</button>` : ''}
        ${step.documentationLink ? `<a href="${step.documentationLink}" target="_blank">Learn more</a>` : ''}
        <button onclick="markCompleted(${index})">Mark as completed</button>
      </div>
    `).join('')}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    
    function executeCommand(command, args) {
      vscode.postMessage({
        command: command,
        args: args
      });
    }
    
    function markCompleted(stepIndex) {
      const stepElement = document.getElementById('step-' + stepIndex);
      stepElement.classList.add('completed');
    }
  </script>
</body>
</html>`;
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
   * Show a detailed progress notification for a long-running operation with multiple steps
   * @param title The title of the operation
   * @param steps Array of step descriptions
   * @param task The task to run with progress
   * @returns Promise that resolves with the result of the task
   */
  async withDetailedProgress<T>(
    title: string,
    steps: string[],
    task: (
      reporter: DetailedProgressReporter,
      token: vscode.CancellationToken
    ) => Thenable<T>
  ): Promise<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true
      },
      async (progress, token) => {
        const reporter = new DetailedProgressReporter(progress, steps);
        return await task(reporter, token);
      }
    );
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
  }
}

/**
 * Helper class for reporting detailed progress with multiple steps
 */
export class DetailedProgressReporter {
  private currentStep: number = 0;
  private readonly totalSteps: number;
  private readonly stepIncrement: number;

  constructor(
    private progress: vscode.Progress<{ message?: string; increment?: number }>,
    private steps: string[]
  ) {
    this.totalSteps = steps.length;
    this.stepIncrement = 100 / this.totalSteps;
    
    // Initialize with first step
    if (this.steps.length > 0) {
      this.progress.report({ message: this.steps[0], increment: 0 });
    }
  }

  /**
   * Advance to the next step
   * @returns True if advanced to next step, false if already at last step
   */
  nextStep(): boolean {
    if (this.currentStep < this.totalSteps - 1) {
      this.currentStep++;
      this.progress.report({
        message: this.steps[this.currentStep],
        increment: this.stepIncrement
      });
      return true;
    }
    return false;
  }

  /**
   * Report progress within the current step
   * @param message Optional message to show
   * @param stepProgress Progress within the current step (0-100)
   */
  reportStepProgress(message?: string, stepProgress: number = 0): void {
    // Calculate the increment within this step
    const normalizedProgress = Math.min(Math.max(stepProgress, 0), 100);
    const increment = (normalizedProgress / 100) * this.stepIncrement;
    
    this.progress.report({
      message: message || this.steps[this.currentStep],
      increment
    });
  }

  /**
   * Complete the progress reporting
   * @param message Optional final message
   */
  complete(message?: string): void {
    // Report 100% completion
    this.progress.report({
      message: message || 'Completed',
      increment: 100 - (this.currentStep * this.stepIncrement)
    });
  }
}