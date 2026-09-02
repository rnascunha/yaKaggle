import * as path from "path";
import { runTests } from "@vscode/test-electron";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to module that initializes mocha and runs test files
    const extensionTestsPath = path.resolve(__dirname, "./index");

    // Launch headless test runner
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--disable-extensions", "--disable-gpu"],
    });
  } catch (err) {
    console.error("Failed to run VS Code integration tests", err);
    process.exit(1);
  }
}

main();
