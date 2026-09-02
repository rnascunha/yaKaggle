import * as assert from "assert";
import { parseKaggleDeadline } from "../../utils/dateUtils";

suite("Unit Test: Deadline Parser", () => {
  test("should mark dates in the past as expired", () => {
    const pastDate = "2020-01-01T00:00:00";
    const result = parseKaggleDeadline(pastDate);

    assert.strictEqual(result.isExpired, true);
    assert.strictEqual(result.urgency, "expired");
    assert.strictEqual(result.formattedText, "Closed");
  });

  test("should mark dates within 2 days as critical", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = parseKaggleDeadline(tomorrow.toISOString());
    assert.strictEqual(result.isExpired, false);
    assert.strictEqual(result.urgency, "critical");
  });

  test("should handle empty or null input gracefully", () => {
    const result = parseKaggleDeadline(null);
    assert.strictEqual(result.isExpired, false);
    assert.strictEqual(result.formattedText, "Ongoing / No date");
  });
});
