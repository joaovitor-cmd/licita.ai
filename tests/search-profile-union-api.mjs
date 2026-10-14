import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testSearchProfileUnion({ a, b, db, sa }) {
  const marker = "joint" + randomUUID().replaceAll("-", ""),
    fixtures = [];
  for (const [title, state, source, value] of [
    ["alpha", "RS", "pncp", 100],
    ["beta", "SC", "comprasgov", 200],
    ["alpha beta", "RS", "pncp", 300],
    ["alpha bloqueado", "RS", "pncp", 400],
    ["alpha", "SP", "pncp", 500],
    ["gama", "RS", "pncp", null],
  ]) {
    const id = randomUUID();
    fixtures.push(id);
    await db.query(
      "INSERT INTO opportunities(id,canonical_key,title,agency,state,source_code,source_name,content_hash,demo_org_id,value,search_tokens) VALUES($1::uuid,($1::uuid)::text,$2,'QA',$3,$4,$4,'qa',$5,$6,$7)",
      [
        id,
        marker + " " + title,
        state,
        source,
        sa.organization.id,
        value,
        [marker, ...title.split(" ")],
      ],
    );
  }
  const first = await a(
    "/search-profiles",
    "POST",
    {
      name: marker + " Alpha",
      description: "",
      filters: {
        terms: "alpha",
        exclude: "bloqueado",
        states: "RS",
        sources: "pncp",
      },
    },
    201,
  );
  const second = await a(
    "/search-profiles",
    "POST",
    {
      name: marker + " Beta",
      description: "",
      filters: { terms: "beta", sources: "pncp,comprasgov" },
    },
    201,
  );
  const url = (ids, extra = "") =>
    "/opportunities?q=" +
    marker +
    "&sort=newest&searchProfiles=" +
    ids.join(",") +
    extra;
  let result = await a(url([first.id, second.id]));
  assert.equal(result.total, 3);
  assert.equal(new Set(result.items.map((x) => x.id)).size, 3);
  assert.deepEqual(
    result.items
      .find((x) => x.id === fixtures[2])
      .matchedSearchProfiles.map((x) => x.id),
    [first.id, second.id],
  );
  assert.deepEqual(
    result.searchProfiles.map((x) => x.revision),
    [1, 1],
  );
  await b(url([first.id]), "GET", undefined, 400);
  const page1 = await a(url([first.id, second.id], "&pageSize=2")),
    page2 = await a(url([first.id, second.id], "&pageSize=2&page=2"));
  assert.equal(page1.total, 3);
  assert.equal(page2.items.length, 1);
  assert.equal(
    new Set([...page1.items, ...page2.items].map((x) => x.id)).size,
    3,
  );
  assert.equal((await a(url([first.id, second.id], "&state=RS"))).total, 2);
  assert.equal((await a(url([first.id, second.id], "&minValue=250"))).total, 1);
  assert.equal((await a(url([first.id, second.id], "&exclude=beta"))).total, 1);
  assert.equal((await a(url([first.id, first.id]))).total, 2);
  assert.equal((await a(url([first.id.toUpperCase()]))).total, 2);
  await a(url(["invalid"]), "GET", undefined, 400);
  await a(url(Array(11).fill(first.id)), "GET", undefined, 400);
  await a(
    "/search-profiles",
    "POST",
    { name: "Nested", description: "", filters: { searchProfiles: first.id } },
    400,
  );
  const threshold = await a(
    "/search-profiles",
    "POST",
    {
      name: marker + " Threshold",
      description: "",
      filters: { terms: "gama", minScore: 100 },
    },
    201,
  );
  assert.equal((await a(url([first.id, threshold.id]))).total, 2);
  assert.equal(
    (await a("/search-profiles")).find((x) => x.id === first.id).revision,
    1,
  );
  await a("/search-profiles/" + first.id + "/active", "PATCH", {
    active: false,
    revision: 1,
  });
  await a(url([first.id, second.id]), "GET", undefined, 400);
  await a("/search-profiles/" + first.id + "/active", "PATCH", {
    active: true,
    revision: 2,
  });
  result = await a(url([first.id]));
  assert.equal(result.searchProfiles[0].revision, 3);
  console.log(
    "PASS: joint profile search, deduplication, provenance, pagination, global refinement, score thresholds, paused profiles and tenant isolation.",
  );
}
