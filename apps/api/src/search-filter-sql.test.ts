import test from "node:test";
import assert from "node:assert/strict";
import { opportunityFilterSql } from "./search-filter-sql.js";
test("shared search rules bind text and preserve conjunctive aliases and term alternatives", () => {
  const values: unknown[] = [];
  const sql = opportunityFilterSql(
    {
      state: "rs",
      states: "RS, SC",
      terms: "impressão, toner laser",
      exclude: "remanufaturado",
      agency: "Órgão ' especial",
      sources: "pncp,comprasgov",
      minValue: 0,
    },
    (v) => {
      values.push(v);
      return "$" + values.length;
    },
  ).join(" AND ");
  assert.match(sql, /o.state=\$1 AND o.state=ANY/);
  assert.match(sql, / OR /);
  assert.match(sql, /NOT \(coalesce/);
  assert.match(sql, /opportunity_sources/);
  assert.equal(sql.includes("especial"), false);
  assert.deepEqual(values.slice(0, 3), ["RS", ["RS", "SC"], 0]);
  assert.ok(
    values.some((v) => Array.isArray(v) && v.join(" ") === "toner laser"),
  );
});
test("public code, bounds and literal wildcard status are safely bound", () => {
  const values: unknown[] = [];
  const sql = opportunityFilterSql(
    { q: "LC-123", status: "%_cancelado", to: "2026-10-07", maxValue: 0 },
    (v) => {
      values.push(v);
      return "$" + values.length;
    },
  ).join(" AND ");
  assert.match(sql, /public_code=.*::bigint/);
  assert.match(sql, /interval '1 day'/);
  assert.ok(values.includes("%\\%\\_cancelado%"));
  assert.ok(values.includes("123"));
  assert.deepEqual(
    opportunityFilterSql({}, () => {
      throw Error("unexpected bind");
    }),
    [],
  );
});
