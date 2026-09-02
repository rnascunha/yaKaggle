import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { KaggleCliService } from "./kaggleCli";
import { OutputChannelManager } from "./outputChannelManager";

export interface KaggleToken {
  username: string;
  key: string;
}

export interface CredentialStatus {
  exists: boolean;
  filePath: string;
  isValidJson: boolean;
  username?: string;
  permissionsCorrect: boolean;
  error?: string;
}

export class CredentialsManager {
  public static getKaggleConfigDir(): string {
    const config = vscode.workspace.getConfiguration("yaKaggle");
    const customDir = config.get<string>("kaggleConfigDir", "").trim();

    if (customDir && fs.existsSync(customDir)) {
      return customDir;
    }

    const homeDir = os.homedir();
    return path.join(homeDir, ".kaggle");
  }

  public static getCredentialsPath(): string {
    return path.join(this.getKaggleConfigDir(), "access_token");
  }

  public static inspectCredentials(): CredentialStatus {
    const credPath = this.getCredentialsPath();

    if (!fs.existsSync(credPath)) {
      return {
        exists: false,
        filePath: credPath,
        isValidJson: false,
        permissionsCorrect: false,
        error: "File does not exist.",
      };
    }

    try {
      const content = fs.readFileSync(credPath, "utf8");
      const parsed: KaggleToken = JSON.parse(content);

      if (!parsed.username || !parsed.key) {
        return {
          exists: true,
          filePath: credPath,
          isValidJson: false,
          permissionsCorrect: false,
          error: 'JSON must contain non-empty "username" and "key" fields.',
        };
      }

      // Check POSIX file permissions
      let permissionsCorrect = true;
      if (process.platform !== "win32") {
        const stats = fs.statSync(credPath);
        const mode = stats.mode & 0o777;
        // Optimal permissions are 0600 (owner rw only)
        if (mode !== 0o600) {
          permissionsCorrect = false;
        }
      }

      return {
        exists: true,
        filePath: credPath,
        isValidJson: true,
        username: parsed.username,
        permissionsCorrect,
      };
    } catch (err: any) {
      return {
        exists: true,
        filePath: credPath,
        isValidJson: false,
        permissionsCorrect: false,
        error: `JSON parsing failed: ${err.message}`,
      };
    }
  }

  public static async saveCredentials(token: KaggleToken): Promise<string> {
    const configDir = this.getKaggleConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    const targetPath = this.getCredentialsPath();
    const payload = JSON.stringify(
      { username: token.username.trim(), key: token.key.trim() },
      null,
      2,
    );

    fs.writeFileSync(targetPath, payload, { encoding: "utf8", mode: 0o600 });

    // Enforce POSIX chmod 600
    if (process.platform !== "win32") {
      try {
        fs.chmodSync(targetPath, 0o600);
      } catch (err) {
        OutputChannelManager.appendLine(
          `[Warning] Could not set 0600 permissions: ${err}`,
        );
      }
    }

    return targetPath;
  }

  public static async fixPermissions(): Promise<void> {
    const credPath = this.getCredentialsPath();
    if (fs.existsSync(credPath) && process.platform !== "win32") {
      fs.chmodSync(credPath, 0o600);
    }
  }

  public static async testAuthentication(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Fast probe to verify API credentials
      const res = await KaggleCliService.execute([
        "competitions",
        "list",
        "--csv",
      ]);
      if (res.includes("401") || res.includes("Unauthorized")) {
        return {
          success: false,
          message: "Invalid API token or unauthorized request.",
        };
      }
      return {
        success: true,
        message: "Authentication verified successfully!",
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }
}
