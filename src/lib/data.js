const cache = new Map()

export function fetchJson(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`${import.meta.env.BASE_URL}data/${path}`)
        .then((r) => {
          if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
          return r.json()
        })
        .catch((e) => {
          cache.delete(path) // 暫時性失敗不要永久快取
          throw e
        }),
    )
  }
  return cache.get(path)
}

// 必須與 scripts/lib/aggregate.mjs 的 shardOf 算出相同值（SHA-1 第 1 byte 的 2 位 hex）
export async function shardOf(playerKey) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(playerKey))
  return new Uint8Array(digest)[0].toString(16).padStart(2, '0')
}

export async function fetchPlayer(playerKey) {
  const shard = await shardOf(playerKey)
  try {
    const data = await fetchJson(`players/${shard}.json`)
    return data[playerKey] ?? null
  } catch {
    return null
  }
}
