// Mock VSCode API for testing
import { vi } from 'vitest';

// Mock EventEmitter
class MockEventEmitter {
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const listeners = this.listeners.get(event) || [];
    listeners.forEach(listener => listener(...args));
    return listeners.length > 0;
  }

  dispose(): void {
    this.listeners.clear();
  }
}

// Mock Event
class MockEvent<T> {
  private listeners: ((e: T) => any)[] = [];

  listener(callback: (e: T) => any): any {
    this.listeners.push(callback);
    return { dispose: () => this.listeners = this.listeners.filter(l => l !== callback) };
  }

  fire(data: T): void {
    this.listeners.forEach(listener => listener(data));
  }
}

// Mock Uri
class MockUri {
  constructor(
    public scheme: string,
    public authority: string,
    public path: string,
    public query: string,
    public fragment: string
  ) {}

  static file(path: string): MockUri {
    return new MockUri('file', '', path, '', '');
  }

  static parse(value: string): MockUri {
    const [scheme, rest] = value.split('://', 2);
    if (!rest) {
      return new MockUri('file', '', value, '', '');
    }
    const [authority, path] = rest.split('/', 2);
    return new MockUri(scheme, authority, '/' + (path || ''), '', '');
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}`;
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): MockUri {
    return new MockUri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment
    );
  }
}

// Mock FileStat
interface MockFileStat {
  type: number;
  ctime: number;
  mtime: number;
  size: number;
}

// Mock FileType enum
const FileType = {
  Unknown: 0,
  File: 1,
  Directory: 2,
  SymbolicLink: 64
};

// Mock StatusBarAlignment enum
const StatusBarAlignment = {
  Left: 1,
  Right: 2
};

// Mock commands
const commands = {
  registerCommand: vi.fn((command: string, callback: Function) => ({
    dispose: vi.fn()
  })),
  executeCommand: vi.fn()
};

// Mock window
const window = {
  showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
  showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
  showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
  showInputBox: vi.fn(() => Promise.resolve(undefined)),
  showQuickPick: vi.fn(() => Promise.resolve(undefined)),
  createStatusBarItem: vi.fn(() => ({
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn()
  })),
  showTextDocument: vi.fn(() => Promise.resolve({})),
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn()
  }))
};

// Mock workspace
const workspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string, defaultValue?: any) => defaultValue),
    update: vi.fn(() => Promise.resolve())
  })),
  openTextDocument: vi.fn(() => Promise.resolve({})),
  registerFileSystemProvider: vi.fn(() => ({
    dispose: vi.fn()
  })),
  onDidChangeWorkspaceFolders: new MockEvent(),
  workspaceFolders: []
};

// Mock ExtensionContext
class MockExtensionContext {
  globalState = {
    get: vi.fn(),
    update: vi.fn(() => Promise.resolve())
  };
  workspaceState = {
    get: vi.fn(),
    update: vi.fn(() => Promise.resolve())
  };
  extensionPath = '/mock/extension/path';
  extensionUri = MockUri.file('/mock/extension/path');
  storagePath = '/mock/storage/path';
  globalStoragePath = '/mock/global/storage/path';
  logPath = '/mock/log/path';

  subscriptions = {
    push: vi.fn((disposable: any) => {})
  };
}

// Mock MarkdownString
class MockMarkdownString {
  value = '';

  appendMarkdown(text: string): this {
    this.value += text;
    return this;
  }

  appendCodeblock(code: string, language?: string): this {
    this.value += `\`\`\`${language || ''}\n${code}\n\`\`\`\n`;
    return this;
  }
}

// Mock Disposable
class MockDisposable {
  constructor(private _dispose: () => void) {}
  dispose(): void {
    this._dispose();
  }
}

// Export the mock VSCode API
export {
  commands,
  window,
  workspace,
  MockExtensionContext as ExtensionContext,
  MockUri as Uri,
  MockEvent as Event,
  MockEventEmitter as EventEmitter,
  MockMarkdownString as MarkdownString,
  MockDisposable as Disposable,
  FileType,
  StatusBarAlignment
};

// Mock the default export
export default {
  commands,
  window,
  workspace,
  Uri: MockUri,
  Event: MockEvent,
  EventEmitter: MockEventEmitter,
  MarkdownString: MockMarkdownString,
  Disposable: MockDisposable,
  FileType,
  StatusBarAlignment
};