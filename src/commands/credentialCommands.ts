import * as vscode from "vscode";
import * as fs from "fs";
import {
  CredentialsManager,
  KaggleToken,
} from "../services/credentialsManager";
import { OutputChannelManager } from "../services/outputChannelManager";

export function registerCredentialCommands(
  context: vscode.ExtensionContext,
): void {
  // Command: Check & Verify
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.verifyCredentials",
      async () => {
        const status = CredentialsManager.inspectCredentials();

        if (!status.exists) {
          const choice = await vscode.window.showWarningMessage(
            `No kaggle.json found at '${status.filePath}'. Would you like to configure it?`,
            "Setup Now",
            "Cancel",
          );
          if (choice === "Setup Now") {
            vscode.commands.executeCommand("yaKaggle.setupCredentials");
          }
          return;
        }

        if (!status.isValidJson) {
          vscode.window.showErrorMessage(
            `Invalid kaggle.json format: ${status.error}`,
          );
          return;
        }

        if (!status.permissionsCorrect && process.platform !== "win32") {
          const fix = await vscode.window.showWarningMessage(
            `kaggle.json has unsafe permissions (should be 0600). Fix now?`,
            "Fix Permissions",
            "Ignore",
          );
          if (fix === "Fix Permissions") {
            await CredentialsManager.fixPermissions();
            vscode.window.showInformationMessage(
              "Permissions updated to 0600.",
            );
          }
        }

        // Execute live ping test
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Testing Kaggle API connection for user '${status.username}'...`,
            cancellable: false,
          },
          async () => {
            const test = await CredentialsManager.testAuthentication();
            if (test.success) {
              vscode.window.showInformationMessage(
                `Kaggle API Connected as '${status.username}'.`,
              );
            } else {
              vscode.window.showErrorMessage(
                `Kaggle Auth Failed: ${test.message}`,
              );
            }
          },
        );
      },
    ),
  );

  // Command: Setup / Import Credentials Wizard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.setupCredentials",
      async () => {
        const action = await vscode.window.showQuickPick(
          [
            {
              label: "$(folder) Import downloaded kaggle.json",
              description:
                "Select the file downloaded from Kaggle Account settings",
            },
            {
              label: "$(key) Enter Username & API Token Manually",
              description: "Provide Kaggle username and API key string",
            },
            {
              label:
                "$(link-external) Open Kaggle Account Page to Generate Token",
              description: "https://www.kaggle.com/settings",
            },
          ],
          { placeHolder: "Kaggle Credentials Setup" },
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

        if (action.label.includes("Import downloaded")) {
          const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { "JSON Files": ["json"] },
            openLabel: "Import kaggle.json",
          });

          if (!uris || !uris[0]) return;

          try {
            const raw = fs.readFileSync(uris[0].fsPath, "utf8");
            const parsed: KaggleToken = JSON.parse(raw);

            if (!parsed.username || !parsed.key) {
              vscode.window.showErrorMessage(
                'Selected file is missing "username" or "key" attributes.',
              );
              return;
            }

            const savedPath = await CredentialsManager.saveCredentials(parsed);
            vscode.window.showInformationMessage(
              `Credentials saved successfully to ${savedPath}`,
            );
            vscode.commands.executeCommand("yaKaggle.verifyCredentials");
          } catch (err: any) {
            vscode.window.showErrorMessage(
              `Failed to read credentials file: ${err.message}`,
            );
          }
        } else if (action.label.includes("Enter Username")) {
          const username = await vscode.window.showInputBox({
            prompt: "Step 1/2: Enter your Kaggle username",
            placeHolder: "e.g., rafaelcunha",
          });
          if (!username) return;

          const key = await vscode.window.showInputBox({
            prompt: "Step 2/2: Enter your Kaggle API key (Token)",
            password: true,
            placeHolder: "e.g., 38f9b8091...",
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
      },
    ),
  );
}
