const CACHE_NAME = 'pt-v2'
const FONT_CACHE = 'pt-fonts-v1'

// Install: cache the app shell entry point
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([
        '/prospect-tracker/',
        '/prospect-tracker/favicon.svg',
        '/prospect-tracker/icons.svg',
      ])
    )
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== FONT_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch: routing strategy
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // 1. Google Fonts — stale-while-revalidate
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const fetched = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone())
            return response
          }).catch(() => cached)
          return cached || fetched
        })
      )
    )
    return
  }

  // 2. Hashed assets — cache-first (immutable, Vite content-hashes filenames)
  if (url.pathname.startsWith('/prospect-tracker/assets/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // 3. API calls — pass through, no caching
  if (
    url.hostname === 'api.outscraper.cloud' ||
    url.hostname.includes('supabase.co') ||
    url.hostname === 'nominatim.openstreetmap.org' ||
    url.hostname === 'api.routexl.com' ||
    url.hostname === 'api.zippopotam.us' ||
    url.hostname.includes('backblazeb2.com') ||
    url.hostname.includes('vercel.app')
  ) {
    return // Let browser handle normally
  }

  // Cache API only supports GET — skip anything else (POST/PUT/DELETE).
  if (event.request.method !== 'GET') return

  // 4. Navigation — network-first, fall back to cached app shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
          return response
        })
        .catch(() => caches.match('/prospect-tracker/'))
    )
    return
  }

  // 5. Everything else — cache-first
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
        }
        return response
      })
    )
  )
})
