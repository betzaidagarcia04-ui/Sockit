import { createServerClient } from '@supabase/ssr';
import { NextResponse,type NextRequest } from 'next/server';
export async function proxy(request:NextRequest){
 let response=NextResponse.next({request});
 if(process.env.SOCKIT_DATABASE_MODE==='local')return response;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return response;
 const client=createServerClient(url,key,{cookies:{
  getAll:()=>request.cookies.getAll(),
  setAll:entries=>{entries.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});entries.forEach(({name,value,options})=>response.cookies.set(name,value,options));},
 }});
 await client.auth.getUser();
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|brand/|favicon.ico).*)']};
