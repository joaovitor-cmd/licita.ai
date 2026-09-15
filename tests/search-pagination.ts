import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../apps/api/src/db.js';
import {searchOpportunities,mapOpportunity} from '../apps/api/src/data.js';
import {defaultProfile,smartNormalize,scoreOpportunity} from '../apps/api/src/scoring.js';
import {scoreSql} from '../apps/api/src/search-query.js';
test('paginação SQL preserva aderência, filtros, total e isolamento',async()=>{
 await migrate();const org=randomUUID();
 const profile={...defaultProfile,keywords:['outsourcing de impressão','computadores','bilhetagem'],excludedKeywords:['usados'],states:['RS'],cities:['Porto Alegre'],modalities:['Pregão eletrônico'],minValue:100,maxValue:500000};
 const auth={organization:{id:org,isDemo:true}} as any;
 try{await pool.query('INSERT INTO organizations(id,name,is_demo,profile) VALUES($1,$2,true,$3)',[org,'QA paginação',JSON.stringify(profile)]);
 for(let i=0;i<37;i++)await pool.query('INSERT INTO opportunities(id,canonical_key,title,description,agency,state,city,modality,value,published_at,closes_at,source_code,source_name,demo_org_id,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[randomUUID(),`qa-page-${org}-${i}`,i%3===0?'Terceirização de impressões':i%3===1?'Computadores':'Software de bilhetagem',i%7===0?'Equipamentos usados':'Equipamentos novos','Órgão de teste',i%2?'RS':'SC',i%2?'Porto Alegre':'Florianópolis','Pregão - Eletrônico',i%5?1000+i:null,new Date(Date.now()-i*60000),new Date(Date.now()+i*60000),'pncp','QA',org,'qa-pagination']);
 const all=(await pool.query('SELECT * FROM opportunities WHERE demo_org_id=$1',[org])).rows;
 const values:unknown[]=[org];const expression=scoreSql(profile,[],v=>{values.push(v);return '$'+values.length;});
 const sqlScores=(await pool.query(`SELECT id,${expression} score FROM opportunities o WHERE demo_org_id=$1`,values)).rows;
 for(const row of all)assert.equal(sqlScores.find(s=>s.id===row.id).score,mapOpportunity(row,profile,[]).match.score,row.title);
 for(const text of ['São José — Impressões','Aluguel de impressoras','Software de bilhetagem','Terceirização de impressão'])assert.equal((await pool.query('SELECT search_smart($1) value',[text])).rows[0].value,smartNormalize(text));
 const first=await searchOpportunities(auth,{pageSize:12}),second=await searchOpportunities(auth,{pageSize:12,page:2});assert.equal(first.total,37);assert.equal(first.items.length,12);assert.equal(first.pages,4);assert.equal(second.items.length,12);assert.equal(first.items.some((a:any)=>second.items.some((b:any)=>a.id===b.id)),false);
 const expected=all.map(row=>mapOpportunity(row,profile,[])).sort((a,b)=>b.match.score-a.match.score||new Date(b.publishedAt!).getTime()-new Date(a.publishedAt!).getTime()||a.id.localeCompare(b.id));assert.deepEqual(first.items.map((v:any)=>v.id),expected.slice(0,12).map(v=>v.id));
 const filtered=await searchOpportunities(auth,{q:'outsourcing de impressão',state:'RS',minScore:60,pageSize:5});assert.ok(filtered.items.every((v:any)=>v.state==='RS'&&v.match.score>=60));assert.equal(filtered.total,all.filter(r=>r.title.startsWith('Terceirização')&&r.state==='RS'&&mapOpportunity(r,profile,[]).match.score>=60).length);
 const empty=await searchOpportunities(auth,{page:100});assert.equal(empty.items.length,0);assert.equal(empty.total,37);
 for(const sort of ['newest','deadline','value'])assert.equal((await searchOpportunities(auth,{sort,pageSize:3})).items.length,3);
 const other=await searchOpportunities({organization:{id:randomUUID(),isDemo:true}} as any,{}).catch(()=>null);assert.ok(other===null||other.total===0);
 const realAuth={organization:{id:org,isDemo:false}} as any;const start=performance.now();const real=await searchOpportunities(realAuth,{pageSize:12});console.log(JSON.stringify({benchmark:'base real, perfil QA',total:real.total,returned:real.items.length,durationMs:Math.round(performance.now()-start)}));assert.equal(real.items.some((v:any)=>v.isDemo),false);
 }finally{await pool.query('DELETE FROM organizations WHERE id=$1',[org]);await pool.end();}
});
