# Preparación técnica de prueba y producción

Documento para quien configure el alojamiento; la propietaria puede seguir
`EMPEZAR.md` sin ejecutar comandos. Ningún paso de publicación de este documento
se ha ejecutado automáticamente.

## Aislamiento obligatorio

Usar proyectos Supabase distintos para pruebas y producción, usuarios independientes
y variables Vercel por entorno. Verificar la URL y el identificador esperado antes
de ejecutar cualquier migración. No configurar un despliegue demo con la URL de
producción. No reutilizar datos ni credenciales de acceso de demostración.

| Variable | Prueba protegida (Preview) | Producción, tras autorización |
| --- | --- | --- |
| `SOCKIT_DATABASE_MODE` | `supabase` | `supabase` |
| `SOCKIT_DEMO_MODE` | `true` | `false` |
| `SOCKIT_EXPECTED_SUPABASE_PROJECT` | Referencia del proyecto de pruebas | Referencia del proyecto real |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de pruebas | URL de producción |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública de pruebas | Clave pública de producción |
| `NEXT_PUBLIC_SITE_URL` | URL HTTPS del despliegue privado de prueba | URL HTTPS real |

Las claves públicas `NEXT_PUBLIC_*` pueden quedar incorporadas durante el build:
no promover un artefacto de Preview a Production con otras variables. Reconstruir
desde el código usando las variables de producción. La aplicación rechaza demo
en `VERCEL_ENV=production` y rechaza una URL cuyo proyecto no coincida con
`SOCKIT_EXPECTED_SUPABASE_PROJECT`.

## Supabase

Aplicar únicamente las migraciones pendientes de `supabase/migrations` (001–008).
En un proyecto vacío aplicar las ocho; en uno existente revisar el historial y
respaldar antes. La 004 prepara un bucket privado y políticas por usuario.
Crear el usuario propietario desde Auth; no hay registro público abierto.
Autorizar `/auth/callback` en Redirect URLs y configurar correo de recuperación.
No usar la clave `service_role` en la aplicación ni guardarla en Git.

El generador local `npm run demo:seed` solo funciona en la carpeta reservada
`.sockit/demo/postgres`, rechaza producción y no accede a Supabase. La carga de
datos ficticios en Supabase debe prepararse y autorizarse específicamente para el
proyecto de pruebas después de conocer su referencia y usuario, sin agregar seeds
a las migraciones de producción.

## Vercel

Framework: Next.js. Carpeta raíz: raíz del repositorio. Node.js 24. Instalación:
`npm ci`. Compilación: `npm run build`. Usar los valores de cada entorno, no el modo
local/PGlite: el disco de una función de Vercel no es la base de datos persistente.
Los comprobantes y fotografías hospedados se guardan en Supabase Storage privado.

Conectar/importar un repositorio puede desplegar su rama de producción automáticamente.
No hacerlo antes de autorización. Para probar, preparar un despliegue Preview
protegido con Vercel Authentication u otra protección disponible en la cuenta y
comprobar en una sesión anónima que se deniega acceso. No asumir que una URL aleatoria
es privada ni que todas las modalidades de protección están incluidas en todos los planes.

Antes de producción: verificar proyecto autorizado, datos iniciales sin DEMO,
dos usuarios aislados por RLS, archivos privados, reservas/concurrencia, confirmación
idempotente, reversos y restauración de PostgreSQL/Storage. La publicación final
requiere autorización expresa de la propietaria.
