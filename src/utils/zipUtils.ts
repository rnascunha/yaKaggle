import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ZipArchive } from "archiver";

const DEFAULT_EXCLUDES = new Set([
  "dataset-metadata.json",
  ".git",
  ".DS_Store",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  ".env",
]);

/**
 * Compresses the contents of a directory into a .zip archive, stripping the root folder.
 * Example: `my-dataset/train.csv` -> `train.csv` at the root of the archive.
 */
export async function zipFolderContents(
  sourceFolder: string,
  destZipPath: string,
  token?: vscode.CancellationToken,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token?.isCancellationRequested) {
      return reject(new vscode.CancellationError());
    }

    const output = fs.createWriteStream(destZipPath);
    const archive = new ZipArchive({
      zlib: { level: 1 },
      forceZip64: true,
    });

    let isAborted = false;
    const cancelSubscription = token?.onCancellationRequested(() => {
      isAborted = true;
      cancelSubscription?.dispose();
      archive.abort();
      output.destroy();
      try {
        if (fs.existsSync(destZipPath)) fs.unlinkSync(destZipPath);
      } catch {}
      reject(new vscode.CancellationError());
    });

    output.on("close", () => {
      cancelSubscription?.dispose();
      if (!isAborted) resolve();
    });

    output.on("error", (err) => {
      cancelSubscription?.dispose();
      reject(err);
    });

    archive.on("error", (err: unknown) => {
      cancelSubscription?.dispose();
      reject(err);
    });

    archive.pipe(output);

    // Recursively walk directory and add files with normalized relative paths
    function addDirectory(currentDir: string) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (DEFAULT_EXCLUDES.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        // Strips root folder: relPath becomes "file.csv" or "subfolder/image.png"
        const relPath = path
          .relative(sourceFolder, fullPath)
          .replace(/\\/g, "/");

        if (entry.isDirectory()) {
          addDirectory(fullPath);
        } else if (entry.isFile()) {
          archive.file(fullPath, { name: relPath });
        }
      }
    }

    try {
      addDirectory(sourceFolder);
      archive.finalize();
    } catch (err) {
      cancelSubscription?.dispose();
      archive.abort();
      output.destroy();
      reject(err);
    }
  });
}
