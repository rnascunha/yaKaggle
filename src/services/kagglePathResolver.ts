import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

export class KagglePathResolver {
  private static cachedPath: string | null = null;

  public static clearCache(): void {
    this.cachedPath = null;
  }

  public static async getKaggleExecutable(): Promise<string> {
    if (this.cachedPath && this.isValidExecutable(this.cachedPath)) {
      return this.cachedPath;
    }

    // 1. Check user-defined setting in VS Code Settings
    const config = vscode.workspace.getConfiguration("yaKaggle");
    const customPath = config.get<string>("kagglePath", "").trim();

    if (customPath) {
      const resolved = this.resolveExecutableFromCandidate(customPath);
      if (resolved && this.isValidExecutable(resolved)) {
        this.cachedPath = resolved;
        return resolved;
      }
    }

    // 2. Query official VS Code Python Extension API (if active/installed)
    const pythonApiExecutable = await this.getPythonExtensionPath();
    if (pythonApiExecutable) {
      const resolved = this.resolveExecutableFromCandidate(pythonApiExecutable);
      if (resolved && this.isValidExecutable(resolved)) {
        this.cachedPath = resolved;
        return resolved;
      }
    }

    // 3. Scan workspace folders for virtual environments (.venv, venv, env, etc.)
    const workspaceResolved = this.findInWorkspaceVenvs();
    if (workspaceResolved) {
      this.cachedPath = workspaceResolved;
      return workspaceResolved;
    }

    // 4. Fallback to system PATH default
    this.cachedPath = process.platform === "win32" ? "kaggle.exe" : "kaggle";
    return this.cachedPath;
  }

  private static resolveExecutableFromCandidate(
    candidatePath: string,
  ): string | null {
    if (!fs.existsSync(candidatePath)) return null;

    const stats = fs.statSync(candidatePath);

    // If candidate is already an executable file directly
    if (stats.isFile()) {
      if (path.basename(candidatePath).startsWith("python")) {
        // Given a python binary, find 'kaggle' in the same directory
        const dir = path.dirname(candidatePath);
        const kaggleBinary =
          process.platform === "win32"
            ? path.join(dir, "kaggle.exe")
            : path.join(dir, "kaggle");
        return fs.existsSync(kaggleBinary) ? kaggleBinary : null;
      }
      return candidatePath;
    }

    // If candidate is a virtual environment root folder (e.g., .venv)
    if (stats.isDirectory()) {
      const binDirName = process.platform === "win32" ? "Scripts" : "bin";
      const binaryName = process.platform === "win32" ? "kaggle.exe" : "kaggle";
      const possiblePath = path.join(candidatePath, binDirName, binaryName);
      if (fs.existsSync(possiblePath)) {
        return possiblePath;
      }
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

  private static isValidExecutable(filePath: string): boolean {
    if (filePath === "kaggle" || filePath === "kaggle.exe") return true;
    return fs.existsSync(filePath);
  }
}
