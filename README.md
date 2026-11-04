# SOCKIT Business Manager

**Para la propietaria:** [guía sencilla para probar y abrir tu aplicación](docs/EMPEZAR.md).


Aplicación integrada en español y pesos dominicanos (RD$), con Next.js 16,
TypeScript, Tailwind CSS, Motion, Recharts y PostgreSQL. Conserva los recursos
extraídos del manual oficial, incluida la T con forma de media. Las pantallas
operan con registros persistentes; no se precargan números ficticios.

## Módulos conectados

| Área | Funcionalidad implementada |
| --- | --- |
| Dashboard | Ventas netas, ganancias, caja/bancos, inventario, reservas, cuentas por cobrar, pedidos y gráficos con filtros de actividad. Los saldos actuales se identifican por separado. |
| Inventario | SKU por variante, colección, categoría, color, talla, tipo, marca, proveedor, fotografías privadas (hasta 12 por SKU), costo promedio, precios, mínimo, físicos/reservados/disponibles, edición y desactivación, tabla y galería. |
| Presentaciones | Pares, paquetes, docenas y combos reutilizables por SKU y precio por par; se expanden en las líneas de venta sin duplicar existencias. |
| Importación | CSV y XLSX con plantillas, vista previa y validación atómica. Catálogo o incorporación de existencias mediante compra a crédito. Hasta 500 filas / 5 MB por lote. |
| Compras | Proveedor, factura, líneas, descuentos, costos de adquisición distribuidos por pares, promedio ponderado móvil, pago inicial y abonos posteriores a proveedores. |
| Ventas | Cliente opcional, líneas/combos, descuentos, entrega cobrada, costo histórico, ganancia, abonos, vencimiento, devoluciones parciales y anulación/devolución total auditada. |
| Clientes | Teléfono, edad opcional por rango, provincia/ciudad/municipio/sector normalizados, dirección opcional, coordenadas opcionales, historial, pedidos, compras y saldo. |
| Pedidos | Número automático, diseños, descuento, entrega, notas, edición antes de salida, estados, reservas, tabla/tarjetas/Kanban/calendario, historial de actor/fecha. |
| Entregas | Hoy, mañana, próximos días y atrasos; entrega con confirmación, hora registrada y protección contra doble salida. |
| Cobros | Saldos y vencimientos, entregados sin cobrar, abonos divididos, anticipos, efectivo, transferencia, depósito y tarjetas con comisiones. |
| Confirmación de pagos | Pendiente/confirmado/rechazado/reversado, referencia, banco origen, cuenta destino, comprobante privado, verificador y fecha; confirmación exactamente una vez. |
| Bancos | Varias cuentas DOP, instituciones dominicanas, números parcialmente ocultos, aportaciones, transferencias propias, ajustes documentados y conciliación con estados de cuenta. |
| Finanzas y gastos | Patrimonio, capital, retiros, costo de inventario, efectivo/bancos, deudas, cobros, gastos operativos y comisiones, sin contar compras como gastos por segunda vez. |
| Estadísticas | Diseños, pares, ingresos, ganancia, margen, clientes únicos, ticket, evolución mensual, edad y ubicación con filtros; protección de grupos demográficos pequeños. |
| Inteligencia comercial | Matriz por diseño/edad/ubicación, comparación de diseños y mapas de coordenadas explícitas; sin inferencia de edad o dirección. |
| Oportunidades | Reposición, margen negativo, baja rotación, productos rentables, concentración geográfica y variaciones de ventas, siempre con métricas de respaldo. |
| Simulador | Costo, precio sugerido por margen, recargo sobre costo, descuentos, ganancia por par/presentación/docena y simulación de combos guardados. No altera ventas ni precios. |
| Reportes | CSV, Excel y PDF: inventario, compras/ventas, pedidos/entregas, saldos, cobros, bancos, gastos, capital, rentabilidad, demografía y recurrencia. |
| Notificaciones | Stock, entregas próximas/atrasadas, pagos y saldos; estado de lectura persistente. WhatsApp abre borradores editables y nunca envía automáticamente. |
| Configuración | Negocio, mensajes, privacidad, catálogos editables, estado activo y auditoría. |

## Reglas de integridad

El par es la unidad base. Confirmar un pedido reserva existencias; despacharlo
convierte la reserva en una sola salida y registra la venta. Cancelar antes de
salida libera reservas; devolver tras salida repone a costo histórico y registra
contrapartidas, sin borrar movimientos financieros.

Un pedido no es automáticamente una venta. Un pago reportado no aumenta saldos.
Los anticipos confirmados antes de despachar son obligaciones con clientes, no
ventas ni ganancia. El despacho vincula esos cobros a la venta. Las comisiones
se registran al confirmar la tarjeta. Las transferencias propias y aportaciones
no son ingresos por ventas. La conciliación no confirma pagos ni ajusta dinero
sin una operación documentada.

