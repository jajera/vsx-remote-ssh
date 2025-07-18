"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarAlignment = exports.FileType = exports.Disposable = exports.MarkdownString = exports.EventEmitter = exports.Event = exports.Uri = exports.ExtensionContext = exports.workspace = exports.window = exports.commands = void 0;
// Mock VSCode API for testing
const vitest_1 = require("vitest");
// Mock EventEmitter
class MockEventEmitter {
    constructor() {
        this.listeners = new Map();
    }
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(listener);
        return this;
    }
    emit(event, ...args) {
        const listeners = this.listeners.get(event) || [];
        listeners.forEach(listener => listener(...args));
        return listeners.length > 0;
    }
    dispose() {
        this.listeners.clear();
    }
}
exports.EventEmitter = MockEventEmitter;
// Mock Event
class MockEvent {
    constructor() {
        this.listeners = [];
    }
    listener(callback) {
        this.listeners.push(callback);
        return { dispose: () => this.listeners = this.listeners.filter(l => l !== callback) };
    }
    fire(data) {
        this.listeners.forEach(listener => listener(data));
    }
}
exports.Event = MockEvent;
// Mock Uri
class MockUri {
    constructor(scheme, authority, path, query, fragment) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
    }
    static file(path) {
        return new MockUri('file', '', path, '', '');
    }
    static parse(value) {
        const [scheme, rest] = value.split('://', 2);
        if (!rest) {
            return new MockUri('file', '', value, '', '');
        }
        const [authority, path] = rest.split('/', 2);
        return new MockUri(scheme, authority, '/' + (path || ''), '', '');
    }
    toString() {
        return `${this.scheme}://${this.authority}${this.path}`;
    }
    with(change) {
        return new MockUri(change.scheme ?? this.scheme, change.authority ?? this.authority, change.path ?? this.path, change.query ?? this.query, change.fragment ?? this.fragment);
    }
}
exports.Uri = MockUri;
// Mock FileType enum
const FileType = {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64
};
exports.FileType = FileType;
// Mock StatusBarAlignment enum
const StatusBarAlignment = {
    Left: 1,
    Right: 2
};
exports.StatusBarAlignment = StatusBarAlignment;
// Mock commands
const commands = {
    registerCommand: vitest_1.vi.fn((command, callback) => ({
        dispose: vitest_1.vi.fn()
    })),
    executeCommand: vitest_1.vi.fn()
};
exports.commands = commands;
// Mock window
const window = {
    showInformationMessage: vitest_1.vi.fn(() => Promise.resolve(undefined)),
    showErrorMessage: vitest_1.vi.fn(() => Promise.resolve(undefined)),
    showWarningMessage: vitest_1.vi.fn(() => Promise.resolve(undefined)),
    showInputBox: vitest_1.vi.fn(() => Promise.resolve(undefined)),
    showQuickPick: vitest_1.vi.fn(() => Promise.resolve(undefined)),
    createStatusBarItem: vitest_1.vi.fn(() => ({
        text: '',
        tooltip: '',
        command: '',
        show: vitest_1.vi.fn(),
        hide: vitest_1.vi.fn(),
        dispose: vitest_1.vi.fn()
    })),
    showTextDocument: vitest_1.vi.fn(() => Promise.resolve({})),
    createOutputChannel: vitest_1.vi.fn(() => ({
        appendLine: vitest_1.vi.fn(),
        show: vitest_1.vi.fn(),
        dispose: vitest_1.vi.fn()
    }))
};
exports.window = window;
// Mock workspace
const workspace = {
    getConfiguration: vitest_1.vi.fn(() => ({
        get: vitest_1.vi.fn((key, defaultValue) => defaultValue),
        update: vitest_1.vi.fn(() => Promise.resolve())
    })),
    openTextDocument: vitest_1.vi.fn(() => Promise.resolve({})),
    registerFileSystemProvider: vitest_1.vi.fn(() => ({
        dispose: vitest_1.vi.fn()
    })),
    onDidChangeWorkspaceFolders: new MockEvent(),
    workspaceFolders: []
};
exports.workspace = workspace;
// Mock ExtensionContext
class MockExtensionContext {
    constructor() {
        this.globalState = {
            get: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(() => Promise.resolve())
        };
        this.workspaceState = {
            get: vitest_1.vi.fn(),
            update: vitest_1.vi.fn(() => Promise.resolve())
        };
        this.extensionPath = '/mock/extension/path';
        this.extensionUri = MockUri.file('/mock/extension/path');
        this.storagePath = '/mock/storage/path';
        this.globalStoragePath = '/mock/global/storage/path';
        this.logPath = '/mock/log/path';
        this.subscriptions = {
            push: vitest_1.vi.fn((disposable) => { })
        };
    }
}
exports.ExtensionContext = MockExtensionContext;
// Mock MarkdownString
class MockMarkdownString {
    constructor() {
        this.value = '';
    }
    appendMarkdown(text) {
        this.value += text;
        return this;
    }
    appendCodeblock(code, language) {
        this.value += `\`\`\`${language || ''}\n${code}\n\`\`\`\n`;
        return this;
    }
}
exports.MarkdownString = MockMarkdownString;
// Mock Disposable
class MockDisposable {
    constructor(_dispose) {
        this._dispose = _dispose;
    }
    dispose() {
        this._dispose();
    }
}
exports.Disposable = MockDisposable;
// Mock the default export
exports.default = {
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
//# sourceMappingURL=vscode.js.map