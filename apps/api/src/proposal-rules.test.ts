import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  proposalDecimal,
  proposalBodySchema,
  proposalTotals,
  proposalProblems,
} from "./proposal-rules.js";

const body = (items: any[]) =>
  proposalBodySchema.parse({
    name: "Proposta QA",
    items,
    conditions: { validity: "", payment: "", delivery: "", observations: "" },
    reviewChecks: {
      selectionAllowed: false,
      itemsChecked: false,
      conditionsChecked: false,
    },
  });
const item = (quantity: string | null, unitPrice: string | null) => ({
  id: randomUUID(),
  number: "1",
  description: "Impressão",
  unit: "PÁG",
  quantity,
  unitPrice,
});
test("proposal decimals are exact, canonical and bounded; blank/null differs from zero", () => {
  assert.equal(proposalDecimal.parse("000.0750"), "0.075");
  assert.equal(proposalDecimal.parse("0"), "0");
  for (const bad of [
    "",
    "1,23",
    "1.234,56",
    "1e3",
    "-1",
    "1.12345",
    "9".repeat(14),
    "NaN",
  ])
    assert.equal(proposalDecimal.safeParse(bad).success, false, bad);
  const totals = proposalTotals(
    body([item("10", null), item("10", "0")]).items,
  );
  assert.equal(totals.complete, false);
  assert.equal(totals.lines[0].total, null);
  assert.equal(totals.lines[1].total, "0.00");
});
test("proposal totals round each line half-up and sum without floating point", () => {
  assert.equal(
    proposalTotals(body([item("1000", "0.075")]).items).total,
    "75.00",
  );
  assert.equal(
    proposalTotals(body([item("1", "0.005"), item("1", "0.005")]).items).total,
    "0.02",
  );
  assert.equal(
    proposalTotals(body([item("9999999999999", "9999999999999")]).items).total,
    "99999999999980000000000001.00",
  );
  assert.equal(
    proposalTotals(body([item("0.125", "0.2")]).items).total,
    "0.03",
  );
});
test("commercial schema rejects internal costs and duplicate official items", () => {
  const x = body([item("10", "1")]);
  assert.equal(
    proposalBodySchema.safeParse({ ...x, internalNotes: "Privado" }).success,
    false,
  );
  assert.equal(
    proposalBodySchema.safeParse({
      ...x,
      items: [{ ...x.items[0], unitCost: 1 }],
    }).success,
    false,
  );
  assert.equal(
    proposalBodySchema.safeParse({
      ...x,
      items: [{ ...x.items[0], quantity: "0" }],
    }).success,
    false,
  );
  const sourceItem = { number: 1, page: 1, checkedAt: "2026-10-06T12:00:00Z" };
  assert.equal(
    proposalBodySchema.safeParse({
      ...x,
      items: [
        { ...x.items[0], sourceItem },
        { ...x.items[0], id: randomUUID(), sourceItem },
      ],
    }).success,
    false,
  );
});
test("review remains explicit about lot selection, conditions, quantities and zero prices", () => {
  const x = body([item("1", "0")]);
  assert.ok(proposalProblems(x).some((p) => p.includes("lotes")));
  assert.ok(proposalProblems(x).some((p) => p.includes("preço zero")));
  x.conditions = {
    validity: "Conferida",
    payment: "Conferido",
    delivery: "Conferida",
    observations: "",
  };
  x.reviewChecks = {
    selectionAllowed: true,
    itemsChecked: true,
    conditionsChecked: true,
    zeroPriceAllowed: true,
  };
  assert.deepEqual(proposalProblems(x), []);
});
