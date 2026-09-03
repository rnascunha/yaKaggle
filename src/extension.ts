// src/extension.ts
import * as vscode from "vscode";
import { KernelsProvider } from "./views/kernelsProvider";
import { DatasetsProvider } from "./views/datasetsProvider";
import { CompetitionsProvider } from "./views/competitionsProvider";
import { KernelStatusMonitor } from "./services/kernelStatusMonitor";
import { OutputChannelManager } from "./services/outputChannelManager";
import { registerCredentialCommands } from "./commands/credentialCommands";
import { registerConfigCommands } from "./commands/configCommands";
import { registerStatusCommands } from "./commands/quickPickCommands";
import { registerKernelCommands } from "./commands/kernelCommands";
import { registerDatasetCommands } from "./commands/datasetCommands";
import { registerCompetitionCommands } from "./commands/competitionCommands";
import { registerBrowserCommands } from "./commands/browserCommands";
import { KagglePathResolver } from "./services/kagglePathResolver";

export function activate(context: vscode.ExtensionContext) {
  // Initialize path resolver cache listeners
  KagglePathResolver.register(context);
  
  // 1. Output Channel & Status Monitor
  const statusMonitor = new KernelStatusMonitor(context);
  context.subscriptions.push(statusMonitor);
  context.subscriptions.push({ dispose: () => OutputChannelManager.dispose() });

  // 2. View Providers
  const kernelsProvider = new KernelsProvider(statusMonitor);
  const datasetsProvider = new DatasetsProvider();
  const competitionsProvider = new CompetitionsProvider();

  vscode.window.registerTreeDataProvider("kaggle-kernels", kernelsProvider);
  vscode.window.registerTreeDataProvider("kaggle-datasets", datasetsProvider);
  vscode.window.registerTreeDataProvider(
    "kaggle-competitions",
    competitionsProvider,
  );

  // 3. Register Command Modules (Each registers unique commands)
  registerCredentialCommands(context);
  registerConfigCommands(context);
  registerStatusCommands(context, statusMonitor);
  registerKernelCommands(context, kernelsProvider, statusMonitor);
  registerDatasetCommands(context, datasetsProvider);
  registerCompetitionCommands(context, competitionsProvider);
  registerBrowserCommands(context);

  // 4. Global Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand("yaKaggle.refreshAll", () => {
      kernelsProvider.refresh();
      datasetsProvider.refresh();
      competitionsProvider.refresh();
      statusMonitor.pollNow();
      vscode.window.showInformationMessage(
        "All Kaggle Dynamics views refreshed.",
      );
    }),
  );
}
