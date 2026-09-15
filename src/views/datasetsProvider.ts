import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  WorkspaceScanner,
  LocalDatasetMetadata,
} from "../services/workspaceScanner";
import { KaggleCliService, RemoteDatasetFileItem } from "../services/kaggleCli";

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

export interface RemoteDatasetTreeNode {
  name: string;
  relativePath: string;
  parentSlug: string;
  isDirectory: boolean;
  size?: string;
  creationDate?: string;
  children: Map<string, RemoteDatasetTreeNode>;
}

export class DatasetsProvider implements vscode.TreeDataProvider<KaggleDatasetTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    KaggleDatasetTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cachedRemoteDatasets: any[] | null = null;
  private remoteTreesCache: Map<string, Map<string, RemoteDatasetTreeNode>> =
    new Map();
  private folderVisibleCount: Map<string, number> = new Map();
  private readonly filesPageSize = 15;

  refresh(): void {
    this.cachedRemoteDatasets = null;
    this.remoteTreesCache.clear();
    this.folderVisibleCount.clear();
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

    // 1. Root Local Datasets Group
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
        item.id = `local_ds_${ds.metadataPath.fsPath}`;
        item.description = ds.id;
        item.iconPath = new vscode.ThemeIcon("database");
        return item;
      });
    }

    // 1a. Inside a Local Dataset
    if (element.contextValue === "localDataset") {
      const ds = element.data as LocalDatasetMetadata;
      const rootDir = ds.folderUri.fsPath;
      const items: KaggleDatasetTreeItem[] = [];

      const metaItem = new KaggleDatasetTreeItem(
        "dataset-metadata.json",
        vscode.TreeItemCollapsibleState.None,
        "metaFile",
        ds,
      );
      metaItem.id = `local_meta_${ds.metadataPath.fsPath}`;
      metaItem.iconPath = new vscode.ThemeIcon("json");
      metaItem.command = {
        command: "yaKaggle.openDatasetMetadata",
        title: "Open Metadata JSON",
        arguments: [element],
      };
      items.push(metaItem);

      items.push(...this.getLocalDirectoryItems(rootDir, rootDir));
      return items;
    }

    // 1b. Inside a Local Subfolder
    if (element.contextValue === "localDatasetFolder") {
      const folderPath = element.data.uri.fsPath;
      const datasetRoot = element.data.datasetRoot;
      return this.getLocalDirectoryItems(folderPath, datasetRoot);
    }

    // 2. Root Remote Datasets Group
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
          item.id = `remote_ds_${fullRef}`;
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

    // 2a. Inside a Remote Dataset Root
    if (element.contextValue === "remoteDataset") {
      const slug = element.data?.ref;
      if (!slug) return [];

      if (!this.remoteTreesCache.has(slug)) {
        try {
          const files = await KaggleCliService.listDatasetFiles(slug);
          const treeRoot = this.buildRemoteFileTree(slug, files);
          this.remoteTreesCache.set(slug, treeRoot);
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to list files for ${slug}: ${err.message}`,
          );
          return [];
        }
      }

      const rootNodes = this.remoteTreesCache.get(slug);
      if (!rootNodes || rootNodes.size === 0) {
        const item = new KaggleDatasetTreeItem(
          "No files found or empty dataset",
          vscode.TreeItemCollapsibleState.None,
          "empty_file",
        );
        item.iconPath = new vscode.ThemeIcon("info");
        return [item];
      }

      // Paginate root level of this dataset
      return this.mapTreeNodesToItems(rootNodes, slug, slug);
    }

    // 2b. Inside a Remote Subfolder
    if (element.contextValue === "remoteDatasetFolder") {
      const node = element.data as RemoteDatasetTreeNode;
      if (!node || !node.children) return [];

      // Paginate subfolder using slug:relativePath as key
      const folderKey = `${node.parentSlug}:${node.relativePath}`;
      return this.mapTreeNodesToItems(
        node.children,
        folderKey,
        node.parentSlug,
      );
    }

    return [];
  }

  /**
   * Increases visible items for a dataset root or subfolder and updates view.
   */
  public incrementVisibleFiles(targetKey: string): void {
    // Matches exact folder key (slug:path) or root dataset slug
    const key = this.folderVisibleCount.has(targetKey)
      ? targetKey
      : Array.from(this.folderVisibleCount.keys()).find((k) =>
          k.startsWith(targetKey),
        ) || targetKey;

    const current = this.folderVisibleCount.get(key) || this.filesPageSize;
    this.folderVisibleCount.set(key, current + this.filesPageSize);
    this._onDidChangeTreeData.fire();
  }

  private getLocalDirectoryItems(
    dirPath: string,
    datasetRoot: string,
  ): KaggleDatasetTreeItem[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items: KaggleDatasetTreeItem[] = [];

      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true,
        });
      });

      for (const entry of entries) {
        if (entry.name === "dataset-metadata.json" && dirPath === datasetRoot) {
          continue;
        }
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const uri = vscode.Uri.file(fullPath);

        if (entry.isDirectory()) {
          const folderItem = new KaggleDatasetTreeItem(
            entry.name,
            vscode.TreeItemCollapsibleState.Collapsed,
            "localDatasetFolder",
            { uri, datasetRoot },
          );
          folderItem.id = `local_ds_folder_${fullPath}`;
          folderItem.iconPath = new vscode.ThemeIcon("folder");
          items.push(folderItem);
        } else {
          const fileItem = new KaggleDatasetTreeItem(
            entry.name,
            vscode.TreeItemCollapsibleState.None,
            "datasetFile",
            { name: entry.name, uri, exists: true },
          );
          fileItem.id = `local_ds_file_${fullPath}`;
          fileItem.iconPath = new vscode.ThemeIcon("file");
          fileItem.command = {
            command: "vscode.open",
            title: "Open File",
            arguments: [uri],
          };
          items.push(fileItem);
        }
      }
      return items;
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to read folder: ${err.message}`);
      return [];
    }
  }

  private buildRemoteFileTree(
    slug: string,
    files: RemoteDatasetFileItem[],
  ): Map<string, RemoteDatasetTreeNode> {
    const rootChildren = new Map<string, RemoteDatasetTreeNode>();

    for (const file of files) {
      const normalized = (file.name || "")
        .replace(/\\/g, "/")
        .replace(/^\//, "");
      if (!normalized) continue;
      const parts = normalized.split("/");

      let currentMap = rootChildren;
      let currentPath = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (isLast) {
          currentMap.set(part, {
            name: part,
            relativePath: currentPath,
            parentSlug: slug,
            isDirectory: false,
            size: file.size,
            creationDate: file.creationDate,
            children: new Map(),
          });
        } else {
          let dirNode = currentMap.get(part);
          if (!dirNode) {
            dirNode = {
              name: part,
              relativePath: currentPath,
              parentSlug: slug,
              isDirectory: true,
              children: new Map(),
            };
            currentMap.set(part, dirNode);
          }
          currentMap = dirNode.children;
        }
      }
    }

    return rootChildren;
  }

  private mapTreeNodesToItems(
    nodes: Map<string, RemoteDatasetTreeNode>,
    containerKey: string,
    parentSlug: string,
  ): KaggleDatasetTreeItem[] {
    const sorted = Array.from(nodes.values()).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
        numeric: true,
      });
    });

    const visibleLimit =
      this.folderVisibleCount.get(containerKey) || this.filesPageSize;
    const visibleNodes = sorted.slice(0, visibleLimit);

    const items: KaggleDatasetTreeItem[] = visibleNodes.map((node) => {
      if (node.isDirectory) {
        const item = new KaggleDatasetTreeItem(
          node.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          "remoteDatasetFolder",
          node,
        );
        item.id = `remote_folder_${node.parentSlug}_${node.relativePath}`;
        item.iconPath = new vscode.ThemeIcon("folder");
        item.tooltip = `Folder: ${node.relativePath}`;
        return item;
      } else {
        const item = new KaggleDatasetTreeItem(
          node.name,
          vscode.TreeItemCollapsibleState.None,
          "remoteDatasetFile",
          {
            name: node.relativePath,
            parentSlug: node.parentSlug,
            size: node.size,
            creationDate: node.creationDate,
          },
        );
        item.id = `remote_file_${node.parentSlug}_${node.relativePath}`;
        item.description = node.size ? `(${node.size})` : "";
        item.tooltip = `Path: ${node.relativePath}\nSize: ${node.size || "N/A"}\nDate: ${node.creationDate || "N/A"}`;
        item.iconPath = new vscode.ThemeIcon("file");
        return item;
      }
    });

    // Append pagination button if there are remaining items in this folder
    if (visibleLimit < sorted.length) {
      const remaining = sorted.length - visibleLimit;
      const moreItem = new KaggleDatasetTreeItem(
        `... Load More Files (${remaining} remaining)`,
        vscode.TreeItemCollapsibleState.None,
        "loadMoreDatasetFiles",
        { slug: parentSlug, key: containerKey },
      );
      moreItem.id = `load_more_${containerKey}`;
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
}

