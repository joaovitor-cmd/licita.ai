import test from "node:test";
import assert from "node:assert/strict";
import {
  agencyCnpj,
  agencyWatchSchema,
  watchMatch,
} from "./agency-watch-rules.js";

test("agency identity uses explicit control CNPJ, not arbitrary names or supplier fields", () => {
  assert.equal(
    agencyCnpj({ canonicalKey: "pncp:11222333000181-1-000771/2026" }),
    "11222333000181",
  );
  assert.equal(
    agencyCnpj({ canonicalKey: "pncp:11222333000182-1-000771/2026" }),
    null,
  );
  assert.equal(agencyCnpj({ canonicalKey: "comprasgov:11222333000181" }), null);
  assert.equal(agencyCnpj({}), null);
});
test("watch schema canonicalizes CNPJ and duplicate terms; rejects unsupported criteria", () => {
  const w = agencyWatchSchema.parse({
    name: " Prefeitura ",
    agencyCnpj: "11.222.333/0001-81",
    terms: ["Impressão", "impressao"],
    states: ["RS", "RS"],
  });
  assert.equal(w.agencyCnpj, "11222333000181");
  assert.deepEqual(w.terms, ["impressao"]);
  assert.deepEqual(w.states, ["RS"]);
  assert.equal(
    agencyWatchSchema.safeParse({ ...w, agencyCnpj: "11111111111111" }).success,
    false,
  );
  assert.equal(
    agencyWatchSchema.safeParse({ ...w, states: ["XX"] }).success,
    false,
  );
  assert.equal(
    agencyWatchSchema.safeParse({ ...w, terms: ["%%%"] }).success,
    false,
  );
  assert.equal(
    agencyWatchSchema.safeParse({ ...w, unexpected: true }).success,
    false,
  );
});
test("watch matches alternative literal phrases, accent folding and whole words; excludes take priority", () => {
  const watch = {
    terms: ["impressão", "software de gestão"],
    excluded_terms: ["remanufaturado"],
    states: ["RS"],
  };
  assert.equal(
    watchMatch(watch, { title: "Contratação de IMPRESSÃO", state: "RS" }),
    true,
  );
  assert.equal(
    watchMatch(watch, {
      title: "Serviço",
      description: "software de gestão",
      state: "RS",
    }),
    true,
  );
  assert.equal(
    watchMatch(watch, { title: "impressão remanufaturado", state: "RS" }),
    false,
  );
  assert.equal(watchMatch(watch, { title: "impressão", state: null }), false);
  assert.equal(watchMatch(watch, { title: "impressão", state: "SP" }), false);
  assert.equal(
    watchMatch(
      { terms: ["TI"], excluded_terms: [], states: [] },
      { title: "tinta para impressora" },
    ),
    false,
  );
  assert.equal(
    watchMatch(
      { terms: [], excluded_terms: [], states: [] },
      { title: "Qualquer objeto", state: null },
    ),
    true,
  );
});
