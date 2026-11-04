// Vercel: salida 0 = omitir compilación; salida 1 = continuar.
// No desplegar automáticamente por guardar código en GitHub.
const target=process.env.VERCEL_ENV;
const preview=target==='preview'&&process.env.SOCKIT_PREVIEW_APPROVED==='true';
const production=target==='production'&&process.env.SOCKIT_PRODUCTION_APPROVED==='true'&&process.env.SOCKIT_DEMO_MODE==='false';
if(preview||production){console.log(`Compilación ${target} autorizada por configuración explícita.`);process.exitCode=1;}
else{
 console.log(`Despliegue omitido: falta autorización explícita para este entorno (${target??'no definido'}).`);
 if(target==='preview')console.log('Configura SOCKIT_PREVIEW_APPROVED=true en Vercel → Settings → Environment Variables, ámbito Preview, y vuelve a desplegar la rama sockit-pruebas.');
 else if(target==='production')console.log('La importación inicial usa Production. Para probar, crea un despliegue Preview de sockit-pruebas con SOCKIT_PREVIEW_APPROVED=true solo en Preview. Production requiere autorización independiente, SOCKIT_PRODUCTION_APPROVED=true y SOCKIT_DEMO_MODE=false.');
 else console.log('Ejecuta este control desde Vercel, que establece VERCEL_ENV; no definas esa variable manualmente.');
 process.exitCode=0;
}
