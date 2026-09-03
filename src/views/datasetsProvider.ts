import * as vscode from "vscode";
import { WorkspaceScanner } from "../services/workspaceScanner";
import { KaggleCliService, RemoteDatasetFileItem } from "../services/kaggleCli";
import { LocalDatasetMetadata } from "../services/workspaceScanner";

export class KaggleDatasetTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly data?: any,
  ) {
    super(label, collapsibleState);
  }
}

export class DatasetsProvider implements vscode.TreeDataProvider<KaggleDatasetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    KaggleDatasetTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cachedRemoteDatasets: any[] | null = null;
  private remoteFilesCache: Map<string, RemoteDatasetFileItem[]> = new Map();
  private remoteFilesVisibleCount: Map<string, number> = new Map();
  private readonly filesPageSize = 15;

  refresh(): void {
    this.cachedRemoteDatasets = null;
    this.remoteFilesCache.clear();
    this.remoteFilesVisibleCount.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KaggleDatasetTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: KaggleDatasetTreeItem,
  ): Promise<KaggleDatasetTreeItem[]> {
    if (!element) {
      return [
        new KaggleDatasetTreeItem(
          "Local Datasets",
          vscode.TreeItemCollapsibleState.Expanded,
          "group_local_datasets",
        ),
        new KaggleDatasetTreeItem(
          "My Remote Datasets",
          vscode.TreeItemCollapsibleState.Collapsed,
          "group_remote_datasets",
        ),
      ];
    }

    // 1. Local Workspace Datasets
    if (element.contextValue === "group_local_datasets") {
      const local = await WorkspaceScanner.findLocalDatasets();
      if (local.length === 0) {
        const item = new KaggleDatasetTreeItem(
          "No local dataset-metadata.json found",
          vscode.TreeItemCollapsibleState.None,
          "empty",
        );
        item.iconPath = new vscode.ThemeIcon("info");
        return [item];
      }

      return local.map((ds) => {
        const item = new KaggleDatasetTreeItem(
          ds.title || ds.id,
          vscode.TreeItemCollapsibleState.Collapsed,
          "localDataset",
          ds,
        );
        item.description = ds.id;
        item.iconPath = new vscode.ThemeIcon("database");
        return item;
      });
    }

    // 1a. Children of Local Dataset
    if (element.contextValue === "localDataset") {
      const ds = element.data as LocalDatasetMetadata;
      const items: KaggleDatasetTreeItem[] = [];

      const metaItem = new KaggleDatasetTreeItem(
        "dataset-metadata.json",
        vscode.TreeItemCollapsibleState.None,
        "metaFile",
        ds,
      );
      metaItem.iconPath = new vscode.ThemeIcon("json");
      metaItem.command = {
        command: "yaKaggle.openDatasetMetadata",
        title: "Open Metadata JSON",
        arguments: [element],
      };
      items.push(metaItem);

      ds.files.forEach((f) => {
        const fileItem = new KaggleDatasetTreeItem(
          f.name,
          vscode.TreeItemCollapsibleState.None,
          "datasetFile",
          f,
        );
        fileItem.iconPath = new vscode.ThemeIcon("file");
        fileItem.command = {
          command: "vscode.open",
          title: "Open File",
          arguments: [f.uri],
        };
        items.push(fileItem);
      });

      return items;
    }

    // 2. Remote Datasets Group
    if (element.contextValue === "group_remote_datasets") {
      try {
        if (!this.cachedRemoteDatasets) {
          this.cachedRemoteDatasets =
            await KaggleCliService.listRemoteDatasets();
        }

        if (
          !this.cachedRemoteDatasets ||
          this.cachedRemoteDatasets.length === 0
        ) {
          const item = new KaggleDatasetTreeItem(
            "No remote datasets found",
            vscode.TreeItemCollapsibleState.None,
            "empty",
          );
          item.iconPath = new vscode.ThemeIcon("info");
          return [item];
        }

        return this.cachedRemoteDatasets.map((r: any) => {
          const fullRef = r.ref || "";
          const displayTitle =
            r.title && r.title.length > 0
              ? r.title
              : fullRef.includes("/")
                ? fullRef.split("/")[1]
                : fullRef;

          const item = new KaggleDatasetTreeItem(
            displayTitle,
            vscode.TreeItemCollapsibleState.Collapsed,
            "remoteDataset",
            { ...r, ref: fullRef, type: "dataset" },
          );

          const votes = r.votecount || r.votes || "0";
          item.description = fullRef;
          item.tooltip = `Dataset: ${displayTitle}\nRef: ${fullRef}\nSize: ${r.size || "N/A"}\nVotes: ${votes}`;
          item.iconPath = new vscode.ThemeIcon("cloud");
          return item;
        });
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Failed to fetch datasets: ${err.message}`,
        );
        return [];
      }
    }

    // 2a. Lazy-loaded files for remote dataset
    if (element.contextValue === "remoteDataset") {
      const slug = element.data?.ref;
      if (!slug) return [];

      if (!this.remoteFilesCache.has(slug)) {
        try {
          const files = await KaggleCliService.listDatasetFiles(slug);
          this.remoteFilesCache.set(slug, files);
          this.remoteFilesVisibleCount.set(slug, this.filesPageSize);
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to list files for ${slug}: ${err.message}`,
          );
          return [];
        }
      }

      const allFiles = this.remoteFilesCache.get(slug) || [];
      const visibleCount =
        this.remoteFilesVisibleCount.get(slug) || this.filesPageSize;

      if (allFiles.length === 0) {
        const item = new KaggleDatasetTreeItem(
          "No files found or empty dataset",
          vscode.TreeItemCollapsibleState.None,
          "empty_file",
        );
        item.iconPath = new vscode.ThemeIcon("info");
        return [item];
      }

      const visibleFiles = allFiles.slice(0, visibleCount);
      const items: KaggleDatasetTreeItem[] = visibleFiles.map((f) => {
        const isNested = f.name.includes("/") || f.name.includes("\\");

        const fileItem = new KaggleDatasetTreeItem(
          f.name,
          vscode.TreeItemCollapsibleState.None,
          "remoteDatasetFile",
          { ...f, parentSlug: slug },
        );

        fileItem.description = f.size ? `(${f.size})` : "";
        fileItem.tooltip = `Path: ${f.name}\nSize: ${f.size || "N/A"}\nDate: ${f.creationDate || "N/A"}`;
        fileItem.iconPath = isNested
          ? new vscode.ThemeIcon("file-submodule")
          : new vscode.ThemeIcon("file-code");
        return fileItem;
      });

      if (visibleCount < allFiles.length) {
        const remaining = allFiles.length - visibleCount;
        const moreItem = new KaggleDatasetTreeItem(
          `... Load More (${remaining} remaining)`,
          vscode.TreeItemCollapsibleState.None,
          "loadMoreDatasetFiles",
          { slug },
        );
        moreItem.iconPath = new vscode.ThemeIcon("ellipsis");
        moreItem.command = {
          command: "yaKaggle.loadMoreDatasetFiles",
          title: "Load More Files",
          arguments: [moreItem],
        };
        items.push(moreItem);
      }

      return items;
    }

    return [];
  }

  public incrementVisibleFiles(slug: string): void {
    const current =
      this.remoteFilesVisibleCount.get(slug) || this.filesPageSize;
    this.remoteFilesVisibleCount.set(slug, current + this.filesPageSize);
    this._onDidChangeTreeData.fire();
  }
}
