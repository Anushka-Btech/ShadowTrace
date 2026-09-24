// Kill-switch service worker.
//
// A stale service worker from a previous project on localhost:3000 was
// serving cached HTML and breaking React hydration. Browsers that still have
// that worker registered will fetch this file on their next update check;
// it takes over, unregisters itself, and reloads every open tab clean.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // wipe any caches the old worker left behind
      const keys = await caches.keys()
      await Promise.all(keys.map(key => caches.delete(key)))
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach(client => client.navigate(client.url))
    })(),
  )
})
