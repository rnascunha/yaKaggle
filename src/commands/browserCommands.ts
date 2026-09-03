import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { CompetitionService } from "../services/competitionService";

export function registerBrowserCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.openInBrowser",
      async (item?: any) => {
        const data = item?.data;
        const contextVal = item?.contextValue || "";

        // 1. Check direct URL property
        if (
          data?.url &&
          typeof data.url === "string" &&
          data.url.startsWith("http")
        ) {
          vscode.env.openExternal(vscode.Uri.parse(data.url));
          return;
        }

        let rawRef =
          data?.ref ||
          data?.id ||
          (typeof item?.label === "string" ? item.label : "");

        // 2. Fallback: inspect active editor if invoked from Command Palette without tree selection
        if (!rawRef && vscode.window.activeTextEditor) {
          const currentPath =
            vscode.window.activeTextEditor.document.uri.fsPath;
          const dir = path.dirname(currentPath);

          const kernelMeta = path.join(dir, "kernel-metadata.json");
          const datasetMeta = path.join(dir, "dataset-metadata.json");

          if (fs.existsSync(kernelMeta)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(kernelMeta, "utf8"));
              if (parsed.id) {
                vscode.env.openExternal(
                  vscode.Uri.parse(`https://www.kaggle.com/code/${parsed.id}`),
                );
                return;
              }
            } catch {}
          } else if (fs.existsSync(datasetMeta)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(datasetMeta, "utf8"));
              if (parsed.id) {
                vscode.env.openExternal(
                  vscode.Uri.parse(
                    `https://www.kaggle.com/datasets/${parsed.id}`,
                  ),
                );
                return;
              }
            } catch {}
          }
        }

        if (!rawRef) {
          vscode.window.showErrorMessage(
            "No Kaggle item selected and active file has no Kaggle metadata.",
          );
          return;
        }

        let targetUrl = "";

        if (data?.type === "dataset" || contextVal.includes("Dataset")) {
          targetUrl = rawRef.startsWith("http")
            ? rawRef
            : `https://www.kaggle.com/datasets/${rawRef}`;
        } else if (
          data?.type === "competition" ||
          contextVal.toLowerCase().includes("competition")
        ) {
          const slug = CompetitionService.extractCleanSlug(rawRef);
          targetUrl = `https://www.kaggle.com/competitions/${slug}`;
        } else {
          targetUrl = rawRef.startsWith("http")
            ? rawRef
            : `https://www.kaggle.com/code/${rawRef}`;
        }

        vscode.env.openExternal(vscode.Uri.parse(targetUrl));
      },
    ),
  );
}
