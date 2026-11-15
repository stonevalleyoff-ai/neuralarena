// Neural Arena — LE SERVICE WORKER (sw.js)
// Il garde le jeu (sa page, son habillage, ses scripts, ses icônes) pour que l'application installée s'ouvre et se joue sans réseau.
// Il ne répond que pour les fichiers du jeu, à sa propre adresse ; rien du service de comptes n'est gardé : il est sur un autre site.
// Les pages, les scripts et les styles : le réseau d'abord (une nouvelle version se voit tout de suite), la copie gardée sinon.
// Les icônes : la copie gardée d'abord, rafraîchie en arrière-plan.
// Changer CACHE quand la liste du SOCLE change : l'ancienne copie est alors jetée.
'use strict';
const CACHE = 'neuralarena-1';
const SOCLE = ['./', 'style.css', 'sim.js', 'rendu.js', 'compte.js', 'app.js', 'train-worker.js', 'manifest.webmanifest', 'icones/icone.svg', 'icones/icone-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SOCLE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(l => Promise.all(l.filter(n => n.startsWith('neuralarena-') && n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== self.location.origin) return;
  const garder = rep => { if (rep && rep.ok) { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(r, copie)); } return rep; };
  if (/\.(?:png|svg)$/.test(u.pathname)) {
    e.respondWith(caches.match(r).then(x => { const frais = fetch(r).then(garder).catch(() => x); return x || frais; }));
    return;
  }
  // (la page se retrouve quels que soient ses paramètres : ./?source=app se sert de la copie de ./)
  e.respondWith(fetch(r).then(garder).catch(() => caches.match(r, { ignoreSearch: true }).then(x => x || (r.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
