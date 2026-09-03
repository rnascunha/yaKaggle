import { spawn } from "child_process";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { parseCsv } from "../utils/csvParser";

import { KagglePathResolver } from "./kagglePathResolver";

// export interface CliResult {
//   stdout: string;
//   stderr: string;
//   code: number;
// }

export class KaggleCliError extends Error {
  public code: number | null;
  constructor(
    message: string,
    code: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;

    // 3. Maintain clean stack traces (V8 environments like Node.js and Chrome)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class KaggleCliService {
  public static parseCsv = parseCsv;

  public static async execute(args: string[], cwd?: string): Promise<string> {
    const kaggleBinary = await KagglePathResolver.getKaggleExecutable();
    const binDir = path.dirname(kaggleBinary);
    const pathDelimiter = process.platform === "win32" ? ";" : ":";
    const envPath = `${binDir}${pathDelimiter}${process.env.PATH || ""}`;

    return new Promise((resolve, reject) => {
      const proc = spawn(kaggleBinary, args, {
        cwd:
          cwd ||
          (vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined),
        shell: true,
        env: {
          ...process.env,
          PATH: envPath,
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => (stdout += data.toString()));
      proc.stderr.on("data", (data) => (stderr += data.toString()));

      proc.on("error", (err) => {
        reject(
          new KaggleCliError(`Failed to start Kaggle binary: ${err.message}`),
        );
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          const errMsg =
            stderr.trim() ||
            stdout.trim() ||
            `Command exited with code ${code}`;
          reject(new KaggleCliError(errMsg, code));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  // --- Kernels ---
  public static async listRemoteKernels(userName?: string): Promise<any[]> {
    const raw = await this.execute(["kernels", "list", "--mine", "--csv"]);
    return this.parseCsv(raw);
  }

  public static async pushKernel(folderPath: string): Promise<string> {
    return await this.execute(["kernels", "push", "-p", `"${folderPath}"`]);
  }

  public static async getKernelStatus(kernelSlug: string): Promise<string> {
    return await this.execute(["kernels", "status", kernelSlug]);
  }

  public static async getKernelOutput(
    kernelSlug: string,
    targetPath: string,
  ): Promise<string> {
    return await this.execute([
      "kernels",
      "output",
      kernelSlug,
      "-p",
      `"${targetPath}"`,
    ]);
  }

  // --- Datasets ---
  public static async listRemoteDatasets(): Promise<any[]> {
    const raw = await this.execute(["datasets", "list", "--mine", "--csv"]);
    return this.parseCsv(raw);
  }

  public static async pushDataset(
    folderPath: string,
    versionNotes?: string,
  ): Promise<string> {
    const args = [
      "datasets",
      "version",
      "-p",
      `"${folderPath}"`,
      "-m",
      `"${versionNotes || "Update dataset"}"`,
      "--dir-mode",
      "zip"
    ];
    return await this.execute(args);
  }

  // --- Competitions ---
  public static async listCompetitions(): Promise<any[]> {
    const raw = await this.execute(["competitions", "list", "--csv"]);
    return this.parseCsv(raw);
  }

  // Add these methods inside KaggleCliService class

  public static async listEnteredCompetitions(): Promise<any[]> {
    // kaggle competitions list --group entered -v
    const raw = await this.execute([
      "competitions",
      "list",
      "--group",
      "entered",
      "--csv",
    ]);
    return this.parseCsv(raw);
  }

  public static async downloadDataset(
    datasetSlug: string,
    targetPath: string,
  ): Promise<string> {
    return await this.execute([
      "datasets",
      "download",
      datasetSlug,
      "-p",
      `"${targetPath}"`,
      "--unzip",
    ]);
  }

  public static async downloadCompetitionFiles(
    competitionSlug: string,
    targetPath: string,
  ): Promise<string> {
    return await this.execute([
      "competitions",
      "download",
      competitionSlug,
      "-p",
      `"${targetPath}"`,
    ]);
  }

  // public static parseCsv(csvString: string): Record<string, string>[] {
  //   if (!csvString || !csvString.trim()) return [];

  //   // 1. Remove ANSI escape codes and strip BOM if present
  //   let clean = csvString
  //     .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
  //     .replace(/^\uFEFF/, "")
  //     .trim();

  //   // 2. Locate the true CSV header line (ignore leading python/cli warnings or logs)
  //   const rawLines = clean.split(/\r?\n/);
  //   const headerLineIndex = rawLines.findIndex((line) => {
  //     const l = line.toLowerCase();
  //     return (
  //       l.includes(",") &&
  //       (l.includes("teamid") ||
  //         l.includes("teamname") ||
  //         l.includes("ref") ||
  //         l.includes("title") ||
  //         l.includes("name") ||
  //         l.includes("id"))
  //     );
  //   });

  //   if (headerLineIndex === -1) {
  //     // Fallback: parse rawLines from line 0
  //     clean = rawLines.join("\n");
  //   } else {
  //     clean = rawLines.slice(headerLineIndex).join("\n");
  //   }

  //   // 3. RFC-4180 State Machine Tokenizer
  //   const records: string[][] = [];
  //   let row: string[] = [];
  //   let field = "";
  //   let inQuotes = false;

  //   for (let i = 0; i < clean.length; i++) {
  //     const c = clean[i];

  //     if (inQuotes) {
  //       if (c === '"') {
  //         if (i + 1 < clean.length && clean[i + 1] === '"') {
  //           field += '"';
  //           i++; // Escaped quote ("")
  //         } else {
  //           inQuotes = false;
  //         }
  //       } else {
  //         field += c;
  //       }
  //     } else {
  //       if (c === '"') {
  //         inQuotes = true;
  //       } else if (c === ",") {
  //         row.push(field.trim());
  //         field = "";
  //       } else if (c === "\n" || c === "\r") {
  //         if (c === "\r" && i + 1 < clean.length && clean[i + 1] === "\n") {
  //           i++; // Handle CRLF without dropping row buffer
  //         }
  //         row.push(field.trim());
  //         if (row.some((val) => val.length > 0)) {
  //           records.push(row);
  //         }
  //         row = [];
  //         field = "";
  //       } else {
  //         field += c;
  //       }
  //     }
  //   }

  //   // Flush remaining trailing field
  //   if (field.length > 0 || row.length > 0) {
  //     row.push(field.trim());
  //     if (row.some((val) => val.length > 0)) {
  //       records.push(row);
  //     }
  //   }

  //   if (records.length < 2) return [];

  //   // 4. Normalize Header Keys
  //   const rawHeaders = records[0];
  //   const headers = rawHeaders.map((h) =>
  //     h.toLowerCase().replace(/[^a-z0-9]/g, ""),
  //   );

  //   return records.slice(1).map((r) => {
  //     const entry: Record<string, string> = {};
  //     headers.forEach((h, idx) => {
  //       let val = r[idx] ?? "";
  //       // Strip wrapping quotes if any remained
  //       if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
  //         val = val.substring(1, val.length - 1);
  //       }
  //       entry[h] = val;
  //     });
  //     return entry;
  //   });
  // }

  public static async listDatasetFiles(
    datasetSlug: string,
  ): Promise<RemoteDatasetFileItem[]> {
    const raw = await this.execute(["datasets", "files", datasetSlug, "--csv"]);
    const records = this.parseCsv(raw);

    return records.map((r) => {
      // Handles name, filename, file, or path column keys
      const fileName =
        r.name || r.filename || r.file || Object.values(r)[0] || "file";
      const size = r.size || r.totalbytes || "";
      const creationDate = r.creationdate || r.date || "";

      return {
        name: fileName,
        size,
        creationDate,
      };
    });
  }

  public static async listRemoteKernelsPage(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<any[]> {
    const raw = await this.execute([
      "kernels",
      "list",
      "--mine",
      "--sort-by",
      "dateRun",
      "--page",
      page.toString(),
      "--page-size",
      pageSize.toString(),
      "--csv",
    ]);
    return this.parseCsv(raw);
  }

  public static async downloadDatasetArchive(
    datasetSlug: string,
    destinationDir: string,
  ): Promise<string> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    return await this.execute([
      "datasets",
      "download",
      datasetSlug,
      "-p",
      `"${destinationDir}"`,
    ]);
  }

  public static async downloadSingleDatasetFile(
    datasetSlug: string,
    relativeFilePath: string,
    destinationDir: string,
  ): Promise<string> {
    // Ensure nested parent directories exist locally if file has a path (e.g. "train/images/1.png")
    const fullLocalTarget = path.join(destinationDir, relativeFilePath);
    const localParentDir = path.dirname(fullLocalTarget);
    if (!fs.existsSync(localParentDir)) {
      fs.mkdirSync(localParentDir, { recursive: true });
    }

    // Kaggle CLI accepts the internal relative path in -f
    return await this.execute([
      "datasets",
      "download",
      datasetSlug,
      "-f",
      `"${relativeFilePath}"`,
      "-p",
      `"${destinationDir}"`,
    ]);
  }

  public static async downloadKernelArtifacts(
    kernelSlug: string,
    destinationDir: string,
  ): Promise<string[]> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    // Pulls output artifacts (logs, models, CSVs, charts)
    await this.execute([
      "kernels",
      "output",
      kernelSlug,
      "-p",
      `"${destinationDir}"`,
    ]);

    return fs.readdirSync(destinationDir);
  }
}

export interface KernelMetadataSchema {
  id: string;
  title: string;
  code_file: string;
  language: "python" | "r" | "rmarkdown";
  kernel_type: "script" | "notebook";
  is_private: boolean;
  enable_gpu: boolean;
  enable_tpu: boolean;
  enable_internet: boolean;
  dataset_sources: string[];
  competition_sources: string[];
  kernel_sources: string[];
}

export class KernelOperationsService {
  /**
   * Initializes or writes a kernel-metadata.json file directly into the target directory.
   */
  public static async initKernelMetadata(
    folderUri: vscode.Uri,
    initialData: Partial<KernelMetadataSchema>,
  ): Promise<vscode.Uri> {
    const metaPath = path.join(folderUri.fsPath, "kernel-metadata.json");

    const defaultData: KernelMetadataSchema = {
      id: initialData.id || "username/kernel-slug",
      title: initialData.title || "Kernel Title",
      code_file: initialData.code_file || "notebook.ipynb",
      language: initialData.language || "python",
      kernel_type: initialData.kernel_type || "notebook",
      is_private: initialData.is_private ?? true,
      enable_gpu: initialData.enable_gpu ?? false,
      enable_tpu: initialData.enable_tpu ?? false,
      enable_internet: initialData.enable_internet ?? true,
      dataset_sources: initialData.dataset_sources || [],
      competition_sources: initialData.competition_sources || [],
      kernel_sources: initialData.kernel_sources || [],
    };

    fs.writeFileSync(metaPath, JSON.stringify(defaultData, null, 2), "utf8");
    return vscode.Uri.file(metaPath);
  }

  /**
   * Pulls remote notebook/script to a temp directory and returns the file buffer + filename.
   */
  public static async pullKernelContent(
    slug: string,
    tempFolder: string,
  ): Promise<{ filename: string; content: Uint8Array; isNotebook: boolean }> {
    if (!fs.existsSync(tempFolder)) {
      fs.mkdirSync(tempFolder, { recursive: true });
    }

    // `kaggle kernels pull <slug> -p <path> -m` pulls both code and metadata
    await KaggleCliService.execute([
      "kernels",
      "pull",
      slug,
      "-p",
      `"${tempFolder}"`,
      "-m",
    ]);

    const files = fs.readdirSync(tempFolder);
    const codeFileName = files.find((f) => f !== "kernel-metadata.json");

    if (!codeFileName) {
      throw new Error("No script or notebook found in the pulled kernel.");
    }

    const fullPath = path.join(tempFolder, codeFileName);
    const content = fs.readFileSync(fullPath);
    const isNotebook = codeFileName.endsWith(".ipynb");

    return {
      filename: codeFileName,
      content,
      isNotebook,
    };
  }
}

// Add to src/services/kaggleCli.ts

export interface RemoteDatasetFileItem {
  name: string;
  size: string;
  creationDate: string;
}

export class DatasetOperationsService {
  /**
   * Lists remote dataset files using the CLI.
   */
  public static async listDatasetFiles(
    datasetSlug: string,
  ): Promise<RemoteDatasetFileItem[]> {
    const raw = await KaggleCliService.execute([
      "datasets",
      "files",
      datasetSlug,
      "--csv",
    ]);
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const entry: Record<string, string> = {};
      headers.forEach((h, idx) => {
        entry[h] = values[idx] ? values[idx].replace(/^"|"$/g, "") : "";
      });
      return {
        name: entry.name || entry.file || "unknown_file",
        size: entry.size || entry.totalBytes || "",
        creationDate: entry.creationDate || "",
      };
    });
  }

  /**
   * Downloads the complete dataset as a .zip file WITHOUT extracting.
   */
  public static async downloadDatasetArchive(
    datasetSlug: string,
    destinationDir: string,
  ): Promise<string> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    // Omit '--unzip' so Kaggle CLI retains the downloaded .zip intact
    return await KaggleCliService.execute([
      "datasets",
      "download",
      datasetSlug,
      "-p",
      `"${destinationDir}"`,
    ]);
  }

  /**
   * Downloads a single specific file from a remote dataset.
   */
  public static async downloadSingleDatasetFile(
    datasetSlug: string,
    fileName: string,
    destinationDir: string,
  ): Promise<string> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    return await KaggleCliService.execute([
      "datasets",
      "download",
      datasetSlug,
      "-f",
      `"${fileName}"`,
      "-p",
      `"${destinationDir}"`,
    ]);
  }

  /**
   * Creates the folder and template dataset-metadata.json file.
   */
  public static async createDatasetTemplate(
    targetFolder: string,
    title: string,
    slug: string,
  ): Promise<vscode.Uri> {
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const metaPath = path.join(targetFolder, "dataset-metadata.json");
    const template = {
      title,
      id: slug,
      subtitle: "A clear and concise summary of the data",
      description:
        "### Context\nExplain the context here.\n\n### Content\nDescribe the files and features.\n",
      isPrivate: true,
      licenses: [{ name: "CC0-1.0" }],
      keywords: [],
    };

    fs.writeFileSync(metaPath, JSON.stringify(template, null, 2), "utf8");
    return vscode.Uri.file(metaPath);
  }
}
