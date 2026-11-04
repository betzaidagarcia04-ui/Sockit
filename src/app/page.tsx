import { currentUser,isLocal,isDemo } from '@/lib/auth';
import { snapshot } from '@/lib/data';
import { redirect } from 'next/navigation';
import Workspace from '@/components/workspace';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export default async function Home() {
 let user:string|null=null;
 try {user=await currentUser();} catch {redirect('/login');}
 if(!user) redirect('/login');
 try {
  const data=await snapshot();
  return <Workspace data={data} local={isLocal()} demo={isDemo()}/>;
 } catch(error) {
  return <main className="setup-error"><h1>No pudimos abrir tu negocio</h1><p role="alert">{error instanceof Error?error.message:'Error al consultar la base de datos'}</p><p>Si usas Supabase, aplica las migraciones de la carpeta <code>supabase/migrations</code> y comprueba las variables del proyecto.</p><a href="/">Volver a intentar</a></main>;
 }
}
