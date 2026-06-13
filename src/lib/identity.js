// 上傳帳號「本人可能性」分級。正向（上傳者頁）與反向（玩家頁）共用。
// 佔比 r = 該角色出現的 report 數 / 該帳號總上傳數。
const LEVELS = [
  { min: 0.9, filled: 5, label: '極可能本人' },
  { min: 0.75, filled: 4, label: '很可能' },
  { min: 0.5, filled: 3, label: '可能' },
  { min: 0.3, filled: 2, label: '不太像' },
  { min: 0, filled: 1, label: '不像' },
]

export function identityLevel(charReports, ownerTotal) {
  if (!ownerTotal || ownerTotal <= 0) {
    return { filled: 1, label: '不像', lowSample: true, sample: `${charReports || 0}/0` }
  }
  const r = charReports / ownerTotal
  // r 為 NaN（charReports 非數值）時 find 會回 undefined，退到最低級避免丟錯。
  const tier = LEVELS.find((t) => r >= t.min) ?? LEVELS[LEVELS.length - 1]
  return {
    filled: tier.filled,
    label: tier.label,
    lowSample: ownerTotal < 5,
    sample: `${charReports}/${ownerTotal}`,
  }
}
