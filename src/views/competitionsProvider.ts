import * as vscode from "vscode";
import {
  CompetitionService,
  CompetitionDetails,
} from "../services/competitionService";
import { parseKaggleDeadline } from "../utils/dateUtils";

export class KaggleCompetitionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly data?: any,
  ) {
    super(label, collapsibleState);
  }
}

export class CompetitionsProvider implements vscode.TreeDataProvider<KaggleCompetitionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    KaggleCompetitionTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private joinedCompetitions: CompetitionDetails[] = [];
  private generalCompetitions: CompetitionDetails[] = [];
  private currentPage = 1;
  private readonly pageSize = 20;
  private hasMoreGeneral = true;
  private isLoading = false;
  private isInitialized = false;

  refresh(): void {
    this.joinedCompetitions = [];
    this.generalCompetitions = [];
    this.currentPage = 1;
    this.hasMoreGeneral = true;
    this.isInitialized = false;
    this._onDidChangeTreeData.fire();
  }

  async loadMore(): Promise<void> {
    if (this.isLoading || !this.hasMoreGeneral) return;
    this.currentPage += 1;
    await this.fetchGeneralPage();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KaggleCompetitionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: KaggleCompetitionTreeItem,
  ): Promise<KaggleCompetitionTreeItem[]> {
    if (!element) {
      if (!this.isInitialized) {
        await this.initialLoad();
      }

      return [
        new KaggleCompetitionTreeItem(
          `My Active Competitions (${this.joinedCompetitions.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          "group_joined",
        ),
        new KaggleCompetitionTreeItem(
          "Recent & Featured Competitions",
          vscode.TreeItemCollapsibleState.Expanded,
          "group_general",
        ),
      ];
    }

    if (element.contextValue === "group_joined") {
      if (this.joinedCompetitions.length === 0) {
        const item = new KaggleCompetitionTreeItem(
          "No active entered competitions found",
          vscode.TreeItemCollapsibleState.None,
          "empty",
        );
        item.iconPath = new vscode.ThemeIcon("info");
        return [item];
      }
      return this.joinedCompetitions.map((c) => this.buildCompetitionItem(c));
    }

    if (element.contextValue === "group_general") {
      if (this.generalCompetitions.length === 0) {
        const item = new KaggleCompetitionTreeItem(
          "No competitions available",
          vscode.TreeItemCollapsibleState.None,
          "empty",
        );
        item.iconPath = new vscode.ThemeIcon("info");
        return [item];
      }

      const items: KaggleCompetitionTreeItem[] = this.generalCompetitions.map(
        (c) => this.buildCompetitionItem(c),
      );

      if (this.hasMoreGeneral) {
        const moreItem = new KaggleCompetitionTreeItem(
          "... Load More Competitions",
          vscode.TreeItemCollapsibleState.None,
          "loadMoreCompetitions",
        );
        moreItem.iconPath = new vscode.ThemeIcon("ellipsis");
        moreItem.command = {
          command: "yaKaggle.loadMoreCompetitions",
          title: "Load More Competitions",
        };
        items.push(moreItem);
      }

      return items;
    }

    return [];
  }

  private buildCompetitionItem(
    c: CompetitionDetails,
  ): KaggleCompetitionTreeItem {
    const deadline = parseKaggleDeadline(c.deadlineRaw);
    const isJoined = c.userHasEntered;
    const isClosed = c.isExpired;

    const item = new KaggleCompetitionTreeItem(
      c.title,
      vscode.TreeItemCollapsibleState.None,
      "competitionItem",
      { ...c, type: "competition" },
    );

    item.description = `${deadline.formattedText} • ${c.reward || "Knowledge"}`;

    // --- Distinct Icon & Color Rules ---
    if (!isClosed && isJoined) {
      // 1. Active + Entered -> Green checkmark
      item.iconPath = new vscode.ThemeIcon(
        "verified-filled",
        new vscode.ThemeColor("charts.green"),
      );
    } else if (isClosed && isJoined) {
      // 2. Closed + Entered -> Blue checkmark
      item.iconPath = new vscode.ThemeIcon(
        "pass-filled",
        new vscode.ThemeColor("charts.blue"),
      );
    } else if (isClosed && !isJoined) {
      // 3. Closed + Not Entered -> Gray checkmark
      item.iconPath = new vscode.ThemeIcon(
        "check",
        new vscode.ThemeColor("disabledForeground"),
      );
    } else {
      // 4. Active + Not Entered -> Urgency / Trophy
      if (deadline.urgency === "critical") {
        item.iconPath = new vscode.ThemeIcon(
          "flame",
          new vscode.ThemeColor("errorForeground"),
        );
      } else if (deadline.urgency === "soon") {
        item.iconPath = new vscode.ThemeIcon(
          "clock",
          new vscode.ThemeColor("charts.orange"),
        );
      } else {
        item.iconPath = new vscode.ThemeIcon("trophy");
      }
    }

    // Markdown Tooltip
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`### ${c.title}\n\n`);
    md.appendMarkdown(
      `- **Participation:** ${isJoined ? "🟢 **Entered**" : "⚪ Not Entered"}\n`,
    );
    md.appendMarkdown(
      `- **Status:** ${isClosed ? "🔴 Closed" : "🟢 Active"}\n`,
    );
    md.appendMarkdown(`- **Slug:** \`${c.ref}\`\n`);
    md.appendMarkdown(`- **Category:** ${c.category}\n`);
    md.appendMarkdown(`- **Reward:** ${c.reward}\n`);
    md.appendMarkdown(`- **Total Teams:** ${c.teamCount}\n`);
    md.appendMarkdown(
      `- **Deadline:** ${deadline.formattedText} (${c.deadlineRaw || "Ongoing"})\n\n`,
    );
    md.appendMarkdown(`[Open Competition on Kaggle](${c.url})`);
    item.tooltip = md;

    return item;
  }

  private async initialLoad(): Promise<void> {
    this.isLoading = true;
    try {
      const records = await CompetitionService.getCompetitionsPage(
        1,
        this.pageSize,
      );
      this.joinedCompetitions = records.filter(
        (c) => c.userHasEntered && !c.isExpired,
      );
      this.generalCompetitions = records.filter(
        (c) => !c.userHasEntered || c.isExpired,
      );
      this.isInitialized = true;
      if (this.generalCompetitions.length < this.pageSize) {
        this.hasMoreGeneral = false;
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to load competitions: ${err.message}`,
      );
    } finally {
      this.isLoading = false;
    }
  }

  private async fetchGeneralPage(): Promise<void> {
    this.isLoading = true;
    try {
      const pageData = await CompetitionService.getCompetitionsPage(
        this.currentPage,
        this.pageSize,
      );
      if (pageData.length < this.pageSize) {
        this.hasMoreGeneral = false;
      }
      const joined = pageData.filter((c) => c.userHasEntered && !c.isExpired);
      const general = pageData.filter((c) => !c.userHasEntered || c.isExpired);

      this.joinedCompetitions.push(...joined);
      this.generalCompetitions.push(...general);
    } catch (err: any) {
      vscode.window.showErrorMessage(
        `Failed to fetch page ${this.currentPage}: ${err.message}`,
      );
      this.hasMoreGeneral = false;
    } finally {
      this.isLoading = false;
    }
  }
}
