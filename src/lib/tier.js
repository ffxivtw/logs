// FFLogs parse 百分位色階：把名次換算成百分位，套用玩家熟悉的 parse 顏色。
// 100=金、99=粉、95+=橘、75+=紫、50+=藍、25+=綠、其餘灰。
export function tierClass(index, total) {
  if (total <= 0) return 'tier-grey'
  if (index === 0) return 'tier-gold'
  const percentile = (1 - index / total) * 100
  if (percentile >= 99) return 'tier-pink'
  if (percentile >= 95) return 'tier-orange'
  if (percentile >= 75) return 'tier-purple'
  if (percentile >= 50) return 'tier-blue'
  if (percentile >= 25) return 'tier-green'
  return 'tier-grey'
}
