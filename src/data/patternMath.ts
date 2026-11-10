import { findColor } from './palettes.ts'
import { PATTERN_STATUS_LABEL, type BrandId, type Pattern, type PatternUsage, type StockItem } from './types.ts'

export type UsageLine = {
  brand: BrandId
  code: string
  quantity: number
}

export type CompareLine = {
  brand: BrandId
  code: string
  hex: string
  need: number
  stock: number
  remaining: number
  short: number
}

export type CompareResult = {
  ok: boolean
  label: '够拼' | '缺料'
  lines: CompareLine[]
  shortages: CompareLine[]
  totalNeed: number
  totalShort: number
}

export function usageTotal(usage: { quantity: number }[]): number {
  return usage.reduce((sum, line) => sum + line.quantity, 0)
}

export function mergeUsage(groups: UsageLine[][]): UsageLine[] {
  const map = new Map<string, UsageLine>()
  for (const group of groups) {
    for (const line of group) {
      const key = `${line.brand}::${line.code}`
      const current = map.get(key)
      if (current) {
        current.quantity += line.quantity
      } else {
        map.set(key, { brand: line.brand, code: line.code, quantity: line.quantity })
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.quantity - a.quantity || a.brand.localeCompare(b.brand) || a.code.localeCompare(b.code, 'en', { numeric: true }),
  )
}

export function usageFromPattern(pattern: { usage: PatternUsage[] }): UsageLine[] {
  return pattern.usage.map((line) => ({ brand: line.brand, code: line.code, quantity: line.quantity }))
}

export function stockBySku(
  items: Pick<StockItem, 'warehouseId' | 'brand' | 'code' | 'quantity'>[],
  scope: 'all' | string,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of items) {
    if (scope !== 'all' && item.warehouseId !== scope) continue
    const key = `${item.brand}::${item.code}`
    map.set(key, (map.get(key) ?? 0) + item.quantity)
  }
  return map
}

export type HoldLike = {
  patternId?: string
  warehouseId: string
  brand: BrandId
  code: string
  quantity: number
}

export type CompareOptions = {
  holds?: HoldLike[]
  /** 这些图纸自己的暂扣算入可用库存，不从比较里扣除。 */
  ignoreHoldPatternIds?: string[]
}

/** 暂扣占用库存，不再算入可用数量。 */
export function availableStockQuantity(ledgerQuantity: number, heldQuantity: number): number {
  return Math.max(0, ledgerQuantity - heldQuantity)
}

export function heldBySku(
  holds: HoldLike[] | undefined,
  scope: 'all' | string,
  ignoreHoldPatternIds: string[] = [],
): Map<string, number> {
  const ignore = new Set(ignoreHoldPatternIds)
  const map = new Map<string, number>()
  for (const hold of holds ?? []) {
    if (hold.patternId && ignore.has(hold.patternId)) continue
    if (scope !== 'all' && hold.warehouseId !== scope) continue
    const key = `${hold.brand}::${hold.code}`
    map.set(key, (map.get(key) ?? 0) + hold.quantity)
  }
  return map
}

export function compareToStock(
  usage: UsageLine[],
  items: Pick<StockItem, 'warehouseId' | 'brand' | 'code' | 'quantity'>[],
  scope: 'all' | string,
  options?: CompareOptions,
): CompareResult {
  const stock = stockBySku(items, scope)
  const held = heldBySku(options?.holds, scope, options?.ignoreHoldPatternIds)
  const lines: CompareLine[] = mergeUsage([usage]).map((line) => {
    const key = `${line.brand}::${line.code}`
    const have = availableStockQuantity(stock.get(key) ?? 0, held.get(key) ?? 0)
    const short = Math.max(0, line.quantity - have)
    const color = findColor(line.brand, line.code)
    return {
      brand: line.brand,
      code: line.code,
      hex: color?.hex ?? '#CCCCCC',
      need: line.quantity,
      stock: have,
      remaining: have - line.quantity,
      short,
    }
  })
  const shortages = lines.filter((line) => line.short > 0)
  const totalNeed = lines.reduce((sum, line) => sum + line.need, 0)
  const totalShort = shortages.reduce((sum, line) => sum + line.short, 0)
  const ok = shortages.length === 0 && lines.length > 0
  return {
    ok,
    label: lines.length === 0 ? '够拼' : ok ? '够拼' : '缺料',
    lines,
    shortages,
    totalNeed,
    totalShort,
  }
}

/** 下一张待拼：状态为「待拼」且创建时间最早的一张；同时间再按 id。 */
export function nextPendingPattern<T extends { status: Pattern['status']; createdAt: number; id: string }>(
  patterns: T[],
): T | undefined {
  return patterns
    .filter((item) => item.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0]
}

export function formatShortageText(
  title: string,
  result: CompareResult,
  scopeLabel: string,
): string {
  const header = [
    `${title}（对比：${scopeLabel}）`,
    result.ok ? '够拼' : `缺料，共 ${result.shortages.length} 色、缺 ${result.totalShort} 粒`,
    '',
  ]
  const body = result.ok
    ? result.lines.map((line) => `${line.brand} ${line.code}  需要 ${line.need}，库存 ${line.stock}，剩余 ${line.remaining}`)
    : result.shortages.map((line) => `${line.brand} ${line.code}  缺 ${line.short}（需要 ${line.need}，库存 ${line.stock}）`)
  return [...header, ...body, ''].join('\n')
}

export function formatShortageCsv(title: string, result: CompareResult, scopeLabel: string): string {
  const rows = [
    ['对比', '结论', '品牌', '色号', '需要', '库存', '剩余', '缺口'],
    ...result.lines.map((line) => [
      scopeLabel,
      result.label,
      line.brand,
      line.code,
      String(line.need),
      String(line.stock),
      String(line.remaining),
      String(line.short),
    ]),
  ]
  if (title) {
    /* title kept in filename; csv is tabular */
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

export function statusLabel(status: Pattern['status']): string {
  return PATTERN_STATUS_LABEL[status]
}

export function describeCompareError(result: CompareResult): string {
  if (result.ok) return ''
  const detail = result.shortages.map((line) => `${line.brand} ${line.code} 缺 ${line.short}`).join('，')
  return `库存不足，无法出库：${detail}。出库不会让库存变成负数。`
}
