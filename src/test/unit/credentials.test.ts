import * as assert from "assert";

suite("Unit Test: Credentials Schema Rules", () => {
  function validateSchema(data: any): boolean {
    return (
      typeof data === "object" &&
      data !== null &&
      typeof data.username === "string" &&
      data.username.trim().length > 0 &&
      typeof data.key === "string" &&
      data.key.trim().length > 0
    );
  }

  test("should validate conforming credentials", () => {
    const valid = { username: "testuser", key: "12345abcdef" };
    assert.strictEqual(validateSchema(valid), true);
  });

  test("should reject missing username or key", () => {
    assert.strictEqual(validateSchema({ username: "testuser" }), false);
    assert.strictEqual(validateSchema({ key: "12345abcdef" }), false);
    assert.strictEqual(validateSchema({ username: "", key: "abc" }), false);
  });
});