Cada solicitud utiliza un UUID idempotente y una transacción PostgreSQL. Repetir
la misma solicitud no repite sus movimientos; cambiar su contenido con la misma
clave se rechaza. Los permisos de lectura son por propietario (RLS); el cliente
no puede escribir directamente en tablas financieras. Cada usuario de Supabase
posee su negocio separado; no se implementa una organización compartida de varios
empleados con permisos distintos.

Las devoluciones preservan las cantidades originales, costos, motivos y actores.
Una devolución parcial reduce la venta neta; si lo cobrado supera el nuevo total,
se reembolsa solo la diferencia a las cuentas originales. Si falta dinero para
reembolsar, la transacción completa se rechaza. Las comisiones ya incurridas no
se devuelven automáticamente. Los cambios de producto se registran como devolución
y nueva venta para mantener trazabilidad.

## Ejecutar en desarrollo

Node.js 24 (probado con 24.22.1) y npm 11. Desde `/workspace/Sockit`:

```sh
npm ci --no-audit --no-fund
npm run setup:local
# Establece tu contraseña de 12+ caracteres en SOCKIT_LOCAL_PASSWORD, en .env.local.
npm run dev
```

`setup:local` conserva `.env.local` si existe. Si falta, genera una contraseña y un
secreto aleatorios sin imprimirlos. No versiones ni compartas ese archivo.
El modo `SOCKIT_DATABASE_MODE=local` usa PostgreSQL/PGlite persistente en
`.sockit/postgres`; los archivos privados están en `.sockit/uploads`.
No se guardan registros del negocio en localStorage. Usa un solo proceso por
carpeta de base de datos; no abras la misma base con desarrollo y otro proceso.

El modo local es para desarrollo y se bloquea por defecto con `NODE_ENV=production`.
Las pruebas usan carpetas distintas para datos y archivos, con registros PRUEBA E2E;
la base de trabajo permanece separada. El primer inicio puede tardar unos segundos
mientras inicializa PostgreSQL.

## Configurar Supabase y publicar la aplicación

La integración hospedada está implementada pero **aún no está verificada contra un
proyecto real**, porque no se proporcionaron proyecto, variables ni acceso de
administración. Configura fuera del chat, en el entorno o `.env.local`:

```dotenv
SOCKIT_DATABASE_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU-CLAVE-PUBLICA-ANON
NEXT_PUBLIC_SITE_URL=https://TU-DOMINIO
SOCKIT_EXPECTED_SUPABASE_PROJECT=REFERENCIA-DEL-PROYECTO
```

No uses `service_role` en la aplicación. La clave `anon` es pública y queda protegida
por las políticas y RPC del usuario autenticado. No envíes contraseñas por chat.

1. Crea o selecciona el proyecto Supabase.
2. Aplica en orden los archivos de `supabase/migrations`. Hay ocho migraciones.
   En un proyecto que ya tiene las dos primeras, aplica solo las pendientes 003–008.
   No vuelvas a ejecutar una migración aplicada ni cambies sus checksums.
   Las migraciones son transaccionales a través del flujo de migraciones; si usas
   SQL Editor, aplica cada archivo dentro de una transacción y conserva el registro.
3. La migración 004 crea el bucket **privado** `sockit-private` y sus políticas por
   carpeta de usuario en Supabase Storage. No habilites acceso público.
4. Crea el usuario propietario desde Authentication. El acceso es privado; no hay
   registro público abierto. Para recuperación de contraseña, configura el dominio
   público y autoriza `https://TU-DOMINIO/auth/callback` en Auth Redirect URLs.
   Configura el correo de Supabase según tu proyecto.
5. Reinicia y verifica Auth, RLS con dos usuarios, archivos privados, compras,
   reservas, despacho, abonos, devoluciones y cuentas en el proyecto real.
6. Para el alojamiento compatible con Next.js Node, configura las variables,
   ejecuta `npm ci`, `npm run build` y `npm start`. Usa HTTPS y configura el respaldo
   hospedado según tu plan. No se ha efectuado despliegue ni publicación automática.

El modo local y Supabase no sincronizan datos. Cambiar el modo no migra los
registros existentes; prepara una migración de datos explícita y verificada.
Las políticas Storage se aplican solo cuando existe el esquema Storage de Supabase;
PostgreSQL local conserva el mismo modelo de permisos de metadatos.

