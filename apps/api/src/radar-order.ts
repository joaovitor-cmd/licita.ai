import type { Router } from "express";
import { z } from "zod";
import { one, transaction, type Database } from "./db.js";
import { addEvent, visibility } from "./data.js";
import { current, HttpError } from "./security.js";
import { uuid } from "./validation.js";
import { randomUUID } from "node:crypto";

export const radarStages = [
  "IDENTIFIED",
  "IN_ANALYSIS",
  "WILL_PARTICIPATE",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
  "DISCARDED",
] as const;
const max = 9223372036854775807n,
  min = -9223372036854775808n,
  step = 1024n;
export function rankBetween(
  previous: string | null,
  next: string | null,
): string | null {
  const left = previous === null ? null : BigInt(previous),
    right = next === null ? null : BigInt(next);
  const rank =
    left === null
      ? right === null
        ? 0n
        : right - step
      : right === null
        ? left + step
        : left + (right - left) / 2n;
  if (
    rank < min ||
    rank > max ||
    (left !== null && rank <= left) ||
    (right !== null && rank >= right)
  )
    return null;
  return String(rank);
}
export async function lockRadarOrder(organizationId: string, db: Database) {
  return one(
    "SELECT radar_order_revision::text revision FROM organizations WHERE id=$1 FOR UPDATE",
    [organizationId],
    db,
  );
}
export async function bumpRadarOrder(organizationId: string, db: Database) {
  return (
    await one(
      "UPDATE organizations SET radar_order_revision=radar_order_revision+1 WHERE id=$1 RETURNING radar_order_revision::text revision",
      [organizationId],
      db,
    )
  ).revision as string;
}
async function rebalance(organizationId: string, stage: string, db: Database) {
  await db.query(
    `WITH ranked AS (SELECT id,row_number() OVER(ORDER BY board_position,id)*1024 position FROM trackings WHERE organization_id=$1 AND stage=$2) UPDATE trackings t SET board_position=ranked.position FROM ranked WHERE t.id=ranked.id`,
    [organizationId, stage],
  );
}
export async function firstRadarPosition(
  organizationId: string,
  stage: string,
  db: Database,
): Promise<string> {
  const first = await one(
    "SELECT board_position::text position FROM trackings WHERE organization_id=$1 AND stage=$2 ORDER BY board_position,id LIMIT 1",
    [organizationId, stage],
    db,
  );
  const rank = rankBetween(null, first?.position ?? null);
  if (rank !== null) return rank;
  await rebalance(organizationId, stage, db);
  return firstRadarPosition(organizationId, stage, db);
}
export async function ensureOrderedTracking(
  organizationId: string,
  opportunityId: string,
  db: Database,
) {
  await lockRadarOrder(organizationId, db);
  const existing = await one(
    "SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2",
    [organizationId, opportunityId],
    db,
  );
  if (existing) return existing;
  const position = await firstRadarPosition(organizationId, "IDENTIFIED", db);
  const created = await one(
    "INSERT INTO trackings(id,organization_id,opportunity_id,board_position) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
    [randomUUID(), organizationId, opportunityId, position],
    db,
  );
  if (created) {
    await bumpRadarOrder(organizationId, db);
    return created;
  }
  return one(
    "SELECT id FROM trackings WHERE organization_id=$1 AND opportunity_id=$2",
    [organizationId, opportunityId],
    db,
  );
}
export function radarOrderRoutes(router: Router) {
  router.post("/trackings/:id/order", async (req, res) => {
    const auth = current(req),
      trackingId = uuid.parse(req.params.id);
    const body = z
      .object({
        stage: z.enum(radarStages),
        beforeId: uuid.nullable(),
        revision: z.string().regex(/^(0|[1-9]\d{0,18})$/),
      })
      .strict()
      .parse(req.body);
    if (body.beforeId === trackingId)
      throw new HttpError(400, "Escolha outro cartão como destino.");
    const result = await transaction(async (db) => {
      const organization = await lockRadarOrder(auth.organization.id, db);
      const tracking = await one(
        `SELECT t.stage FROM trackings t JOIN opportunities o ON o.id=t.opportunity_id WHERE t.id=$1 AND t.organization_id=$2 AND ${visibility(auth, 2)} FOR UPDATE OF t`,
        [trackingId, auth.organization.id],
        db,
      );
      if (!tracking) throw new HttpError(404, "Participação não encontrada.");
      if (
        tracking.stage !== body.stage ||
        organization.revision !== body.revision
      )
        throw new HttpError(
          409,
          "O quadro foi reorganizado por outra pessoa. Atualize antes de mover este cartão.",
        );
      if (body.beforeId) {
        const target = await one(
          `SELECT t.stage FROM trackings t JOIN opportunities o ON o.id=t.opportunity_id WHERE t.id=$1 AND t.organization_id=$2 AND ${visibility(auth, 2)}`,
          [body.beforeId, auth.organization.id],
          db,
        );
        if (!target)
          throw new HttpError(404, "Cartão de destino não encontrado.");
        if (target.stage !== body.stage)
          throw new HttpError(
            409,
            "O cartão de destino mudou de etapa. Atualize o quadro.",
          );
      }
      const currentNext = await one(
        `SELECT id FROM trackings WHERE organization_id=$1 AND stage=$2 AND (board_position,id)>(SELECT board_position,id FROM trackings WHERE id=$3) ORDER BY board_position,id LIMIT 1`,
        [auth.organization.id, body.stage, trackingId],
        db,
      );
      if ((currentNext?.id ?? null) === body.beforeId)
        return { changed: false, orderRevision: organization.revision };
      async function neighbors() {
        const next = body.beforeId
          ? await one(
              "SELECT id,board_position::text position FROM trackings WHERE id=$1",
              [body.beforeId],
              db,
            )
          : null;
        const previous = await one(
          `SELECT board_position::text position FROM trackings WHERE organization_id=$1 AND stage=$2 AND id<>$3 ${next ? "AND (board_position,id)<($4::bigint,$5::uuid)" : ""} ORDER BY board_position DESC,id DESC LIMIT 1`,
          [
            auth.organization.id,
            body.stage,
            trackingId,
            ...(next ? [next.position, next.id] : []),
          ],
          db,
        );
        return {
          previous: previous?.position ?? null,
          next: next?.position ?? null,
        };
      }
      let adjacent = await neighbors(),
        position = rankBetween(adjacent.previous, adjacent.next);
      if (position === null) {
        await rebalance(auth.organization.id, body.stage, db);
        adjacent = await neighbors();
        position = rankBetween(adjacent.previous, adjacent.next);
      }
      if (position === null)
        throw new HttpError(
          409,
          "Não foi possível reorganizar esta etapa. Atualize e tente novamente.",
        );
      await db.query(
        "UPDATE trackings SET board_position=$3 WHERE id=$1 AND organization_id=$2",
        [trackingId, auth.organization.id, position],
      );
      const orderRevision = await bumpRadarOrder(auth.organization.id, db);
      await addEvent(
        trackingId,
        "REORDERED",
        "Posição no quadro ajustada",
        body.beforeId
          ? "Cartão reposicionado antes de outra participação na mesma etapa."
          : "Cartão reposicionado ao final da etapa.",
        auth.user.id,
        db,
      );
      return { changed: true, orderRevision };
    });
    res.json({ ...result, trackingId });
  });
}
