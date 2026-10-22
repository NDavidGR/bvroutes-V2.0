# BV Route Control Center 2.0

Panel de rutas sobre Supabase. Sitio estático (HTML + JS sin build): se publica tal cual en Vercel.

## Puesta en marcha
1. Base de datos: correr `01_schema.sql`, `02_seed.sql` y `03_triggers.sql` (carpeta `sql/`) en el SQL Editor de Supabase.
2. Crear el usuario en Authentication → Users y autorizarlo:
   `insert into editors select id from auth.users where email = 'TU_CORREO';`
3. En Vercel: Add New → Project → importar este repo (sin framework, sin build).
4. Al abrir la página: iniciar sesión y pegar la llave de Google Maps (se guarda solo en el navegador).
   La llave debe permitir el dominio de Vercel como referente HTTP.

## Archivos
- `js/config.js`: URL y clave pública (anon) de Supabase, colores de rutas.
- `js/data.js`: carga paginada y escritura (stops, routes, route_stops).
- `js/map.js`: mapa y marcadores. `js/panel.js`: edición de una parada. `js/app.js`: lista, filtros, alta.


## SQL a ejecutar (en orden)
`01_schema.sql` → `02_seed.sql` → `03_triggers.sql` → `04_move_functions.sql` (mover/agregar/quitar con renumeración y un solo registro de historial) → `05_reorder.sql` (reordenar arrastrando) → `06_day_plans.sql` (plan del día y sus versiones) → `07_route_order.sql` (guardar el orden completo de una ruta, con respaldo en el historial).

## Páginas
- `index.html` — Rutas: mapa, edición de paradas, mover/agregar, reordenar, historial.
- `plan.html` — Plan del día: pegar paradas, ORGANIZE, salida ordenada, mapa del orden del día. Comparte la sesión con `index.html`.
- `mapa.html` — Mapa de TODAS las rutas del día superpuestas (solo las paradas del plan), en vivo; se abre desde el Plan del día.
- `reordenar.html` — Reordenar una ruta sobre el mapa: clic en pines, ▢ Área, orden por eje, proponer, arrastrar en la lista, guardar y restaurar órdenes anteriores.

## Otras funciones
- Búsqueda por dirección (Google Geocoder) al crear o ubicar una parada; sugiere en qué posición cae (después de la parada más cercana).
- `Exportar` (CSV y JSON) en la app de Rutas; filtro y etiqueta `SIN PIN`.
- Historial de todos los cambios, incluido `Orden guardado`.
