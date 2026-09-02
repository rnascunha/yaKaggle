import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface LocalKernelMetadata {
  id: string;
  code_file: string;
  language: string;
  kernel_type: string;
  metadataPath: vscode.Uri;
  codeFileExists: boolean;
  codeFilePath: vscode.Uri;
}

export interface LocalDatasetMetadata {
  id: string;
  title: string;
  metadataPath: vscode.Uri;
  files: { name: string; uri: vscode.Uri; exists: boolean }[];
}

export class WorkspaceScanner {
  public static async findLocalKernels(): Promise<LocalKernelMetadata[]> {
    const metaFiles = await vscode.workspace.findFiles('**/kernel-metadata.json', '**/node_modules/**');
    const kernels: LocalKernelMetadata[] = [];

    for (const uri of metaFiles) {
      try {
        const raw = await vscode.workspace.fs.readFile(uri);
        const meta = JSON.parse(new TextDecoder().decode(raw));
        const dir = path.dirname(uri.fsPath);
        const codeFilePath = path.join(dir, meta.code_file || '');
        const exists = fs.existsSync(codeFilePath);

        kernels.push({
          id: meta.id || path.basename(dir),
          code_file: meta.code_file || 'Unspecified file',
          language: meta.language || 'python',
          kernel_type: meta.kernel_type || 'notebook',
          metadataPath: uri,
          codeFileExists: exists,
          codeFilePath: vscode.Uri.file(codeFilePath)
        });
      } catch (err) {
        console.error(`Error reading ${uri.fsPath}:`, err);
      }
    }
    return kernels;
  }

  public static async findLocalDatasets(): Promise<LocalDatasetMetadata[]> {
    const metaFiles = await vscode.workspace.findFiles('**/dataset-metadata.json', '**/node_modules/**');
    const datasets: LocalDatasetMetadata[] = [];

    for (const uri of metaFiles) {
      try {
        const raw = await vscode.workspace.fs.readFile(uri);
        const meta = JSON.parse(new TextDecoder().decode(raw));
        const dir = path.dirname(uri.fsPath);

        const dirEntries = fs.readdirSync(dir, { withFileTypes: true });
        const dataFiles = dirEntries
          .filter((d) => !d.isDirectory() && d.name !== 'dataset-metadata.json')
          .map((d) => ({
            name: d.name,
            uri: vscode.Uri.file(path.join(dir, d.name)),
            exists: true
          }));

        datasets.push({
          id: meta.id || path.basename(dir),
          title: meta.title || meta.id || 'Untitled Dataset',
          metadataPath: uri,
          files: dataFiles
        });
      } catch (err) {
        console.error(`Error reading dataset metadata at ${uri.fsPath}:`, err);
      }
    }
    return datasets;
  }
}