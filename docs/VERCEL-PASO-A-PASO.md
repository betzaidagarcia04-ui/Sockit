# Preparar Vercel sin publicar

## Código comprobado

La rama remota `main` coincide con el checkout confirmado:
`191390b13ab7abff9955a58248c7472a178dcf6f`.
Contiene `package.json`, lockfile, configuración Next.js, TypeScript y Tailwind,
28 archivos fuente, ocho migraciones y 47 recursos en `public/brand`.
También incluye las instrucciones de despliegue y el control de autorización de
`vercel.json`. No hay código funcional pendiente de integrar en esa revisión.

## Pantalla de importación

1. En Vercel, elegir **Import** junto a `betzaidagarcia04-ui/Sockit` para abrir
   la configuración. Detenerse antes de **Deploy** o de cualquier botón que
   anuncie creación/despliegue automático. No autorizar publicación todavía.
2. Nombre sugerido: `sockit-pruebas`. Framework: **Next.js**.
3. Root Directory: raíz del repositorio, sin elegir `src` ni `/workspace/Sockit`.
4. Instalación: `npm ci`. Build: `npm run build`. Output Directory: predeterminado
   de Next.js. Node.js: **24.x**; revisar también Settings → Build and Deployment
   si no aparece en la importación.
5. No cargar `.env.local`, bases locales, contraseñas de desarrollo ni tokens.

## Variables para Preview, no Production

Los valores del entorno de desarrollo NO se copian automáticamente a Vercel.
Elegir el ámbito **Preview** al guardar cada variable. Si la importación no permite
seleccionar el ámbito, no publicar: configurar los ámbitos desde los ajustes del
proyecto antes de autorizar un despliegue de prueba.

| Nombre | Valor |
| --- | --- |
| `SOCKIT_DATABASE_MODE` | `supabase` |
| `SOCKIT_DEMO_MODE` | `true` |
| `SOCKIT_EXPECTED_SUPABASE_PROJECT` | `hmjypsazjgjjblfjcrmz` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hmjypsazjgjjblfjcrmz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Copiar la clave pública anon o publishable del proyecto Sockit-pruebas desde Supabase → Settings → API Keys. No usar secret ni service_role. |
| `NEXT_PUBLIC_SITE_URL` | URL HTTPS definitiva de la prueba. Pendiente de asignar; no usar la URL de Supabase ni inventar una dirección. |

`SOCKIT_PREVIEW_APPROVED=true` solo se agregará a Preview cuando la propietaria
autorice el despliegue protegido. No configurar `SOCKIT_PRODUCTION_APPROVED`.
No poner `SUPABASE_ACCESS_TOKEN`, service_role, claves secret ni contraseñas de
base de datos en Vercel: la aplicación no las necesita.

## Antes del primer despliegue autorizado

- La primera importación suele crear un despliegue Production. No usarlo para la
  demostración: mantener Production bloqueado y preparar una rama de prueba
  diferente de la rama de producción para desplegar Preview.
- Conservar el Ignored Build Step de `vercel.json`. Es un control adicional;
  no sustituye detenerse antes de Deploy, especialmente en la primera creación.
- Activar **Settings → Deployment Protection → Vercel Authentication**, si está
  disponible en el plan. Comprobar que cubra la URL que se entregará y rechace una
  sesión anónima. No asumir que una URL difícil de adivinar es privada.
- Preparar el usuario propietario y sus datos ficticios solo en Sockit-pruebas.
  Las tablas están creadas, pero no hay todavía un acceso hospedado entregado ni
  un seed hospedado. El seed local no debe ejecutarse contra Supabase.
- Configurar Supabase → Authentication → URL Configuration con la URL real y
  el callback HTTPS `/auth/callback`, sin comodines generales. Actualizar
  `NEXT_PUBLIC_SITE_URL` y reconstruir si cambió la URL.
- Verificar sesión, recuperación, Storage privado y recorridos reales en Preview
  desde computadora y celular antes de dar el enlace por listo.

El código no configura protección de Vercel ni crea usuarios mediante el build.
Ningún paso de esta guía se ha ejecutado sobre Vercel. Producción requiere una
base independiente y una autorización posterior; no promover un build demo.
