import * as vscode from "vscode";
import { CompetitionService } from "../services/competitionService";

export function registerBrowserCommands(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.openInBrowser",
      (item: any) => {
        const data = item?.data;
        const contextVal = item?.contextValue || "";

        if (!data && !item?.label) {
          vscode.window.showErrorMessage("No Kaggle item selected to open.");
          return;
        }

        // If data.url is already a valid complete URL, open directly
        if (
          data?.url &&
          typeof data.url === "string" &&
          data.url.startsWith("http")
        ) {
          vscode.env.openExternal(vscode.Uri.parse(data.url));
          return;
        }

        const rawRef =
          data?.ref ||
          data?.id ||
          (typeof item?.label === "string" ? item.label : "");
        if (!rawRef) return;

        let targetUrl = "";

        if (data?.type === "dataset" || contextVal.includes("Dataset")) {
          targetUrl = rawRef.startsWith("http")
            ? rawRef
            : `https://www.kaggle.com/datasets/${rawRef}`;
        } else if (
          data?.type === "competition" ||
          contextVal.includes("competition") ||
          contextVal.includes("Competition")
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
