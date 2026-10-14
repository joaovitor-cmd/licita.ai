import type {Request,Response,NextFunction} from 'express';
import {one,type Database,pool} from './db.js';
import {current,HttpError} from './security.js';
export const featureCatalog=['discovery','radar','catalog','documents','analysis','simulator','digest','changeAlerts','commercialHistory'] as const;
export async function entitlements(org:string,db:Database=pool){
 const r=await one(`SELECT e.id environment_id,(e.active AND o.active) active,p.name plan_name,p.max_companies,p.enforce_features,p.planned_features,
 (SELECT count(*)::int FROM organizations c WHERE (c.id=e.id OR c.environment_id=e.id) AND c.active) company_count
 FROM organizations o JOIN organizations e ON e.id=coalesce(o.environment_id,o.id) JOIN commercial_plans p ON p.code=e.plan_code WHERE o.id=$1`,[org],db);
 if(!r)throw new HttpError(403,'Ambiente não disponível.');
 return {...r,features:r.enforce_features?r.planned_features:[...featureCatalog],multiCompany:r.max_companies>1};
}
export function routeFeature(path:string):string|null{
 if(/^\/opportunities\/[^/]+\/(analysis)/.test(path))return 'analysis';
 if(/^\/proposals|^\/opportunities\/[^/]+\/proposal/.test(path))return 'discovery';
 if(/^\/opportunities\/[^/]+\/changes|^\/opportunity-relations|^\/change-alert/.test(path))return 'changeAlerts';
 if(/^\/opportunities\/[^/]+\/(preparation|checklist)|^\/checklist|^\/trackings|^\/radar-settings/.test(path))return 'radar';
 if(/^\/opportunities|^\/search-profiles|^\/agency-watches/.test(path))return 'discovery';
 if(/^\/catalog/.test(path))return 'catalog';
 if(/^\/documents/.test(path))return 'documents';
 if(/^\/simulation/.test(path))return 'simulator';
 if(/^\/digest/.test(path))return 'digest';
 if(/^\/commercial/.test(path))return 'commercialHistory';
 return null;
}
export async function enforcePlan(req:Request,_res:Response,next:NextFunction){
 const feature=routeFeature(req.path);if(!feature||current(req).isPlatformAdmin)return next();
 const plan=await entitlements(current(req).organization.id);
 if(!plan.active||!plan.features.includes(feature))throw new HttpError(403,'Esta funcionalidade não está incluída no plano do seu ambiente.');
 next();
}
