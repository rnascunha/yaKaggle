import * as vscode from "vscode";
import { KernelStatusMonitor } from "../services/kernelStatusMonitor";
import { OutputChannelManager } from "../services/outputChannelManager";
import { KaggleCliService } from "../services/kaggleCli";

export function registerStatusCommands(
  context: vscode.ExtensionContext,
  monitor: KernelStatusMonitor,
): void {
  // Show QuickPick on status bar click
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "yaKaggle.showKernelQuickPick",
      async () => {
        const tracked = monitor.getTrackedKernels();

        interface QuickPickItemWithAction extends vscode.QuickPickItem {
          action: () => Promise<void> | void;
        }

        const items: QuickPickItemWithAction[] = [
          {
            label: "$(output) Show Kaggle Logs Channel",
            description: "Open extension output log",
            action: () => OutputChannelManager.show(false),
          },
          {
            label: "$(sync) Poll Running Kernels Now",
            description: "Force an immediate status check",
            action: () => monitor.pollNow(),
          },
          {
            label: "$(add) Track Remote Kernel Slug...",
            description: "Monitor status of any running Kaggle kernel",
            action: async () => {
              const slug = await vscode.window.showInputBox({
                prompt:
                  "Enter Kaggle kernel slug (e.g. username/notebook-name):",
                placeHolder: "username/my-kernel-slug",
              });
              if (slug) monitor.registerRunningKernel(slug);
            },
          },
        ];

        // Add individual tracked kernels
        if (tracked.length > 0) {
          items.push({
            label: "Active Kernels",
            kind: vscode.QuickPickItemKind.Separator,
            action: () => {},
          });

          for (const t of tracked) {
            items.push({
              label: `$(play) ${t.slug}`,
              description: `State: ${t.lastKnownState.toUpperCase()}`,
              detail: `Running since ${t.startTime.toLocaleTimeString()}`,
              action: async () => {
                const selected = await vscode.window.showQuickPick(
                  [
                    {
                      label: "$(link-external) Open in Kaggle Browser",
                      id: "open",
                    },
                    { label: "$(output) View Current Output Logs", id: "logs" },
                    { label: "$(trash) Stop Tracking", id: "untrack" },
                  ],
                  { placeHolder: `Actions for ${t.slug}` },
                );

                if (selected?.id === "open") {
                  vscode.env.openExternal(
                    vscode.Uri.parse(`https://www.kaggle.com/code/${t.slug}`),
                  );
                } else if (selected?.id === "logs") {
                  OutputChannelManager.show();
                  try {
                    const status = await KaggleCliService.getKernelStatus(
                      t.slug,
                    );
                    OutputChannelManager.appendLine(
                      `[Status] ${t.slug}: ${status}`,
                    );
                  } catch (e: any) {
                    OutputChannelManager.appendLine(`Error: ${e.message}`);
                  }
                } else if (selected?.id === "untrack") {
                  monitor.unregisterKernel(t.slug);
                }
              },
            });
          }
        }

        const chosen = await vscode.window.showQuickPick(items, {
          placeHolder: "Kaggle Dynamics Monitor Actions",
        });

        if (chosen && chosen.action) {
          chosen.action();
        }
      },
    ),
  );
}
