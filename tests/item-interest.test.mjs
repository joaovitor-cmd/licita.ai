import test from "node:test";
import assert from "node:assert/strict";
import {
  createItemInterestMatcher,
  foldItemText,
  itemProfileTerms,
} from "../apps/web/src/item-interest.ts";
test("item interests normalize accents, match whole words and prioritize exclusions", () => {
  const match = createItemInterestMatcher(
    ["impressão", "papel A4"],
    ["offset"],
  );
  assert.equal(match("IMPRESSÃO monocromática").interested, true);
  assert.deepEqual(match("Papel branco tamanho A4").matched, ["papel A4"]);
  assert.equal(match("impressão offset").excluded, true);
  assert.equal(match("impressão offset").interested, false);
  assert.equal(match("reimpressão").interested, false);
  assert.equal(
    createItemInterestMatcher([], [])("impressão").interested,
    false,
  );
  assert.equal(
    createItemInterestMatcher(["de da"], [])("de da").interested,
    false,
  );
  assert.equal(foldItemText("Órgão / A4"), "orgao a4");
  assert.deepEqual(itemProfileTerms(" impressão, , papel "), [
    "impressão",
    "papel",
  ]);
});
