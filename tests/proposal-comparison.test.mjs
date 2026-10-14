import test from "node:test";
import assert from "node:assert/strict";
import { compareCommercialDrafts } from "../apps/web/src/proposal-comparison.ts";
const line = {
  id: "a",
  number: "1",
  lot: "",
  description: "Papel",
  unit: "UN",
  quantity: "10",
  unitPrice: "0.15",
  brand: "",
  model: "",
  solution: "",
  catalogId: null,
  catalogPriceApplied: false,
};
const body = {
  name: "Cotação",
  items: [line],
  conditions: {
    validity: "30 dias",
    payment: "10 dias",
    delivery: "15 dias",
    observations: "",
  },
};
test("commercial comparison normalizes decimals and whitelists fields without internal costs", () => {
  const mine = structuredClone(body),
    current = structuredClone(body);
  mine.items[0].quantity = "010,0000";
  mine.items[0].unitPrice = "0,1500";
  mine.items[0].unitCost = "999";
  assert.deepEqual(compareCommercialDrafts(mine, current), []);
  mine.items[0].unitPrice = "";
  current.items[0].unitPrice = "0";
  assert.deepEqual(compareCommercialDrafts(mine, current), [
    {
      label: "Item 1 · Preço unitário ofertado",
      mine: "Não informado",
      current: "0",
    },
  ]);
});
test("commercial comparison identifies additions/removals by stable line ID without mutating drafts", () => {
  const current = structuredClone(body);
  current.items = [{ ...line, id: "b", number: "2", unitPrice: "0.2" }];
  current.conditions.payment = "20 dias";
  const original = JSON.stringify(body),
    changes = compareCommercialDrafts(body, current);
  assert.equal(changes.length, 3);
  assert.equal(changes[0].label, "Pagamento");
  assert.match(changes[1].label, /somente no seu rascunho/);
  assert.match(changes[2].label, /somente na versão atual/);
  assert.equal(JSON.stringify(body), original);
});
