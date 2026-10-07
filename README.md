# FridgeNFC

La lista de lo que falta en casa, compartida y sin cuentas. Pegas un sticker NFC en la nevera; al acercar el móvil se abre la lista y cualquiera de casa apunta, marca o borra.

- Sin app que instalar y sin login: es una web (se puede añadir a la pantalla de inicio).
- Funciona sin conexión: lo que apuntas se guarda en el móvil y se envía al volver la red.
- Varias listas por casa (nevera, despensa…): cada sticker lleva un enlace distinto.

## Estructura

```
Fuentes/            la app (HTML, CSS y JS sin dependencias ni build)
  index.html
  css/app.css
  js/app.js         pantalla y acciones
  js/datos.js       Supabase, copia local y cola sin conexión
  js/config.js      URL y clave de Supabase  ← lo único que hay que rellenar
  service-worker.js abre la app sin conexión
  manifest.json, icons/
supabase/esquema.sql   tabla y funciones (se ejecuta una vez)
docs/                  cómo funciona y cómo ponerlo en marcha
.github/workflows/     publica Fuentes/ en GitHub Pages
```

## Probarla en local

```bash
python -m http.server 8000 -d Fuentes
```

Abre http://localhost:8000. Sin rellenar `js/config.js` funciona en **modo local**: la lista vive solo en ese navegador, sin sincronizar. Para probarla de verdad entre móviles, sigue [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md).

## Documentación

- [Puesta en marcha](docs/puesta-en-marcha.md): Supabase, GitHub Pages y grabar los stickers.
- [Cómo funciona](docs/como-funciona.md): listas, datos, modo sin conexión y seguridad.
