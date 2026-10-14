import test from "node:test";
import assert from "node:assert/strict";
import { rankBetween } from "./radar-order.js";
test("board ranks use exact integers and preserve space at either end", () => {
  assert.equal(rankBetween(null, null), "0");
  assert.equal(rankBetween(null, "0"), "-1024");
  assert.equal(rankBetween("1024", null), "2048");
  assert.equal(rankBetween("0", "1024"), "512");
  assert.equal(rankBetween("-1024", "0"), "-512");
  assert.equal(
    rankBetween("9007199254740993", "9007199254742017"),
    "9007199254741505",
  );
});
test("board ranks require rebalance for collisions, narrow gaps and overflow", () => {
  assert.equal(rankBetween("0", "1"), null);
  assert.equal(rankBetween("0", "0"), null);
  assert.equal(rankBetween("5", "2"), null);
  assert.equal(rankBetween("9223372036854775807", null), null);
  assert.equal(rankBetween(null, "-9223372036854775808"), null);
});
