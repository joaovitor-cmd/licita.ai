import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultProfile,
  matchesModality,
  normalize,
  scoreOpportunity,
} from "./scoring.js";

test("modalidade genérica inclui suas variantes sem misturar modalidades distintas", () => {
  assert.equal(
    matchesModality("Concorrência - Eletrônica", "Concorrência"),
    true,
  );
  assert.equal(
    matchesModality("Pregão - Eletrônico", "Pregão eletrônico"),
    true,
  );
  assert.equal(
    matchesModality("Pregão - Presencial", "Pregão eletrônico"),
    false,
  );
  assert.equal(matchesModality("Concurso", "Concorrência"), false);
  assert.equal(matchesModality("Dispensa", ""), false);
});
test("acentos normalizados sem remover letras", () =>
  assert.equal(normalize("Computação — PREGÃO!"), "computacao pregao"));
test("perfil vazio não fabrica aderência", () =>
  assert.equal(
    scoreOpportunity(
      { title: "Limpeza predial", description: "", state: "RS" },
      defaultProfile,
      [],
    ).score,
    0,
  ));
test("exclusões bloqueiam recomendação", () => {
  const result = scoreOpportunity(
    { title: "Computadores usados", description: "" },
    {
      ...defaultProfile,
      keywords: ["computadores"],
      excludedKeywords: ["usados"],
    },
    [],
  );
  assert.equal(result.score, 0);
  assert.equal(result.excluded, true);
});
test("catálogo inativo não aumenta score", () =>
  assert.equal(
    scoreOpportunity(
      { title: "Compra de notebooks", description: "" },
      defaultProfile,
      [{ name: "notebooks", keywords: ["notebooks"], active: false }],
    ).score,
    0,
  ));
test("score é explicável e limitado a100", () => {
  const result = scoreOpportunity(
    {
      title: "Computadores e notebooks",
      description: "",
      state: "RS",
      city: "Porto Alegre",
      modality: "Pregão - Eletrônico",
      value: 120000,
    },
    {
      ...defaultProfile,
      keywords: ["computadores", "notebooks"],
      states: ["RS"],
      cities: ["Porto Alegre"],
      modalities: ["Pregão eletrônico"],
      minValue: 100,
      maxValue: 200000,
    },
    [{ name: "Notebooks", keywords: ["notebooks"], active: true }],
  );
  assert.equal(result.score, 100);
  assert.ok(result.reasons.length >= 4);
});
test("UF fora do perfil reduz score e valor desconhecido não vale zero", () => {
  const a = { title: "Notebooks", description: "", state: "RS", value: null };
  const p = {
    ...defaultProfile,
    keywords: ["notebooks"],
    states: ["SC"],
    minValue: 1,
    maxValue: 500000,
  };
  const result = scoreOpportunity(a, p, []);
  assert.ok(result.score < 50);
  assert.ok(result.reasons.some((r) => r.includes("não informado")));
});
