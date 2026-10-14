import test from "node:test";
import assert from "node:assert/strict";
import { sourceChangeSummary } from "./source-change-message.js";
test("source notices explain dates, estimates and attachment lists without raw URLs", () => {
  const before = {
    opensAt: null,
    value: 0,
    status: "Aberta",
    documents: [],
    url: "https://old.invalid",
  };
  const after = {
    opensAt: "2026-10-06T12:00:00Z",
    value: 3000.5,
    status: "Suspensa",
    documents: [{ name: "Edital.pdf", url: "https://pncp.gov.br/long-url" }],
    url: "https://new.invalid",
  };
  const summary = sourceChangeSummary(before, after);
  assert.match(summary, /06\/10\/2026, 09:00 \(Brasília\)/);
  assert.match(summary, /3\.000,50/);
  assert.match(summary, /Aberta → Suspensa/);
  assert.match(summary, /0 antes, 1 agora/);
  assert.doesNotMatch(summary, /https?:\/\/|"url"|long-url/);
  assert.match(summary, /não comprova mudança no conteúdo/);
});
test("source notices limit external text and do not serialize unknown/object fields", () => {
  const summary = sourceChangeSummary(
    {},
    {
      title: "https://external.invalid " + "Objeto ".repeat(100),
      status: { secret: "do not disclose" },
      debug: { url: "https://private.invalid" },
    },
  );
  assert.ok(summary.length < 350);
  assert.doesNotMatch(summary, /secret|debug|disclose|https?:\/\//);
  assert.match(
    sourceChangeSummary({ opensAt: "bad" }, { opensAt: "still bad" }),
    /Data não informada/,
  );
  assert.match(sourceChangeSummary({ value: null }, { value: 0 }), /0,00/);
});
