import test from "node:test";
import assert from "node:assert/strict";
import {
  checklistSchema,
  itemKey,
  starterTemplates,
} from "./checklist-rules.js";
test("modelos iniciais são roteiros de tarefas válidos, não documentos presumidos", () => {
  for (const t of starterTemplates) {
    assert.ok(
      checklistSchema.safeParse({ name: t.name, items: t.items }).success,
    );
    assert.ok(t.items.every((i) => i.kind === "TASK"));
  }
});
test("modelo contém somente títulos e tipos, sem estados ou arquivos", () => {
  assert.equal(
    checklistSchema.safeParse({
      name: "Teste",
      items: [
        {
          kind: "DOCUMENT",
          title: "Certidão QA",
          documentId: "segredo",
          state: "REVIEWED",
        },
      ],
    }).success,
    false,
  );
});
test("limites de modelos não permitem checklist vazio ou mais de 60 itens", () => {
  for (const items of [
    [],
    Array.from({ length: 61 }, () => ({
      kind: "TASK",
      title: "Conferir prazo",
    })),
    [{ kind: "TASK", title: "x".repeat(201) }],
  ])
    assert.equal(
      checklistSchema.safeParse({ name: "Teste", items }).success,
      false,
    );
});
test("deduplicação ignora caixa, acento e espaços, mas distingue tipo", () => {
  assert.equal(
    itemKey({ kind: "TASK", title: "  Conferir CERTIDÃO  técnica " }),
    itemKey({ kind: "TASK", title: "conferir certidao tecnica" }),
  );
  assert.notEqual(
    itemKey({ kind: "TASK", title: "Certidão QA" }),
    itemKey({ kind: "DOCUMENT", title: "Certidão QA" }),
  );
});
