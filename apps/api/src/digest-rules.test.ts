import test from "node:test";
import assert from "node:assert/strict";
import { brazilClock, digestSchema, digestText } from "./digest-rules.js";
import { collectDigest } from "./digests.js";
test("agendamento usa o dia e horário de Brasília, não UTC ou fuso do servidor", () => {
  assert.deepEqual(brazilClock(new Date("2026-09-10T01:30:00Z")), {
    day: "2026-09-09",
    time: "22:30",
  });
  assert.deepEqual(brazilClock(new Date("2026-09-10T03:00:00Z")), {
    day: "2026-09-10",
    time: "00:00",
  });
});
test("valida horário, revisão e destinatários sem repetições", () => {
  const b = {
    enabled: false,
    sendTime: "08:30",
    recipientIds: [],
    revision: 0,
  };
  assert.ok(digestSchema.safeParse(b).success);
  for (const sendTime of ["24:00", "8:00", "12:60", "amanhã"])
    assert.equal(digestSchema.safeParse({ ...b, sendTime }).success, false);
  assert.equal(
    digestSchema.safeParse({
      ...b,
      recipientIds: [
        "cb35311f-c04c-479e-bb79-d8c5c22db2db",
        "cb35311f-c04c-479e-bb79-d8c5c22db2db",
      ],
    }).success,
    false,
  );
});
test("texto limita o resumo e aponta lista completa e limitações sem prometer habilitação", () => {
  const items = Array.from({ length: 21 }, (_, i) => ({
    id: String(i),
    title: `Item ${i}`,
    agency: "Órgão QA",
    state: null,
    score: 80,
  }));
  const text = digestText(
    items,
    "2026-09-09",
    "http://localhost:5173/app/boletins/qa",
    true,
  );
  assert.match(text, /21 oportunidades/);
  assert.match(text, /lista completa/);
  assert.doesNotMatch(text, /Item 20/);
  assert.match(text, /2.000 registros/);
  assert.match(text, /não habilitação/);
});
test("coleta limitada mantém cursor com microssegundos e retoma sem perder o excedente", async () => {
  const values = Array.from({ length: 2001 }, (_, i) => ({
    id: String(i).padStart(4, "0"),
    title: "Impressão QA",
    agency: "QA",
    created_cursor: "2026-09-09 08:00:00.123456+00",
    closes_at: null,
    state: "RS",
  }));
  const db = {
    query: async (sql: string) => ({
      rows: sql.includes("FROM opportunities") ? values : [],
    }),
  } as any;
  const result = await collectDigest(
    {
      id: "qa",
      is_demo: false,
      profile: { keywords: ["impressão"] },
      preferences: { minScore: 40 },
    },
    { cursor_text: "2026-09-08", cursor_id: "min" },
    new Date("2026-09-10"),
    db,
  );
  assert.equal(result.scanned, 2000);
  assert.equal(result.items.length, 2000);
  assert.equal(result.remaining, true);
  assert.equal(result.cursorId, "1999");
  assert.equal(result.cursorAt, "2026-09-09 08:00:00.123456+00");
});
test("exclusões e prazo encerrado não entram no boletim; cursor avança mesmo sem afinidade", async () => {
  const candidates = [
    {
      id: "1",
      title: "Impressão proibido",
      created_cursor: "2026-09-09",
      closes_at: null,
    },
    {
      id: "2",
      title: "Impressão",
      created_cursor: "2026-09-09",
      closes_at: "2020-01-01",
    },
  ];
  const db = {
    query: async (sql: string) => ({
      rows: sql.includes("FROM opportunities") ? candidates : [],
    }),
  } as any;
  const r = await collectDigest(
    {
      id: "qa",
      is_demo: true,
      profile: { keywords: ["impressão"], excludedKeywords: ["proibido"] },
      preferences: { minScore: 0 },
    },
    { cursor_text: "2026-09-08", cursor_id: "min" },
    new Date("2026-09-10"),
    db,
  );
  assert.equal(r.items.length, 0);
  assert.equal(r.cursorId, "2");
});
