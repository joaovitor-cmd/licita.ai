import test from "node:test";
import assert from "node:assert/strict";
import { opportunityIdentifiers } from "./opportunity-identifiers.js";

test("identifiers never turn a PNCP unit into a confirmed UASG", () => {
  const item = opportunityIdentifiers({
    public_code: "44455",
    source_code: "pncp",
    raw: {
      numeroCompra: "154/2026",
      unidadeOrgao: { codigoUnidade: "123456" },
    },
  });
  assert.equal(item.publicCode, "LC-00044455");
  assert.equal(item.editalNumber, "154/2026");
  assert.equal(item.uasg, null);
  assert.equal(item.capag, null);
});
test("explicit UASG and projected metadata preserve official identifiers", () => {
  assert.equal(
    opportunityIdentifiers({
      source_code: "comprasgov",
      identifier_metadata: { unidadeOrgaoCodigoUnidade: "010012" },
    }).uasg,
    "010012",
  );
  assert.equal(
    opportunityIdentifiers({
      raw: {
        codigoUasg: 123456,
        numeroEdital: { invalid: true },
        numeroCompra: 22,
      },
    }).editalNumber,
    "22",
  );
  assert.equal(opportunityIdentifiers({ raw: { codigoUasg: 75 } }).uasg, null);
  assert.equal(opportunityIdentifiers({}).publicCode, null);
});
