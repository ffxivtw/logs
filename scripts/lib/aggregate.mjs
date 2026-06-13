import { createHash } from 'node:crypto'

// 玩家 key（角色名@伺服器）→ 分片名：UTF-8 SHA-1 第 1 個 byte 的 2 位 hex。
// 前端 src/lib/data.js 的 shardOf 必須算出相同值。
export function shardOf(playerKey) {
  return createHash('sha1').update(playerKey, 'utf8').digest('hex').slice(0, 2)
}

export function createAccumulator() {
  return { reports: new Map() }
}

export function readReportsJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function collectReport(report, encounterKey, acc, tcServers) {
  const code = report?.report_code
  const owner = report?.owner
  if (!code || !owner || owner.id == null) return
  let entry = acc.reports.get(code)
  if (!entry) {
    const players = new Set()
    for (const fight of report.fights ?? []) {
      for (const p of fight.players ?? []) {
        if (p.name && tcServers.has(p.server)) players.add(`${p.name}@${p.server}`)
      }
    }
    entry = {
      code,
      url: report.url ?? `https://www.fflogs.com/reports/${code}`,
      owner: { id: owner.id, name: owner.name ?? String(owner.id) },
      time_iso: report.report_start_time_iso ?? null,
      fight_count: (report.fights ?? []).length,
      players,
      encounters: new Set(),
    }
    acc.reports.set(code, entry)
  }
  entry.encounters.add(encounterKey)
}

export function aggregate(acc) {
  const uploaders = new Map()
  const players = new Map()
  const monthly = {}
  for (const r of acc.reports.values()) {
    let u = uploaders.get(r.owner.id)
    if (!u) {
      u = { id: r.owner.id, name: r.owner.name, report_count: 0, fight_count: 0, players: new Set(), encounters: {}, monthly: {} }
      uploaders.set(r.owner.id, u)
    }
    u.report_count += 1
    u.fight_count += r.fight_count
    const month = r.time_iso ? r.time_iso.slice(0, 7) : null
    if (month) {
      monthly[month] = (monthly[month] ?? 0) + 1
      u.monthly[month] = (u.monthly[month] ?? 0) + 1
    }
    for (const k of r.encounters) u.encounters[k] = (u.encounters[k] ?? 0) + 1
    const reportRef = {
      code: r.code,
      encounters: [...r.encounters].sort(),
      time_iso: r.time_iso,
      url: r.url,
    }
    for (const key of r.players) {
      u.players.add(key)
      let byUploader = players.get(key)
      if (!byUploader) { byUploader = new Map(); players.set(key, byUploader) }
      let pu = byUploader.get(r.owner.id)
      if (!pu) { pu = { id: r.owner.id, name: r.owner.name, reports: [] }; byUploader.set(r.owner.id, pu) }
      pu.reports.push(reportRef)
    }
  }
  return { uploaders, players, reportCount: acc.reports.size, monthly }
}

function sortedMonthly(m) {
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))
}

export function buildOutputs({ uploaders, players, reportCount, monthly = {} }, { now, encounterNames = {} }) {
  const uploaderRows = [...uploaders.values()]
    .map((u) => ({
      id: u.id,
      name: u.name,
      report_count: u.report_count,
      unique_player_count: u.players.size,
      fight_count: u.fight_count,
      encounters: u.encounters,
    }))
    .sort((a, b) => b.report_count - a.report_count || a.id - b.id)

  const playerShards = new Map()
  const playersRanking = []
  const perUploaderPlayers = new Map() // ownerId → Map(playerKey → report 數)
  const sortedKeys = [...players.keys()].sort()
  for (const key of sortedKeys) {
    const uploaderList = [...players.get(key).values()]
      .map((pu) => ({
        id: pu.id,
        name: pu.name,
        owner_total: uploaders.get(pu.id).report_count,
        reports: [...pu.reports].sort(
          (a, b) => (b.time_iso ?? '').localeCompare(a.time_iso ?? '') || a.code.localeCompare(b.code),
        ),
      }))
      .sort((a, b) => b.reports.length - a.reports.length || a.id - b.id)
    const playerMonthly = {}
    for (const pu of uploaderList) {
      let m = perUploaderPlayers.get(pu.id)
      if (!m) { m = new Map(); perUploaderPlayers.set(pu.id, m) }
      m.set(key, pu.reports.length)
      for (const rep of pu.reports) {
        if (rep.time_iso) {
          const mk = rep.time_iso.slice(0, 7)
          playerMonthly[mk] = (playerMonthly[mk] ?? 0) + 1
        }
      }
    }
    const shard = shardOf(key)
    let content = playerShards.get(shard)
    if (!content) { content = {}; playerShards.set(shard, content) }
    content[key] = { uploaders: uploaderList, monthly: sortedMonthly(playerMonthly) }
    playersRanking.push({
      key,
      reports: uploaderList.reduce((s, u) => s + u.reports.length, 0),
      uploaders: uploaderList.length,
    })
  }
  playersRanking.sort((a, b) => b.reports - a.reports || a.key.localeCompare(b.key))

  const uploaderDetails = new Map()
  for (const u of uploaderRows) {
    const m = perUploaderPlayers.get(u.id) ?? new Map()
    uploaderDetails.set(u.id, {
      ...u,
      monthly: sortedMonthly(uploaders.get(u.id).monthly),
      players: [...m.entries()]
        .map(([key, report_count]) => ({ key, report_count }))
        .sort((a, b) => b.report_count - a.report_count || a.key.localeCompare(b.key)),
    })
  }

  return {
    uploaders: { updated_at_iso: now, uploaders: uploaderRows },
    playerShards,
    uploaderDetails,
    playersIndex: sortedKeys,
    playersRanking,
    meta: {
      updated_at_iso: now,
      report_count: reportCount,
      uploader_count: uploaderRows.length,
      player_count: sortedKeys.length,
      encounters: encounterNames,
      monthly: sortedMonthly(monthly),
    },
  }
}
