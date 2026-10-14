import test from "node:test";
import assert from "node:assert/strict";
import {
  readCatalogCsv,
  suggestCatalogMapping,
  mappedCatalogRows,
  catalogDecimal,
} from "../apps/web/src/catalog-csv.ts";
test("catalog CSV preserves quoted separators, escaped quotes, newlines and UTF8 header", () => {
  const data = readCatalogCsv(
    '\uFEFFnome;descricao;unidade\r\n"Serviço; A4";"duas\nlinhas e ""aspas""";Página\r\n',
    ";",
  );
  assert.deepEqual(data.headers, ["nome", "descricao", "unidade"]);
  assert.deepEqual(data.rows, [
    ["Serviço; A4", 'duas\nlinhas e "aspas"', "Página"],
  ]);
});
test("catalog CSV rejects malformed, excessive and inconsistent input", () => {
  for (const data of [
    "nome;valor\nA;1;2",
    'nome\n"aberto',
    'nome\n"fechado"extra',
    'nome\nfoo"bar',
    "nome\n\uFFFD",
  ])
    assert.throws(() => readCatalogCsv(data, ";"));
  assert.throws(() =>
    readCatalogCsv(
      "nome\n" + Array.from({ length: 201 }, () => "Item").join("\n"),
      ";",
    ),
  );
  assert.throws(() => readCatalogCsv("nome\n" + "x".repeat(5001), ";"));
  assert.throws(() => readCatalogCsv("x".repeat(1_000_001), ";"));
});
test("catalog decimals distinguish blank, zero, localized precision and invalid values", () => {
  assert.equal(catalogDecimal("", ","), null);
  assert.equal(catalogDecimal("0", ","), 0);
  assert.equal(catalogDecimal("R$ 1.234,5678", ","), 1234.5678);
  assert.equal(catalogDecimal("1,234.5678", "."), 1234.5678);
  assert.equal(catalogDecimal("0,0345", ","), 0.0345);
  assert.equal(catalogDecimal("1.234", ","), 1234);
  for (const value of ["1,23456", "-1", "1e3", "1.23,00"])
    assert.equal(catalogDecimal(value, ","), value);
});
test("mapping keeps cost separate from sale and never guesses generic value", () => {
  const headers = [
    "Nome",
    "Custo interno unitário",
    "Preço de venda unitário",
    "Valor",
    "Unidade",
    "Periodicidade",
    "Tipo",
  ];
  const mapping = suggestCatalogMapping(headers);
  assert.equal(mapping.unitCost, 1);
  assert.equal(mapping.salePrice, 2);
  const [item] = mappedCatalogRows(
    [
      [
        "Impressão",
        "0,0345",
        "0,0750",
        "1000",
        "Página",
        "Por unidade",
        "Serviço",
      ],
    ],
    mapping,
    ",",
  );
  assert.equal(item.unitCost, 0.0345);
  assert.equal(item.salePrice, 0.075);
  assert.equal(item.type, "SERVICE");
  assert.equal(item.priceBasis, "PER_UNIT");
  const simple = suggestCatalogMapping(["Nome", "Valor"]);
  assert.equal(simple.unitCost, -1);
  assert.equal(simple.salePrice, -1);
});
