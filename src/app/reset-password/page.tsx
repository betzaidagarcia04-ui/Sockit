import {changePassword} from '../actions';
import {currentUser,isLocal} from '@/lib/auth';
export const dynamic='force-dynamic';
export default async function ResetPassword({searchParams}:{searchParams:Promise<{error?:string}>}){
 const {error}=await searchParams;let authorized=false;try{authorized=!isLocal()&&!!await currentUser();}catch{}
 return <main className="setup-error operation-form"><h1>Una nueva contraseña.</h1>{error&&<p className="error" role="alert">{error}</p>}{authorized?<form action={changePassword}><label>Nueva contraseña<input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label><label>Confirmar contraseña<input name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></label><button className="primary">Guardar contraseña</button></form>:<p>Abre el enlace de recuperación enviado a tu correo para continuar.</p>}<a href="/login">Volver al acceso</a></main>;
}
