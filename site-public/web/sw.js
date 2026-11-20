// PWA v2 : réseau uniquement, aucune mise en cache des comptes, QR ou réponses API.
// skipWaiting et clients.claim permettent de remplacer immédiatement l'ancien worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
