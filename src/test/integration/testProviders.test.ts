import * as assert from "assert";
import * as vscode from "vscode";
import { KernelsProvider } from "../../views/kernelsProvider";
import { DatasetsProvider } from "../../views/datasetsProvider";
import { CompetitionsProvider } from "../../views/competitionsProvider";
import { KernelStatusMonitor } from "../../services/kernelStatusMonitor";
import { CompetitionService } from "../../services/competitionService";

suite("Integration Test: Tree Data Providers", () => {
  let context: vscode.ExtensionContext;
  let monitor: KernelStatusMonitor;

  suiteSetup(() => {
    context = {
      subscriptions: [],
      globalStorageUri: vscode.Uri.file("/tmp/yakaggle-test"),
    } as any;
    monitor = new KernelStatusMonitor(context);

    // Prevent network requests during tree provider integration runs
    CompetitionService.getJoinedActiveCompetitions = async () => [];
    CompetitionService.getCompetitionsPage = async () => [];
  });

  suiteTeardown(() => {
    monitor.dispose();
  });

  test("KernelsProvider should provide top-level groups", async () => {
    const provider = new KernelsProvider(monitor);
    const roots = await provider.getChildren();

    assert.strictEqual(roots.length, 3);
    assert.ok(roots[0].label.includes("Running & Tracked"));
    assert.strictEqual(roots[1].label, "Local Workspace Kernels");
    assert.strictEqual(roots[2].label, "Remote on Kaggle");
  });

  test("DatasetsProvider should provide top-level groups", async () => {
    const provider = new DatasetsProvider();
    const roots = await provider.getChildren();

    assert.strictEqual(roots.length, 2);
    assert.strictEqual(roots[0].label, "Local Datasets");
    assert.strictEqual(roots[1].label, "My Remote Datasets");
  });

  test("CompetitionsProvider should provide initial groups matching active view", async () => {
    const provider = new CompetitionsProvider();
    const roots = await provider.getChildren();

    assert.strictEqual(roots.length, 2);
    assert.ok(
      roots[0].label.includes("My Competitions"),
      `Expected label to include 'My Competitions', got '${roots[0].label}'`,
    );
    assert.strictEqual(roots[1].label, "Recent & Featured Competitions");
  });
});