// import * as vscode from "vscode";
// import { WorkspaceScanner } from "../services/workspaceScanner";
// import { KaggleCliService, RemoteDatasetFileItem } from "../services/kaggleCli";
// import { LocalDatasetMetadata } from "../services/workspaceScanner";

// export class KaggleDatasetTreeItem extends vscode.TreeItem {
//   constructor(
//     public readonly label: string,
//     public readonly collapsibleState: vscode.TreeItemCollapsibleState,
//     public readonly contextValue: string,
//     public readonly data?: any,
//   ) {
//     super(label, collapsibleState);
//   }
// }

// export class DatasetsProvider implements vscode.TreeDataProvider<KaggleDatasetTreeItem> {
//   private _onDidChangeTreeData = new vscode.EventEmitter<
//     KaggleDatasetTreeItem | undefined | null | void
//   >();
//   readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

//   private cachedRemoteDatasets: any[] | null = null;
//   private remoteFilesCache: Map<string, RemoteDatasetFileItem[]> = new Map();
//   private remoteFilesVisibleCount: Map<string, number> = new Map();
//   private readonly filesPageSize = 15;

//   refresh(): void {
//     this.cachedRemoteDatasets = null;
//     this.remoteFilesCache.clear();
//     this.remoteFilesVisibleCount.clear();
//     this._onDidChangeTreeData.fire();
//   }

