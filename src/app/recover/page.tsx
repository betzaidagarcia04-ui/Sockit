import {recoverAccess} from '../actions';
import {isLocal} from '@/lib/auth';
export default async function Recover({searchParams}:{searchParams:Promise<{message?:string}>}){
 const {message}=await searchParams;
 return <main className="setup-error operation-form"><h1>Volvamos a tu negocio.</h1>{message&&<p className="notice" role="status">{message}</p>}{isLocal()?<p>En desarrollo local, establece tu contraseña en SOCKIT_LOCAL_PASSWORD dentro de .env.local y reinicia Next.js.</p>:<form action={recoverAccess}><label>Correo de tu cuenta<input name="email" type="email" autoComplete="email" required/></label><button className="primary">Solicitar recuperación</button></form>}<p><a href="/login">Volver al inicio de sesión</a></p></main>;
}
