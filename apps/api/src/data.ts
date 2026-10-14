import { randomUUID } from "node:crypto";
import { type Database, one, pool, rows, transaction } from "./db.js";
import { current, HttpError, type Auth } from "./security.js";
import {
  defaultProfile,
  normalize,
  type Profile,
  scoreOpportunity,
} from "./scoring.js";
import { searchSchema } from "./validation.js";
import {enqueueEmail} from './email-queue.js';
import {scoreSql} from './search-query.js';
import {opportunityIdentifiers,identifierMetadataSql} from './opportunity-identifiers.js';
import {opportunityFilterSql} from './search-filter-sql.js';

export const iso = (date: any): string | null =>
  date ? new Date(date).toISOString() : null;
export async function getProfile(
  auth: Auth,
  db: Database = pool,
): Promise<Profile> {
  const org = await one(
    "SELECT name,tax_id,profile,company_revision FROM organizations WHERE id=$1",
    [auth.organization.id],
    db,
  );
  return {
    ...defaultProfile,
    ...org.profile,
    organizationName: org.name,
    taxId: org.tax_id,
    companyRevision:org.company_revision,
  };
}
export function mapCatalog(row: any) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    category: row.category,
    keywords: row.keywords,
    active: row.active,
    updatedAt: iso(row.updated_at),
    unit: row.unit ?? null,
    unitCost: row.unit_cost == null ? null : Number(row.unit_cost),
    salePrice: row.sale_price == null ? null : Number(row.sale_price),
    priceBasis: row.price_basis ?? null,
  };
}
export async function catalog(auth: Auth, db: Database = pool) {
  return (
    await rows(
      "SELECT * FROM catalog WHERE organization_id=$1 ORDER BY active DESC,name",
      [auth.organization.id],
      db,
    )
  ).map(mapCatalog);
}
export const visibility = (auth: Auth, offset = 1) =>
  auth.organization.isDemo
    ? `o.demo_org_id=$${offset}`
    : "o.demo_org_id IS NULL";

export function mapOpportunity(row: any, profile: Profile, offerings: any[]) {
  const item = {
    id: row.id,
    ...opportunityIdentifiers(row),
    canonicalKey: row.canonical_key,
    title: row.title,
    description: row.description,
    agency: row.agency,
    state: row.state,
    city: row.city,
    modality: row.modality,
    sphere: row.sphere,
    value: row.value === null ? null : Number(row.value),
    publishedAt: iso(row.published_at),
    opensAt: iso(row.opens_at),
    closesAt: iso(row.closes_at),
    status: row.status,
    url: row.url,
    sourceCode: row.source_code,
    sourceName: row.source_name,
    syncedAt: iso(row.synced_at),
    isDemo: !!row.demo_org_id,
    documents: row.documents ?? [],
    attachmentWarning: row.attachment_error ?? undefined,
    trackingId: row.tracking_id ?? null,
  };
  return {
    ...item,
    match: scoreOpportunity(
      item,
      profile,
      offerings.filter((o) => o.active),
    ),
  };
}

export async function getOpportunity(
  auth: Auth,
  id: string,
  db: Database = pool,
) {
  const row = await one(
    `SELECT o.*, t.id tracking_id FROM opportunities o
    LEFT JOIN trackings t ON t.opportunity_id=o.id AND t.organization_id=$2
    WHERE o.id=$1 AND ${auth.organization.isDemo ? "o.demo_org_id=$2" : "o.demo_org_id IS NULL"}`,
    [id, auth.organization.id],
    db,
  );
  if (!row) throw new HttpError(404, "Oportunidade não encontrada.");
  const [profile, offerings] = await Promise.all([
    getProfile(auth, db),
    catalog(auth, db),
  ]);
  return mapOpportunity(row, profile, offerings);
}

