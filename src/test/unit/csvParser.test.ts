import * as assert from "assert";
import { parseCsv } from "../../utils/csvParser";

suite("Unit Test: KaggleCli CSV Parser", () => {
  test("should parse standard CSV columns correctly", () => {
    const csv = `ref,title,size\nusername/my-dataset,"My Dataset, Cleaned",12MB`;
    const records = parseCsv(csv);

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].ref, "username/my-dataset");
    assert.strictEqual(records[0].title, "My Dataset, Cleaned");
    assert.strictEqual(records[0].size, "12MB");
  });

  test("should handle escaped quotes inside fields", () => {
    const csv = `id,title\n1,"A title with ""quoted"" words"`;
    const records = parseCsv(csv);

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].title, 'A title with "quoted" words');
  });

  test("should strip ANSI escape sequences and leading warnings", () => {
    const csv = `\x1B[33mWarning: token expiration approaching\x1B[0m\nref,title\nuser/slug,Title`;
    const records = parseCsv(csv);

    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].ref, "user/slug");
    assert.strictEqual(records[0].title, "Title");
  });

  test("should return empty array on empty input", () => {
    const records = parseCsv("");
    assert.deepStrictEqual(records, []);
  });
});
