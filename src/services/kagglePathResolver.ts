import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class KagglePathResolver {
  private static cachedPath: string | null = null;
  private static initialized = false;

  /**
   * Registers configuration and environment listeners to auto-invalidate the cache.
   */
  public static register(context: vscode.ExtensionContext): void {
    if (this.initialized) return;
    this.initialized = true;

    // Invalidate cache whenever yaKaggle settings change
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("yaKaggle.kagglePath")) {
          this.clearCache();
        }
      }),
    );

    // Invalidate cache when workspace folders change
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.clearCache();
      }),
    );

    // Invalidate cache when Python extension changes the active environment
    this.hookPythonEnvironmentWatcher(context);
  }

  public static clearCache(): void {
    this.cachedPath = null;
  }

  /**
   * Resolves the best available Kaggle executable.
   * Only existing absolute paths are cached; system PATH fallbacks are never cached.
   */
  public static async getKaggleExecutable(): Promise<string> {
    if (this.cachedPath && this.isValidAbsoluteExecutable(this.cachedPath)) {
      return this.cachedPath;
    }

    // 1. User-defined setting in VS Code Settings
    const config = vscode.workspace.getConfiguration("yaKaggle");
    const customPath = config.get<string>("kagglePath", "").trim();

    if (customPath) {
      const resolved = this.resolveExecutableFromCandidate(customPath);
      if (resolved && this.isValidAbsoluteExecutable(resolved)) {
        this.cachedPath = resolved;
        return resolved;
      }
    }

    // 2. Active environment from official VS Code Python Extension
    const pythonApiExecutable = await this.getPythonExtensionPath();
    if (pythonApiExecutable) {
      const resolved = this.resolveExecutableFromCandidate(pythonApiExecutable);
      if (resolved && this.isValidAbsoluteExecutable(resolved)) {
        this.cachedPath = resolved;
        return resolved;
      }
    }

    // 3. Scan workspace root folders for virtual environments (.venv, venv, conda-env, etc.)
    const workspaceResolved = this.findInWorkspaceVenvs();
    if (
      workspaceResolved &&
      this.isValidAbsoluteExecutable(workspaceResolved)
    ) {
      this.cachedPath = workspaceResolved;
      return workspaceResolved;
    }

    // 4. Fallback to system PATH without caching (allows late-loading venvs to be discovered later)
    return process.platform === "win32" ? "kaggle.exe" : "kaggle";
  }

  private static resolveExecutableFromCandidate(
    candidatePath: string,
  ): string | null {
    if (!fs.existsSync(candidatePath)) return null;

    try {
      const stats = fs.statSync(candidatePath);

      // If candidate is a direct file
      if (stats.isFile()) {
        const fileName = path.basename(candidatePath).toLowerCase();
        if (fileName.startsWith("python")) {
          const dir = path.dirname(candidatePath);
          const kaggleBinary =
            process.platform === "win32"
              ? path.join(dir, "kaggle.exe")
              : path.join(dir, "kaggle");
          return fs.existsSync(kaggleBinary) ? kaggleBinary : null;
        }
        return candidatePath;
      }

      // If candidate is a virtual environment directory root
      if (stats.isDirectory()) {
        const binDirName = process.platform === "win32" ? "Scripts" : "bin";
        const binaryName =
          process.platform === "win32" ? "kaggle.exe" : "kaggle";
        const possiblePath = path.join(candidatePath, binDirName, binaryName);
        if (fs.existsSync(possiblePath)) {
          return possiblePath;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private static async getPythonExtensionPath(): Promise<string | null> {
    try {
      const pyExt = vscode.extensions.getExtension("ms-python.python");
      if (!pyExt) return null;

      if (!pyExt.isActive) {
        await pyExt.activate();
      }

      const environments = pyExt.exports?.environments;
      if (environments) {
        const activeEnv = await environments.getActiveEnvironmentPath();
        if (activeEnv?.path) {
          return activeEnv.path;
        }
      }
    } catch {
      // Fallback silently if Python API is unavailable
    }
    return null;
  }

  private static async hookPythonEnvironmentWatcher(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    try {
      const pyExt = vscode.extensions.getExtension("ms-python.python");
      if (!pyExt) return;

      if (!pyExt.isActive) {
        await pyExt.activate();
      }

      const environments = pyExt.exports?.environments;
      if (environments?.onDidChangeActiveEnvironmentPath) {
        context.subscriptions.push(
          environments.onDidChangeActiveEnvironmentPath(() => {
            this.clearCache();
          }),
        );
      }
    } catch {
      // Ignore if Python extension API changes
    }
  }

  private static findInWorkspaceVenvs(): string | null {
    const folders = vscode.workspace.workspaceFolders || [];
    const venvNames = [".venv", "venv", "env", ".env"];
    const binDir = process.platform === "win32" ? "Scripts" : "bin";
    const exeName = process.platform === "win32" ? "kaggle.exe" : "kaggle";

    for (const folder of folders) {
      for (const venv of venvNames) {
        const candidate = path.join(folder.uri.fsPath, venv, binDir, exeName);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  private static isValidAbsoluteExecutable(filePath: string): boolean {
    if (!filePath || !path.isAbsolute(filePath)) {
      return false;
    }
    try {
      const stat = fs.statSync(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}
