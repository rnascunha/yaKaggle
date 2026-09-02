import * as assert from "assert";
import { WorkspaceScanner } from "../../services/workspaceScanner";

suite("Integration Test: WorkspaceScanner", () => {
  test("findLocalKernels should return an array without throwing", async () => {
    const kernels = await WorkspaceScanner.findLocalKernels();
    assert.ok(Array.isArray(kernels));
  });

  test("findLocalDatasets should return an array without throwing", async () => {
    const datasets = await WorkspaceScanner.findLocalDatasets();
    assert.ok(Array.isArray(datasets));
  });
});
