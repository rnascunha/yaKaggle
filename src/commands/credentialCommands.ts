import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  CredentialsManager,
  KaggleToken,
} from "../services/credentialsManager";

export function registerCredentialCommands(
  context: vscode.ExtensionContext,
): void {
  // Command: Check & Verify
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.verifyCredentials", async () => {
      const status = CredentialsManager.inspectCredentials();
      const fileName = path.basename(status.filePath);

      if (!status.exists) {
        const choice = await vscode.window.showWarningMessage(
          `No credentials found at '${status.filePath}'. Would you like to configure them now?`,
          "Setup Now",
          "Cancel",
        );
        if (choice === "Setup Now") {
          vscode.commands.executeCommand("yaKaggle.setupCredentials");
        }
        return;
      }

      if (!status.isValidJson && status.format === "kaggle.json") {
        vscode.window.showErrorMessage(
          `Invalid ${fileName} format: ${status.error}`,
        );
        return;
      }

      if (!status.permissionsCorrect && process.platform !== "win32") {
        const fix = await vscode.window.showWarningMessage(
          `${fileName} has open permissions (should be 0600). Fix now?`,
          "Fix Permissions",
          "Ignore",
        );
        if (fix === "Fix Permissions") {
          await CredentialsManager.fixPermissions();
          vscode.window.showInformationMessage("Permissions updated to 0600.");
        }
      }

      const userTag = status.username ? ` as '${status.username}'` : "";
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Testing Kaggle API connection${userTag}...`,
          cancellable: false,
        },
        async () => {
          const test = await CredentialsManager.testAuthentication();
          if (test.success) {
            vscode.window.showInformationMessage(
              `Kaggle API Authenticated successfully (${status.format || fileName})${userTag}.`,
            );
          } else {
            vscode.window.showErrorMessage(
              `Kaggle Auth Failed: ${test.message}`,
            );
          }
        },
      );
    }),
  );

  // Command: Setup / Import Credentials Wizard
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.setupCredentials", async () => {
      const action = await vscode.window.showQuickPick(
        [
          {
            label: "$(key) Paste API Access Token (access_token)",
            description: "Paste token directly into ~/.kaggle/access_token",
          },
          {
            label:
              "$(file) Import Credentials File (access_token or kaggle.json)",
            description: "Select file downloaded from Kaggle Account settings",
          },
          {
            label: "$(edit) Enter Username & API Key Manually (kaggle.json)",
            description: "Save classic credentials format",
          },
          {
            label:
              "$(link-external) Open Kaggle Account Page to Generate Token",
            description: "https://www.kaggle.com/settings",
          },
        ],
        { placeHolder: "Select Kaggle Credentials Setup Method" },
      );

      if (!action) return;

      if (action.label.includes("Open Kaggle Account")) {
        vscode.env.openExternal(
          vscode.Uri.parse("https://www.kaggle.com/settings"),
        );
        vscode.window.showInformationMessage(
          'Scroll to the "API" section on Kaggle and click "Create New Token".',
        );
        return;
      }

      if (action.label.includes("Paste API Access Token")) {
        const tokenInput = await vscode.window.showInputBox({
          prompt: "Paste your Kaggle API token string",
          password: true,
          placeHolder: "eyJhbGciOi...",
        });
        if (!tokenInput || tokenInput.trim().length === 0) return;

        const savedPath = await CredentialsManager.saveCredentials(
          tokenInput.trim(),
        );
        vscode.window.showInformationMessage(`Token stored in ${savedPath}`);
        vscode.commands.executeCommand("yaKaggle.verifyCredentials");
        return;
      }

      if (action.label.includes("Import Credentials File")) {
        const uris = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          openLabel: "Import Credentials File",
        });

        if (!uris || !uris[0]) return;

        try {
          const raw = fs.readFileSync(uris[0].fsPath, "utf8").trim();

          // If file is JSON
          if (raw.startsWith("{") && raw.endsWith("}")) {
            const parsed: KaggleToken = JSON.parse(raw);
            if (!parsed.username || !parsed.key) {
              vscode.window.showErrorMessage(
                'JSON credentials file is missing "username" or "key" attributes.',
              );
              return;
            }
            const savedPath = await CredentialsManager.saveCredentials(parsed);
            vscode.window.showInformationMessage(
              `Credentials saved to ${savedPath}`,
            );
          } else {
            // Raw text token
            const savedPath = await CredentialsManager.saveCredentials(raw);
            vscode.window.showInformationMessage(
              `Access token saved to ${savedPath}`,
            );
          }

          vscode.commands.executeCommand("yaKaggle.verifyCredentials");
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to read credentials file: ${err.message}`,
          );
        }
      } else if (action.label.includes("Enter Username")) {
        const username = await vscode.window.showInputBox({
          prompt: "Step 1/2: Enter your Kaggle username",
          placeHolder: "e.g., rnascunha",
        });
        if (!username) return;

        const key = await vscode.window.showInputBox({
          prompt: "Step 2/2: Enter your Kaggle API key",
          password: true,
          placeHolder: "API key token string",
        });
        if (!key) return;

        const savedPath = await CredentialsManager.saveCredentials({
          username,
          key,
        });
        vscode.window.showInformationMessage(
          `Credentials stored at ${savedPath}`,
        );
        vscode.commands.executeCommand("yaKaggle.verifyCredentials");
      }
    }),
  );
}
