import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import { CredentialsManager } from "../../services/credentialsManager";

suite("Unit Test: CredentialsManager Operations", () => {
  const tempDir = path.join(os.tmpdir(), `yakaggle-creds-test-${Date.now()}`);

  suiteSetup(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    // Direct configuration dir to temporary test sandbox
    CredentialsManager.getKaggleConfigDir = () => tempDir;
  });

  suiteTeardown(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  setup(() => {
    const accessPath = path.join(tempDir, "access_token");
    const legacyPath = path.join(tempDir, "kaggle.json");
    if (fs.existsSync(accessPath)) fs.unlinkSync(accessPath);
    if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
  });

  test("should detect when no credentials exist", () => {
    const status = CredentialsManager.inspectCredentials();
    assert.strictEqual(status.exists, false);
    assert.strictEqual(status.isValidJson, false);
  });

  test("should load plain access_token without requiring username", async () => {
    await CredentialsManager.saveCredentials("fake-api-token-12345");
    const status = CredentialsManager.inspectCredentials();

    assert.strictEqual(status.exists, true);
    assert.strictEqual(status.format, "access_token");
    assert.strictEqual(status.isValidJson, true);
  });

  test("should fallback to default 'username' when access_token is set without username config", async () => {
    await CredentialsManager.saveCredentials("fake-api-token-12345");
    const resolvedUser = CredentialsManager.getUsername();

    assert.strictEqual(resolvedUser, "username");
  });

  test("should resolve username from legacy kaggle.json when present", async () => {
    await CredentialsManager.saveCredentials({
      username: "legacyUser",
      key: "secretKey",
    });
    const status = CredentialsManager.inspectCredentials();
    const resolvedUser = CredentialsManager.getUsername();

    assert.strictEqual(status.exists, true);
    assert.strictEqual(status.format, "kaggle.json");
    assert.strictEqual(status.username, "legacyUser");
    assert.strictEqual(resolvedUser, "legacyUser");
  });

  test("should report invalid JSON when kaggle.json is corrupted", () => {
    fs.writeFileSync(path.join(tempDir, "kaggle.json"), "{ invalid json ");
    const status = CredentialsManager.inspectCredentials();

    assert.strictEqual(status.exists, true);
    assert.strictEqual(status.isValidJson, false);
    assert.ok(status.error?.includes("JSON parsing failed"));
  });
});
