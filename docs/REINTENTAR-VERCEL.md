# Reintentar el despliegue de prueba autorizado

La propietaria autorizó el despliegue inicial de pruebas. Se conserva el control
de aprobación por variables y toda la autenticación. La prueba usa la rama
`sockit-pruebas`, distinta de `main`, y el entorno Vercel **Preview**. La producción
del negocio sigue bloqueada. No definir `VERCEL_ENV` manualmente.

## 1. Guardar las variables

En el proyecto Vercel: **Settings → Environment Variables**. Crear cada variable
de `vercel-preview.env.example`, seleccionando **Preview** y todas sus ramas
(o específicamente `sockit-pruebas`). El archivo es una plantilla; no se carga
automáticamente ni contiene la clave pública real.

En particular: `SOCKIT_PREVIEW_APPROVED=true`, `SOCKIT_DATABASE_MODE=supabase`,
`SOCKIT_DEMO_MODE=true` y la URL/referencia del proyecto Sockit-pruebas.
Obtener `NEXT_PUBLIC_SUPABASE_ANON_KEY` desde Supabase → Settings → API Keys,
usando la clave pública anon/publishable, nunca secret/service_role.
Las variables del entorno de desarrollo no se transfieren a Vercel.

No agregar `SOCKIT_PRODUCTION_APPROVED`. No subir el token administrativo de
Supabase a Vercel ni a GitHub.

## 2. Ejecutar Preview

En Vercel → **Deployments**, crear un despliegue desde la rama `sockit-pruebas`
(opción **Create Deployment**, según la interfaz), confirmando entorno **Preview**.
Usar el último commit de esa rama. No repetir el despliegue cancelado de `main`
si está marcado Production: seguirá bloqueado intencionadamente.

Si ya aparece un Preview de `sockit-pruebas`, abrir su menú **… → Redeploy**
después de guardar las variables. Los ajustes deben aplicarse al nuevo build.
El registro esperado es `Compilación preview autorizada por configuración explícita.`
Mantener Next.js, Node 24.x, `npm ci`, `npm run build`, carpeta raíz del repositorio.
Conservar el Ignored Build Step definido por `vercel.json`.

## 3. Proteger y completar el acceso

Activar **Settings → Deployment Protection → Vercel Authentication** si está
disponible en el plan y comprobar acceso denegado desde una sesión no autorizada.
La aplicación sigue requiriendo sesión Supabase para consultar/modificar datos,
independientemente de esa protección adicional.

Cuando Vercel asigne la URL HTTPS, guardarla como `NEXT_PUBLIC_SITE_URL` en Preview,
reconstruir y configurarla también en Supabase → Authentication → URL Configuration:
Site URL y Redirect URLs con `https://DIRECCION-REAL/auth/callback`. No usar la URL
de Supabase como dirección de la aplicación ni habilitar comodines generales.

La verificación remota encontró cero usuarios en Auth. En Supabase → Authentication
→ Users → Add user → Create new user, la propietaria puede crear su usuario con
su correo y una contraseña elegida por ella. No compartirla por chat. Si la interfaz
permite marcar correo confirmado al crear, hacerlo únicamente para su propio
correo verificado. No habilitar registro público para resolver este paso.

Después abrir el enlace HTTPS de Preview, iniciar sesión y comprobar operaciones
y archivos desde el navegador. No hay datos DEMO hospedados todavía; el modo demo
muestra una advertencia, pero no carga datos automáticamente. No usar el seed local
contra Supabase. Los datos demostrativos y la prueba de Auth/Storage hospedados
siguen pendientes de completar antes de dar la prueba por terminada.

## Comprobaciones realizadas sin mostrar claves

- Proyecto de pruebas saludable, API administrativa HTTP 200 y Auth HTTP 200.
- Ocho migraciones registradas; todas las tablas públicas tienen RLS.
- Bucket privado; la RPC de datos rechaza la sesión anónima con HTTP 401.
- URL y referencia configuradas coinciden con el proyecto de pruebas.
- El modo y la URL pública del entorno de desarrollo aún no son valores válidos
  para alojamiento; usar la configuración Preview indicada, no copiarlos.

No hay conector Vercel en este chat: sus variables, la protección y el estado de
su despliegue deben comprobarse en su panel. No se afirma que estén configurados
por haber preparado el archivo de ejemplo.
