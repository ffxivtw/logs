import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { shardOf } from './lib/aggregate.mjs'

const OUT_DIR = process.env.OUT_DIR ?? './public/data'
function fail(msg) {
  console.error(`validate:data 失敗: ${msg}`)
  process.exit(1)
}

function checkMonthly(monthly, cap, label) {
  if (monthly == null || typeof monthly !== 'object') fail(`${label} 缺 monthly`)
  let sum = 0
  for (const [k, v] of Object.entries(monthly)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(k)) fail(`${label} monthly 鍵格式錯誤: ${k}`)
    if (!Number.isInteger(v) || v < 1) fail(`${label} monthly 值異常: ${k}=${v}`)
    sum += v
  }
  if (sum > cap) fail(`${label} monthly 總和 ${sum} 超過上限 ${cap}`)
}

const uploaders = JSON.parse(readFileSync(join(OUT_DIR, 'uploaders.json'), 'utf8'))
if (!Array.isArray(uploaders.uploaders)) fail('uploaders.json 缺 uploaders 陣列')
if (uploaders.uploaders.length === 0) fail('uploaders 為空')
let prev = Infinity
for (const u of uploaders.uploaders) {
  if (u.id == null || typeof u.name !== 'string') fail(`uploader 缺 id/name: ${JSON.stringify(u)}`)
  for (const f of ['report_count', 'unique_player_count', 'fight_count']) {
    if (!Number.isInteger(u[f]) || u[f] < 0) fail(`uploader ${u.id} 欄位 ${f} 異常`)
  }
  if (u.report_count > prev) fail('uploaders 未按 report_count 遞減排序')
  prev = u.report_count
}

const meta = JSON.parse(readFileSync(join(OUT_DIR, 'meta.json'), 'utf8'))
for (const f of ['updated_at_iso', 'report_count', 'uploader_count', 'player_count', 'encounters']) {
  if (meta[f] == null) fail(`meta.json 缺 ${f}`)
}
if (meta.uploader_count !== uploaders.uploaders.length) fail('meta.uploader_count 與 uploaders.json 不符')
checkMonthly(meta.monthly, meta.report_count, 'meta.json')

const ranking = JSON.parse(readFileSync(join(OUT_DIR, 'players_ranking.json'), 'utf8'))
if (!Array.isArray(ranking.players)) fail('players_ranking.json 缺 players 陣列')
if (meta.player_count !== ranking.players.length) fail('meta.player_count 與 players_ranking 不符')
let prevReports = Infinity
for (const p of ranking.players) {
  if (typeof p.key !== 'string' || !p.key.includes('@')) fail(`players_ranking key 異常: ${JSON.stringify(p)}`)
  if (!Number.isInteger(p.reports) || p.reports < 1) fail(`players_ranking ${p.key} reports 異常`)
  if (!Number.isInteger(p.uploaders) || p.uploaders < 1) fail(`players_ranking ${p.key} uploaders 異常`)
  if (p.reports > prevReports) fail('players_ranking 未按 reports 遞減排序')
  prevReports = p.reports
}

let shardKeys = 0
for (const file of readdirSync(join(OUT_DIR, 'players'))) {
  const shard = file.replace(/\.json$/, '')
  const content = JSON.parse(readFileSync(join(OUT_DIR, 'players', file), 'utf8'))
  for (const [key, value] of Object.entries(content)) {
    if (shardOf(key) !== shard) fail(`玩家 ${key} 不應在分片 ${shard}`)
    if (!Array.isArray(value.uploaders) || value.uploaders.length === 0) fail(`玩家 ${key} uploaders 異常`)
    for (const u of value.uploaders) {
      if (!Number.isInteger(u.owner_total) || u.owner_total < 1) {
        fail(`玩家 ${key} 的上傳者 ${u.id} owner_total 異常`)
      }
      if (u.owner_total < u.reports.length) {
        fail(`玩家 ${key} 的上傳者 ${u.id} owner_total(${u.owner_total}) 小於該玩家筆數(${u.reports.length})`)
      }
    }
    checkMonthly(
      value.monthly,
      value.uploaders.reduce((s, u) => s + u.reports.length, 0),
      `玩家 ${key}`,
    )
    shardKeys += 1
  }
}
if (shardKeys !== ranking.players.length) fail(`分片玩家總數 ${shardKeys} 與排行榜 ${ranking.players.length} 不符`)

for (const file of readdirSync(join(OUT_DIR, 'uploaders'))) {
  const d = JSON.parse(readFileSync(join(OUT_DIR, 'uploaders', file), 'utf8'))
  checkMonthly(d.monthly, d.report_count, `uploaders/${file}`)
}

console.log(`validate:data 通過 uploaders=${uploaders.uploaders.length} players=${ranking.players.length}`)
