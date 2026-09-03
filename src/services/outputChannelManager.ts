import * as vscode from "vscode";

export class OutputChannelManager {
  private static channel: vscode.OutputChannel | null = null;

  public static getChannel(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel("yaKaggle");
    }
    return this.channel;
  }

  public static appendLine(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.getChannel().appendLine(`[${timestamp}] ${message}`);
  }

  public static show(preserveFocus = true): void {
    this.getChannel().show(preserveFocus);
  }

  public static clear(): void {
    if (this.channel) {
      this.channel.clear();
    }
  }

  public static dispose(): void {
    if (this.channel) {
      this.channel.dispose();
      this.channel = null;
    }
  }
}
