import { existsSync,writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if(existsSync('.env.local')){
 console.log('.env.local existe: se conserva sin cambios.');
} else {
 writeFileSync('.env.local',`SOCKIT_DATABASE_MODE=local\nSOCKIT_LOCAL_PASSWORD=${randomBytes(24).toString('hex')}\nSOCKIT_SESSION_SECRET=${randomBytes(48).toString('hex')}\n`,{mode:0o600,flag:'wx'});
 console.log('Configuración local creada. Establece tu contraseña en SOCKIT_LOCAL_PASSWORD dentro de .env.local. No compartas este archivo.');
}
