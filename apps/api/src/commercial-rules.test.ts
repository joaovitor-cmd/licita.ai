import test from "node:test";
import assert from "node:assert/strict";
import { commercialQuery, winRate } from "./commercial-rules.js";
import { trackingSchema } from "./validation.js";
test("taxa de ganhos não fabrica percentual sem resultados", () => {
  assert.equal(winRate(0, 0), null);
  assert.equal(winRate(0, 2), 0);
  assert.equal(winRate(1, 1), 50);
  assert.equal(winRate(1, 2), 33.3);
});
test("filtros comerciais rejeitam períodos invertidos e datas inválidas", () => {
  assert.ok(
    commercialQuery.safeParse({ from: "2026-09-01", to: "2026-09-09" }).success,
  );
  for (const q of [
    { from: "2026-09-10", to: "2026-09-09" },
    { from: "2026-02-30" },
    { page: 0 },
    { stage: "inventada" },
  ])
    assert.equal(commercialQuery.safeParse(q).success, false);
});
test("classificação é explícita e restrita às opções do produto", () => {
  assert.ok(trackingSchema.safeParse({ outcomeCategory: "PRICE" }).success);
  assert.ok(trackingSchema.safeParse({ outcomeCategory: null }).success);
  assert.equal(
    trackingSchema.safeParse({ outcomeCategory: "GARANTIDO" }).success,
    false,
  );
});
