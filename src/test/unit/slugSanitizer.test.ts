import * as assert from "assert";
import { CompetitionService } from "../../services/competitionService";

suite("Unit Test: Slug Sanitization", () => {
  test("should extract slug from full Kaggle URL", () => {
    const url = "https://www.kaggle.com/competitions/titanic";
    assert.strictEqual(CompetitionService.extractCleanSlug(url), "titanic");
  });

  test("should extract slug with trailing slash", () => {
    const url = "https://www.kaggle.com/competitions/titanic/";
    assert.strictEqual(CompetitionService.extractCleanSlug(url), "titanic");
  });

  test("should leave standalone slug untouched", () => {
    assert.strictEqual(
      CompetitionService.extractCleanSlug("spaceship-titanic"),
      "spaceship-titanic",
    );
  });

  test("should extract from subpath ref", () => {
    assert.strictEqual(
      CompetitionService.extractCleanSlug("c/house-prices"),
      "house-prices",
    );
  });
});
