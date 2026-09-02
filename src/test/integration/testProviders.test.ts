import * as assert from "assert";
import * as vscode from "vscode";
import { KernelsProvider } from "../../views/kernelsProvider";
import { DatasetsProvider } from "../../views/datasetsProvider";
import { CompetitionsProvider } from "../../views/competitionsProvider";
import { KernelStatusMonitor } from "../../services/kernelStatusMonitor";

suite("Integration Test: Tree Data Providers", () => {
  let context: vscode.ExtensionContext;
  let monitor: KernelStatusMonitor;

  suiteSetup(() => {
    // Dummy context for status monitor registration
    context = {
      subscriptions: [],
      globalStorageUri: vscode.Uri.file("/tmp"),
    } as any;
    monitor = new KernelStatusMonitor(context);
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

  test("CompetitionsProvider should provide initial groups", async () => {
    const provider = new CompetitionsProvider();
    const roots = await provider.getChildren();

    assert.strictEqual(roots.length, 2);
    assert.ok(roots[0].label.includes("My Active Competitions"));
    assert.strictEqual(roots[1].label, "Recent & Featured Competitions");
  });
});
