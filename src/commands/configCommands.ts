import * as vscode from "vscode";
import { KagglePathResolver } from "../services/kagglePathResolver";

export function registerConfigCommands(context: vscode.ExtensionContext): void {
  // Listen for config changes to invalidate cached binary
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("yaKaggle.kagglePath")) {
        KagglePathResolver.clearCache();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.selectKaggleBinary",
      async () => {
        const choice = await vscode.window.showQuickPick(
          [
            {
              label: "$(search) Auto-detect Virtual Environment",
              description:
                "Scans workspace .venv/venv and active Python interpreter",
            },
            {
              label:
                "$(file-directory) Browse for Executable or .venv Folder...",
              description:
                "Select kaggle binary or virtual environment path manually",
            },
            {
              label: "$(edit) Enter Custom Path Manually",
              description: "Type full path to executable",
            },
          ],
          { placeHolder: "Configure Kaggle CLI binary resolution" },
        );

        if (!choice) return;

        if (choice.label.includes("Auto-detect")) {
          await vscode.workspace
            .getConfiguration("yaKaggle")
            .update("kagglePath", "", vscode.ConfigurationTarget.Workspace);
          KagglePathResolver.clearCache();
          const detected = await KagglePathResolver.getKaggleExecutable();
          vscode.window.showInformationMessage(
            `Auto-detected Kaggle executable: ${detected}`,
          );
        } else if (choice.label.includes("Browse")) {
          const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select Kaggle Binary or Virtualenv",
          });

          if (uris && uris[0]) {
            await vscode.workspace
              .getConfiguration("yaKaggle")
              .update(
                "kagglePath",
                uris[0].fsPath,
                vscode.ConfigurationTarget.Workspace,
              );
            KagglePathResolver.clearCache();
            vscode.window.showInformationMessage(
              `Kaggle path set to: ${uris[0].fsPath}`,
            );
          }
        } else if (choice.label.includes("Custom Path")) {
          const input = await vscode.window.showInputBox({
            prompt:
              "Enter full path to kaggle binary or virtual environment folder",
            placeHolder: "/home/user/project/.venv/bin/kaggle",
          });

          if (input !== undefined) {
            await vscode.workspace
              .getConfiguration("yaKaggle")
              .update(
                "kagglePath",
                input.trim(),
                vscode.ConfigurationTarget.Workspace,
              );
            KagglePathResolver.clearCache();
            vscode.window.showInformationMessage(
              `Kaggle path set to: ${input}`,
            );
          }
        }
      },
    ),
  );
}
