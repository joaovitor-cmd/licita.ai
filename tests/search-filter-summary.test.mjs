import test from "node:test";
import assert from "node:assert/strict";
import {
  searchFilterSummary,
  removeSearchFilter,
  clearSearchFilters,
} from "../apps/web/src/search-filter-summary.ts";
test("active filter groups ignore empty and navigation fields and preserve zero", () => {
  const filters = searchFilterSummary(
    new URLSearchParams(
      "q=impressao&sort=value&page=3&pageSize=20&searchProfile=profile&unknown=ignored&city=+&minValue=0&minScore=0&states=rs,sc&sources=pncp,comprasgov&from=2026-10-07&status=open",
    ),
  );
  assert.equal(filters.length, 6);
  assert.match(filters.find((f) => f.id === "minValue").value, /0,00/);
  assert.equal(filters.find((f) => f.id === "minScore").value, "0%");
  assert.equal(filters.find((f) => f.id === "states").value, "RS, SC");
  assert.equal(
    filters.find((f) => f.id === "sources").value,
    "PNCP, Compras.gov.br",
  );
  assert.match(filters.find((f) => f.id === "from").value, /07/);
  assert.equal(
    filters.find((f) => f.id === "status").value,
    "Prazo em curso nos dados coletados",
  );
});
test("removing a filter clears both singular and plural restrictions without changing the saved profile or others", () => {
  const original = new URLSearchParams(
    "state=RS&states=RS,SC&source=pncp&terms=impressao&q=laser&page=4&sort=value&searchProfile=profile",
  );
  const group = searchFilterSummary(original).find((f) => f.id === "states");
  assert.equal(group.value, "RS · e também: RS, SC");
  const next = removeSearchFilter(original, group);
  assert.equal(next.has("state"), false);
  assert.equal(next.has("states"), false);
  assert.equal(next.has("page"), false);
  assert.equal(next.get("searchProfile"), "profile");
  assert.equal(next.get("terms"), "impressao");
  assert.equal(next.get("source"), "pncp");
  assert.equal(original.get("page"), "4");
  const cleared = clearSearchFilters(
    new URLSearchParams(original.toString() + "&pageSize=20"),
  );
  assert.equal(cleared.toString(), "q=laser&sort=value&pageSize=20");
  assert.equal(original.get("searchProfile"), "profile");
});
test("long and literal text remains available while preview is bounded", () => {
  const text =
      "<img src=x onerror=alert(1)> " + "Termos técnicos longos ".repeat(25),
    filter = searchFilterSummary(new URLSearchParams({ terms: text }))[0];
  assert.equal(filter.value, text.trim());
  assert.ok(Array.from(filter.preview).length <= 65);
  assert.ok(filter.preview.endsWith("…"));
});
test("empty list terms have no effect, empty numeric URL fields reflect API zero, invalid dates are not rewritten", () => {
  const filters = searchFilterSummary(
    new URLSearchParams("terms=, ,&exclude=, ,&minValue=&from=2026-02-31"),
  );
  assert.equal(filters.length, 2);
  assert.match(filters.find((f) => f.id === "minValue").value, /0,00/);
  assert.equal(filters.find((f) => f.id === "from").value, "2026-02-31");
});
test('joint profiles display names rather than UUIDs and can be removed independently',()=>{
 const params=new URLSearchParams('q=laser&searchProfiles=ABC,def,ABC&states=RS&page=3');
 const pending=searchFilterSummary(params)[0];assert.equal(pending.value,'2 selecionado(s)');assert.equal(pending.value.includes('ABC'),false);
 const group=searchFilterSummary(params,[{id:'abc',name:'Impressão'},{id:'def',name:'Serviços'}])[0];assert.equal(group.value,'Impressão, Serviços');
 const removed=removeSearchFilter(params,group);assert.equal(removed.has('searchProfiles'),false);assert.equal(removed.has('page'),false);assert.equal(removed.get('q'),'laser');assert.equal(removed.get('states'),'RS');
});
