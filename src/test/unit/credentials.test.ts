import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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

  test("should load and parse modern plain access_token", async () => {
    await CredentialsManager.saveCredentials("fake-api-token-12345");
    const status = CredentialsManager.inspectCredentials();

    assert.strictEqual(status.exists, true);
    assert.strictEqual(status.format, "access_token");
    assert.strictEqual(status.isValidJson, true);
  });

  test("should decode username when access_token is a JWT", async () => {
    const payload = Buffer.from(
      JSON.stringify({ username: "rnascunha" }),
    ).toString("base64url");
    const jwtToken = `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;

    await CredentialsManager.saveCredentials(jwtToken);
    const status = CredentialsManager.inspectCredentials();

    assert.strictEqual(status.exists, true);
    assert.strictEqual(status.username, "rnascunha");
  });

  test("should fall back to legacy kaggle.json when access_token is absent", async () => {
    await CredentialsManager.saveCredentials({
      username: "legacyUser",
      key: "secretKey",
    });
    const status = CredentialsManager.inspectCredentials();

    assert.strictEqual(status.exists, true);
    assert.strictEqual(status.format, "kaggle.json");
    assert.strictEqual(status.username, "legacyUser");
  });

  test("should report invalid JSON when kaggle.json is corrupted", () => {
    fs.writeFileSync(path.join(tempDir, "kaggle.json"), "{ invalid json ");
    const status = CredentialsManager.inspectCredentials();

    assert.strictEqual(status.exists, true);
    assert.strictEqual(status.isValidJson, false);
    assert.ok(status.error?.includes("JSON parsing failed"));
  });
});