export async function searchOpportunities(auth: Auth, query: unknown) {
  const q = searchSchema.parse(query);
  const values: unknown[] = [auth.organization.id];
  const where = [visibility(auth)];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  where.push(...opportunityFilterSql(q,bind));
  const [profile,offerings]=await Promise.all([getProfile(auth),catalog(auth)]);
  const ids=[...new Set(q.searchProfiles.split(',').map(id=>id.trim().toLowerCase()).filter(Boolean))];
  const foundProfiles=ids.length?await rows('SELECT id,name,revision,filters FROM search_profiles WHERE organization_id=$1 AND active AND id=ANY($2::uuid[])',[auth.organization.id,ids]):[];
  if(foundProfiles.length!==ids.length)throw new HttpError(400,'Um dos perfis selecionados não está disponível nesta empresa. Atualize a seleção; perfis pausados não participam da busca.');
  const selectedProfiles=ids.map(id=>foundProfiles.find(profile=>profile.id===id)!);
  const profileRules=selectedProfiles.map(saved=>({saved,filters:searchSchema.parse(saved.filters)}));
  const predicates=profileRules.map(rule=>opportunityFilterSql(rule.filters,bind).join(' AND ')||'TRUE');
  if(predicates.length)where.push(`(${predicates.map(predicate=>`(${predicate})`).join(' OR ')})`);
  const needsScore=q.sort==='score'||q.minScore!==undefined||profileRules.some(rule=>rule.filters.minScore!==undefined);
  const rank=needsScore?scoreSql(profile,offerings,bind):'0';
  const threshold=q.minScore===undefined?'TRUE':`rank_score>=${bind(q.minScore)}`;
  const profileScoreChecks=profileRules.map(rule=>rule.filters.minScore===undefined?'TRUE':`rank_score>=${bind(rule.filters.minScore)}`);
  const unionThreshold=predicates.length?` AND (${predicates.map((_,index)=>`(match_profile_${index} AND ${profileScoreChecks[index]})`).join(' OR ')})`:'';
  const matchColumns=predicates.map((predicate,index)=>`,(${predicate}) match_profile_${index}`).join('');
  const matchMetadata=profileRules.length?`coalesce((SELECT jsonb_agg(profile ORDER BY ordinal) FROM (VALUES ${profileRules.map((rule,index)=>`(${index},CASE WHEN p.match_profile_${index} AND ${profileScoreChecks[index]==='TRUE'?'TRUE':'p.'+profileScoreChecks[index]} THEN jsonb_build_object('id',${bind(rule.saved.id)}::text,'name',${bind(rule.saved.name)}::text,'revision',${bind(rule.saved.revision)}::int) END)`).join(',')}) matched(ordinal,profile) WHERE profile IS NOT NULL),'[]'::jsonb)`:`'[]'::jsonb`;
  const orders={score:'rank_score DESC,published_at DESC NULLS LAST,id',newest:'published_at DESC NULLS LAST,id',deadline:'closes_at ASC NULLS LAST,id',value:'value DESC NULLS LAST,id'};
  const limit=bind(q.pageSize),offset=bind((q.page-1)*q.pageSize);
  // Count and page share one database snapshot. Only the requested rows cross the connection.
  const result=await one(`WITH candidates AS MATERIALIZED (
    SELECT o.id,o.published_at,o.closes_at,o.value,${rank} rank_score${matchColumns} FROM opportunities o WHERE ${where.join(' AND ')}
  ), filtered AS MATERIALIZED (SELECT * FROM candidates WHERE ${threshold}${unionThreshold}),
  page AS (SELECT * FROM filtered ORDER BY ${orders[q.sort]} LIMIT ${limit} OFFSET ${offset})
  SELECT (SELECT count(*)::int FROM filtered) total,coalesce((SELECT jsonb_agg(record ORDER BY position) FROM (
    SELECT o.id,o.public_code,o.canonical_key,o.title,o.description,o.agency,o.state,o.city,o.modality,o.sphere,o.value,o.published_at,o.opens_at,o.closes_at,o.status,o.url,o.source_code,o.source_name,o.synced_at,o.demo_org_id,o.documents,o.attachment_error,${identifierMetadataSql} identifier_metadata,t.id tracking_id,${matchMetadata} matched_search_profiles,
    row_number() OVER(ORDER BY ${orders[q.sort].split(',').map(part=>'p.'+part).join(',')}) position
    FROM page p JOIN opportunities o ON o.id=p.id LEFT JOIN trackings t ON t.opportunity_id=o.id AND t.organization_id=$1
  ) record),'[]'::jsonb) items`,values);
  const total=Number(result.total),page=q.page;
  const items=result.items.map((row:any)=>({...mapOpportunity(row,profile,offerings),matchedSearchProfiles:row.matched_search_profiles??[]}));
  return {
    items,
    searchProfiles:selectedProfiles.map(saved=>({id:saved.id,name:saved.name,revision:saved.revision})),
    total,
    page,
    pageSize: q.pageSize,
    pages: Math.ceil(total / q.pageSize),
  };
}

