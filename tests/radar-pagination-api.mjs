import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testRadarPagination({ a, b, db, sa }) {
  const opportunityIds = Array.from({ length: 62 }, () => randomUUID()),
    trackingIds = opportunityIds.map(() => randomUUID()),
    marker = "QA radar paging";
  await db.query(
    `INSERT INTO opportunities(id,canonical_key,title,agency,value,source_code,source_name,content_hash,demo_org_id)
 SELECT id,'radar-qa:'||id,$3||' '||lpad((position-1)::text,3,'0'),'Órgão QA',CASE WHEN position=1 THEN NULL ELSE 100 END,'qa','QA','qa',$2 FROM unnest($1::uuid[]) WITH ORDINALITY fixture(id,position)`,
    [opportunityIds, sa.organization.id, marker],
  );
  await db.query(
    `INSERT INTO trackings(id,organization_id,opportunity_id,stage,owner_id,updated_at)
 SELECT tracking,$3,opportunity,CASE WHEN position<=52 THEN 'IDENTIFIED' WHEN position<=60 THEN 'IN_ANALYSIS' ELSE 'WON' END,CASE WHEN position%2=0 THEN $4::uuid ELSE NULL END,'2026-10-07T12:00:00Z'::timestamptz FROM unnest($1::uuid[],$2::uuid[]) WITH ORDINALITY fixture(tracking,opportunity,position)`,
    [trackingIds, opportunityIds, sa.organization.id, sa.user.id],
  );
  await db.query(
    `INSERT INTO tasks(id,tracking_id,title,done) SELECT gen_random_uuid(),id,'QA task',position=2 FROM unnest($1::uuid[]) fixture(id) CROSS JOIN generate_series(1,2) fixture_task(position)`,
    [trackingIds],
  );
  const root = "/trackings/page?q=" + encodeURIComponent(marker),
    first = await a(root);
  assert.equal(first.items.length, 33);
  assert.equal(first.total, 60);
  assert.equal(first.pageSize, 25);
  assert.deepEqual(first.summary, {
    active: 60,
    potential: 5900,
    unknownValues: 1,
    pendingTasks: 60,
  });
  assert.equal(
    first.stages.find((stage) => stage.stage === "IDENTIFIED").count,
    52,
  );
  assert.equal(
    first.stages.find((stage) => stage.stage === "IDENTIFIED").hasMore,
    true,
  );
  assert.ok(
    first.items.every(
      (item) => item.tasks.length === 2 && item.events.length === 0,
    ),
  );
  const second = await a(root + "&stage=IDENTIFIED&page=2"),
    third = await a(root + "&stage=IDENTIFIED&page=3");
  assert.equal(second.items.length, 25);
  assert.equal(third.items.length, 2);
  assert.equal(
    third.stages.find((stage) => stage.stage === "IDENTIFIED").hasMore,
    false,
  );
  assert.equal(second.pageTotal, 52);
  assert.equal(second.hasMore, true);
  assert.equal(third.hasMore, false);
  const ids = [
    ...first.items.filter((item) => item.stage === "IDENTIFIED"),
    ...second.items,
    ...third.items,
  ].map((item) => item.id);
  assert.equal(new Set(ids).size, 52);
  const outside = third.items[0].id;
  const highlighted = await a(root + "&highlight=" + outside);
  assert.equal(highlighted.items.length, 34);
  assert.ok(highlighted.items.some((item) => item.id === outside));
  assert.equal(highlighted.total, 60);
  assert.equal((await b(root + "&highlight=" + outside)).items.length, 0);
  assert.equal(
    (await a("/trackings/page?q=impossible&highlight=" + outside)).items.length,
    0,
  );
  await a(root + "&highlight=invalid", "GET", undefined, 400);
  const list1 = await a(root + "&view=list"),
    list2 = await a(root + "&view=list&page=2");
  assert.equal(list1.items.length, 50);
  assert.equal(list2.items.length, 10);
  assert.equal(list1.hasMore, true);
  assert.equal(list2.hasMore, false);
  assert.equal(
    new Set([...list1.items, ...list2.items].map((item) => item.id)).size,
    60,
  );
  assert.equal((await a(root + "&includeClosed=true")).total, 62);
  assert.equal((await a(root + "&owner=" + sa.user.id)).total, 30);
  assert.equal((await b(root)).total, 0);
  assert.equal((await b(root)).items.length, 0);
  await a(root + "&page=0", "GET", undefined, 400);
  await a(root + "&includeClosed=maybe", "GET", undefined, 400);
  await a(root + "&stage=UNKNOWN", "GET", undefined, 400);
  const change = randomUUID();
  await db.query(
    "INSERT INTO opportunity_changes(id,opportunity_id,types,before_data,after_data) VALUES($1,$2,$3,$4,$5)",
    [change, opportunityIds[0], '["STATUS"]', "{}", '{"status":"Suspensa"}'],
  );
  const pending = await a(root + "&changesOnly=true");
  assert.equal(pending.total, 1);
  assert.equal(pending.items[0].id, trackingIds[0]);
  assert.equal(pending.items[0].pendingChanges, 1);
  assert.equal(pending.summary.potential, null);
  await a(
    "/opportunities/" + opportunityIds[0] + "/changes/" + change + "/review",
    "POST",
    {},
  );
  assert.equal((await a(root + "&changesOnly=true")).total, 0);
  console.log(
    "PASS: bounded radar pages, complete filtered totals, per-stage pagination, stable tie ordering, pending-change filters, unknown values and tenant isolation.",
  );
}
