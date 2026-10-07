# Puesta en marcha

Tres pasos, unos 15 minutos.

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (el plan gratuito sobra).
2. **SQL Editor → New query**, pega entero [`supabase/esquema.sql`](../supabase/esquema.sql) y ejecútalo.
   - Se puede repetir sin miedo: si la tabla ya existía, la actualiza y quita la política abierta de la versión anterior.
3. **Project Settings → API**, copia la *Project URL* y la clave *anon public* en [`Fuentes/js/config.js`](../Fuentes/js/config.js):

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

La clave *anon* es pública por diseño y puede ir en el repo: con este esquema solo sirve para llamar a las cuatro funciones de la app, que exigen el id de una lista. La clave *service_role* **nunca** va en el código.

## 2. GitHub Pages

1. En el repo: **Settings → Pages → Source: GitHub Actions**.
2. Cada push a `main` publica la carpeta `Fuentes/` con [`.github/workflows/pages.yml`](../.github/workflows/pages.yml). También se puede lanzar a mano desde **Actions → Publicar en GitHub Pages → Run workflow**.
3. La app queda en `https://<usuario>.github.io/<repo>/` (aquí, `https://fridgenfc.github.io/fridgenfc/`).

Si cambias archivos de la app, sube `VERSION` en `Fuentes/service-worker.js` para que los móviles no se queden con la copia vieja.

## 3. Stickers NFC

Sirven los NTAG213 o NTAG215 normales (los más baratos).

1. Abre la app en el móvil: la primera vez crea una lista y te pide su nombre y el tuyo.
2. Toca el botón de compartir (arriba a la derecha).
3. Graba el enlace en el sticker:
   - **Android (Chrome):** botón *Grabar en un sticker* y acerca el sticker. No hace falta ninguna app.
   - **iPhone:** con la app gratuita *NFC Tools*: Escribir → Añadir un registro → URL/URI → pega el enlace → Escribir.
4. Pega el sticker en la nevera. Al acercar cualquier móvil se abre esa lista.

Para otra lista (despensa, trastero), toca el nombre de la lista → *Crear otra lista* y graba su enlace en otro sticker.
