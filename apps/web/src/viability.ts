export const initialInputs = {monoPages:0,colorPages:0,monoIncluded:0,colorIncluded:0,monoPrice:0,colorPrice:0,monoCost:0,colorCost:0,fixedRevenue:0,equipment:0,operations:0,taxPercent:0,targetMargin:20,months:12};
export type ViabilityInputs = typeof initialInputs;
export function calculateViability(v:ViabilityInputs) {
  // Legacy scenarios have no included-volume fields. Their per-page model is preserved.
  const monoBillable=Math.max(0,v.monoPages-(v.monoIncluded??0));
  const colorBillable=Math.max(0,v.colorPages-(v.colorIncluded??0));
  const revenue=v.fixedRevenue+monoBillable*v.monoPrice+colorBillable*v.colorPrice;
  const operatingCost=v.equipment+v.operations+v.monoPages*v.monoCost+v.colorPages*v.colorCost;
  const tax=revenue*v.taxPercent/100;
  const profit=revenue-operatingCost-tax;
  const denominator=1-(v.taxPercent+v.targetMargin)/100;
  return {revenue,operatingCost,tax,monoBillable,colorBillable,totalCost:operatingCost+tax,profit,margin:revenue>0?profit/revenue*100:null,targetRevenue:denominator>0?operatingCost/denominator:null,contractProfit:profit*v.months};
}
