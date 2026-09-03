import { spawn } from "child_process";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { parseCsv } from "../utils/csvParser";
import { KagglePathResolver } from "./kagglePathResolver";
import { CredentialsManager } from "./credentialsManager";

export class KaggleCliError extends Error {
  public code: number | null;
  constructor(
    message: string,
    code: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export interface RemoteDatasetFileItem {
  name: string;
  size: string;
  creationDate: string;
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

export class KaggleCliService {
  public static parseCsv = parseCsv;

  /**
   * Wraps an argument in shell-safe quotes if it contains spaces or quotes.
   */
  private static escapeShellArg(arg: string): string {
    if (!arg || !/[\s"']/.test(arg)) {
      return arg;
    }
    if (process.platform === "win32") {
      // Escape internal double quotes for cmd.exe
      return `"${arg.replace(/"/g, '""')}"`;
    }
    // Escape internal quotes and shell metacharacters for POSIX sh/bash
    return `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
  }

  public static async execute(
    args: string[],
    cwd?: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    if (token?.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    const kaggleBinary = await KagglePathResolver.getKaggleExecutable();
    const pathDelimiter = process.platform === "win32" ? ";" : ":";

    let envPath = process.env.PATH || "";
    if (path.isAbsolute(kaggleBinary)) {
      const binDir = path.dirname(kaggleBinary);
      envPath = `${binDir}${pathDelimiter}${envPath}`;
    }

    const kaggleConfigDir = CredentialsManager.getKaggleConfigDir();

    // Automatically escape any argument that contains spaces or metacharacters
    const sanitizedArgs = args.map((arg) => this.escapeShellArg(arg));

    return new Promise((resolve, reject) => {
      const proc = spawn(kaggleBinary, sanitizedArgs, {
        cwd:
          cwd ||
          (vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : undefined),
        shell: true,
        env: {
          ...process.env,
          PATH: envPath,
          KAGGLE_CONFIG_DIR: kaggleConfigDir,
        },
      });

      let stdout = "";
      let stderr = "";
      let wasCancelled = false;
      let cancelSubscription: vscode.Disposable | undefined;

      if (token) {
        cancelSubscription = token.onCancellationRequested(() => {
          wasCancelled = true;
          cancelSubscription?.dispose();

          try {
            if (process.platform === "win32" && proc.pid) {
              spawn("taskkill", ["/pid", proc.pid.toString(), "/T", "/F"]);
            } else {
              proc.kill("SIGTERM");
            }
          } catch {
            proc.kill();
          }

          reject(new vscode.CancellationError());
        });
      }

      proc.stdout.on("data", (data) => (stdout += data.toString()));
      proc.stderr.on("data", (data) => (stderr += data.toString()));

      proc.on("error", (err) => {
        cancelSubscription?.dispose();
        if (wasCancelled) return;
        reject(
          new KaggleCliError(`Failed to start Kaggle binary: ${err.message}`),
        );
      });

      proc.on("close", (code) => {
        cancelSubscription?.dispose();
        if (wasCancelled) return;

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
  public static async listRemoteKernels(
    userName?: string,
    token?: vscode.CancellationToken,
  ): Promise<any[]> {
    const raw = await this.execute(
      ["kernels", "list", "--mine", "--csv"],
      undefined,
      token,
    );
    return this.parseCsv(raw);
  }

  public static async listRemoteKernelsPage(
    page: number = 1,
    pageSize: number = 10,
    token?: vscode.CancellationToken,
  ): Promise<any[]> {
    const raw = await this.execute(
      [
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
      ],
      undefined,
      token,
    );
    return this.parseCsv(raw);
  }

  public static async pushKernel(
    folderPath: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return await this.execute(
      ["kernels", "push", "-p", folderPath],
      undefined,
      token,
    );
  }

  public static async getKernelStatus(
    kernelSlug: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return await this.execute(
      ["kernels", "status", kernelSlug],
      undefined,
      token,
    );
  }

  public static async getKernelOutput(
    kernelSlug: string,
    targetPath: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return await this.execute(
      ["kernels", "output", kernelSlug, "-p", targetPath],
      undefined,
      token,
    );
  }

  public static async downloadKernelArtifacts(
    kernelSlug: string,
    destinationDir: string,
    token?: vscode.CancellationToken,
  ): Promise<string[]> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    await this.execute(
      ["kernels", "output", kernelSlug, "-p", destinationDir],
      undefined,
      token,
    );
    return fs.readdirSync(destinationDir);
  }

  // --- Datasets ---
  public static async listRemoteDatasets(
    token?: vscode.CancellationToken,
  ): Promise<any[]> {
    const raw = await this.execute(
      ["datasets", "list", "--mine", "--csv"],
      undefined,
      token,
    );
    return this.parseCsv(raw);
  }

  public static async listDatasetFiles(
    datasetSlug: string,
    token?: vscode.CancellationToken,
  ): Promise<RemoteDatasetFileItem[]> {
    const raw = await this.execute(
      ["datasets", "files", datasetSlug, "--csv"],
      undefined,
      token,
    );
    const records = this.parseCsv(raw);

    return records.map((r) => {
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

  public static async pushDataset(
    folderPath: string,
    versionNotes?: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    const args = [
      "datasets",
      "version",
      "-p",
      folderPath,
      "-m",
      versionNotes || "Update dataset",
      "--dir-mode",
      "zip",
    ];
    return await this.execute(args, undefined, token);
  }

  public static async downloadDataset(
    datasetSlug: string,
    targetPath: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return await this.execute(
      ["datasets", "download", datasetSlug, "-p", targetPath, "--unzip"],
      undefined,
      token,
    );
  }

  public static async downloadDatasetArchive(
    datasetSlug: string,
    destinationDir: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }
    return await this.execute(
      ["datasets", "download", datasetSlug, "-p", destinationDir],
      undefined,
      token,
    );
  }

  public static async downloadSingleDatasetFile(
    datasetSlug: string,
    relativeFilePath: string,
    destinationDir: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    const fullLocalTarget = path.join(destinationDir, relativeFilePath);
    const localParentDir = path.dirname(fullLocalTarget);
    if (!fs.existsSync(localParentDir)) {
      fs.mkdirSync(localParentDir, { recursive: true });
    }

    return await this.execute(
      [
        "datasets",
        "download",
        datasetSlug,
        "-f",
        relativeFilePath,
        "-p",
        destinationDir,
      ],
      undefined,
      token,
    );
  }

  // --- Competitions ---
  public static async listCompetitions(
    token?: vscode.CancellationToken,
  ): Promise<any[]> {
    const raw = await this.execute(
      ["competitions", "list", "--csv"],
      undefined,
      token,
    );
    return this.parseCsv(raw);
  }

  public static async listEnteredCompetitions(
    token?: vscode.CancellationToken,
  ): Promise<any[]> {
    const raw = await this.execute(
      ["competitions", "list", "--group", "entered", "--csv"],
      undefined,
      token,
    );
    return this.parseCsv(raw);
  }

  public static async downloadCompetitionFiles(
    competitionSlug: string,
    targetPath: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return await this.execute(
      ["competitions", "download", competitionSlug, "-p", targetPath],
      undefined,
      token,
    );
  }
}

export class KernelOperationsService {
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

  public static async pullKernelContent(
    slug: string,
    tempFolder: string,
    token?: vscode.CancellationToken,
  ): Promise<{ filename: string; content: Uint8Array; isNotebook: boolean }> {
    if (!fs.existsSync(tempFolder)) {
      fs.mkdirSync(tempFolder, { recursive: true });
    }

    await KaggleCliService.execute(
      ["kernels", "pull", slug, "-p", tempFolder, "-m"],
      undefined,
      token,
    );

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

export class DatasetOperationsService {
  public static async listDatasetFiles(
    datasetSlug: string,
    token?: vscode.CancellationToken,
  ): Promise<RemoteDatasetFileItem[]> {
    return KaggleCliService.listDatasetFiles(datasetSlug, token);
  }

  public static async downloadDatasetArchive(
    datasetSlug: string,
    destinationDir: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return KaggleCliService.downloadDatasetArchive(
      datasetSlug,
      destinationDir,
      token,
    );
  }

  public static async downloadSingleDatasetFile(
    datasetSlug: string,
    fileName: string,
    destinationDir: string,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return KaggleCliService.downloadSingleDatasetFile(
      datasetSlug,
      fileName,
      destinationDir,
      token,
    );
  }

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
