/* DPA Player — Service Worker
   Rende il player installabile e utilizzabile offline.
   NB: la musica NON viene messa in cache qui: i brani vivono in IndexedDB,
   salvati sul dispositivo dell'utente. Qui mettiamo in cache solo il guscio dell'app. */

var CACHE = 'dpa-player-v1';
var SHELL = [
  'player.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png'
];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // addAll fallisce se un file manca: aggiungiamo uno per uno in modo tollerante
      return Promise.all(SHELL.map(function(url){
        return c.add(url).catch(function(){ /* ignora singolo file mancante */ });
      }));
    })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; })
                            .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method!=='GET') return;
  var url = new URL(req.url);
  // Solo richieste same-origin (font/cdn passano dalla rete normalmente)
  if(url.origin !== self.location.origin) return;

  // Strategia: cache-first per il guscio, network fallback, poi cache di riserva.
  e.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res && res.status===200 && res.type==='basic'){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      }).catch(function(){
        // offline e non in cache: prova a servire player.html per le navigazioni
        if(req.mode==='navigate') return caches.match('player.html');
      });
    })
  );
});
