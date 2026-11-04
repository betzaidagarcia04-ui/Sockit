import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createHmac, timingSafeEqual } from 'node:crypto';
export const isLocal = () => process.env.SOCKIT_DATABASE_MODE === 'local';
export const isDemo = () => process.env.SOCKIT_DEMO_MODE === 'true';
export const sessionCookieName = () => isDemo()?'sockit_demo_session':'sockit_session';
export async function supabase() {
  if(process.env.VERCEL_ENV==='production'&&isDemo())throw new Error('La configuración de demostración no puede ejecutarse como producción.');
  const store=await cookies();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.');
  const expected=process.env.SOCKIT_EXPECTED_SUPABASE_PROJECT;
  if(process.env.VERCEL_ENV && !expected)throw new Error('Configura SOCKIT_EXPECTED_SUPABASE_PROJECT para verificar el proyecto de este despliegue.');
  if(expected&&new URL(url).hostname!==`${expected}.supabase.co`)throw new Error('La URL de Supabase no coincide con el proyecto autorizado para este entorno.');
  return createServerClient(url,key,{cookies:{getAll:()=>store.getAll(),setAll:entries=>{try{entries.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Server component: actions refresh cookies. */}}}});
}
export function safeEqual(a: string,b: string) {
  const ah=createHmac('sha256','sockit-password-comparison').update(a).digest();
  const bh=createHmac('sha256','sockit-password-comparison').update(b).digest();
  return timingSafeEqual(ah,bh);
}
export function localConfig() {
  const password=process.env.SOCKIT_LOCAL_PASSWORD??'';
  const secret=process.env.SOCKIT_SESSION_SECRET??'';
  if(password.length<12 || secret.length<32) throw new Error('Configura SOCKIT_LOCAL_PASSWORD (mínimo 12 caracteres) y SOCKIT_SESSION_SECRET (mínimo 32) en .env.local.');
  if(process.env.NODE_ENV==='production' && process.env.SOCKIT_ALLOW_LOCAL_PRODUCTION!=='true') throw new Error('El modo local es solo para desarrollo. Configura Supabase para producción.');
  return {password,secret};
}
export function signSession(expires: number) {
  return createHmac('sha256',localConfig().secret).update(String(expires)).digest('hex');
}
export async function currentUser(): Promise<string|null> {
  if (isLocal()) {
    localConfig();
    const token=(await cookies()).get(sessionCookieName())?.value;
    if (!token) return null;
    const [expires,signature]=token.split('.');
    if(!expires || !signature || !Number.isFinite(Number(expires)) || Number(expires)<Date.now()) return null;
    return safeEqual(signature,signSession(Number(expires)))?'local':null;
  }
  const {data,error}=await (await supabase()).auth.getUser();
  if(error || !data.user) return null;
  return data.user.id;
}
