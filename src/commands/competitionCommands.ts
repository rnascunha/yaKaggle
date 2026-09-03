import * as vscode from "vscode";
import { CompetitionsProvider } from "../views/competitionsProvider";
import { CompetitionService } from "../services/competitionService";
import { OutputChannelManager } from "../services/outputChannelManager";

export function registerCompetitionCommands(
  context: vscode.ExtensionContext,
  competitionsProvider: CompetitionsProvider,
): void {
  const getCleanDetails = (
    item: any,
  ): { slug: string; title: string; url: string } => {
    const data = item?.data;
    const rawRef =
      data?.ref ||
      data?.id ||
      (typeof item?.label === "string" ? item.label : "");
    const slug = CompetitionService.extractCleanSlug(rawRef);
    const title = data?.title || slug;
    const url = data?.url || `https://www.kaggle.com/competitions/${slug}`;
    return { slug, title, url };
  };

  // 1. Open Competition in Browser
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.openCompetitionBrowser",
      async (item?: any) => {
        let { slug, url } = getCleanDetails(item);

        if (!slug) {
          const input = await vscode.window.showInputBox({
            prompt: "Enter competition slug (e.g., titanic)",
          });
          if (!input) return;
          slug = CompetitionService.extractCleanSlug(input);
          url = `https://www.kaggle.com/competitions/${slug}`;
        }

        vscode.env.openExternal(vscode.Uri.parse(url));
      },
    ),
  );

  // 2. View Leaderboard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.viewLeaderboard",
      async (item?: any) => {
        let { slug, title } = getCleanDetails(item);

        if (!slug) {
          const input = await vscode.window.showInputBox({
            prompt: "Enter competition slug to view leaderboard",
          });
          if (!input) return;
          slug = CompetitionService.extractCleanSlug(input);
          title = slug;
        }

        OutputChannelManager.show(false);
        OutputChannelManager.appendLine(
          `[Leaderboard] Fetching standings for '${title}' (${slug})...`,
        );

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Fetching leaderboard for ${title}...`,
            cancellable: false,
          },
          async () => {
            try {
              const { topEntries, userEntry } =
                await CompetitionService.getLeaderboard(slug);

              OutputChannelManager.show(false);
              OutputChannelManager.appendLine(
                `\n================ LEADERBOARD: ${title} ================`,
              );

              if (userEntry) {
                OutputChannelManager.appendLine(
                  ` ⭐ YOUR STANDING: Rank #${userEntry.rank} | Team: ${userEntry.teamName} | Score: ${userEntry.score} | Submitted: ${userEntry.lastSubmission}`,
                );
                OutputChannelManager.appendLine(
                  `-------------------------------------------------------------------------`,
                );
              } else {
                OutputChannelManager.appendLine(
                  ` (No team matching your handle found on the public leaderboard)`,
                );
                OutputChannelManager.appendLine(
                  `-------------------------------------------------------------------------`,
                );
              }

              OutputChannelManager.appendLine(
                `Rank\tScore\t\tTeam Name\t\t\tLast Submission`,
              );
              OutputChannelManager.appendLine(
                `----\t-----\t\t---------\t\t\t---------------`,
              );

              if (topEntries.length === 0) {
                OutputChannelManager.appendLine(
                  `No leaderboard records available yet.`,
                );
              } else {
                topEntries.forEach((e) => {
                  const marker = e.isCurrentUser ? "➔ " : "  ";
                  const scoreStr = (e.score || "-").padEnd(12);
                  const teamStr = e.teamName.padEnd(25).slice(0, 25);
                  OutputChannelManager.appendLine(
                    `${marker}#${e.rank.padEnd(4)}\t${scoreStr}\t${teamStr}\t${e.lastSubmission}`,
                  );
                });
              }

              OutputChannelManager.appendLine(
                `=========================================================================\n`,
              );

              vscode.window
                .showInformationMessage(
                  `Loaded leaderboard for ${title}`,
                  "View Output Channel",
                )
                .then((c) => {
                  if (c === "View Output Channel") OutputChannelManager.show();
                });
            } catch (err: any) {
              OutputChannelManager.appendLine(
                `[Error] Could not fetch leaderboard: ${err.message}`,
              );
              vscode.window.showErrorMessage(
                `Failed to fetch leaderboard: ${err.message}`,
              );
            }
          },
        );
      },
    ),
  );

  // 3. Download Competition Data
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.downloadCompetitionData",
      async (item?: any) => {
        let { slug, title, url } = getCleanDetails(item);

        if (!slug) {
          const input = await vscode.window.showInputBox({
            prompt: "Enter competition slug to download data for",
          });
          if (!input) return;
          slug = CompetitionService.extractCleanSlug(input);
          title = slug;
          url = `https://www.kaggle.com/competitions/${slug}`;
        }

        const destUris = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Download Folder",
        });

        if (!destUris || !destUris[0]) return;
        const targetDir = destUris[0].fsPath;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Downloading data for ${title}...`,
            cancellable: true,
          },
          async (_, token) => {
            try {
              OutputChannelManager.appendLine(
                `[CLI] Downloading competition data for '${slug}' to ${targetDir}...`,
              );
              const res = await CompetitionService.downloadCompetitionFiles(
                slug,
                targetDir,
              );
              OutputChannelManager.appendLine(`[CLI] ${res}`);

              const choice = await vscode.window.showInformationMessage(
                `Competition data downloaded to ${targetDir}`,
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
              OutputChannelManager.appendLine(
                `[Error] Download failed: ${err.message}`,
              );
              if (
                err.message.includes("403") ||
                err.message.includes("Forbidden") ||
                err.message.includes("rules")
              ) {
                const accept = await vscode.window.showErrorMessage(
                  `Download failed: You must accept competition rules on Kaggle before downloading data.`,
                  "Open Rules Page",
                );
                if (accept === "Open Rules Page") {
                  vscode.env.openExternal(vscode.Uri.parse(`${url}/rules`));
                }
              } else {
                vscode.window.showErrorMessage(
                  `Download failed: ${err.message}`,
                );
              }
            }
          },
        );
      },
    ),
  );

  // 4. Load More
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.loadMoreCompetitions",
      async () => {
        await competitionsProvider.loadMore();
      },
    ),
  );

  // 5. Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.refreshCompetitions", () => {
      competitionsProvider.refresh();
      vscode.window.showInformationMessage("Kaggle Competitions refreshed.");
    }),
  );
}
