'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isLocal,localConfig,safeEqual,signSession,supabase,currentUser,sessionCookieName } from '@/lib/auth';
import { operation } from '@/lib/data';
import { suiteSchemas,operationExtras } from '@/lib/suite-validation';

const amount=z.number().finite().nonnegative().max(999999999);
const account=z.enum(['cash','bank']);
const schemas:Record<string,z.ZodType>={
 product:z.object({sku:z.string().trim().min(1).max(60),name:z.string().trim().min(1).max(160),category:z.string().max(100),color:z.string().max(80),size:z.string().max(40),price:amount,minimum:z.number().int().nonnegative().max(1000000)}),
 purchase:z.object({contact:z.string().trim().min(1).max(160),reference:z.string().max(160),account,paid:amount,acquisition:amount,lines:z.array(z.object({product_id:z.uuid(),quantity:z.number().int().positive().max(1000000),unit_price:amount})).min(1).max(100)}),
 sale:z.object({contact:z.string().trim().min(1).max(160),reference:z.string().max(160),account,paid:amount,acquisition:z.literal(0),lines:z.array(z.object({product_id:z.uuid(),quantity:z.number().int().positive().max(1000000),unit_price:amount})).min(1).max(100)}),
 payment:z.object({document_id:z.uuid(),amount:amount.positive(),account,reference:z.string().max(160)}),
};
const cashSchema=z.object({amount:amount.positive(),account,description:z.string().trim().min(1).max(250)});
schemas.edit_product=z.object({product_id:z.uuid(),sku:z.string().trim().min(1).max(60),name:z.string().trim().min(1).max(160),category:z.string().max(100),color:z.string().max(80),size:z.string().max(40),price:amount,minimum:z.number().int().nonnegative().max(1000000),active:z.boolean()});
schemas.purchase_payment=z.object({document_id:z.uuid(),amount:amount.positive(),account,reference:z.string().max(160)});
schemas.reverse_sale=z.object({document_id:z.uuid(),description:z.string().trim().min(1).max(250)});
const paymentSchema=z.object({payment_id:z.uuid()});
for(const kind of ['capital','expense','withdrawal','transfer']) schemas[kind]=cashSchema;
for(const kind of ['confirm_payment','reject_payment','reverse_payment']) schemas[kind]=paymentSchema;
for(const kind of ['product','edit_product','sale','purchase','payment','purchase_payment','capital','expense','withdrawal','transfer']) schemas[kind]=z.intersection(schemas[kind],operationExtras);
Object.assign(schemas,suiteSchemas);

export async function saveOperation(kind:string,payload:unknown,key:string):Promise<{ok:boolean;error?:string}> {
 try {
  if(!await currentUser()) throw new Error('Tu sesión terminó. Vuelve a iniciar sesión.');
  z.uuid().parse(key);
  if(!schemas[kind]) throw new Error('Operación inválida');
  const parsed=schemas[kind].safeParse(payload);
  if(!parsed.success) return {ok:false,error:'Revisa los campos obligatorios, cantidades e importes.'};
  await operation(kind,parsed.data,key);
  revalidatePath('/'); return {ok:true};
 } catch(error) {
  let message=error instanceof Error?error.message:'No se pudo guardar la operación';
  if(message.includes('duplicate key')) message='Ya existe un producto con ese SKU.';
  if(message.includes('permission denied')) message='No tienes permiso para esta operación.';
  return {ok:false,error:message};
 }
}

const authAttempts=globalThis as unknown as {sockitAuthAttempts?:{count:number;since:number}};
export async function login(form:FormData) {
 let error:string|undefined;
 try {
  if(isLocal()) {
   const attempts=authAttempts.sockitAuthAttempts??={count:0,since:Date.now()};
   if(Date.now()-attempts.since>15*60*1000){attempts.count=0;attempts.since=Date.now();}
   if(attempts.count>=10) throw new Error('Demasiados intentos. Espera 15 minutos.');
   attempts.count++;
   if(!safeEqual(String(form.get('password')??''),localConfig().password)) throw new Error('Contraseña incorrecta');
   attempts.count=0;
   const expires=Date.now()+8*60*60*1000;
   (await cookies()).set(sessionCookieName(),`${expires}.${signSession(expires)}`,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:8*60*60});
  } else {
   const result=await (await supabase()).auth.signInWithPassword({email:String(form.get('email')??''),password:String(form.get('password')??'')});
   if(result.error) throw new Error('No se pudo iniciar sesión. Revisa tu correo, contraseña y configuración de Supabase.');
  }
 } catch(e){error=e instanceof Error?e.message:'No se pudo iniciar sesión';}
 if(error) redirect(`/login?error=${encodeURIComponent(error)}`);
 redirect('/');
}
export async function logout() {
 if(isLocal()) (await cookies()).delete(sessionCookieName());
 else await (await supabase()).auth.signOut();
 redirect('/login');
}

export async function recoverAccess(form:FormData){
 let message='Si el correo corresponde a una cuenta, recibirás instrucciones para recuperar el acceso.';
 try{
  if(isLocal())throw new Error('En desarrollo local, cambia SOCKIT_LOCAL_PASSWORD en .env.local y reinicia la aplicación.');
  const site=process.env.NEXT_PUBLIC_SITE_URL;
  if(!site)throw new Error('Configura NEXT_PUBLIC_SITE_URL y autoriza /auth/callback en las URL de redirección de Supabase Auth.');
  const url=new URL('/auth/callback?next=/reset-password',site);
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('La URL pública de producción debe usar HTTPS.');
  const email=z.email().parse(String(form.get('email')??''));
  const {error}=await(await supabase()).auth.resetPasswordForEmail(email,{redirectTo:url.toString()});
  if(error)throw new Error(`No se pudo solicitar recuperación: ${error.message}`);
 }catch(e){message=e instanceof Error?e.message:'No se pudo solicitar la recuperación';}
 redirect(`/recover?message=${encodeURIComponent(message)}`);
}
export async function changePassword(form:FormData){
 let error='';
 try{
  if(isLocal()||!await currentUser())throw new Error('Abre el enlace de recuperación recibido por correo.');
  const password=z.string().min(12).max(128).parse(String(form.get('password')??''));
  if(password!==form.get('confirmation'))throw new Error('Las contraseñas no coinciden.');
  const result=await(await supabase()).auth.updateUser({password});if(result.error)throw new Error(result.error.message);
 }catch(e){error=e instanceof z.ZodError?'Usa una contraseña de entre 12 y 128 caracteres.':e instanceof Error?e.message:'No se pudo cambiar la contraseña';}
 if(error)redirect(`/reset-password?error=${encodeURIComponent(error)}`);
 redirect('/');
}
