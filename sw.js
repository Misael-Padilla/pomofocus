const CACHE_NAME = 'pomofocus-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Fase de Instalación: Guardar archivos en caché
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Caché guardada correctamente');
      return cache.addAll(ASSETS);
    })
  );
});

// Fase de Interceptación: Servir desde caché si no hay red
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Retorna el recurso en caché, o hace la petición a la red si no está
      return response || fetch(event.request);
    })
  );
});

// Fase de Activación: Limpieza de cachés antiguas
self.addEventListener('activate', (event) => {
  const cacheAllowlist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheAllowlist.includes(cacheName)) {
            console.log('🗑️ Caché antigua eliminada:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});