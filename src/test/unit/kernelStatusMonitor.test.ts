import * as assert from "assert";
import * as vscode from "vscode";
import { KernelStatusMonitor } from "../../services/kernelStatusMonitor";

suite("Unit Test: KernelStatusMonitor State Machine", () => {
  let monitor: KernelStatusMonitor;

  suiteSetup(() => {
    const dummyContext = {
      subscriptions: [],
      globalStorageUri: vscode.Uri.file("/tmp"),
    } as any;
    monitor = new KernelStatusMonitor(dummyContext);
  });

  suiteTeardown(() => {
    monitor.dispose();
  });

  test("parseStatusString maps Kaggle CLI outputs correctly", () => {
    assert.strictEqual(
      monitor.parseStatusString("Kernel running..."),
      "running",
    );
    assert.strictEqual(
      monitor.parseStatusString("Notebook queued for execution"),
      "queued",
    );
    assert.strictEqual(
      monitor.parseStatusString("Job finished successfully (complete)"),
      "complete",
    );
    assert.strictEqual(
      monitor.parseStatusString("Execution failed with code 1"),
      "error",
    );
    assert.strictEqual(monitor.parseStatusString("unknown state"), "unknown");
  });

  test("syncKernelStatus registers running or queued kernels", () => {
    monitor.syncKernelStatus("test-user/my-running-kernel", "running");
    assert.strictEqual(monitor.isTracked("test-user/my-running-kernel"), true);

    monitor.syncKernelStatus("test-user/my-queued-kernel", "queued");
    assert.strictEqual(monitor.isTracked("test-user/my-queued-kernel"), true);
  });

  test("syncKernelStatus unregisters finished or failed kernels", () => {
    monitor.syncKernelStatus("test-user/to-finish", "running");
    assert.strictEqual(monitor.isTracked("test-user/to-finish"), true);

    monitor.syncKernelStatus("test-user/to-finish", "complete");
    assert.strictEqual(monitor.isTracked("test-user/to-finish"), false);
  });
});
