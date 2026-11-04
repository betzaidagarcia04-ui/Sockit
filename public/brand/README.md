# Recursos SOCKIT extraídos del manual

Fuente: `SOCKIT_manual_de_identidad.pdf`, 12 páginas, versión 1.0.
Los SVG y PNG de `public/brand/` son extracciones de las páginas 3 y 7,
no redibujos ni archivos maestros del diseñador. `provenance.json` conserva
la página y el rectángulo de extracción en puntos PDF de cada recurso.

Incluye seis variantes del logo, seis paneles del sistema gráfico y el
isotipo T extraído del logo principal. PNG a escala 4×. SVG con texto
convertido a trazados, sin depender de fuentes instaladas. Se preservaron
colores, proporciones y fondos tal como aparecen en el PDF. Las páginas
originales contienen vectores, sin imágenes rasterizadas.

Se revisaron visualmente las páginas de logos y patrones, y las extracciones
PNG del logo principal y del isotipo. No se ha validado todavía cada SVG en
navegadores. Los SVG conservan contenido de página recortado: falta optimizar
su peso y eliminar elementos fuera del recorte antes de integrarlos en producción.
Los patrones son paneles extraídos; no se afirma que sean mosaicos repetibles.
No hay ilustraciones oficiales en la carpeta `illustrations`.

El manual recomienda un margen de seguridad igual a la altura del puño de
la T. Los recortes son recursos de origen, no incorporan ese margen completo;
debe añadirse al utilizarlos. Ancho mínimo: logo completo 150 px, compacto
80 px, isotipo 24 px. No estirar, rotar ni recolorear talón y punta.

`tokens.css` transcribe los siete colores hexadecimales de la página 4
y las familias indicadas en la página 6. Deben descargarse fuentes completas
con licencia OFL cuando se restablezca la red; no usar los subconjuntos del
PDF como fuentes de interfaz. Titulares Fraunces Bold, cuerpo DM Sans
Regular/Medium y acentos breves Instrument Serif Italic.

Pendiente: optimización vectorial, comprobación de variantes en navegador,
favicon y tamaños de iconos móviles con márgenes apropiados, carga de fuentes
y la integración en la aplicación. El manual también recomienda entregar
maestros SVG/PNG afinados por un diseñador; estas extracciones no sustituyen
esos maestros. La aplicación y sus pruebas siguen bloqueadas por el proxy.

## Integración posterior

Los originales anteriores se conservan. Las versiones optimizadas están en
`/brand/optimized/` y se usan en la interfaz. Se añadieron favicon e iconos
180/192/512 extraídos directamente del isotipo del PDF, con margen de seguridad.
Las fuentes completas OFL se sirven localmente desde Fontsource. La extracción
y optimización tienen scripts reproducibles en `scripts/`.
