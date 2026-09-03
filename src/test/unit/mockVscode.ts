import Module = require("module");

const originalLoad = (Module as any)._load;

export class MockCancellationError extends Error {
  constructor() {
    super("Canceled");
    this.name = "CancellationError";
  }
}

const vscodeMock = {
  CancellationError: MockCancellationError,
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({
      get: (_key: string, defaultValue = "") => defaultValue,
      update: async () => {},
    }),
    findFiles: async () => [],
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
    fs: {
      readFile: async () => new Uint8Array(),
    },
  },
  window: {
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    showOpenDialog: async () => undefined,
    withProgress: async (
      _options: any,
      task: (progress: any, token: any) => Promise<any>,
    ) => {
      return task(
        { report: () => {} },
        {
          isCancellationRequested: false,
          onCancellationRequested: () => ({ dispose: () => {} }),
        },
      );
    },
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      clear: () => {},
      dispose: () => {},
    }),
    createStatusBarItem: () => ({
      show: () => {},
      dispose: () => {},
      text: "",
      tooltip: "",
    }),
  },
  extensions: {
    getExtension: () => undefined,
  },
  Uri: {
    file: (f: string) => ({ fsPath: f, path: f, scheme: "file" }),
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
    joinPath: (base: any, ...parts: string[]) => {
      const path = require("path");
      return {
        fsPath: path.join(base.fsPath || base, ...parts),
        scheme: "file",
      };
    },
  },
  TreeItem: class {
    constructor(
      public label: string,
      public collapsibleState?: any,
    ) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(
      public id: string,
      public color?: any,
    ) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  MarkdownString: class {
    private text = "";
    isTrusted = false;
    appendMarkdown(str: string) {
      this.text += str;
    }
  },
  EventEmitter: class {
    event = () => ({ dispose: () => {} });
    fire = () => {};
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { Notification: 15, Window: 10 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  Disposable: class {
    static from(...disposables: { dispose(): any }[]) {
      return { dispose: () => disposables.forEach((d) => d.dispose()) };
    }
  },
};

(Module as any)._load = function (
  request: string,
  parent: any,
  isMain: boolean,
) {
  if (request === "vscode") {
    return vscodeMock;
  }
  return originalLoad.apply(this, arguments);
};
