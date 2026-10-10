// FridgeNFC · service worker
//
// Guarda los archivos de la app para que abra sin conexión.
// Estrategia: red primero (siempre la última versión si hay internet) y, si
// falla, la copia guardada. Las llamadas a Supabase no pasan por aquí: la app
// guarda su propia copia de la lista (js/datos.js).
//
// Al cambiar archivos de la app, sube VERSION para limpiar la caché vieja.

const VERSION = 'fridgenfc-v6';

const ARCHIVOS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/datos.js',
  './js/qrcode.js',
  './js/config.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET' || new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith(
    // no-cache: pregunta siempre al servidor y no mezcla archivos nuevos con viejos
    // de la caché del navegador (GitHub Pages los guarda 10 minutos).
    fetch(peticion, { cache: 'no-cache' })
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(async () => {
        const guardada = await caches.match(peticion, { ignoreSearch: true });
        if (guardada) return guardada;
        // Navegación sin conexión a una URL no guardada: se sirve la app.
        if (peticion.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
