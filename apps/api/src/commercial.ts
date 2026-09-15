import type { Router } from "express";
import { one } from "./db.js";
import { current } from "./security.js";
import { commercialQuery, outcomeLabels, winRate } from "./commercial-rules.js";
export function commercialRoutes(router: Router) {
  router.get("/commercial-options", (_req, res) => res.json(outcomeLabels));
  router.get("/commercial-report", async (req, res) => {
    const q = commercialQuery.parse(req.query),
      org = current(req).organization.id;
    const result = await one(
      `WITH cohort AS MATERIALIZED (
    SELECT t.*,o.title,o.agency,o.state,u.name owner_name FROM trackings t JOIN opportunities o ON o.id=t.opportunity_id
    LEFT JOIN members m ON m.organization_id=t.organization_id AND m.user_id=t.owner_id LEFT JOIN users u ON u.id=m.user_id
    WHERE t.organization_id=$1 AND ($2::date IS NULL OR t.created_at>=($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo'))
    AND ($3::date IS NULL OR t.created_at<(($3::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
    AND ($4::uuid IS NULL OR t.owner_id=$4)
   ), filtered AS MATERIALIZED (SELECT * FROM cohort WHERE $5::text IS NULL OR stage=$5),
   summary AS (SELECT count(*)::integer total,
    count(*) FILTER(WHERE stage='WON')::integer won,count(*) FILTER(WHERE stage='LOST')::integer lost,
    count(*) FILTER(WHERE stage='DISCARDED')::integer discarded,
    count(*) FILTER(WHERE stage NOT IN ('WON','LOST','DISCARDED'))::integer active,
    count(*) FILTER(WHERE owner_id IS NULL AND stage NOT IN ('WON','LOST','DISCARDED'))::integer without_owner,
    count(*) FILTER(WHERE stage IN ('WON','LOST','DISCARDED') AND outcome_category IS NULL)::integer unclassified,
    count(*) FILTER(WHERE stage NOT IN ('WON','LOST','DISCARDED') AND expected_value IS NULL)::integer active_value_missing,
    coalesce(sum(expected_value) FILTER(WHERE stage NOT IN ('WON','LOST','DISCARDED')),0)::text active_value,
    count(*) FILTER(WHERE stage='WON' AND expected_value IS NULL)::integer won_value_missing,
    coalesce(sum(expected_value) FILTER(WHERE stage='WON'),0)::text won_value FROM cohort),
   stages AS (SELECT stage,count(*)::integer count FROM cohort GROUP BY stage),
   reasons AS (SELECT stage,coalesce(outcome_category,'UNCLASSIFIED') category,count(*)::integer count FROM cohort WHERE stage IN ('WON','LOST','DISCARDED') GROUP BY stage,outcome_category),
   months AS (SELECT to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM') AS "month",count(*)::integer entered,count(*) FILTER(WHERE stage='WON')::integer won,count(*) FILTER(WHERE stage='LOST')::integer lost,count(*) FILTER(WHERE stage='DISCARDED')::integer discarded FROM cohort GROUP BY 1 ORDER BY 1 DESC LIMIT 24),
   history AS (SELECT id,title,agency,state,stage,owner_name,expected_value::text,outcome_reason,outcome_category,created_at,updated_at FROM filtered ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET $6)
   SELECT (SELECT row_to_json(summary) FROM summary) summary,
    (SELECT count(*)::integer FROM tasks k JOIN cohort t ON t.id=k.tracking_id WHERE NOT k.done AND t.stage NOT IN ('WON','LOST','DISCARDED')) pending_tasks,
    coalesce((SELECT jsonb_agg(stages) FROM stages),'[]') stages,
    coalesce((SELECT jsonb_agg(reasons ORDER BY count DESC,stage,category) FROM reasons),'[]') reasons,
    coalesce((SELECT jsonb_agg(months ORDER BY "month" DESC) FROM months),'[]') months,
    (SELECT count(*)::integer FROM filtered) total,
    coalesce((SELECT jsonb_agg(history ORDER BY created_at DESC,id DESC) FROM history),'[]') items`,
      [
        org,
        q.from ?? null,
        q.to ?? null,
        q.ownerId ?? null,
        q.stage ?? null,
        (q.page - 1) * 25,
      ],
    );
    res.json({
      ...result,
      summary: {
        ...result.summary,
        pending_tasks: result.pending_tasks,
        win_rate: winRate(result.summary.won, result.summary.lost),
      },
      reasonLabels: outcomeLabels,
      page: q.page,
      pages: Math.max(1, Math.ceil(result.total / 25)),
    });
  });
}