//   getTreeItem(element: KaggleDatasetTreeItem): vscode.TreeItem {
//     return element;
//   }

//   async getChildren(
//     element?: KaggleDatasetTreeItem,
//   ): Promise<KaggleDatasetTreeItem[]> {
//     if (!element) {
//       return [
//         new KaggleDatasetTreeItem(
//           "Local Datasets",
//           vscode.TreeItemCollapsibleState.Expanded,
//           "group_local_datasets",
//         ),
//         new KaggleDatasetTreeItem(
//           "My Remote Datasets",
//           vscode.TreeItemCollapsibleState.Collapsed,
//           "group_remote_datasets",
//         ),
//       ];
//     }

//     // 1. Local Workspace Datasets
//     if (element.contextValue === "group_local_datasets") {
//       const local = await WorkspaceScanner.findLocalDatasets();
//       if (local.length === 0) {
//         const item = new KaggleDatasetTreeItem(
//           "No local dataset-metadata.json found",
//           vscode.TreeItemCollapsibleState.None,
//           "empty",
//         );
//         item.iconPath = new vscode.ThemeIcon("info");
//         return [item];
//       }

//       return local.map((ds) => {
//         const item = new KaggleDatasetTreeItem(
//           ds.title || ds.id,
//           vscode.TreeItemCollapsibleState.Collapsed,
//           "localDataset",
//           ds,
//         );
//         item.description = ds.id;
//         item.iconPath = new vscode.ThemeIcon("database");
//         return item;
//       });
//     }

//     // 1a. Children of Local Dataset
//     if (element.contextValue === "localDataset") {
//       const ds = element.data as LocalDatasetMetadata;
//       const items: KaggleDatasetTreeItem[] = [];

//       const metaItem = new KaggleDatasetTreeItem(
//         "dataset-metadata.json",
//         vscode.TreeItemCollapsibleState.None,
//         "metaFile",
//         ds,
//       );
//       metaItem.iconPath = new vscode.ThemeIcon("json");
//       metaItem.command = {
//         command: "yaKaggle.openDatasetMetadata",
//         title: "Open Metadata JSON",
//         arguments: [element],
//       };
//       items.push(metaItem);

//       ds.files.forEach((f) => {
//         const fileItem = new KaggleDatasetTreeItem(
//           f.name,
//           vscode.TreeItemCollapsibleState.None,
//           "datasetFile",
//           f,
//         );
//         fileItem.iconPath = new vscode.ThemeIcon("file");
//         fileItem.command = {
//           command: "vscode.open",
//           title: "Open File",
//           arguments: [f.uri],
//         };
//         items.push(fileItem);
//       });

//       return items;
//     }

//     // 2. Remote Datasets Group
//     if (element.contextValue === "group_remote_datasets") {
//       try {
//         if (!this.cachedRemoteDatasets) {
//           this.cachedRemoteDatasets =
//             await KaggleCliService.listRemoteDatasets();
//         }

