import {wordVariants,synonymGroups,smartNormalize} from './scoring.js';
const literal=(s:string)=>`'${s.replace(/'/g,"''")}'`;
// Same normalization vocabulary as the application; persisted by a database trigger.
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').map(w=>wordVariants[w]??w).filter(w=>!['de','da','do','das','dos'].includes(w)).join(' ');
export const searchSchemaSql=`
CREATE OR REPLACE FUNCTION search_normalize(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT trim(regexp_replace(lower(regexp_replace(normalize(coalesce(value,''),NFD),'['||chr(768)||'-'||chr(879)||']','','g')),'[^a-z0-9]+',' ','g'))
$$;
CREATE OR REPLACE FUNCTION search_smart(value text) RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE result text;
BEGIN
 SELECT ' '||coalesce(string_agg(coalesce(${literal(JSON.stringify(wordVariants))}::jsonb->>token,token),' ' ORDER BY ord),'')||' ' INTO result
 FROM unnest(string_to_array(search_normalize(value),' ')) WITH ORDINALITY words(token,ord)
 WHERE token NOT IN ('de','da','do','das','dos');
 ${synonymGroups.flatMap(group=>group.map(term=>`result := replace(result,${literal(' '+fold(term)+' ')},${literal(' '+fold(group[0])+' ')});`)).join('\n')}
 RETURN trim(result);
END $$;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS search_tokens text[];
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS match_text text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS city_search text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS agency_search text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS modality_search text;
CREATE OR REPLACE FUNCTION update_opportunity_search() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.match_text:=search_smart(NEW.title||' '||coalesce(NEW.description,''));
 NEW.search_tokens:=string_to_array(search_smart(NEW.title||' '||coalesce(NEW.description,'')||' '||coalesce(NEW.agency,'')||' '||coalesce(NEW.city,'')||' '||NEW.canonical_key),' ');
 NEW.city_search:=search_normalize(NEW.city); NEW.agency_search:=search_normalize(NEW.agency); NEW.modality_search:=search_normalize(NEW.modality);
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER opportunities_search_trigger BEFORE INSERT OR UPDATE OF title,description,agency,city,canonical_key,modality ON opportunities FOR EACH ROW EXECUTE FUNCTION update_opportunity_search();
UPDATE opportunities SET title=title WHERE search_tokens IS NULL;
CREATE INDEX IF NOT EXISTS opportunities_tokens_gin ON opportunities USING gin(search_tokens);
CREATE INDEX IF NOT EXISTS opportunities_public_newest ON opportunities(published_at DESC NULLS LAST,id) WHERE demo_org_id IS NULL;
CREATE INDEX IF NOT EXISTS opportunities_demo_newest ON opportunities(demo_org_id,published_at DESC NULLS LAST,id);
CREATE INDEX IF NOT EXISTS opportunity_sources_lookup ON opportunity_sources(opportunity_id,source_code);
`;
