import type { Router } from "express";
import { z } from "zod";
import { one } from "./db.js";
import { getOpportunity } from "./data.js";
import { current, HttpError, rateLimit } from "./security.js";
import { fetchItems, itemPage, itemsUrl } from "./procurement-items.js";

const pending = new Map<string, Promise<unknown>>();
export function itemRoutes(router: Router) {
  router.get(
    "/opportunities/:id/items",
    rateLimit("procurement-items", 45, 60000),
    async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      const { page } = z.object({ page: itemPage }).strict().parse(req.query);
      const auth = current(req),
        opportunity = await getOpportunity(auth, id);
      if (
        auth.organization.isDemo ||
        !itemsUrl(opportunity.canonicalKey, page)
      ) {
        return res.json({
          supported: false,
          items: [],
          page,
          hasMore: false,
          notice:
            "Consulta de itens disponível para oportunidades reais com identificador PNCP.",
        });
      }
      const cached = await one(
        "SELECT payload,checked_at FROM opportunity_item_pages WHERE opportunity_id=$1 AND page=$2",
        [id, page],
      );
      if (
        cached &&
        Date.now() - new Date(cached.checked_at).getTime() < 3600000
      )
        return res.json({
          ...cached.payload,
          supported: true,
          page,
          checkedAt: cached.checked_at,
          stale: false,
        });
      const key = `${id}:${page}`;
      let work = pending.get(key);
      if (!work) {
        if (pending.size >= 8)
          throw new HttpError(
            503,
            "Há várias consultas em andamento. Tente novamente em instantes.",
          );
        work = (async () => {
          const payload = await fetchItems(opportunity.canonicalKey, page);
          const saved = await one(
            `INSERT INTO opportunity_item_pages(opportunity_id,page,payload,checked_at) VALUES($1,$2,$3,now())
          ON CONFLICT(opportunity_id,page) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at RETURNING checked_at`,
            [id, page, JSON.stringify(payload)],
          );
          return {
            ...payload,
            supported: true,
            page,
            checkedAt: saved.checked_at,
            stale: false,
          };
        })().finally(() => pending.delete(key));
        pending.set(key, work);
      }
      try {
        return res.json(await work);
      } catch {
        if (cached)
          return res.json({
            ...cached.payload,
            supported: true,
            page,
            checkedAt: cached.checked_at,
            stale: true,
            notice:
              "Não foi possível consultar o PNCP agora. Exibindo a última consulta salva; confirme os dados na fonte.",
          });
        throw new HttpError(
          502,
          "O PNCP não respondeu com uma lista válida de itens. Tente novamente em instantes.",
        );
      }
    },
  );
}
