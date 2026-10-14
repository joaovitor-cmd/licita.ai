export type ArchiveDocument={name:string;data:Uint8Array};
const encoder=new TextEncoder();
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function createDocumentZip(files:ArchiveDocument[]):ArrayBuffer{
 if(!files.length||files.length>65535)throw new Error('Selecione pelo menos um documento.');
 const size=files.reduce((sum,file)=>sum+file.data.byteLength,0);
 if(size>100*1024*1024)throw new Error('O conjunto deve ter até 100 MB.');
 const parts:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0,directorySize=0;
 for(const [index,file] of files.entries()){
  const basename=file.name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f:*?"<>|]/g,'_').trim().slice(0,180).replace(/[. ]+$/g,'')||'documento';
  const name=encoder.encode(`${String(index+1).padStart(2,'0')} - ${basename}`);
  const crc=crc32(file.data),local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,file.data.length,true);v.setUint32(22,file.data.length,true);v.setUint16(26,name.length,true);local.set(name,30);
  const entry=new Uint8Array(46+name.length),d=new DataView(entry.buffer);
  d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,file.data.length,true);d.setUint32(24,file.data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);entry.set(name,46);
  parts.push(local,file.data);directory.push(entry);directorySize+=entry.length;offset+=local.length+file.data.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,directorySize,true);e.setUint32(16,offset,true);
 const result=new Uint8Array(offset+directorySize+end.length);let position=0;
 for(const part of [...parts,...directory,end]){result.set(part,position);position+=part.length;}
 return result.buffer;
}