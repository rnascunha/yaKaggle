import * as path from "path";
import * as Mocha from "mocha";
import * as fs from "fs";

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: 10000,
  });

  const testsRoot = path.resolve(__dirname, ".");

  return new Promise((resolve, reject) => {
    function findTestFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.resolve(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(findTestFiles(fullPath));
        } else if (file.endsWith(".test.js")) {
          results.push(fullPath);
        }
      }
      return results;
    }

    try {
      const files = findTestFiles(testsRoot);
      files.forEach((f) => mocha.addFile(f));

      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
