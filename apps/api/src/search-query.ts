import {normalize,smartNormalize,stopWords,type Profile} from './scoring.js';
export function scoreSql(profile:Profile,offerings:any[],bind:(v:unknown)=>string){
 const array=(values:string[])=>bind([...new Set(values.map(smartNormalize).filter(Boolean))])+'::text[]';
 const contains=(values:string[])=>`EXISTS(SELECT 1 FROM unnest(${array(values)}) term WHERE position(' '||term||' ' in ' '||o.match_text||' ')>0)`;
 const count=`(SELECT count(*) FROM unnest(${array(profile.keywords)}) term WHERE position(' '||term||' ' in ' '||o.match_text||' ')>0)`;
 const offerTokens=offerings.filter(o=>o.active!==false).flatMap(o=>[...(o.keywords??[]),...normalize(o.name).split(' ').filter(t=>t.length>3&&!stopWords.has(t))]);
 const commercial=`CASE WHEN ${count}>0 THEN LEAST(60,40+10*${count}) ELSE 0 END + CASE WHEN ${contains(offerTokens)} THEN CASE WHEN ${count}>0 THEN 20 ELSE 60 END ELSE 0 END`;
 const states=profile.states.length?bind(profile.states)+'::text[]':'ARRAY[]::text[]';
 const region=profile.states.length?`CASE WHEN o.state=ANY(${states}) THEN 10 ELSE 0 END`:'0';
 const city=profile.cities.length?`CASE WHEN o.city_search=ANY(${bind(profile.cities.map(normalize))}::text[]) THEN 5 ELSE 0 END`:'0';
 const modality=profile.modalities.length?`CASE WHEN EXISTS(SELECT 1 FROM unnest(${bind(profile.modalities.map(normalize))}::text[]) term WHERE o.modality_search=term OR left(o.modality_search,length(term)+1)=term||' ') THEN 5 ELSE 0 END`:'0';
 const bounds:string[]=[];if(profile.minValue!==null)bounds.push(`o.value>=${bind(profile.minValue)}`);if(profile.maxValue!==null)bounds.push(`o.value<=${bind(profile.maxValue)}`);
 const value=bounds.length?`CASE WHEN o.value IS NULL THEN 0 WHEN ${bounds.join(' AND ')} THEN 5 ELSE -20 END`:'0';
 const outside=profile.states.length?`CASE WHEN o.state IS NOT NULL AND o.state<>'' AND NOT(o.state=ANY(${states})) THEN 0.45 ELSE 1 END`:'1';
 return `CASE WHEN ${contains(profile.excludedKeywords)} THEN 0 ELSE LEAST(100,ROUND(GREATEST(0,(${commercial})+(${region})+(${city})+(${modality})+(${value}))*(${outside})))::int END`;
}
