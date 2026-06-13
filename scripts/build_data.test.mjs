import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TC_SERVERS } from './lib/tc_servers.mjs'
import { shardOf, createAccumulator, collectReport, aggregate, readReportsJson, buildOutputs } from './lib/aggregate.mjs'

function makeReport(code, ownerId, ownerName, fightsPlayers, timeIso = '2026-06-01T12:00:00+00:00') {
  return {
    report_code: code,
    url: `https://www.fflogs.com/reports/${code}`,
    owner: { id: ownerId, name: ownerName },
    report_start_time_iso: timeIso,
    fights: fightsPlayers.map((players) => ({
      players: players.map(([name, server]) => ({ name, server })),
    })),
  }
}

test('TC_SERVERS 包含全部 7 個繁中服', () => {
  assert.deepEqual(
    [...TC_SERVERS].sort(),
    ['伊弗利特', '利維坦', '奧汀', '巴哈姆特', '泰坦', '迦樓羅', '鳳凰'].sort(),
  )
})

test('shardOf 回傳 2 位 hex 且輸入相同結果相同', () => {
  const s = shardOf('魚丸探長@鳳凰')
  assert.match(s, /^[0-9a-f]{2}$/)
  assert.equal(s, shardOf('魚丸探長@鳳凰'))
  assert.notEqual(shardOf('a@鳳凰'), shardOf('b@鳳凰')) // 已驗證此二值不同
})

test('collectReport 只收 TC 服玩家', () => {
  const acc = createAccumulator()
  collectReport(
    makeReport('AAA', 1, 'up1', [[['小明', '鳳凰'], ['路人', 'Tonberry']]]),
    'savage_m1s', acc, TC_SERVERS,
  )
  const entry = acc.reports.get('AAA')
  assert.deepEqual([...entry.players], ['小明@鳳凰'])
})

test('collectReport 同 report 出現在多個副本目錄時去重、encounters 合併', () => {
  const acc = createAccumulator()
  const r = makeReport('BBB', 1, 'up1', [[['小明', '鳳凰']], [['小華', '泰坦']]])
  collectReport(r, 'savage_m1s', acc, TC_SERVERS)
  collectReport(r, 'savage_m2s', acc, TC_SERVERS)
  assert.equal(acc.reports.size, 1)
  const entry = acc.reports.get('BBB')
  assert.deepEqual([...entry.encounters].sort(), ['savage_m1s', 'savage_m2s'])
  assert.equal(entry.fight_count, 2)
})

test('collectReport 略過缺 owner 或缺 report_code 的 report', () => {
  const acc = createAccumulator()
  collectReport({ ...makeReport('CCC', 1, 'up1', [[]]), owner: null }, 'savage_m1s', acc, TC_SERVERS)
  collectReport({ ...makeReport('', 1, 'up1', [[]]) }, 'savage_m1s', acc, TC_SERVERS)
  assert.equal(acc.reports.size, 0)
})

test('aggregate 彙總上傳者與玩家', () => {
  const acc = createAccumulator()
  collectReport(makeReport('R1', 1, 'up1', [[['小明', '鳳凰'], ['小華', '泰坦']]]), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R2', 1, 'up1', [[['小明', '鳳凰']], [['小明', '鳳凰']]]), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R3', 2, 'up2', [[['小明', '鳳凰']]]), 'extreme_zoraal_ja', acc, TC_SERVERS)
  const { uploaders, players, reportCount } = aggregate(acc)

  assert.equal(reportCount, 3)
  const u1 = uploaders.get(1)
  assert.equal(u1.report_count, 2)
  assert.equal(u1.fight_count, 3)
  assert.deepEqual([...u1.players].sort(), ['小明@鳳凰', '小華@泰坦'])
  assert.deepEqual(u1.encounters, { savage_m1s: 2 })

  const ming = players.get('小明@鳳凰')
  // 同一 report 內出現在多場 fight 只算一筆 report 關聯
  assert.equal(ming.get(1).reports.length, 2)
  assert.equal(ming.get(2).reports.length, 1)
})

test('readReportsJson 解析失敗回傳 null', () => {
  assert.equal(readReportsJson('{broken'), null)
  assert.deepEqual(readReportsJson('{"X":{"report_code":"X"}}'), { X: { report_code: 'X' } })
})

