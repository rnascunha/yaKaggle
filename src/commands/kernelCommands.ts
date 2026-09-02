import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  KaggleKernelTreeItem,
  KernelsProvider,
} from "../views/kernelsProvider";
import { KernelOperationsService } from "../services/kaggleCli";
import { KaggleCliService } from "../services/kaggleCli";
import { OutputChannelManager } from "../services/outputChannelManager";
import { KernelStatusMonitor } from "../services/kernelStatusMonitor";
import { CredentialsManager } from "../services/credentialsManager";

export function registerKernelCommands(
  context: vscode.ExtensionContext,
  kernelsProvider: KernelsProvider,
  statusMonitor: KernelStatusMonitor,
): void {
  // 1. Direct Edit kernel-metadata.json
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.openMetadata",
      async (item: KaggleKernelTreeItem) => {
        const metaUri = item?.data?.metadataPath as vscode.Uri;
        if (metaUri) {
          const doc = await vscode.workspace.openTextDocument(metaUri);
          await vscode.window.showTextDocument(doc);
        } else {
          vscode.window.showErrorMessage(
            "No metadata path found for this item.",
          );
        }
      },
    ),
  );

  // 2. Initialize (Init) kernel-metadata.json for a script or notebook
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.initKernelMetadata", async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(
          "Open a workspace folder to initialize Kaggle metadata.",
        );
        return;
      }

      // Step A: Pick target directory or scan for code files
      const candidateFiles = await vscode.workspace.findFiles(
        "**/*.{ipynb,py,r,R}",
        "**/node_modules/**",
      );

      let targetFolder = workspaceFolders[0].uri;
      let defaultCodeFile = "notebook.ipynb";
      let detectedLang: "python" | "r" = "python";
      let detectedType: "notebook" | "script" = "notebook";

      if (candidateFiles.length > 0) {
        const filePick = await vscode.window.showQuickPick(
          candidateFiles.map((uri) => ({
            label: `$(file-code) ${vscode.workspace.asRelativePath(uri)}`,
            uri,
          })),
          {
            placeHolder:
              "Select the script or notebook to link with this kernel metadata:",
          },
        );

        if (!filePick) return;

        targetFolder = vscode.Uri.file(path.dirname(filePick.uri.fsPath));
        defaultCodeFile = path.basename(filePick.uri.fsPath);
        detectedType = defaultCodeFile.endsWith(".ipynb")
          ? "notebook"
          : "script";
        detectedLang =
          defaultCodeFile.endsWith(".r") || defaultCodeFile.endsWith(".R")
            ? "r"
            : "python";
      }

      // Step B: Kernel Slug & Title Prompt
      const creds = CredentialsManager.inspectCredentials();
      const defaultUser = creds.username || "username";

      const title = await vscode.window.showInputBox({
        prompt: "Enter the title for your Kaggle Kernel",
        placeHolder: "e.g. Titanic Disaster Prediction Model",
      });
      if (!title) return;

      const defaultSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const slug = await vscode.window.showInputBox({
        prompt: "Enter the kernel slug (id)",
        value: `${defaultUser}/${defaultSlug}`,
      });
      if (!slug) return;

      // Step C: Write file & open editor
      const metaUri = await KernelOperationsService.initKernelMetadata(
        targetFolder,
        {
          id: slug,
          title,
          code_file: defaultCodeFile,
          language: detectedLang,
          kernel_type: detectedType,
          is_private: true,
        },
      );

      kernelsProvider.refresh();
      const doc = await vscode.workspace.openTextDocument(metaUri);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `Created ${path.basename(metaUri.fsPath)} successfully.`,
      );
    }),
  );

  // 3. Pull Remote Notebook to Unsaved / Untitled File
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.pullRemoteKernelUnsaved",
      async (item: KaggleKernelTreeItem) => {
        const slug = item?.data?.ref || item?.data?.id;
        if (!slug) {
          vscode.window.showErrorMessage("Invalid kernel item selected.");
          return;
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Pulling notebook '${slug}' from Kaggle...`,
            cancellable: false,
          },
          async () => {
            try {
              const tempDir = path.join(
                context.globalStorageUri.fsPath,
                "temp-pulls",
                slug.replace("/", "_"),
              );
              const { filename, content, isNotebook } =
                await KernelOperationsService.pullKernelContent(slug, tempDir);

              if (isNotebook) {
                // Open untitled Jupyter Notebook in memory
                const notebookData = JSON.parse(
                  new TextDecoder().decode(content),
                );
                const untitledDoc = await vscode.workspace.openNotebookDocument(
                  "jupyter-notebook",
                  new vscode.NotebookData(
                    notebookData.cells.map((cell: any) => {
                      const kind =
                        cell.cell_type === "code"
                          ? vscode.NotebookCellKind.Code
                          : vscode.NotebookCellKind.Markup;
                      const cellData = new vscode.NotebookCellData(
                        kind,
                        Array.isArray(cell.source)
                          ? cell.source.join("")
                          : cell.source,
                        cell.cell_type === "code" ? "python" : "markdown",
                      );
                      return cellData;
                    }),
                  ),
                );
                await vscode.window.showNotebookDocument(untitledDoc);
              } else {
                // Open untitled Text/Python script buffer in memory
                const untitledDoc = await vscode.workspace.openTextDocument({
                  content: new TextDecoder().decode(content),
                  language: filename.endsWith(".py") ? "python" : "r",
                });
                await vscode.window.showTextDocument(untitledDoc);
              }

              vscode.window.showInformationMessage(
                `Pulled '${slug}' into a new buffer.`,
              );
            } catch (err: any) {
              vscode.window.showErrorMessage(`Pull failed: ${err.message}`);
            }
          },
        );
      },
    ),
  );

  // 4. View Kernel Output Logs & Status
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.viewKernelOutput",
      async (item: KaggleKernelTreeItem) => {
        const slug = item?.data?.id || item?.data?.ref;
        if (!slug) {
          vscode.window.showErrorMessage("Select a kernel to view output.");
          return;
        }

        OutputChannelManager.show(false);
        OutputChannelManager.appendLine(
          `[Kernel] Fetching latest status and logs for '${slug}'...`,
        );

        try {
          const status = await KaggleCliService.getKernelStatus(slug);
          OutputChannelManager.appendLine(
            `[Status] Current Execution State: ${status.toUpperCase()}`,
          );

          const tempPath = path.join(
            context.globalStorageUri.fsPath,
            "kernel-outputs",
            slug.replace("/", "_"),
          );
          const output = await KaggleCliService.getKernelOutput(slug, tempPath);

          OutputChannelManager.appendLine(
            `\n--- Execution Output for ${slug} ---`,
          );
          OutputChannelManager.appendLine(
            output || "No text/stdout logs generated yet.",
          );
          OutputChannelManager.appendLine(
            `-----------------------------------\n`,
          );
        } catch (err: any) {
          OutputChannelManager.appendLine(
            `[Error] Failed to fetch output: ${err.message}`,
          );
        }
      },
    ),
  );

  // 5. Refresh Kernels View
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.refreshKernels", () => {
      kernelsProvider.refresh();
      statusMonitor.pollNow();
    }),
  );

  // Command: Load More Remote Kernels (Pagination)
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.loadMoreKernels", async () => {
      await kernelsProvider.loadMore();
    }),
  );

  // Command: Download Kernel Output Artifacts (CSV, Models, Charts)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.downloadKernelFiles",
      async (item: KaggleKernelTreeItem) => {
        const slug = item?.data?.ref || item?.data?.id;
        if (!slug) {
          vscode.window.showErrorMessage(
            "No kernel selected for artifact download.",
          );
          return;
        }

        // Pick destination folder
        const targetUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Output Destination Folder",
        });

        if (!targetUris || !targetUris[0]) return;

        const destPath = path.join(
          targetUris[0].fsPath,
          slug.replace("/", "_") + "_output",
        );

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading output artifacts for '${slug}'...`,
            cancellable: false,
          },
          async () => {
            try {
              const files = await KaggleCliService.downloadKernelArtifacts(
                slug,
                destPath,
              );
              const choice = await vscode.window.showInformationMessage(
                `Downloaded ${files.length} file(s) to ${destPath}`,
                "Open Folder",
                "View Output Channel",
              );

              if (choice === "Open Folder") {
                vscode.commands.executeCommand(
                  "revealFileInOS",
                  vscode.Uri.file(destPath),
                );
              } else if (choice === "View Output Channel") {
                OutputChannelManager.show();
              }
            } catch (err: any) {
              vscode.window.showErrorMessage(
                `Failed to download artifacts: ${err.message}`,
              );
            }
          },
        );
      },
    ),
  );


  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.pushKernel",
      async (item?: any) => {
        let targetDir: string | undefined;

        // 1. Triggered from editor title or explorer context menu (item IS a vscode.Uri)
        if (item && item.fsPath && typeof item.fsPath === "string") {
          const stat = fs.statSync(item.fsPath);
          targetDir = stat.isDirectory()
            ? item.fsPath
            : path.dirname(item.fsPath);
        }
        // 2. Triggered from TreeView element with custom data
        else if (
          item?.data?.folderPath &&
          typeof item.data.folderPath === "string"
        ) {
          targetDir = item.data.folderPath;
        } else if (
          item?.data?.metadataPath &&
          typeof item.data.metadataPath === "string"
        ) {
          targetDir = path.dirname(item.data.metadataPath);
        }
        // 3. Triggered from TreeView element holding a resourceUri property
        else if (
          item?.resourceUri?.fsPath &&
          typeof item.resourceUri.fsPath === "string"
        ) {
          const stat = fs.statSync(item.resourceUri.fsPath);
          targetDir = stat.isDirectory()
            ? item.resourceUri.fsPath
            : path.dirname(item.resourceUri.fsPath);
        }
        // 4. Fallback: Currently active editor tab
        else if (vscode.window.activeTextEditor?.document?.uri?.fsPath) {
          const activePath = vscode.window.activeTextEditor.document.uri.fsPath;
          targetDir = path.dirname(activePath);
        }
        // 5. Fallback: Root of first workspace folder
        else if (
          vscode.workspace.workspaceFolders &&
          vscode.workspace.workspaceFolders.length > 0
        ) {
          targetDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
        }

        if (!targetDir || typeof targetDir !== "string") {
          vscode.window.showErrorMessage(
            "Could not determine folder to push. Open a file inside the kernel folder or select it from the tree view.",
          );
          return;
        }

        const metadataPath = path.join(targetDir, "kernel-metadata.json");
        if (!fs.existsSync(metadataPath)) {
          vscode.window.showErrorMessage(
            `Missing 'kernel-metadata.json' in "${targetDir}". Run 'yaKaggle: Initialize Kernel Metadata' first.`,
          );
          return;
        }

        // Read slug/id from metadata for tracking
        let kernelSlug = "";
        try {
          const rawContent = fs.readFileSync(metadataPath, "utf-8");
          const metadataContent = JSON.parse(rawContent);
          kernelSlug = metadataContent.id || metadataContent.id_no || "";
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to parse kernel-metadata.json: ${err.message}`,
          );
          return;
        }

        OutputChannelManager.show(false);
        OutputChannelManager.appendLine(
          `[Push] Pushing kernel from directory: ${targetDir}...`,
        );

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Pushing kernel to Kaggle (${kernelSlug || path.basename(targetDir)})...`,
            cancellable: false,
          },
          async () => {
            try {
              const result = await KaggleCliService.execute([
                "kernels",
                "push",
                "-p",
                `"${targetDir}"`,
              ]);
              OutputChannelManager.appendLine(`[Push] Output:\n${result}`);

              vscode.window
                .showInformationMessage(
                  `Kernel successfully pushed to Kaggle!`,
                  "View Logs",
                )
                .then((choice) => {
                  if (choice === "View Logs") {
                    OutputChannelManager.show();
                  }
                });

              if (kernelSlug) {
                statusMonitor.registerRunningKernel(kernelSlug);
              }

              kernelsProvider.refresh();
            } catch (err: any) {
              OutputChannelManager.appendLine(
                `[Error] Kernel push failed: ${err.message}`,
              );
              vscode.window.showErrorMessage(
                `Kernel push failed: ${err.message}`,
              );
            }
          },
        );
      },
    ),
  );
}