## Pruebas y evidencia

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit --omit=dev
```

La suite PostgreSQL comprueba compras/costos, ventas/combos, concurrencia,
reservas, cancelaciones, comisiones, abonos, doble confirmación, rechazos,
reembolsos parciales/totales, capital, deudas, RLS, importación atómica, estadísticas,
persistencia, actualización desde la versión inicial y respaldo/restauración.

Chromium recorre formularios reales: acceso, diseño, compra, venta, clientes,
cuentas, pedido/reserva, anticipo de tarjeta y comprobante privado, despacho,
entrega, devolución parcial, CSV/XLSX, presentaciones, conciliación, reportes y
filtros. Abre el XLSX exportado y verifica el PDF; comprueba acceso anónimo denegado
a comprobantes, persistencia, movimiento reducido, móvil y cierre de sesión.
El ejecutor usa `/usr/bin/chromium`. En otra máquina adapta la ruta en
`playwright.config.ts`. Las trazas están desactivadas para no guardar entradas de
contraseña; los artefactos de prueba no se versionan.

La restricción de red del ejecutor puede producir `Failed to connect to proxy port
8080` aunque el entorno permita internet. Se comprobó que Git/npm funcionan desde
la ejecución aprobada, conservando proxy y TLS. No hace falta sustituir autenticación
Git ni desactivar TLS.

## Respaldar y restaurar datos y archivos locales

Detén Next.js antes de abrir su base con el script. Guarda tanto el archivo `.tgz`
como su carpeta acompañante `.tgz.files`, si existe. Ambos contienen información
privada. La copia verifica SHA-256 de cada archivo y no sobrescribe destinos.

```sh
# Next.js detenido; el destino no debe existir.
node --import tsx scripts/local-backup.ts backup /tmp/sockit-respaldo.tgz --server-stopped
# Restauración en dos carpetas NUEVAS; conserva la base y archivos originales.
SOCKIT_LOCAL_DB_DIR=.sockit/restaurada SOCKIT_LOCAL_FILES_DIR=.sockit/archivos-restaurados node --import tsx scripts/local-backup.ts restore /tmp/sockit-respaldo.tgz --server-stopped
# Comprobar la copia restaurada antes de adoptarla.
SOCKIT_LOCAL_DB_DIR=.sockit/restaurada SOCKIT_LOCAL_FILES_DIR=.sockit/archivos-restaurados npm run dev
```

El script informa registros y archivos recuperados. No respalda las credenciales del
entorno. Para Supabase, configura y prueba respaldo/PITR de PostgreSQL y respaldo de
Storage en un proyecto separado; el respaldo de base no incluye automáticamente
los objetos de Storage.

## Identidad oficial y recursos

`public/brand` conserva las extracciones originales SVG/PNG y su procedencia.
`public/brand/optimized` contiene versiones SVG optimizadas a partir de esos
trazados; no se presentan como los maestros originales del diseñador. Se conserva
la T-media y sus proporciones. Hay favicon e iconos de aplicación 180/192/512, con
margen de seguridad, extraídos del PDF. El manifiesto permite añadir la web a inicio;
no se ofrece operación offline ni se cachean registros financieros con un service worker.

Las fuentes OFL Fraunces Bold, DM Sans e Instrument Serif Italic se sirven desde
Fontsource. La interfaz usa los siete colores hexadecimales del manual.
Para regenerar recursos opcionalmente:

```sh
python3 scripts/extract-app-icons.py /ruta/SOCKIT_manual_de_identidad.pdf
node scripts/optimize-brand.mjs
```

La extracción requiere PyMuPDF. Los patrones extraídos son paneles fieles, no se
presumen mosaicos infinitos. Los originales permanecen intactos.

## Límites explícitos

- El servicio Supabase, el correo de recuperación y el alojamiento de producción
  necesitan configuración externa y validación real. No se afirma producción lista.
- El mapa se carga solo con coordenadas registradas y tras pulsar «Cargar mapa»;
  requiere teselas OpenStreetMap. No geocodifica ni infiere direcciones.
- Los grupos demográficos con menos de tres clientes identificados se suprimen
  (umbral configurable hacia arriba). No se inventan conclusiones para llenarlos.
- Los reportes muestran ventas netas actuales filtradas por fecha de venta; no son
  un sistema de cierres fiscales ni una contabilidad tributaria dominicana.
- Moneda operativa DOP. No hay conversión de divisas, integración automática de
  bancos ni pasarela de tarjeta: reportar y verificar pagos es un proceso manual.
- Las lecturas actuales cargan la instantánea del negocio; para volúmenes muy grandes
  se necesita paginación y agregación del lado del servidor.

## Demostración aislada

`npm run demo` prepara y arranca una base local reservada para datos ficticios.
`npm run demo:seed` solo prepara los datos. Ambos conservan las pruebas existentes
si la carga ya terminó; no restablecen ni borran registros. El acceso y el secreto
se generan en `.sockit/demo/access.env` (privado, ignorado por Git), con una cookie
diferente de la sesión del negocio. No se imprimen contraseñas.

La base demo es `.sockit/demo/postgres`, sus archivos `.sockit/demo/uploads` y su
salida de Next `.next-demo`. La carga rechaza producción, conexiones Supabase,
rutas distintas, enlaces simbólicos a otras carpetas y bases previamente ocupadas
sin marca de demostración. Un bloqueo evita abrir dos instancias simultáneas.
No cargar registros de demostración en `.sockit/postgres` ni en proyectos reales.
El aviso DEMOSTRACIÓN permanece visible en todos los módulos.

La red del entorno no ofrece por sí sola un enlace externo. No presentar la
dirección interna como accesible desde el equipo de la propietaria. Para crear
un enlace privado de prueba se requiere alojamiento autorizado y protección de
acceso; consultar [preparación de despliegue](docs/DESPLIEGUE.md). El código se
guarda en GitHub, pero datos locales, contraseñas, comprobantes y respaldos no se
suben al repositorio.
