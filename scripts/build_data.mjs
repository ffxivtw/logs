import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createAccumulator, collectReport, aggregate, buildOutputs, readReportsJson } from './lib/aggregate.mjs'
import { TC_SERVERS } from './lib/tc_servers.mjs'

const UPSTREAM_DIR = process.env.UPSTREAM_DIR ?? './Final-Fantasy-XIV-Ranking-for-TC'
const OUT_DIR = process.env.OUT_DIR ?? './public/data'
const rankingsDir = join(UPSTREAM_DIR, 'data', 'rankings')

const acc = createAccumulator()
let badFiles = 0
for (const entry of readdirSync(rankingsDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.endsWith('.reports')) continue
  const encounterKey = entry.name.slice(0, -'.reports'.length)
  const dir = join(rankingsDir, entry.name)
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    const reports = readReportsJson(readFileSync(join(dir, file), 'utf8'))
    if (!reports) {
      console.warn(`warning: 略過損壞檔案 ${join(dir, file)}`)
      badFiles += 1
      continue
    }
    for (const report of Object.values(reports)) collectReport(report, encounterKey, acc, TC_SERVERS)
  }
}

let encounterNames = {}
try {
  const list = JSON.parse(readFileSync(join(UPSTREAM_DIR, 'config', 'encounters.json'), 'utf8'))
  encounterNames = Object.fromEntries(list.map((e) => [e.key, e.name]))
} catch {
  console.warn('warning: 無法讀取上游 config/encounters.json，副本名稱將以 key 顯示')
}

const outputs = buildOutputs(aggregate(acc), { now: new Date().toISOString(), encounterNames })

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(join(OUT_DIR, 'players'), { recursive: true })
mkdirSync(join(OUT_DIR, 'uploaders'), { recursive: true })
writeFileSync(join(OUT_DIR, 'uploaders.json'), JSON.stringify(outputs.uploaders))
writeFileSync(
  join(OUT_DIR, 'players_ranking.json'),
  JSON.stringify({ updated_at_iso: outputs.meta.updated_at_iso, players: outputs.playersRanking }),
)
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(outputs.meta))
for (const [shard, content] of outputs.playerShards) {
  writeFileSync(join(OUT_DIR, 'players', `${shard}.json`), JSON.stringify(content))
}
for (const [id, content] of outputs.uploaderDetails) {
  writeFileSync(join(OUT_DIR, 'uploaders', `${id}.json`), JSON.stringify(content))
}

console.log(
  `build:data 完成 reports=${outputs.meta.report_count} uploaders=${outputs.meta.uploader_count} ` +
  `players=${outputs.meta.player_count} shards=${outputs.playerShards.size} badFiles=${badFiles}`,
)
