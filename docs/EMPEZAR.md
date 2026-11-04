# Cómo empezar a utilizar SOCKIT

## Lo que está preparado

La aplicación y una base de demostración separada. Los datos ficticios se
identifican con **DEMO**; la pantalla lo recuerda en todo momento. Puedes practicar
sin introducir información de clientes reales ni hacer transferencias bancarias.

Este entorno no ofrece una herramienta para entregarte un enlace web externo.
Una dirección interna del servidor no se abriría desde tu computadora o celular.
Para un enlace navegable privado prepararemos un despliegue **de prueba** en Vercel,
con una base **de prueba** en Supabase. No se ha publicado ese despliegue.

## Paso 1: crea tus cuentas

Abre estas páginas y usa tu propio correo:

1. [Crear o entrar a Supabase](https://supabase.com/dashboard).
2. [Crear cuenta en Vercel](https://vercel.com/signup). Puedes elegir continuar con GitHub.

No compartas aquí contraseñas, claves administrativas ni datos de tarjetas.
Todavía no importes el repositorio en Vercel: esa acción puede iniciar un
despliegue automáticamente. Primero configuraremos el entorno de pruebas.

## Paso 2: prepara dos bases separadas en Supabase

Primero crea solo `sockit-pruebas`. Cuando apruebes el uso real, prepararemos un segundo proyecto independiente:

| Nombre sugerido | Para qué se usa |
| --- | --- |
| `sockit-pruebas` | Practicar con datos ficticios. |
| `sockit-produccion` | Tu negocio real, después de tu autorización. |

Elige contraseñas de base de datos diferentes y guárdalas en tu gestor de
contraseñas. No necesitas comprar un dominio para probar. Si el plan elegido no
permite dos proyectos, prepara primero solo el de pruebas; no reutilices esa base
como producción ni borres proyectos existentes para hacer espacio.

Cuando los tengas, indícame sus nombres. Los valores técnicos se introducirán en
la configuración segura del servicio, sin pegarlos en esta conversación.

## Paso 3: autoriza únicamente la prueba

Antes de crear el enlace, debes autorizar estas acciones concretas:

1. Preparar las tablas y el almacenamiento privado **en `sockit-pruebas`**.
2. Crear tu usuario de prueba en Supabase Auth; tú establecerás la contraseña.
3. Cargar los datos ficticios **solo en ese proyecto de pruebas**.
4. Crear el despliegue de prueba en Vercel y activar su protección de acceso.

Esto no autoriza a modificar `sockit-produccion`. La carga de demostración local
incluida en el código rechaza conexiones a Supabase: no puede cargar por accidente
datos ficticios en un proyecto hospedado.

La protección de Vercel depende de las opciones de tu cuenta. Para un acceso
privado de prueba, comprobaremos la protección con Vercel Authentication, o la
opción equivalente disponible, además del inicio de sesión de SOCKIT. Un enlace
difícil de adivinar no sustituye esta protección.

## Paso 4: abre tu enlace de prueba

Después de configurar y comprobar el despliegue recibirás una dirección HTTPS
real, no una dirección interna. Desde tu computadora o celular:

1. Abre esa dirección en Chrome, Safari o Edge.
2. Si Vercel te pide acceso, entra con tu cuenta autorizada.
3. En SOCKIT, entra con el correo y la contraseña de **prueba** que tú creaste.
4. Comprueba que aparezca el aviso **DEMOSTRACIÓN** antes de practicar.

No hay un enlace de prueba publicado todavía. No necesitas ejecutar comandos.

## Paso 5: practica con estos recorridos

**Inventario:** abre Inventario. Verás seis diseños ficticios, incluido uno
agotado. Puedes crear un diseño nuevo y registrar una compra para aumentar sus pares.

**Ventas:** abre Ventas y elige Nueva venta. Selecciona un diseño disponible,
indica pares y cliente de prueba. Guarda y comprueba el cambio en Inventario y Finanzas.

**Pedidos:** abre Pedidos. Crea uno para un cliente DEMO. Confirmarlo reserva pares;
prepararlo y marcarlo listo no los descuenta dos veces. Al enviarlo se registra
la salida y la venta. También puedes usar el tablero Kanban y el calendario.

**Transferencias:** abre Confirmación de pagos. Hay pagos ficticios pendientes.
Al confirmar uno, aumenta la cuenta receptora; rechazarlo no genera dinero.
No necesitas hacer una transferencia real ni cargar comprobantes reales.

**Estadísticas:** abre Estadísticas y cambia entre diseño, edad y ubicación.
En Inteligencia comercial puedes comparar diseños. Los grupos con pocos clientes
se ocultan para proteger la privacidad, también en la demostración.

**Reportes:** abre Reportes, selecciona inventario, ventas o pedidos y descarga
un CSV, Excel o PDF. El archivo se guarda con la función normal de tu navegador.

Los nombres, saldos y movimientos DEMO son ficticios. Se guardan tus pruebas al
volver a entrar: no se reinician ni se borran automáticamente.

## Paso 6: pasar al negocio real, cuando tú decidas

Solo después de tu aprobación:

1. Prepararemos las tablas y el usuario en `sockit-produccion`.
2. Confirmaremos que esté vacía y que no tenga clientes ni ventas DEMO.
3. Configuraremos copias de seguridad y recuperación de contraseña.
4. Haremos un despliegue nuevo con las variables de producción.
5. Verificaremos inicio de sesión, permisos y acceso desde tu celular.
6. Te entregaremos el enlace real y podrás ingresar tus productos y capital.

No se trasladarán a producción los saldos, clientes, pedidos ni comprobantes de
demostración. No se promoverá una compilación de prueba sin reconstruirla con la
configuración de producción. Puedes seguir practicando en el enlace de pruebas.

## Qué no debes autorizar todavía

No autorices despliegue de producción, carga de datos reales, migraciones sobre
una base con registros reales ni pagos de servicios hasta revisar la configuración
concreta y los costos del plan que hayas elegido. Crear las cuentas no requiere
entregarme sus contraseñas ni contratar un plan de pago automáticamente.