export const mapTask = (r: any) => ({
  id: r.id,
  title: r.title,
  done: r.done,
  deadline: iso(r.deadline),
  ownerId: r.owner_id,
});
export const mapEvent = (r: any) => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  createdAt: iso(r.created_at),
});
export async function ensureTracking(
  auth: Auth,
  id: string,
  db: Database = pool,
) {
  const row = await one(
    "SELECT * FROM trackings WHERE id=$1 AND organization_id=$2",
    [id, auth.organization.id],
    db,
  );
  if (!row) throw new HttpError(404, "Acompanhamento não encontrado.");
  return row;
}
export async function ensureOwner(
  auth: Auth,
  ownerId: string | null | undefined,
  db: Database = pool,
) {
  if (
    ownerId &&
    !(await one(
        "SELECT 1 FROM members WHERE user_id=$1 AND organization_id=$2 AND active",
      [ownerId, auth.organization.id],
      db,
    ))
  )
    throw new HttpError(400, "O responsável deve pertencer à sua empresa.");
}
export async function getTracking(auth: Auth, id: string, db: Database = pool) {
  const row = await ensureTracking(auth, id, db);
  const [opportunity, tasks, events, changes] = await Promise.all([
    getOpportunity(auth, row.opportunity_id, db),
    rows(
      "SELECT * FROM tasks WHERE tracking_id=$1 ORDER BY created_at,id",
      [id],
      db,
    ),
    rows(
      "SELECT * FROM events WHERE tracking_id=$1 ORDER BY created_at DESC,id",
      [id],
      db,
    ),
    one(`SELECT count(*)::int pending FROM opportunity_changes c WHERE c.opportunity_id=$1 AND NOT EXISTS
      (SELECT 1 FROM opportunity_change_reviews r WHERE r.organization_id=$2 AND r.change_id=c.id)`,[row.opportunity_id,auth.organization.id],db),
  ]);
  row.pending_changes=changes?.pending??0;
  return mapTracking(row,opportunity,tasks,events);
}
function mapTracking(row:any,opportunity:any,tasks:any[],events:any[]){
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    opportunity,
    pendingChanges: row.pending_changes ?? 0,
    boardPosition: String(row.board_position),
    stage: row.stage,
    ownerId: row.owner_id,
    deadline: iso(row.deadline),
    expectedValue:
      row.expected_value === null ? null : Number(row.expected_value),
    outcomeReason: row.outcome_reason,
    outcomeCategory: row.outcome_category,
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    tasks: tasks.map(mapTask),
    events: events.map(mapEvent),
  };
}
export async function listTrackings(auth: Auth, ids?:string[]) {
  if(ids?.length===0)return [];
  const values=ids?[auth.organization.id,ids]:[auth.organization.id];
  const scope=ids?' AND t.id=ANY($2::uuid[])':'';
  // Fixed query count; histories are loaded on the selected participation only.
  const [found,tasks,profile,offerings]=await Promise.all([
    rows(`SELECT t.*, (SELECT count(*)::int FROM opportunity_changes c WHERE c.opportunity_id=t.opportunity_id AND NOT EXISTS
      (SELECT 1 FROM opportunity_change_reviews r WHERE r.organization_id=t.organization_id AND r.change_id=c.id)) pending_changes,
      (to_jsonb(o)-'raw'-'match_text'-'search_tokens') ||
      jsonb_build_object('identifier_metadata',${identifierMetadataSql},'tracking_id',t.id) opportunity_row
      FROM trackings t JOIN opportunities o ON o.id=t.opportunity_id
      WHERE t.organization_id=$1 AND ${visibility(auth)}${scope} ORDER BY t.updated_at DESC,t.id`,values),
    rows(`SELECT task.* FROM tasks task JOIN trackings t ON t.id=task.tracking_id WHERE t.organization_id=$1${scope} ORDER BY task.created_at,task.id`,values),
    getProfile(auth),catalog(auth),
  ]);
  const grouped=new Map<string,any[]>();
  for(const task of tasks){const group=grouped.get(task.tracking_id)??[];group.push(task);grouped.set(task.tracking_id,group);}
  return found.map(row=>mapTracking(row,mapOpportunity(row.opportunity_row,profile,offerings),grouped.get(row.id)??[],[]));
}
export async function radarPage(auth:Auth, input:{q:string;owner?:string;highlight?:string;includeClosed:boolean;changesOnly:boolean;view:'board'|'list';stage?:string;page:number}) {
  const organization=await one('SELECT radar_order_revision::text revision FROM organizations WHERE id=$1',[auth.organization.id]);
  const args:unknown[]=[auth.organization.id],conditions=[`t.organization_id=$1`,visibility(auth)];
  const bind=(value:unknown)=>{args.push(value);return `$${args.length}`;};
  if(input.q){const pattern=bind('%'+input.q.replace(/[\\%_]/g,'\\$&')+'%');conditions.push(`(o.title ILIKE ${pattern} OR o.agency ILIKE ${pattern})`);}
  if(input.owner)conditions.push(`t.owner_id=${bind(input.owner)}::uuid`);
  if(!input.includeClosed)conditions.push("t.stage NOT IN ('WON','LOST','DISCARDED')");
  if(input.changesOnly)conditions.push(`EXISTS(SELECT 1 FROM opportunity_changes c WHERE c.opportunity_id=t.opportunity_id AND NOT EXISTS(SELECT 1 FROM opportunity_change_reviews r WHERE r.organization_id=t.organization_id AND r.change_id=c.id))`);
  const from=`FROM trackings t JOIN opportunities o ON o.id=t.opportunity_id WHERE ${conditions.join(' AND ')}`;
  const grouped=await rows(`SELECT t.stage,count(*)::int count,sum(coalesce(t.expected_value,o.value)) potential,count(*) FILTER(WHERE t.expected_value IS NULL AND o.value IS NULL)::int unknown_values,sum((SELECT count(*) FROM tasks task WHERE task.tracking_id=t.id AND NOT task.done))::int pending_tasks ${from} GROUP BY t.stage`,args);
  const pageArgs=[...args],limit=input.view==='board'?25:50;
  let pageFrom=from;
  if(input.stage){pageArgs.push(input.stage);pageFrom+=` AND t.stage=$${pageArgs.length}`;}
  pageArgs.push((input.page-1)*limit,input.page*limit);
  const selected=await rows(`WITH ranked AS (SELECT t.id,t.stage,row_number() OVER(${input.view==='board'?'PARTITION BY t.stage ':''}ORDER BY ${input.view==='board'?'t.board_position,t.id':'t.updated_at DESC,t.id'}) position ${pageFrom}) SELECT id,stage FROM ranked WHERE position>$${pageArgs.length-1} AND position<=$${pageArgs.length} ORDER BY position,id`,pageArgs);
  if(input.highlight&&input.view==='board'&&input.page===1&&!input.stage&&!selected.some(row=>row.id===input.highlight)){
    const focused=await rows(`SELECT t.id ${from} AND t.id=$${args.length+1}::uuid`,[...args,input.highlight]);
    selected.push(...focused);
  }
  const loaded=await listTrackings(auth,selected.map(row=>row.id)),byId=new Map(loaded.map(item=>[item.id,item]));
  const items=selected.map(row=>byId.get(row.id)).filter(item=>item!==undefined);
  const stages=grouped.map(row=>({stage:row.stage,count:row.count,potential:row.potential===null?null:Number(row.potential),unknownValues:row.unknown_values,pendingTasks:row.pending_tasks,hasMore:row.count>input.page*limit}));
  const active=stages.filter(row=>!['WON','LOST','DISCARDED'].includes(row.stage));
  const total=stages.reduce((sum,row)=>sum+row.count,0),pageTotal=input.stage?stages.find(row=>row.stage===input.stage)?.count??0:total;
  const hasMore=input.view==='list'?pageTotal>input.page*limit:stages.some(row=>(!input.stage||row.stage===input.stage)&&row.hasMore);
  return {items,orderRevision:organization.revision,page:input.page,pageSize:limit,view:input.view,stages,total,pageTotal,hasMore,summary:{active:active.reduce((sum,row)=>sum+row.count,0),potential:active.every(row=>row.potential===null)?null:active.reduce((sum,row)=>sum+(row.potential??0),0),unknownValues:active.reduce((sum,row)=>sum+row.unknownValues,0),pendingTasks:active.reduce((sum,row)=>sum+row.pendingTasks,0)}};
}
export async function addEvent(
  trackingId: string,
  type: string,
  title: string,
  description = "",
  actorId: string | null = null,
  db: Database = pool,
) {
  return mapEvent(
    await one(
      `INSERT INTO events(id,tracking_id,type,title,description,actor_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [randomUUID(), trackingId, type, title, description, actorId],
      db,
    ),
  );
}
export async function notify(
  organizationId: string,
  title: string,
  description: string,
  url: string,
  dedupeKey: string | null = null,
  skipEmail = false,
) {
  const org = await one(
    "SELECT preferences,is_demo,active FROM organizations WHERE id=$1",
    [organizationId],
  );
  if (!org || org.active===false) return;
  await transaction(async db=>{
  const inserted = await one(
    `INSERT INTO notifications(id,organization_id,title,description,url,dedupe_key,read)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,dedupe_key) DO NOTHING RETURNING id`,
    [
      randomUUID(),
      organizationId,
      title,
      description,
      url,
      dedupeKey,
      !org.preferences.inApp,
    ],
    db,
  );
  if (inserted && org.preferences.email && !org.is_demo && !skipEmail) {
    const members = await rows(
      "SELECT u.email FROM users u JOIN members m ON m.user_id=u.id WHERE m.organization_id=$1 AND m.role='ADMIN'",
      [organizationId],
      db,
    );
    for (const member of members) {
      await enqueueEmail(db,organizationId,inserted.id,member.email,title,`${description}\n\n${process.env.APP_URL ?? "http://localhost:5173"}${url}`);
    }
  }
  });
}
