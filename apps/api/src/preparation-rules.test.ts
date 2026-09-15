import test from "node:test";
import assert from "node:assert/strict";
import { documentState } from "./preparation-rules.js";
test("documento removido nunca continua conferido", () =>
  assert.equal(
    documentState({ document_id: null, state: "REVIEWED" }, "v1"),
    "MISSING",
  ));
test("validade vencida exige atualização", () =>
  assert.equal(
    documentState(
      {
        document_id: "doc",
        state: "REVIEWED",
        expires_at: "2020-01-01",
        review_version: "v1",
      },
      "v1",
    ),
    "UPDATE",
  ));
test("nova leitura invalida conferência sem apagar histórico", () =>
  assert.equal(
    documentState(
      { document_id: "doc", state: "REVIEWED", review_version: "v1" },
      "v2",
    ),
    "UPDATE",
  ));
test("conferência atual permanece humana e válida no resumo", () =>
  assert.equal(
    documentState(
      { document_id: "doc", state: "REVIEWED", review_version: "v1" },
      "v1",
    ),
    "REVIEWED",
  ));
test("vínculo não equivale a conferência", () =>
  assert.equal(
    documentState({ document_id: "doc", state: "MISSING" }, "v1"),
    "LINKED",
  ));