function buildSample() {
  const acc = createAccumulator()
  collectReport(makeReport('R1', 1, 'up1', [[['小明', '鳳凰'], ['小華', '泰坦']]]), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R2', 1, 'up1', [[['小明', '鳳凰']]], '2026-06-02T12:00:00+00:00'), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('R3', 2, 'up2', [[['小明', '鳳凰']]]), 'extreme_zoraal_ja', acc, TC_SERVERS)
  return buildOutputs(aggregate(acc), {
    now: '2026-06-12T00:00:00.000Z',
    encounterNames: { savage_m1s: '零式 M1S / 黑貓' },
  })
}

test('buildOutputs: uploaders.json 按 report_count 遞減排序', () => {
  const out = buildSample()
  assert.equal(out.uploaders.updated_at_iso, '2026-06-12T00:00:00.000Z')
  assert.deepEqual(out.uploaders.uploaders.map((u) => u.id), [1, 2])
  const u1 = out.uploaders.uploaders[0]
  assert.equal(u1.report_count, 2)
  assert.equal(u1.unique_player_count, 2)
})

test('buildOutputs: 玩家分片內容正確且 report 按時間新→舊', () => {
  const out = buildSample()
  const shard = shardOf('小明@鳳凰')
  const entry = out.playerShards.get(shard)['小明@鳳凰']
  assert.equal(entry.uploaders[0].id, 1) // up1 有 2 筆，排前面
  assert.deepEqual(entry.uploaders[0].reports.map((r) => r.code), ['R2', 'R1'])
})

test('buildOutputs: uploader 明細含 per-player report 數', () => {
  const out = buildSample()
  const d = out.uploaderDetails.get(1)
  assert.deepEqual(d.players, [
    { key: '小明@鳳凰', report_count: 2 },
    { key: '小華@泰坦', report_count: 1 },
  ])
})

test('buildOutputs: players_index 排序且 meta 計數正確', () => {
  const out = buildSample()
  assert.deepEqual(out.playersIndex, ['小明@鳳凰', '小華@泰坦'].sort())
  assert.equal(out.meta.report_count, 3)
  assert.equal(out.meta.uploader_count, 2)
  assert.equal(out.meta.player_count, 2)
  assert.equal(out.meta.encounters.savage_m1s, '零式 M1S / 黑貓')
})

function buildMonthlySample() {
  const acc = createAccumulator()
  collectReport(makeReport('M1', 1, 'up1', [[['小明', '鳳凰']]], '2026-05-15T08:00:00+00:00'), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('M2', 1, 'up1', [[['小明', '鳳凰']]], '2026-06-01T08:00:00+00:00'), 'savage_m1s', acc, TC_SERVERS)
  collectReport(makeReport('M3', 2, 'up2', [[['小明', '鳳凰']]], '2026-06-20T08:00:00+00:00'), 'savage_m2s', acc, TC_SERVERS)
  collectReport(makeReport('M4', 1, 'up1', [[['小明', '鳳凰']]], null), 'savage_m1s', acc, TC_SERVERS)
  return buildOutputs(aggregate(acc), { now: '2026-06-13T00:00:00.000Z', encounterNames: {} })
}

test('monthly: meta 全站月度計數且 null time_iso 不計入', () => {
  const out = buildMonthlySample()
  assert.deepEqual(out.meta.monthly, { '2026-05': 1, '2026-06': 2 })
  assert.equal(out.meta.report_count, 4) // M4 無時間仍計入總數
})

test('monthly: uploader 明細含月度、排行榜列不含', () => {
  const out = buildMonthlySample()
  assert.deepEqual(out.uploaderDetails.get(1).monthly, { '2026-05': 1, '2026-06': 1 })
  assert.equal('monthly' in out.uploaders.uploaders[0], false)
})

test('monthly: 玩家分片含月度且鍵升冪', () => {
  const out = buildMonthlySample()
  const entry = out.playerShards.get(shardOf('小明@鳳凰'))['小明@鳳凰']
  assert.deepEqual(entry.monthly, { '2026-05': 1, '2026-06': 2 })
  assert.deepEqual(Object.keys(entry.monthly), ['2026-05', '2026-06'])
})

test('playersRanking: 按 reports 降冪、平手 key 字典序、含正確統計', () => {
  const out = buildSample()
  assert.deepEqual(out.playersRanking, [
    { key: '小明@鳳凰', reports: 3, uploaders: 2 },
    { key: '小華@泰坦', reports: 1, uploaders: 1 },
  ])
})

test('owner_total: 玩家分片 uploader 條目含該帳號總上傳數', () => {
  const out = buildSample()
  const entry = out.playerShards.get(shardOf('小明@鳳凰'))['小明@鳳凰']
  // up1（id 1）總上傳 2 筆（R1, R2）；up2（id 2）總上傳 1 筆（R3）
  assert.equal(entry.uploaders[0].id, 1)
  assert.equal(entry.uploaders[0].owner_total, 2)
  assert.equal(entry.uploaders[1].id, 2)
  assert.equal(entry.uploaders[1].owner_total, 1)
})
