# Verificación de Sockit-pruebas

Comprobación del 4 de noviembre de 2026. No contiene credenciales.

## Resultado comprobado

- Proyecto autorizado: `hmjypsazjgjjblfjcrmz`, nombre `Sockit-pruebas`.
- API administrativa: HTTP 200, estado `ACTIVE_HEALTHY`.
- Auth: comprobación con clave pública, HTTP 200.
- Las seis variables requeridas están presentes, incluida la credencial administrativa.
- URL y referencia esperada corresponden al proyecto autorizado.
- La base estaba vacía antes de configurar; se aplicaron las ocho migraciones
  existentes en una transacción y se registraron en
  `supabase_migrations.schema_migrations`. No volver a aplicarlas.
- Hay 22 tablas públicas y el bucket `sockit-private` es privado.
- Prueba hospedada: capital, compra, venta, pago bancario, stock, estadísticas
  financieras e aislamiento RLS entre dos identidades. Se ejecutó dentro de una
  transacción revertida; no conserva registros de práctica.
- Pruebas locales de negocio, TypeScript, compilación de producción y recorrido
  Playwright completo: aprobados. El navegador usa una base local aislada; esto
  no sustituye la prueba de inicio de sesión y archivos en un despliegue hospedado.
- Se conservan SVG oficiales originales/optimizados, logo, patrones, paleta
  borgoña/crema y fuentes locales Fraunces, DM Sans e Instrument Serif.

## Pendientes antes de poder entrar desde otro equipo

1. `SOCKIT_DATABASE_MODE` está presente, pero su valor no es `supabase`.
   Configurarlo como `supabase` para el despliegue de prueba. No cambiar el modo
   local de las pruebas automatizadas.
2. `NEXT_PUBLIC_SITE_URL` está presente, pero no es una URL HTTPS válida.
   Establecer la dirección real de la prueba cuando exista el alojamiento.
3. En la comprobación inicial no había usuarios en Auth. Preparar el usuario de
   la propietaria; ella debe establecer su contraseña mediante un flujo seguro.
4. Preparar datos DEMO específicos para ese usuario y proyecto, sin cambiar el
   generador local que rechaza Supabase. No se han cargado datos DEMO hospedados.
5. Crear un Preview protegido en Vercel solo después de autorización. No existe
   herramienta de preview externo ni conector Vercel en este chat.
6. Configurar Site URL y Redirect URLs de Auth con la dirección HTTPS real y
   `/auth/callback`. Comprobar recuperación, sesión, RLS con dos usuarios y subida
   privada de archivos desde el despliegue antes de darlo por terminado.

## Pasos de Vercel para la propietaria, después de autorizar

No pulsar Deploy todavía. Importar un repositorio puede iniciar una publicación.

1. Entrar en Vercel con la cuenta propia y elegir el repositorio
   `betzaidagarcia04-ui/Sockit` cuando esté autorizada la prueba.
2. Seleccionar Next.js, carpeta raíz del repositorio, Node.js 24, instalación
   `npm ci` y compilación `npm run build`.
3. Configurar las variables de la columna Preview de `DESPLIEGUE.md` únicamente
   para Preview. No poner el token administrativo de Supabase en Vercel.
4. Mantener producción bloqueada. La prueba requiere una rama distinta de la
   rama de producción y `SOCKIT_PREVIEW_APPROVED=true` solo en Preview.
5. Activar Deployment Protection / Vercel Authentication, según el plan de la
   cuenta; comprobar acceso denegado desde una sesión no autorizada.
6. Copiar la URL HTTPS al ajuste de la aplicación y a Supabase Auth, reconstruir
   y comprobar el acceso desde computadora y celular.

No se ejecutó ningún despliegue, push ni cambio de configuración publicada.
Producción requiere un proyecto Supabase independiente, sin datos DEMO, y una
autorización posterior. La guía completa es `DESPLIEGUE.md`.
