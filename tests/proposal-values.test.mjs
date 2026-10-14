import test from "node:test";
import assert from "node:assert/strict";
import {
  decimalInput,
  decimalDisplay,
  moneyExact,
  commercialTotals,
} from "../apps/web/src/proposal-values.ts";
import { proposalTotals } from "../apps/api/src/proposal-rules.ts";

test("commercial input distinguishes absence and zero and refuses ambiguous thousands", () => {
  assert.equal(decimalInput(""), null);
  assert.equal(decimalInput(" 0,0000 "), "0");
  assert.equal(decimalInput("00012,0750"), "12.075");
  assert.equal(decimalDisplay("12.075"), "12,075");
  for (const value of [
    "1.000,00",
    "1,000.00",
    "-1",
    "1e3",
    "1.12345",
    "10000000000000",
    "1 000",
  ])
    assert.throws(() => decimalInput(value));
});
test("frontend preview matches authoritative exact commercial rounding including large values", () => {
  const items = [
    { id: "a", quantity: "10", unitPrice: "0.075" },
    { id: "b", quantity: "1", unitPrice: "0.005" },
    {
      id: "c",
      quantity: "9999999999999.9999",
      unitPrice: "9999999999999.9999",
    },
  ];
  assert.deepEqual(commercialTotals(items), proposalTotals(items));
  assert.equal(commercialTotals(items.slice(0, 2)).total, "0.76");
  assert.equal(
    moneyExact("99999999999999999999999999.99"),
    "R$ 99.999.999.999.999.999.999.999.999,99",
  );
  assert.deepEqual(
    commercialTotals([{ id: "a", quantity: "10", unitPrice: null }]),
    { total: "0.00", complete: false, lines: [{ id: "a", total: null }] },
  );
});
