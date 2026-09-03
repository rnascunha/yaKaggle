import * as assert from "assert";
import { CompetitionService } from "../../services/competitionService";

suite("Unit Test: Slug Sanitization", () => {
  test("should extract slug from full standard URL", () => {
    assert.strictEqual(
      CompetitionService.extractCleanSlug(
        "https://www.kaggle.com/competitions/titanic",
      ),
      "titanic",
    );
  });

  test("should extract slug from short /c/ competition URL with subpages", () => {
    assert.strictEqual(
      CompetitionService.extractCleanSlug(
        "https://www.kaggle.com/c/titanic/data",
      ),
      "titanic",
    );
    assert.strictEqual(
      CompetitionService.extractCleanSlug(
        "https://www.kaggle.com/c/house-prices-advanced-regression-techniques/leaderboard",
      ),
      "house-prices-advanced-regression-techniques",
    );
  });

  test("should strip query strings and trailing slashes", () => {
    assert.strictEqual(
      CompetitionService.extractCleanSlug(
        "https://www.kaggle.com/competitions/spaceship-titanic/?tab=rules",
      ),
      "spaceship-titanic",
    );
  });

  test("should leave raw slugs untouched", () => {
    assert.strictEqual(
      CompetitionService.extractCleanSlug("march-machine-learning-mania-2026"),
      "march-machine-learning-mania-2026",
    );
  });

  test("should handle empty or null values gracefully", () => {
    assert.strictEqual(CompetitionService.extractCleanSlug(""), "");
    assert.strictEqual(
      CompetitionService.extractCleanSlug(undefined as any),
      "",
    );
  });
});
