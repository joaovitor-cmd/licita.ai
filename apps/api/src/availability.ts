// Same eligibility rule for dashboard counts, distributions and the open-search filter.
// Dates/status are the latest stored source data, not a guarantee of live portal availability.
export const openOpportunitySql = `o.closes_at>now()
 AND (o.opens_at IS NULL OR o.opens_at<=now())
 AND lower(coalesce(o.status,'')) !~ 'cancel|revog|anulad|suspens|conclu|encerr|homolog|adjudic|desert|fracass|finaliz'`;
export function recommendationThreshold(value: unknown) {
 return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : 60;
}
export function deadlineSummary(trackings: any[], now = Date.now()) {
 const active=trackings.filter(t=>!['WON','LOST','DISCARDED'].includes(t.stage));
 const time=(t:any)=>new Date(t.deadline || t.opportunity.closesAt || '').getTime();
 const dated=active.filter(t=>Number.isFinite(time(t)));
 return {
  urgent:dated.filter(t=>time(t)>=now && time(t)<=now+7*86400000).length,
  overdue:dated.filter(t=>time(t)<now).length,
  deadlines:dated.sort((a,b)=>time(a)-time(b)).slice(0,6),
 };
}
