# Cómo funciona

## Listas

Cada lista tiene un id aleatorio de 16 letras y números (por ejemplo `k3v9q2m8x1d7p4ta`) que va en el enlace: `.../fridgenfc/#k3v9q2m8x1d7p4ta`. Ese enlace es lo que se graba en el sticker.

- Quien tiene el enlace puede ver y editar la lista. No hay usuarios ni contraseñas.
- El móvil recuerda las listas que ha abierto, con el nombre que les has puesto, y quién eres (para el «Aitzol · hace 2 h» de cada cosa). Todo eso vive en el `localStorage` del móvil, no en el servidor.
- Los enlaces de la versión anterior (12 caracteres) siguen funcionando.

## Datos

Una sola tabla, `items`: `id`, `room_id` (el id de la lista), `name`, `done`, `added_by`, `created_at`, `updated_at`.

La app no toca la tabla directamente. Usa cuatro funciones de Supabase, todas con el id de la lista como primer parámetro:

| Función | Qué hace |
|---|---|
| `listar_items(p_sala)` | Devuelve la lista |
| `guardar_item(p_sala, p_id, p_nombre, p_quien)` | Añade (o actualiza) un elemento |
| `marcar_item(p_sala, p_id, p_hecho)` | Marca como comprado o pendiente |
| `borrar_items(p_sala, p_ids)` | Borra uno o varios |

## Sin conexión

En `js/datos.js`:

1. Cada cambio se aplica al momento en pantalla y entra en una **cola** guardada en el móvil.
2. La cola se envía en orden. Si no hay red, se queda ahí y se reintenta al volver a la app, al recuperar la conexión y cada 15 segundos.
3. Los ids los genera el móvil (UUID), así que un elemento recién añadido sin conexión ya se puede marcar o borrar, y reenviarlo no lo duplica.
4. Si el servidor rechaza un dato (nombre vacío, demasiado largo), se descarta. Si el fallo es de configuración (función no instalada, clave mal), **no** se descarta nada y arriba aparece «Sin conexión con el servidor».

El service worker guarda los archivos de la app (red primero, copia guardada si no hay red), así que también abre sin internet.

La lista se refresca cada 15 segundos con la app abierta y al volver a ella. No usa tiempo real: con una lista de la compra no hace falta, y el tiempo real de Supabase no encaja con este modelo de seguridad sin usuarios.

## Seguridad

En la versión anterior la política de la tabla era `using (true)`: con la clave pública del HTML, cualquiera podía leer y borrar las listas de todo el mundo (`/rest/v1/items?select=*`).

Ahora:

- La tabla tiene RLS activado, ninguna política y ningún permiso para `anon`: no se puede leer ni escribir directamente.
- Las cuatro funciones son `security definer` y siempre filtran por `room_id = p_sala`. Sin el id de una lista no se puede leer ni tocar nada, ni listar las de otros.
- Restricciones en la tabla: formato del id, nombre de 1 a 60 caracteres y nombre de persona de hasta 30.

Lo que **no** protege: quien tenga el enlace (o el sticker) tiene la lista. Es el mismo trato que un enlace de «cualquiera con el enlace puede editar».

## Diferencias con la versión anterior

| Antes | Ahora |
|---|---|
| Tabla abierta a cualquiera | Solo funciones con el id de la lista |
| Lo añadido sin red se perdía (id temporal) | Cola local que se envía al volver la red |
| Sin copia local: sin red, lista vacía | La lista se guarda en el móvil |
| Nombres de la familia fijos en el código | Cada móvil dice quién es |
| Rutas absolutas, iconos inexistentes | Funciona en GitHub Pages, con iconos |
| Borrar sin vuelta atrás | «Deshacer» durante 5 segundos |
| — | Varias listas por móvil, «lo de siempre», avisos de duplicados, grabar el sticker desde Android, modo oscuro |
