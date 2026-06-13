import { ref } from 'vue'

export function parseHash(hash) {
  const h = hash.replace(/^#\/?/, '')
  try {
    if (h.startsWith('player/')) return { name: 'player', key: decodeURIComponent(h.slice('player/'.length)) }
  } catch {
    // 畸形的 percent-encoding（手打或截斷的網址）→ 回首頁
  }
  if (h.startsWith('uploader/')) return { name: 'uploader', id: h.slice('uploader/'.length) }
  if (h === 'players') return { name: 'players' }
  return { name: 'home' }
}

export function useRoute() {
  const route = ref(parseHash(location.hash))
  window.addEventListener('hashchange', () => {
    route.value = parseHash(location.hash)
  })
  return route
}
