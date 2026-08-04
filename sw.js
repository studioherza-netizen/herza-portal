/* Herza Home — Service Worker
   Estrategia:
   - Navegaciones (abrir la app): network-first → siempre trae la última versión
     publicada; si no hay red, sirve el shell cacheado (funciona offline).
   - Estáticos del mismo origen (íconos, manifest): stale-while-revalidate.
   - Todo lo de otros orígenes (Supabase, jsdelivr, Google Fonts) NO se intercepta:
     lo maneja el navegador con red directa, para no servir datos viejos.
   Sube VERSION cuando quieras forzar refresco del cache. */
const VERSION = 'hh-v1';
const CORE = ['/', '/oficina', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-180.png', '/icon.svg'];

self.addEventListener('install', function(e){
  e.waitUntil((async function(){
    try{
      const c = await caches.open(VERSION);
      await Promise.all(CORE.map(function(u){ return c.add(new Request(u, {cache:'reload'})).catch(function(){}); }));
    }catch(err){}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    try{
      const keys = await caches.keys();
      await Promise.all(keys.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
    }catch(err){}
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function(e){
  const req = e.request;
  if(req.method !== 'GET') return;
  let url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.origin !== self.location.origin) return; // Supabase / CDNs / fuentes → red directa

  // Navegación → network-first (siempre la versión más reciente)
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        try{ const copy = res.clone(); caches.open(VERSION).then(function(c){ c.put(req, copy); }).catch(function(){}); }catch(err){}
        return res;
      }).catch(function(){
        return caches.match(req).then(function(r){ return r || caches.match('/oficina').then(function(o){ return o || caches.match('/'); }); });
      })
    );
    return;
  }

  // Estáticos del mismo origen → stale-while-revalidate
  e.respondWith(
    caches.match(req).then(function(cached){
      const fetching = fetch(req).then(function(res){
        if(res && res.status === 200){ try{ const copy = res.clone(); caches.open(VERSION).then(function(c){ c.put(req, copy); }).catch(function(){}); }catch(err){} }
        return res;
      }).catch(function(){ return cached; });
      return cached || fetching;
    })
  );
});
