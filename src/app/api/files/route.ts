import { NextResponse,type NextRequest } from 'next/server';
import { storeFile } from '@/lib/files';
import { currentUser } from '@/lib/auth';
export const runtime='nodejs';
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 const expectedHost=(request.headers.get('x-forwarded-host')??request.headers.get('host')??'').split(',')[0].trim().toLowerCase();
 let allowed=false;
 try{const url=new URL(origin??'');allowed=['http:','https:'].includes(url.protocol)&&url.host.toLowerCase()===expectedHost;}catch{}
 if(!allowed)return NextResponse.json({error:'Origen no permitido'},{status:403});
 if(!await currentUser())return NextResponse.json({error:'Debes iniciar sesión'},{status:401});
 if(Number(request.headers.get('content-length')??0)>5300000)return NextResponse.json({error:'Archivo demasiado grande'},{status:413});
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error('Selecciona un archivo');
  const chunks:Uint8Array[]=[];let total=0;
  while(true){const item=await reader.read();if(item.done)break;total+=item.value.length;if(total>5300000){await reader.cancel();return NextResponse.json({error:'Archivo demasiado grande'},{status:413});}chunks.push(item.value);}
  const bounded=new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')??''},body:Buffer.concat(chunks)});
  const form=await bounded.formData();const file=form.get('file');if(!(file instanceof File))throw new Error('Selecciona un archivo');
  return NextResponse.json(await storeFile(file,String(form.get('purpose'))));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo guardar el archivo'},{status:400});}
}
