import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceScanner, LocalKernelMetadata } from '../services/workspaceScanner';
import { KaggleCliService } from '../services/kaggleCli';
import { KernelStatusMonitor } from '../services/kernelStatusMonitor';

export class KaggleKernelTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly data?: any
  ) {
    super(label, collapsibleState);
  }
}

export class KernelsProvider implements vscode.TreeDataProvider<KaggleKernelTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<KaggleKernelTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private remoteKernels: any[] = [];
  private currentPage = 1;
  private pageSize = 10;
  private hasMoreRemote = true;
  private isLoadingRemote = false;

  constructor(private monitor: KernelStatusMonitor) {
    this.monitor.onStatusChange(() => this.refresh());
  }

  refresh(): void {
    this.remoteKernels = [];
    this.currentPage = 1;
    this.hasMoreRemote = true;
    this._onDidChangeTreeData.fire();
  }

  async loadMore(): Promise<void> {
    if (this.isLoadingRemote || !this.hasMoreRemote) return;
    this.currentPage += 1;
    await this.fetchRemotePage();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KaggleKernelTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: KaggleKernelTreeItem): Promise<KaggleKernelTreeItem[]> {
    if (!element) {
      const runningCount = this.monitor.getTrackedKernels().length;
      return [
        new KaggleKernelTreeItem(
          `Running & Tracked (${runningCount})`,
          vscode.TreeItemCollapsibleState.Expanded,
          'group_running'
        ),
        new KaggleKernelTreeItem('Local Workspace Kernels', vscode.TreeItemCollapsibleState.Expanded, 'group_local'),
        new KaggleKernelTreeItem('Remote on Kaggle', vscode.TreeItemCollapsibleState.Collapsed, 'group_remote')
      ];
    }

    // 1. Running / Tracked
    if (element.contextValue === 'group_running') {
      const tracked = this.monitor.getTrackedKernels();
      if (tracked.length === 0) {
        const item = new KaggleKernelTreeItem('No active kernels running', vscode.TreeItemCollapsibleState.None, 'empty');
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }

      return tracked.map((t) => {
        const item = new KaggleKernelTreeItem(t.slug, vscode.TreeItemCollapsibleState.None, 'runningKernel', {
          id: t.slug,
          ref: t.slug,
          state: t.lastKnownState
        });
        item.description = `[${t.lastKnownState.toUpperCase()}]`;
        item.iconPath = t.lastKnownState === 'running' 
          ? new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue')) 
          : new vscode.ThemeIcon('clock');
        return item;
      });
    }

    // 2. Local Workspace
    if (element.contextValue === 'group_local') {
      const local = await WorkspaceScanner.findLocalKernels();
      if (local.length === 0) {
        const item = new KaggleKernelTreeItem('No local kernel-metadata.json found', vscode.TreeItemCollapsibleState.None, 'empty_local');
        item.iconPath = new vscode.ThemeIcon('info');
        return [item];
      }

      return local.map((k) => {
        const item = new KaggleKernelTreeItem(k.id, vscode.TreeItemCollapsibleState.Collapsed, 'localKernel', k);
        item.description = path.dirname(k.metadataPath.fsPath);
        item.iconPath = new vscode.ThemeIcon('notebook');
        return item;
      });
    }

    if (element.contextValue === 'localKernel') {
      const k = element.data as LocalKernelMetadata;
      const codeItem = new KaggleKernelTreeItem(k.code_file, vscode.TreeItemCollapsibleState.None, 'codeFile', k);
      codeItem.iconPath = k.codeFileExists ? new vscode.ThemeIcon('file-code') : new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));
      if (k.codeFileExists) {
        codeItem.command = { command: 'vscode.open', title: 'Open Code', arguments: [k.codeFilePath] };
      }

      const metaItem = new KaggleKernelTreeItem('kernel-metadata.json', vscode.TreeItemCollapsibleState.None, 'metaFile', k);
      metaItem.iconPath = new vscode.ThemeIcon('json');
      metaItem.command = { command: 'vscode.open', title: 'Open Metadata JSON', arguments: [k.metadataPath] };

      return [codeItem, metaItem];
    }

    // 3. Remote Group with Pagination
    if (element.contextValue === 'group_remote') {
      if (this.remoteKernels.length === 0) {
        await this.fetchRemotePage();
      }

      const items: KaggleKernelTreeItem[] = this.remoteKernels.map((r) => {
        const item = new KaggleKernelTreeItem(r.ref || r.title || 'Untitled', vscode.TreeItemCollapsibleState.None, 'remoteKernel', r);
        item.description = `v${r.currentVersionNumber || '1'} (${r.lastRunTime || 'recently'})`;
        item.tooltip = `Author: ${r.author || 'Me'}\nTotal Votes: ${r.totalVotes || '0'}\nSlug: ${r.ref}`;
        item.iconPath = new vscode.ThemeIcon('cloud');
        return item;
      });

      if (this.hasMoreRemote) {
        const moreItem = new KaggleKernelTreeItem('... Load More Kernels', vscode.TreeItemCollapsibleState.None, 'loadMore');
        moreItem.iconPath = new vscode.ThemeIcon('ellipsis');
        moreItem.command = { command: 'yaKaggle.loadMoreKernels', title: 'Load More Kernels' };
        items.push(moreItem);
      }

      return items;
    }

    return [];
  }

  private async fetchRemotePage(): Promise<void> {
    this.isLoadingRemote = true;
    try {
      const newItems = await KaggleCliService.listRemoteKernelsPage(this.currentPage, this.pageSize);
      if (newItems.length < this.pageSize) {
        this.hasMoreRemote = false;
      }
      this.remoteKernels.push(...newItems);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to fetch remote kernels: ${err.message}`);
      this.hasMoreRemote = false;
    } finally {
      this.isLoadingRemote = false;
    }
  }
}