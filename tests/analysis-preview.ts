import {pool} from '../apps/api/src/db.js';
import {downloadPdf,readPdf} from '../apps/api/src/pdf-reader.js';
import {findEvidence,officialPdfUrl} from '../apps/api/src/analysis-rules.js';
// Read-only QA of an already collected public procurement document. No organization data is modified.
async function main(){try{
 const source=(await pool.query("SELECT id,title,documents FROM opportunities WHERE demo_org_id IS NULL AND jsonb_array_length(documents)>0 ORDER BY (title ILIKE '%impress%') DESC,created_at DESC LIMIT 100")).rows;
 const selected=source.flatMap(row=>row.documents.map((d:any)=>({...d,title:row.title,id:row.id}))).find(doc=>officialPdfUrl(doc.url));
 if(!selected){console.log(JSON.stringify(source.slice(0,3).map(s=>({title:s.title,documents:s.documents})),null,2));throw new Error('Não há PDF oficial disponível para o teste.');}
 const bytes=await downloadPdf(selected.url,AbortSignal.timeout(25000));
 const result=await readPdf(bytes,AbortSignal.timeout(30000));const evidence=findEvidence(result.pages);
 if(!result.pages.length)throw new Error('Nenhuma página extraída.');
 console.log(JSON.stringify({id:selected.id,title:selected.title,url:selected.url,bytes:bytes.length,totalPages:result.totalPages,readPages:result.pages.length,partial:result.partial,evidenceCount:evidence.length,example:evidence.slice(0,2)},null,2));
}finally{await pool.end();}}
void main().catch(error=>{console.error(error);process.exitCode=1;});
