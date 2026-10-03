import test from "node:test";
import assert from "node:assert/strict";
import { translatedCopy } from "../../src/brand/localization";
test("missing customer translations are visible rather than silently falling back", () => {
  assert.equal(
    translatedCopy("Add AED 66 more to continue.", "ar"),
    "الترجمة قيد الإعداد",
  );
  assert.equal(
    translatedCopy("Pistachio · Individual", "en"),
    "Pistachio · Individual",
  );
});
test("translation templates reorder values without altering amount or accepting missing placeholders", () => {
  // Synthetic translation fixture, not business-approved Arabic copy.
  const source = "Minimum AED 100 in JVC.";
  const key = "Minimum AED {0} in {1}.";
  assert.equal(
    translatedCopy(source, "ar", {
      [key]: { english: key, arabic: "{1}: AED {0}." },
    }),
    "JVC: AED 100.",
  );
  assert.equal(
    translatedCopy(source, "ar", {
      [key]: { english: key, arabic: "AED {0}." },
    }),
    source,
  );
  assert.equal(
    translatedCopy(source, "ar", {
      [key]: { english: key, arabic: "{2}: AED {0}." },
    }),
    source,
  );
});
