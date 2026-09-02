import Module = require("module");

const originalLoad = (Module as any)._load;

// Mock VS Code API object
const vscodeMock = {
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({
      get: () => "",
    }),
    findFiles: async () => [],
    fs: {
      readFile: async () => new Uint8Array(),
    },
  },
  window: {
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    createOutputChannel: () => ({
      appendLine: () => {},
      show: () => {},
      clear: () => {},
      dispose: () => {},
    }),
    createStatusBarItem: () => ({
      show: () => {},
      dispose: () => {},
    }),
  },
  Uri: {
    file: (f: string) => ({ fsPath: f, path: f, scheme: "file" }),
    parse: (s: string) => ({ toString: () => s, fsPath: s }),
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
  EventEmitter: class {
    event = () => {};
    fire = () => {};
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
};

// Monkey-patch Node's module loader to intercept 'vscode'
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
