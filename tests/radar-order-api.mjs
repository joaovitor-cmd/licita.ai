import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export async function testRadarOrder({ a, b, anon, db, sa }) {
  const marker = "QA order " + randomUUID(),
    cards = [];
  for (let index = 0; index < 3; index++) {
    const id = randomUUID();
    await db.query(
      "INSERT INTO opportunities(id,canonical_key,title,agency,source_code,source_name,content_hash,demo_org_id) VALUES($1,$4,$2,'Órgão QA','qa','QA','qa',$3)",
      [id, marker + " " + index, sa.organization.id, id],
    );
    cards.push(await a("/trackings", "POST", { opportunityId: id }, 201));
  }
  const page = () => a("/trackings/page?q=" + encodeURIComponent(marker));
  const ids = (result) => result.items.map((card) => card.id);
  let snapshot = await page();
  assert.deepEqual(ids(snapshot), [cards[2].id, cards[1].id, cards[0].id]);
  const body = {
    stage: "IDENTIFIED",
    beforeId: cards[1].id,
    revision: snapshot.orderRevision,
  };
  await anon("/trackings/" + cards[0].id + "/order", "POST", body, 401);
  await b("/trackings/" + cards[0].id + "/order", "POST", body, 404);
  const foreign=(await b('/trackings/page')).items[0].id;
  await a('/trackings/'+cards[0].id+'/order','POST',{...body,beforeId:foreign},404);
  await a(
    "/trackings/" + cards[0].id + "/order",
    "POST",
    { ...body, beforeId: cards[0].id },
    400,
  );
  await a(
    "/trackings/" + cards[0].id + "/order",
    "POST",
    { ...body, revision: 0 },
    400,
  );
  const original = (
    await db.query("SELECT updated_at FROM trackings WHERE id=$1", [
      cards[0].id,
    ])
  ).rows[0].updated_at;
  const changed = await a("/trackings/" + cards[0].id + "/order", "POST", body);
  assert.equal(changed.changed, true);
  snapshot = await page();
  assert.deepEqual(ids(snapshot), [cards[2].id, cards[0].id, cards[1].id]);
  assert.equal(
    (
      await db.query("SELECT updated_at FROM trackings WHERE id=$1", [
        cards[0].id,
      ])
    ).rows[0].updated_at.toISOString(),
    original.toISOString(),
  );
  await a("/trackings/" + cards[2].id + "/order", "POST", body, 409);
  const noop = await a("/trackings/" + cards[0].id + "/order", "POST", {
    ...body,
    revision: snapshot.orderRevision,
  });
  assert.equal(noop.changed, false);
  assert.equal(noop.orderRevision, snapshot.orderRevision);
  await a("/trackings/" + cards[0].id, "PATCH", {
    notes: "Revisão sem mudar a ordem.",
  });
  assert.deepEqual(ids(await page()), ids(snapshot));
  const end = await a("/trackings/" + cards[0].id + "/order", "POST", {
    stage: "IDENTIFIED",
    beforeId: null,
    revision: snapshot.orderRevision,
  });
  assert.equal(end.changed, true);
  snapshot = await page();
  assert.deepEqual(ids(snapshot), [cards[2].id, cards[1].id, cards[0].id]);
  // Equal positions exercise transactional rebalancing without losing any cards.
  await db.query(
    "UPDATE trackings SET board_position=0 WHERE organization_id=$1 AND stage=$2",
    [sa.organization.id, "IDENTIFIED"],
  );
  const ordered = (await page()).items;
  const reordered = await a(
    "/trackings/" + ordered.at(-1).id + "/order",
    "POST",
    {
      stage: "IDENTIFIED",
      beforeId: ordered[1].id,
      revision: snapshot.orderRevision,
    },
  );
  assert.equal(reordered.changed, true);
  assert.equal((await page()).items[1].id, ordered.at(-1).id);
  snapshot = await page();
  const concurrent = await Promise.all([
    a(
      "/trackings/" + snapshot.items[2].id + "/order",
      "POST",
      {
        stage: "IDENTIFIED",
        beforeId: snapshot.items[0].id,
        revision: snapshot.orderRevision,
      },
      [200, 409],
    ),
    a(
      "/trackings/" + snapshot.items[1].id + "/order",
      "POST",
      {
        stage: "IDENTIFIED",
        beforeId: snapshot.items[0].id,
        revision: snapshot.orderRevision,
      },
      [200, 409],
    ),
  ]);
  assert.equal(
    concurrent.filter((result) => result.changed === true).length,
    1,
  );
  assert.equal(concurrent.filter((result) => result.error).length, 1);
  snapshot = await page();
  await a("/trackings/" + cards[0].id, "PATCH", { stage: "IN_ANALYSIS" });
  await a(
    "/trackings/" + cards[1].id + "/order",
    "POST",
    {
      stage: "IDENTIFIED",
      beforeId: cards[0].id,
      revision: snapshot.orderRevision,
    },
    409,
  );
  snapshot = await page();
  await a(
    "/trackings/" + cards[1].id + "/order",
    "POST",
    {
      stage: "IDENTIFIED",
      beforeId: cards[0].id,
      revision: snapshot.orderRevision,
    },
    409,
  );
  const events = await db.query(
    "SELECT type FROM events WHERE tracking_id=$1 AND type='REORDERED'",
    [cards[0].id],
  );
  assert.ok(events.rowCount >= 2);
  const beforeMigration = (
    await db.query(
      "SELECT id,board_position::text position FROM trackings WHERE organization_id=$1 ORDER BY id",
      [sa.organization.id],
    )
  ).rows;
  const { schema } = await import("../apps/api/dist/schema.js");
  await db.query(schema);
  assert.deepEqual(
    (
      await db.query(
        "SELECT id,board_position::text position FROM trackings WHERE organization_id=$1 ORDER BY id",
        [sa.organization.id],
      )
    ).rows,
    beforeMigration,
  );
  console.log(
    "PASS: persistent radar order, exact ranks/rebalance, shared revision conflicts, concurrent writes, no-op, audit history, stage changes and migration preservation.",
  );
}
