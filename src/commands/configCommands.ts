import * as vscode from "vscode";
import { KagglePathResolver } from "../services/kagglePathResolver";

export function registerConfigCommands(context: vscode.ExtensionContext): void {
  const getTarget = (): vscode.ConfigurationTarget => {
    return vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.selectKaggleBinary", async () => {
      const choice = await vscode.window.showQuickPick(
        [
          {
            label: "$(search) Auto-detect Environment / PATH",
            description:
              "Scans workspace .venv/venv and active Python interpreter",
          },
          {
            label: "$(file-directory) Browse for Executable or .venv Folder...",
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

      const target = getTarget();

      if (choice.label.includes("Auto-detect")) {
        await vscode.workspace
          .getConfiguration("yaKaggle")
          .update("kagglePath", "", target);
        KagglePathResolver.clearCache();
        const detected = await KagglePathResolver.getKaggleExecutable();
        vscode.window.showInformationMessage(
          `Kaggle executable resolved to: ${detected}`,
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
            .update("kagglePath", uris[0].fsPath, target);
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
            .update("kagglePath", input.trim(), target);
          KagglePathResolver.clearCache();
          vscode.window.showInformationMessage(`Kaggle path set to: ${input}`);
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.setUsername", async () => {
      const current = vscode.workspace
        .getConfiguration("yaKaggle")
        .get<string>("username", "");

      const input = await vscode.window.showInputBox({
        prompt:
          "Enter your Kaggle username (used for slugs and author attribution)",
        placeHolder: "e.g., rnascunha",
        value: current,
        validateInput: (val) => {
          if (val.trim().length > 0 && !/^[a-zA-Z0-9_-]+$/.test(val.trim())) {
            return "Kaggle usernames can only contain alphanumeric characters, underscores, and dashes.";
          }
          return null;
        },
      });

      if (input !== undefined) {
        const target =
          vscode.workspace.workspaceFolders &&
          vscode.workspace.workspaceFolders.length > 0
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;

        await vscode.workspace
          .getConfiguration("yaKaggle")
          .update("username", input.trim(), target);

        vscode.window.showInformationMessage(
          input.trim()
            ? `Kaggle username set to '${input.trim()}'.`
            : "Kaggle username cleared (using default fallback).",
        );
      }
    }),
  );
}