//         if (
//           !this.cachedRemoteDatasets ||
//           this.cachedRemoteDatasets.length === 0
//         ) {
//           const item = new KaggleDatasetTreeItem(
//             "No remote datasets found",
//             vscode.TreeItemCollapsibleState.None,
//             "empty",
//           );
//           item.iconPath = new vscode.ThemeIcon("info");
//           return [item];
//         }

//         return this.cachedRemoteDatasets.map((r: any) => {
//           const fullRef = r.ref || "";
//           const displayTitle =
//             r.title && r.title.length > 0
//               ? r.title
//               : fullRef.includes("/")
//                 ? fullRef.split("/")[1]
//                 : fullRef;

//           const item = new KaggleDatasetTreeItem(
//             displayTitle,
//             vscode.TreeItemCollapsibleState.Collapsed,
//             "remoteDataset",
//             { ...r, ref: fullRef, type: "dataset" },
//           );

//           const votes = r.votecount || r.votes || "0";
//           item.description = fullRef;
//           item.tooltip = `Dataset: ${displayTitle}\nRef: ${fullRef}\nSize: ${r.size || "N/A"}\nVotes: ${votes}`;
//           item.iconPath = new vscode.ThemeIcon("cloud");
//           return item;
//         });
//       } catch (err: any) {
//         vscode.window.showErrorMessage(
//           `Failed to fetch datasets: ${err.message}`,
//         );
//         return [];
//       }
//     }

//     // 2a. Lazy-loaded files for remote dataset
//     if (element.contextValue === "remoteDataset") {
//       const slug = element.data?.ref;
//       if (!slug) return [];

//       if (!this.remoteFilesCache.has(slug)) {
//         try {
//           const files = await KaggleCliService.listDatasetFiles(slug);
//           this.remoteFilesCache.set(slug, files);
//           this.remoteFilesVisibleCount.set(slug, this.filesPageSize);
//         } catch (err: any) {
//           vscode.window.showErrorMessage(
//             `Failed to list files for ${slug}: ${err.message}`,
//           );
//           return [];
//         }
//       }

//       const allFiles = this.remoteFilesCache.get(slug) || [];
//       const visibleCount =
//         this.remoteFilesVisibleCount.get(slug) || this.filesPageSize;

//       if (allFiles.length === 0) {
//         const item = new KaggleDatasetTreeItem(
//           "No files found or empty dataset",
//           vscode.TreeItemCollapsibleState.None,
//           "empty_file",
//         );
//         item.iconPath = new vscode.ThemeIcon("info");
//         return [item];
//       }

//       const visibleFiles = allFiles.slice(0, visibleCount);
//       const items: KaggleDatasetTreeItem[] = visibleFiles.map((f) => {
//         const isNested = f.name.includes("/") || f.name.includes("\\");

//         const fileItem = new KaggleDatasetTreeItem(
//           f.name,
//           vscode.TreeItemCollapsibleState.None,
//           "remoteDatasetFile",
//           { ...f, parentSlug: slug },
//         );

//         fileItem.description = f.size ? `(${f.size})` : "";
//         fileItem.tooltip = `Path: ${f.name}\nSize: ${f.size || "N/A"}\nDate: ${f.creationDate || "N/A"}`;
//         fileItem.iconPath = isNested
//           ? new vscode.ThemeIcon("file-submodule")
//           : new vscode.ThemeIcon("file-code");
//         return fileItem;
//       });

//       if (visibleCount < allFiles.length) {
//         const remaining = allFiles.length - visibleCount;
//         const moreItem = new KaggleDatasetTreeItem(
//           `... Load More (${remaining} remaining)`,
//           vscode.TreeItemCollapsibleState.None,
//           "loadMoreDatasetFiles",
//           { slug },
//         );
//         moreItem.iconPath = new vscode.ThemeIcon("ellipsis");
//         moreItem.command = {
//           command: "yaKaggle.loadMoreDatasetFiles",
//           title: "Load More Files",
//           arguments: [moreItem],
//         };
//         items.push(moreItem);
//       }

//       return items;
//     }

//     return [];
//   }

//   public incrementVisibleFiles(slug: string): void {
//     const current =
//       this.remoteFilesVisibleCount.get(slug) || this.filesPageSize;
//     this.remoteFilesVisibleCount.set(slug, current + this.filesPageSize);
//     this._onDidChangeTreeData.fire();
//   }
// }
