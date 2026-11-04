import { loadFile } from '@/lib/files';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return new Response(null,{status:404});
 try{const file=await loadFile(id);if(!file)return new Response(null,{status:404});
  return new Response(Buffer.from(file.bytes),{headers:{'Content-Type':file.metadata.mime,'Content-Length':String(file.bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${file.metadata.mime==='application/pdf'?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.metadata.name)}`}});
 }catch{return new Response(null,{status:404});}
}
