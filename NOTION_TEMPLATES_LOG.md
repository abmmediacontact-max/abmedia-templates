# Registro de plantillas importadas desde Notion "Story Templates"

Fuente: https://melon-bicycle-a1d.notion.site/Story-Templates-1d5daed52b5881ba9310de98ff1f442f

Este archivo lleva el control de qué plantillas de esa base de datos de Notion
ya se han incorporado a `catalog.js`, para poder seguir añadiendo más rondas
en el futuro sin repetir contenido. Cada vez que se añadan nuevas plantillas
desde este Notion, hay que actualizar la tabla de abajo.

## Cómo usar este archivo

1. Antes de elegir nuevas plantillas del Notion, revisa la tabla "Ya usadas"
   para no repetir ninguna (columna "Notion – Título original").
2. Al añadir plantillas nuevas a `catalog.js`, añade una fila nueva a la tabla
   con: título original en Notion, tipo (categoría Notion), el/los `id` que se
   le dio en `catalog.js`, y la fecha.
3. Mantén la sintaxis y formato de `catalog.js`: sin instrucciones dentro de
   `body`, instrucciones de producción/foto en `objective`, variables con
   `(*...*)`, todo en español, y adaptación original (no copia literal) del
   contenido de Notion.

## Mapeo de categorías (app ↔ Notion "Type")

| Categoría app | Type en Notion |
|---|---|
| personal | Personal |
| venta | Sales, Sales (Workshop) |
| puente | Bridge, Bridge (Long-Form) |
| flex | Flex |
| valor | Value |

## Plantillas ya usadas (incorporadas en catalog.js)

| Notion – Título original | Type | id(s) en catalog.js | Fecha |
|---|---|---|---|
| Life Story | Personal | p-historiavida | 2026-07-14 |
| Perfect Day | Personal | p-diaperfecto | 2026-07-14 |
| Book Quote | Personal | p-fraselibro | 2026-07-14 |
| Doors Open | Sales | v-reaperturacupos | 2026-07-14 |
| Pros & Cons | Sales | v-prosycons | 2026-07-14 |
| Success Recap | Sales | v-recapresultados | 2026-07-14 |
| Case Study Bridge | Bridge | pu-casodeexito | 2026-07-14 |
| 1-2-3 Years Ago | Bridge | pu-anosconsistencia | 2026-07-14 |
| Quick 1-2 | Bridge | pu-guiarapida | 2026-07-14 |
| Client Onboarding | Flex | f-bienvenida | 2026-07-14 |
| New Setup | Flex | f-nuevomontaje | 2026-07-14 |
| Live Client Flex | Flex | f-antesydespues | 2026-07-14 |
| 4 Buckets | Value | val-4tipos | 2026-07-14 |
| Mental Models | Value | val-modelosmentales | 2026-07-14 |
| Traits of the Successful | Value | val-rasgoexito | 2026-07-14 |
| Traveling | Personal | p-vistaavion | 2026-07-14 |
| Rate my X | Personal | p-puntuami | 2026-07-14 |
| Expensive Hobbies | Personal | p-micapricho | 2026-07-14 |
| Friendly Reminder | Sales | v-recordatorio | 2026-07-14 |
| Enter 2026 Already Ahead | Sales | v-empiezaconventaja | 2026-07-14 |
| Let's Play A Game… | Sales | v-juguemos | 2026-07-14 |
| Drop a Bomb | Bridge | pu-suelolabomba | 2026-07-14 |
| Common Tool PSA | Bridge | pu-avisoherramienta | 2026-07-14 |
| Common Solution Sucks… | Bridge | pu-solucionnofunciona | 2026-07-14 |
| Why Not You | Flex | f-porquenotu | 2026-07-14 |
| Client Help | Flex | f-ayudandocliente | 2026-07-14 |
| New Video Tease | Flex | f-adelantovideo | 2026-07-14 |
| Biggest Lie | Value | val-lamayormentira | 2026-07-14 |
| Struggle Solution | Value | val-luchaasolucion | 2026-07-14 |
| Do The Boring Work | Value | val-trabajoaburrido | 2026-07-14 |

## Notas sobre adaptación

Varias plantillas de Notion son de un único frame ("Prompt"/"Concept"/
"Directions" sin secciones "Story N" adicionales). En esos casos se adaptó el
concepto original a una plantilla propia de 2 o más frames en español,
manteniendo el ángulo temático pero sin traducir literalmente el texto de
Notion (política de no reproducir contenido con derechos de autor de forma
verbatim). Esto aplica a: Book Quote, Client Onboarding, New Setup y Traits of
the Successful.

En la segunda ronda (15 plantillas nuevas), la mayoría de entradas de un único
frame se mantuvieron como plantillas de 1 slide (Vista desde el avión, Puntúa
mi…, Mi capricho, ¿Por qué no tú?, Ayudando a un cliente, Adelanto de vídeo,
La mayor mentira, Haz el trabajo aburrido, Aviso sobre una herramienta, La
solución típica no funciona), mientras que las de varios frames en Notion
("Story 1/2/3") se mantuvieron con el mismo número de slides (Enter 2026
Already Ahead → 3 slides, Let's Play A Game → 3 slides, Struggle Solution → 3
slides, Drop a Bomb → 2 slides, Friendly Reminder se dividió en 2 slides para
mejorar el ritmo). En todos los casos se redactó en español de forma original,
sin copia literal del texto de Notion.

## Pendiente para próximas rondas

La base de Notion tiene decenas de entradas adicionales sin explorar todavía
en las categorías Sales (Workshop) y Bridge (Long-Form), además de posibles
entradas nuevas que se añadan con el tiempo. Antes de la siguiente ronda:

1. Abrir la base de Notion y filtrar por "Type".
2. Descartar cualquier título que ya aparezca en la tabla "Ya usadas" arriba.
3. Elegir candidatas nuevas, verificar si tienen 2+ "Story N" (multi-frame) o
   si hay que adaptarlas igual que las de este lote.
4. Redactar en el mismo formato que el resto de `catalog.js` y añadir una fila
   nueva a este registro al terminar.
