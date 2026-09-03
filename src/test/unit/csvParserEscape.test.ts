import * as assert from "assert";
import { KaggleCliService } from "../../services/kaggleCli";

suite("Unit Test: CLI Shell Argument Escaping", () => {
  const escapeArg = (KaggleCliService as any).escapeShellArg.bind(
    KaggleCliService,
  );

  test("should leave single-word arguments untouched", () => {
    assert.strictEqual(escapeArg("competitions"), "competitions");
    assert.strictEqual(escapeArg("titanic"), "titanic");
  });

  test("should safely quote messages containing spaces", () => {
    const escaped = escapeArg("Updated using yaKaggle");
    assert.ok(escaped.startsWith('"') && escaped.endsWith('"'));
    assert.ok(escaped.includes("Updated using yaKaggle"));
  });

  test("should escape internal quotes inside strings", () => {
    const escaped = escapeArg('Fixes "NaN" issue');
    assert.ok(escaped.startsWith('"') && escaped.endsWith('"'));
    if (process.platform === "win32") {
      assert.ok(escaped.includes('""NaN""'));
    } else {
      assert.ok(escaped.includes('\\"NaN\\"'));
    }
  });
});
