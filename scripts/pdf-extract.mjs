// Untrusted PDFs are parsed in a separate time- and heap-limited process, with no rendering or actions.
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const chunks=[];let size=0;
for await(const chunk of process.stdin){size+=chunk.length;if(size>10*1024*1024)throw new Error('PDF muito grande');chunks.push(chunk);}
const bytes=Buffer.concat(chunks);
if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('Formato não suportado');
const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,verbosity:0,stopAtErrors:true});
try{
 const doc=await task.promise;const pages=[];let characters=0;const limit=Math.min(doc.numPages,150);
 for(let n=1;n<=limit;n++){
  const page=await doc.getPage(n);const content=await page.getTextContent();
  const text=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('');
  characters+=text.length;if(characters>800000)break;
  pages.push({page:n,text});page.cleanup();
 }
 process.stdout.write(JSON.stringify({pages,totalPages:doc.numPages,partial:pages.length<doc.numPages}));
}finally{await task.destroy();}
