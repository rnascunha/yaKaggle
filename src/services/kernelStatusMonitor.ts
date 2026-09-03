import * as vscode from "vscode";
import * as fs from "fs";
import { KaggleCliService } from "./kaggleCli";
import { OutputChannelManager } from "./outputChannelManager";

export type KernelState =
  | "queued"
  | "running"
  | "complete"
  | "error"
  | "idle"
  | "unknown";

export interface ActiveKernelTracker {
  slug: string;
  lastKnownState: KernelState;
  startTime: Date;
}

export class KernelStatusMonitor implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeKernels: Map<string, ActiveKernelTracker> = new Map();
  private isPolling = false;
  private pollIntervalMs = 15000; // 15 seconds default
  private _onStatusChange = new vscode.EventEmitter<void>();
  public readonly onStatusChange = this._onStatusChange.event;

  constructor(private context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50, // Priority
    );
    this.statusBarItem.command = "yaKaggle.showKernelQuickPick";
    this.context.subscriptions.push(this.statusBarItem);

    this.renderIdle();
    this.startPolling();
  }

  public isTracked(slug: string): boolean {
    return this.activeKernels.has(slug);
  }

  public registerRunningKernel(
    slug: string,
    initialState: KernelState = "queued",
  ): void {
    const existing = this.activeKernels.get(slug);
    if (!existing) {
      this.activeKernels.set(slug, {
        slug,
        lastKnownState: initialState,
        startTime: new Date(),
      });
      OutputChannelManager.appendLine(
        `[Monitor] Registered kernel '${slug}' for real-time tracking.`,
      );
    } else {
      existing.lastKnownState = initialState;
    }
    this.render();
    this.pollNow();
  }

  public unregisterKernel(slug: string): void {
    if (this.activeKernels.has(slug)) {
      this.activeKernels.delete(slug);
      OutputChannelManager.appendLine(
        `[Monitor] Unregistered kernel '${slug}' from real-time tracking.`,
      );
      this.render();
    }
  }

  public parseStatusString(raw: string): KernelState {
    const clean = raw.toLowerCase();
    if (clean.includes("running")) return "running";
    if (clean.includes("queued")) return "queued";
    if (clean.includes("complete") || clean.includes("finished"))
      return "complete";
    if (clean.includes("error") || clean.includes("failed")) return "error";
    return "unknown";
  }

  /**
   * Synchronizes tracker state based on newly fetched status:
   * Adds if queued or running; removes if finished, failed, or idle.
   */
  public syncKernelStatus(slug: string, rawStatus: string): KernelState {
    const state = this.parseStatusString(rawStatus);

    if (state === "running" || state === "queued") {
      this.registerRunningKernel(slug, state);
    } else if (this.activeKernels.has(slug)) {
      this.unregisterKernel(slug);
    }

    return state;
  }

  public startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.pollAll(), this.pollIntervalMs);
  }

  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async pollNow(): Promise<void> {
    await this.pollAll();
  }

  private async pollAll(): Promise<void> {
    if (this.isPolling || this.activeKernels.size === 0) return;
    this.isPolling = true;

    try {
      for (const [slug, tracker] of this.activeKernels.entries()) {
        try {
          const rawStatus = await KaggleCliService.getKernelStatus(slug);
          const state = this.parseStatusString(rawStatus);

          if (state !== tracker.lastKnownState) {
            this.handleStateTransition(slug, tracker.lastKnownState, state);
            tracker.lastKnownState = state;
          }

          // Auto-fetch output and notify if completed or failed
          if (state === "complete" || state === "error") {
            await this.fetchAndShowKernelOutput(slug, state);
            this.activeKernels.delete(slug); // Stop tracking finished jobs
          }
          if (
            state !== "running" &&
            state !== "queued" &&
            this.activeKernels.has(slug)
          ) {
            this.unregisterKernel(slug);
          }
        } catch (err: any) {
          OutputChannelManager.appendLine(
            `[Error] Failed to poll status for '${slug}': ${err.message}`,
          );
        }
      }
    } finally {
      this.isPolling = false;
      this.render();
    }
  }

  private handleStateTransition(
    slug: string,
    oldState: KernelState,
    newState: KernelState,
  ): void {
    OutputChannelManager.appendLine(
      `[Status Change] '${slug}': ${oldState.toUpperCase()} ➔ ${newState.toUpperCase()}`,
    );

    if (newState === "complete") {
      vscode.window
        .showInformationMessage(
          `Kaggle Kernel '${slug}' finished execution successfully.`,
          "View Logs",
        )
        .then((choice) => {
          if (choice === "View Logs") OutputChannelManager.show();
        });
    } else if (newState === "error") {
      vscode.window
        .showErrorMessage(
          `Kaggle Kernel '${slug}' failed with an error.`,
          "View Logs",
        )
        .then((choice) => {
          if (choice === "View Logs") OutputChannelManager.show();
        });
    }
  }

  private async fetchAndShowKernelOutput(
    slug: string,
    state: KernelState,
  ): Promise<void> {
    OutputChannelManager.appendLine(
      `\n---------------- [OUTPUT: ${slug} (${state.toUpperCase()})] ----------------`,
    );

    try {
      // 1. Resolve and sanitize target folder path
      const sanitizedSlug = slug.replace(/[\\/]/g, "_");
      const targetDirUri = vscode.Uri.joinPath(
        this.context.globalStorageUri,
        "kernel-outputs",
        sanitizedSlug,
      );
      const tempPath = targetDirUri.fsPath;

      // 2. Ensure global storage root and kernel directory exist recursively
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, { recursive: true });
      }

      // 3. Fetch output via Kaggle CLI
      const cliStdout = await KaggleCliService.getKernelOutput(slug, tempPath);

      // 4. Kaggle CLI writes log files directly into the destination directory.
      // If cliStdout is empty or just says files were downloaded, check for log files.
      let logContent = cliStdout ? cliStdout.trim() : "";

      const files = fs.readdirSync(tempPath);
      const logFile = files.find(
        (f) => f.endsWith(".log") || f.endsWith(".txt") || f.includes("output"),
      );

      if (logFile) {
        const fileText = fs
          .readFileSync(
            vscode.Uri.joinPath(targetDirUri, logFile).fsPath,
            "utf8",
          )
          .trim();
        if (fileText.length > 0) {
          logContent = logContent
            ? `${logContent}\n\n[File: ${logFile}]\n${fileText}`
            : fileText;
        }
      }

      OutputChannelManager.appendLine(
        logContent ||
          "Kernel completed. Output directory created, but no textual log was produced.",
      );
    } catch (err: any) {
      OutputChannelManager.appendLine(
        `Could not fetch log output: ${err.message}`,
      );
    }

    OutputChannelManager.appendLine(
      `-------------------------------------------------------------------------\n`,
    );
  }

  private render(): void {
    this._onStatusChange.fire();
    if (this.activeKernels.size === 0) {
      this.renderIdle();
      return;
    }

    const count = this.activeKernels.size;
    const runningCount = Array.from(this.activeKernels.values()).filter(
      (k) => k.lastKnownState === "running",
    ).length;
    const queuedCount = Array.from(this.activeKernels.values()).filter(
      (k) => k.lastKnownState === "queued",
    ).length;

    this.statusBarItem.text = `$(sync~spin) Kaggle: ${runningCount} running${queuedCount > 0 ? `, ${queuedCount} queued` : ""}`;
    this.statusBarItem.tooltip = Array.from(this.activeKernels.values())
      .map((k) => `${k.slug} [${k.lastKnownState.toUpperCase()}]`)
      .join("\n");
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  private renderIdle(): void {
    this.statusBarItem.text = "$(check) Kaggle: Idle";
    this.statusBarItem.tooltip =
      "yaKaggle: No kernels currently executing. Click for actions.";
    this.statusBarItem.backgroundColor = undefined;
    this.statusBarItem.show();
  }

  public getTrackedKernels(): ActiveKernelTracker[] {
    return Array.from(this.activeKernels.values());
  }

  public dispose(): void {
    this.stopPolling();
    this.statusBarItem.dispose();
  }
}
