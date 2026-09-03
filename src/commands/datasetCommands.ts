import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  DatasetsProvider,
  KaggleDatasetTreeItem,
} from "../views/datasetsProvider";
import {
  DatasetOperationsService,
  KaggleCliService,
} from "../services/kaggleCli";
import { CredentialsManager } from "../services/credentialsManager";
import { OutputChannelManager } from "../services/outputChannelManager";

function extractDatasetFolder(item?: any): string | undefined {
  if (!item) {
    if (vscode.window.activeTextEditor?.document?.uri) {
      return path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
    }
    return undefined;
  }

  if (item instanceof vscode.Uri) {
    const stat = fs.statSync(item.fsPath);
    return stat.isDirectory() ? item.fsPath : path.dirname(item.fsPath);
  }

  if (item?.data?.metadataPath instanceof vscode.Uri) {
    return path.dirname(item.data.metadataPath.fsPath);
  }

  if (typeof item?.data?.metadataPath === "string") {
    return path.dirname(item.data.metadataPath);
  }

  return undefined;
}

export function registerDatasetCommands(
  context: vscode.ExtensionContext,
  datasetsProvider: DatasetsProvider,
): void {
  // 1. Edit Local dataset-metadata.json
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.openDatasetMetadata",
      async (item: KaggleDatasetTreeItem) => {
        let metaUri: vscode.Uri | undefined;

        if (item?.data?.metadataPath instanceof vscode.Uri) {
          metaUri = item.data.metadataPath;
        } else if (typeof item?.data?.metadataPath === "string") {
          metaUri = vscode.Uri.file(item.data.metadataPath);
        }

        if (metaUri) {
          const doc = await vscode.workspace.openTextDocument(metaUri);
          await vscode.window.showTextDocument(doc);
        } else {
          vscode.window.showErrorMessage(
            "No dataset-metadata.json found for this item.",
          );
        }
      },
    ),
  );

  // 2. Create New Dataset Wizard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.initDatasetMetadata",
      async () => {
        const folderUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Folder for New Dataset",
        });

        if (!folderUris || !folderUris[0]) return;
        const targetFolder = folderUris[0].fsPath;

        const title = await vscode.window.showInputBox({
          prompt: "Enter dataset title (6-50 characters)",
          placeHolder: "e.g. Brazilian E-Commerce Public Dataset",
          validateInput: (val) =>
            val.length < 6 || val.length > 50
              ? "Title must be 6 to 50 characters long."
              : null,
        });
        if (!title) return;

        const creds = CredentialsManager.inspectCredentials();
        const defaultUser = creds.username || "username";
        const defaultSlug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

        const slug = await vscode.window.showInputBox({
          prompt: "Enter dataset identifier (username/slug)",
          value: `${defaultUser}/${defaultSlug}`,
        });
        if (!slug) return;

        try {
          const metaUri = await DatasetOperationsService.createDatasetTemplate(
            targetFolder,
            title,
            slug,
          );
          datasetsProvider.refresh();
          const doc = await vscode.workspace.openTextDocument(metaUri);
          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage(
            `Dataset template created at ${metaUri.fsPath}`,
          );
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to create dataset: ${err.message}`,
          );
        }
      },
    ),
  );

  // 3. Download & Unzip Dataset (Registers command defined in package.json)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.downloadDataset",
      async (item: KaggleDatasetTreeItem) => {
        const slug = item?.data?.ref || item?.data?.id;
        if (!slug) {
          vscode.window.showErrorMessage("Please select a remote dataset.");
          return;
        }

        const destUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Destination Folder (Will Unzip)",
        });

        if (!destUris || !destUris[0]) return;
        const targetDir = destUris[0].fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading & unzipping dataset '${slug}'...`,
            cancellable: true,
          },
          async (_, token) => {
            try {
              OutputChannelManager.appendLine(
                `[CLI] Downloading and unzipping dataset: ${slug}`,
              );
              const result = await KaggleCliService.downloadDataset(
                slug,
                targetDir,
                token,
              );
              OutputChannelManager.appendLine(`[CLI] ${result}`);

              const choice = await vscode.window.showInformationMessage(
                `Dataset '${slug}' downloaded and unzipped to ${targetDir}`,
                "Open Folder",
              );
              if (choice === "Open Folder") {
                vscode.commands.executeCommand(
                  "revealFileInOS",
                  vscode.Uri.file(targetDir),
                );
              }
            } catch (err: any) {
              if (err instanceof vscode.CancellationError) return;
              vscode.window.showErrorMessage(`Download failed: ${err.message}`);
            }
          },
        );
      },
    ),
  );

  // 4. Download Entire Dataset as Unextracted Zip Archive
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.downloadDatasetArchive",
      async (item: KaggleDatasetTreeItem) => {
        const slug = item?.data?.ref || item?.data?.id;
        if (!slug) {
          vscode.window.showErrorMessage(
            "Please select a valid remote dataset.",
          );
          return;
        }

        const destUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Download Destination Folder",
        });

        if (!destUris || !destUris[0]) return;
        const targetDir = destUris[0].fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading '${slug}' archive (.zip)...`,
            cancellable: true,
          },
          async (_, token) => {
            try {
              OutputChannelManager.appendLine(
                `[CLI] Downloading full dataset archive: ${slug}`,
              );
              const result =
                await DatasetOperationsService.downloadDatasetArchive(
                  slug,
                  targetDir,
                  token,
                );
              OutputChannelManager.appendLine(`[CLI] ${result}`);

              const choice = await vscode.window.showInformationMessage(
                `Downloaded ${slug}.zip to ${targetDir}`,
                "Open Folder",
              );
              if (choice === "Open Folder") {
                vscode.commands.executeCommand(
                  "revealFileInOS",
                  vscode.Uri.file(targetDir),
                );
              }
            } catch (err: any) {
              if (err instanceof vscode.CancellationError) return;
              vscode.window.showErrorMessage(`Download failed: ${err.message}`);
            }
          },
        );
      },
    ),
  );

  // 5. Download Single Remote File
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.downloadDatasetFile",
      async (item: KaggleDatasetTreeItem) => {
        const fileData = item?.data;
        if (!fileData || !fileData.parentSlug || !fileData.name) {
          vscode.window.showErrorMessage("Invalid dataset file selected.");
          return;
        }

        const destUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Destination Folder",
        });

        if (!destUris || !destUris[0]) return;
        const targetDir = destUris[0].fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading '${fileData.name}' from ${fileData.parentSlug}...`,
            cancellable: true,
          },
          async (_, token) => {
            try {
              OutputChannelManager.appendLine(
                `[CLI] Downloading file '${fileData.name}' from ${fileData.parentSlug}...`,
              );

              await KaggleCliService.downloadSingleDatasetFile(
                fileData.parentSlug,
                fileData.name,
                targetDir,
                token,
              );

              vscode.window
                .showInformationMessage(
                  `Successfully downloaded ${fileData.name} to ${targetDir}`,
                  "Open Folder",
                )
                .then((choice) => {
                  if (choice === "Open Folder") {
                    vscode.commands.executeCommand(
                      "revealFileInOS",
                      vscode.Uri.file(targetDir),
                    );
                  }
                });
            } catch (err: any) {
              if (err instanceof vscode.CancellationError) return;
              OutputChannelManager.appendLine(
                `[Error] Single file download failed: ${err.message}`,
              );
              vscode.window.showErrorMessage(
                `Failed to download ${fileData.name}: ${err.message}`,
              );
            }
          },
        );
      },
    ),
  );

  // 6. Load More Remote Dataset Files
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.loadMoreDatasetFiles",
      (item: KaggleDatasetTreeItem) => {
        if (item?.data?.slug) {
          datasetsProvider.incrementVisibleFiles(item.data.slug);
        }
      },
    ),
  );

  // 7. Refresh Datasets View
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.refreshDatasets", () => {
      datasetsProvider.refresh();
      vscode.window.showInformationMessage("Kaggle Datasets refreshed.");
    }),
  );

  // 8. Update Local Dataset Version
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.updateDataset",
      async (item: any) => {
        const reportName = item?.data?.id || item?.label || "dataset";
        try {
          const filePath = extractDatasetFolder(item);
          if (!filePath) {
            throw new Error(
              "Could not locate dataset folder. Open a file inside the dataset folder or select it from the sidebar.",
            );
          }

          const inputMessage = await vscode.window.showInputBox({
            prompt: `Enter version message for dataset '${reportName}' (optional)`,
            placeHolder: "e.g., Added clean rows and updated features",
          });

          if (inputMessage === undefined) return;

          const commitMessage = inputMessage.trim() || "Updated using yaKaggle";

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Pushing new version of '${reportName}'...`,
              cancellable: true,
            },
            async (_, token) => {
              await KaggleCliService.pushDataset(
                filePath,
                commitMessage,
                token,
              );
              vscode.window.showInformationMessage(
                `Dataset '${reportName}' updated successfully!`,
              );
            },
          );
        } catch (e: any) {
          console.log(e)
          if (e instanceof vscode.CancellationError) return;
          vscode.window.showErrorMessage(
            `Error updating dataset '${reportName}': ${e?.message || e}`,
          );
        }
      },
    ),
  );
}
