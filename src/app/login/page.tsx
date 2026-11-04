import { login } from '../actions';
import { currentUser,isLocal,isDemo } from '@/lib/auth';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}) {
 let configurationError='';
 try {if(await currentUser()) redirect('/');} catch(e) {
  if(e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e;
  configurationError=e instanceof Error?e.message:'Error de configuración';
 }
 const {error}=await searchParams;
 return <main className="login-page"><section className="login-story"><img src="/brand/optimized/logos/monocromatico-crema.svg" alt="SOCKIT" width="309" height="75"/><span className="eyebrow">BUSINESS MANAGER</span><h1>Un par más.<br/><em>Una nueva posibilidad.</em></h1><p>Tu colección, tus ventas y tus próximos pasos, en un solo lugar.</p><div className="login-pattern"/></section><section className="login-panel"><div className="login-box"><span className="eyebrow">BIENVENIDA A TU NEGOCIO</span><h2>Hoy toca vender más.</h2><p className="muted">Inicia sesión para cuidar cada detalle de SOCKIT.</p>{isDemo()&&<p className="demo-banner">DEMOSTRACIÓN · Solo datos ficticios. Acceso separado del negocio real.</p>}{isLocal()&&!isDemo()&&<p className="notice">Entorno local de desarrollo · PostgreSQL persistente. No usar para exponer el negocio en internet.</p>}{configurationError&&<p className="error" role="alert">{configurationError}</p>}{error&&<p className="error" role="alert">{error}</p>}<form action={login}>{!isLocal()&&<label>Correo electrónico<input name="email" type="email" autoComplete="username" required/></label>}<label>Contraseña<input name="password" type="password" autoComplete="current-password" required minLength={isLocal()?12:6}/></label><button className="primary" disabled={!!configurationError}>Entrar a mi negocio <span>→</span></button></form><p className="footnote"><a href="/recover">Recuperar mi acceso</a></p><small>Acceso privado. Tus registros pertenecen a tu cuenta.</small></div></section></main>;
}
