import test from "node:test";
import assert from "node:assert/strict";
import {
  textPreview,
  proposalDateNotice,
} from "../apps/web/src/opportunity-reading.ts";
import { date, currency } from "../apps/web/src/api.ts";
test("object preview ends at word boundaries, preserves literal source text and does not split emoji", () => {
  assert.deepEqual(textPreview("  Objeto\n simples  "), {
    text: "Objeto simples",
    truncated: false,
  });
  const long =
    "Fornecimento de impressoras e equipamentos para atendimento municipal. ".repeat(
      8,
    );
  const preview = textPreview(long);
  assert.equal(preview.truncated, true);
  assert.ok(preview.text.length <= 281);
  assert.ok(long.startsWith(preview.text.slice(0, -1)));
  assert.ok(!preview.text.endsWith("munici…"));
  assert.equal(textPreview("😀".repeat(281)).text, "😀".repeat(280) + "…");
  assert.deepEqual(textPreview("<script>alert(1)</script>"), {
    text: "<script>alert(1)</script>",
    truncated: false,
  });
});
test("date notices describe stored dates without inventing official availability", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  assert.equal(proposalDateNotice(null, null, now), null);
  assert.equal(
    proposalDateNotice("2026-10-01T12:00:00Z", "2026-10-20T12:00:00Z", now),
    null,
  );
  assert.match(
    proposalDateNotice(null, "2026-10-07T12:00:00Z", now),
    /já passou/,
  );
  assert.match(proposalDateNotice("2026-10-10T12:00:00Z", null, now), /futuro/);
  assert.match(
    proposalDateNotice("2026-10-10T12:00:00Z", "2026-10-01T12:00:00Z", now),
    /inconsistentes/,
  );
  assert.match(proposalDateNotice("invalid", null, now), /inconsistentes/);
  assert.equal(date("invalid", true), "Não informado");
  assert.equal(date(null), "Não informado");
  assert.equal(currency(null), "Não informado");
  assert.equal(currency(Number.NaN), "Não informado");
  assert.match(currency(0), /0,00/);
});
