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
  format?: "access_token" | "kaggle.json";
  username?: string;
  permissionsCorrect: boolean;
  error?: string;
}

export class CredentialsManager {
  /**
   * Retrieves the configured or default Kaggle configuration directory.
   */
  public static getKaggleConfigDir(): string {
    const config = vscode.workspace.getConfiguration("yaKaggle");
    const customDir = config.get<string>("kaggleConfigDir", "").trim();

    if (customDir && fs.existsSync(customDir)) {
      return customDir;
    }

    return path.join(os.homedir(), ".kaggle");
  }

  public static getAccessTokenPath(): string {
    return path.join(this.getKaggleConfigDir(), "access_token");
  }

  public static getLegacyCredentialsPath(): string {
    return path.join(this.getKaggleConfigDir(), "kaggle.json");
  }

  /**
   * Returns the path of the active credentials file.
   * Prefers `access_token` if present; falls back to `kaggle.json`.
   */
  public static getCredentialsPath(): string {
    const accessTokenPath = this.getAccessTokenPath();
    if (fs.existsSync(accessTokenPath)) {
      return accessTokenPath;
    }

    const legacyPath = this.getLegacyCredentialsPath();
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }

    // Default target for new setups
    return accessTokenPath;
  }

  /**
   * Resolves the active Kaggle username.
   * Priority:
   * 1. VS Code configuration (`yaKaggle.username`)
   * 2. Username found in credentials file (e.g. legacy kaggle.json)
   * 3. Fallback default: "username"
   */
  public static getUsername(): string {
    const configUser = vscode.workspace
      .getConfiguration("yaKaggle")
      .get<string>("username", "")
      .trim();

    if (configUser.length > 0) {
      return configUser;
    }

    const creds = this.inspectCredentials();
    if (creds.username && creds.username.trim().length > 0) {
      return creds.username.trim();
    }

    return "username";
  }

  /**
   * Inspects credentials, checking access_token first and falling back to kaggle.json.
   */
  public static inspectCredentials(): CredentialStatus {
    const configDir = this.getKaggleConfigDir();
    const accessPath = path.join(configDir, "access_token");
    const jsonPath = path.join(configDir, "kaggle.json");

    // Check configuration setting first for username
    const configuredUser = vscode.workspace
      .getConfiguration("yaKaggle")
      .get<string>("username", "")
      .trim();

    if (fs.existsSync(accessPath)) {
      const perms = this.checkFilePermissions(accessPath);
      return {
        exists: true,
        filePath: accessPath,
        format: "access_token",
        isValidJson: true,
        permissionsCorrect: perms,
        username: configuredUser || undefined,
      };
    }

    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, "utf8");
        const parsed = JSON.parse(raw);
        const perms = this.checkFilePermissions(jsonPath);
        return {
          exists: true,
          filePath: jsonPath,
          format: "kaggle.json",
          isValidJson: !!(parsed.username && parsed.key),
          permissionsCorrect: perms,
          username: configuredUser || parsed.username || undefined,
        };
      } catch (err: any) {
        return {
          exists: true,
          filePath: jsonPath,
          format: "kaggle.json",
          isValidJson: false,
          permissionsCorrect: false,
          error: `JSON parsing failed: ${err.message}`,
        };
      }
    }

    return {
      exists: false,
      filePath: accessPath,
      isValidJson: false,
      permissionsCorrect: false,
      username: configuredUser || undefined,
    };
  }

  /**
   * Saves either a JSON token pair or a plain access token string.
   */
  public static async saveCredentials(
    token: KaggleToken | string,
  ): Promise<string> {
    const configDir = this.getKaggleConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    let targetPath: string;
    let payload: string;

    if (typeof token === "string") {
      targetPath = this.getAccessTokenPath();
      payload = token.trim();
    } else {
      targetPath = this.getLegacyCredentialsPath();
      payload = JSON.stringify(
        { username: token.username.trim(), key: token.key.trim() },
        null,
        2,
      );
    }

    fs.writeFileSync(targetPath, payload, { encoding: "utf8", mode: 0o600 });
    this.enforceFilePermissions(targetPath);

    return targetPath;
  }

  /**
   * Sets POSIX 0600 permissions on existing credential files.
   */
  public static async fixPermissions(): Promise<void> {
    const accessTokenPath = this.getAccessTokenPath();
    const legacyPath = this.getLegacyCredentialsPath();

    if (fs.existsSync(accessTokenPath)) {
      this.enforceFilePermissions(accessTokenPath);
    }
    if (fs.existsSync(legacyPath)) {
      this.enforceFilePermissions(legacyPath);
    }
  }

  /**
   * Quick probe to test if credentials can query the Kaggle API.
   */
  public static async testAuthentication(): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
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

  private static checkFilePermissions(filePath: string): boolean {
    if (process.platform === "win32") {
      return true;
    }
    try {
      const stats = fs.statSync(filePath);
      return (stats.mode & 0o777) === 0o600;
    } catch {
      return false;
    }
  }

  private static enforceFilePermissions(filePath: string): void {
    if (process.platform !== "win32" && fs.existsSync(filePath)) {
      try {
        fs.chmodSync(filePath, 0o600);
      } catch (err) {
        OutputChannelManager.appendLine(
          `[Warning] Could not set 0600 permissions on ${filePath}: ${err}`,
        );
      }
    }
  }

  private static extractUsernameFromJwt(token: string): string | undefined {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
        const parsed = JSON.parse(jsonPayload);
        return parsed.username || parsed.sub || parsed.name || undefined;
      }
    } catch {
      // Opaque non-JWT token; username extraction skipped
    }
    return undefined;
  }
}
