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
    return undefined;
  }

  if (typeof item?.data?.metadataPath === "string") {
    return path.dirname(item.data.metadataPath);
  }

  if (item?.data?.metadataPath instanceof vscode.Uri) {
    return path.dirname(item.data.metadataPath.fsPath);
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
        const metaUri = item?.data?.metadataPath as vscode.Uri;
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

  // 3. Download Entire Dataset as Unextracted Zip
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.downloadDatasetArchive",
      async (item: KaggleDatasetTreeItem) => {
        const slug = item?.data?.fullSlug || item?.data?.ref;
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
            title: `Downloading '${slug}' archive (keeping zipped)...`,
            cancellable: false,
          },
          async () => {
            try {
              OutputChannelManager.appendLine(
                `[CLI] Downloading full dataset archive: ${slug}`,
              );
              const result =
                await DatasetOperationsService.downloadDatasetArchive(
                  slug,
                  targetDir,
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
              vscode.window.showErrorMessage(`Download failed: ${err.message}`);
            }
          },
        );
      },
    ),
  );

  // 4. Download Single Remote File
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
            cancellable: false,
          },
          async () => {
            try {
              OutputChannelManager.appendLine(
                `[CLI] Downloading file '${fileData.name}' from ${fileData.parentSlug}...`,
              );

              await KaggleCliService.downloadSingleDatasetFile(
                fileData.parentSlug,
                fileData.name,
                targetDir,
              );

              const downloadedFilePath = path.join(targetDir, fileData.name);
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

  // 5. Load More Remote Dataset Files (Pagination)
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

  // 6. Refresh Datasets View
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.refreshDatasets", () => {
      datasetsProvider.refresh();
      vscode.window.showInformationMessage("Kaggle Datasets refreshed.");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.updateDataset",
      async (item: any) => {
        const reportName = item?.data?.id || item?.label || "dataset";
        try {
          const filePath = extractDatasetFolder(item);
          if (!filePath) {
            throw new Error("Error getting file");
          }

          const inputMessage = await vscode.window.showInputBox({
            prompt: `Enter version message for dataset '${reportName}' (optional)`,
            placeHolder: "e.g., Added clean rows and updated features",
          });

          // Cancelled via ESC
          if (inputMessage === undefined) {
            return;
          }

          const trimmed = inputMessage.trim();
          const commitMessage =
            trimmed.length > 0 ? trimmed : "Updated using yaKaggle";

          vscode.window.showInformationMessage(
            `Updating dataset ${reportName}...`,
          );

          await KaggleCliService.pushDataset(filePath, commitMessage);
          vscode.window.showInformationMessage(
            `Dataset '${reportName}' updated successfully!`,
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(
            `Error trying to update dataset '${reportName}': ${e?.message || e}`,
          );
        }
      },
    ),
  );
}
