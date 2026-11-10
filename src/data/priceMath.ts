import type { BrandId } from './types.ts'

/** 单价计量单位。当前按「元/粒」计价；以后若改为按包，只改这里。 */
export const PRICE_UNIT = 'bead' as const
export type PriceUnit = 'bead' | 'pack'

export function priceUnitLabel(unit: PriceUnit = PRICE_UNIT): string {
  return unit === 'pack' ? '包' : '粒'
}

export function priceSkuKey(brand: BrandId, code: string): string {
  return `${brand}::${code}`
}

export function overrideId(warehouseId: string, brand: BrandId, code: string): string {
  return `${warehouseId}::${brand}::${code}`
}

/**
 * 内部单价单位：厘（0.001 元，整数）。
 * 行小计（分）= round(数量 × 厘 / 10)，再按分汇总，避免浮点误差。
 * 例如 0.035 元 × 30 粒 = 105 分 = ¥1.05。
 */
export function parseYuanToLi(raw: string): number | null | 'invalid' {
  const text = raw.trim()
  if (text === '') return null
  if (text === '.' || text.endsWith('.')) return 'invalid'
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return 'invalid'
  const yuan = Number(text)
  if (!Number.isFinite(yuan) || yuan < 0) return 'invalid'
  return Math.round(yuan * 1000)
}

export function liToYuanInput(li: number): string {
  const yuan = Math.round(li) / 1000
  if (Number.isInteger(yuan)) return String(yuan)
  return yuan.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

/** 金额（分）用两位小数。 */
export function formatYuan(fen: number): string {
  const yuan = Math.round(fen) / 100
  return `¥${yuan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 单价展示：2 位或（有厘时）3 位小数。0 元显示 ¥0.00。 */
export function formatPriceYuan(li: number): string {
  const yuan = Math.round(li) / 1000
  const digits = Math.round(li) % 10 === 0 ? 2 : 3
  return `¥${yuan.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: 3 })}`
}

export function formatBeads(count: number): string {
  return count.toLocaleString('zh-CN')
}

export function lineAmountFen(need: number, li: number): number {
  return Math.round((need * Math.round(li)) / 10)
}

export type LineQuote = { kind: 'zero-need' } | { kind: 'unpriced' } | { kind: 'amount'; fen: number }

/** 需补为 0 显示「—」不计价；未填不当成 0 元；填 0 是已填的 0 元。 */
export function quoteLine(need: number, li: number | null): LineQuote {
  if (need <= 0) return { kind: 'zero-need' }
  if (li === null) return { kind: 'unpriced' }
  return { kind: 'amount', fen: lineAmountFen(need, li) }
}

export function formatLineAmount(quote: LineQuote): string {
  if (quote.kind === 'zero-need') return '—'
  if (quote.kind === 'unpriced') return '未填'
  return formatYuan(quote.fen)
}

export type QuoteSummary = {
  colors: number
  beads: number
  totalFen: number
  unpriced: number
  priced: number
}

export function quoteSummary(rows: { need: number; li: number | null }[]): QuoteSummary {
  let beads = 0
  let totalFen = 0
  let unpriced = 0
  let priced = 0
  for (const row of rows) {
    beads += row.need
    const quote = quoteLine(row.need, row.li)
    if (quote.kind === 'amount') {
      totalFen += quote.fen
      priced += 1
    }
    if (quote.kind === 'unpriced') unpriced += 1
  }
  return { colors: rows.length, beads, totalFen, unpriced, priced }
}

/** 需补大于 0 的行里一个单价都没填。需补 0 的行不算未填，也不算已填。 */
export function allPricesUnfilled(summary: QuoteSummary): boolean {
  return summary.priced === 0 && summary.unpriced > 0
}

/** 例：12 种色 · 3,400 粒 · 约 ¥86.50；全部未填时写「单价未填」，不显示约 ¥0.00。 */
export function formatQuoteHeadline(summary: QuoteSummary, unit: PriceUnit = PRICE_UNIT): string {
  const amount = allPricesUnfilled(summary) ? '单价未填' : `约 ${formatYuan(summary.totalFen)}`
  return `${summary.colors} 种色 · ${formatBeads(summary.beads)} ${priceUnitLabel(unit)} · ${amount}`
}

/** 合计行金额。全部未填时写「未填」，不显示 ¥0.00。 */
export function formatQuoteTotal(summary: QuoteSummary): string {
  return allPricesUnfilled(summary) ? '未填' : formatYuan(summary.totalFen)
}

/** 例：合计 ¥86.50（另有 2 色未填）；全部未填时写「合计 未填」。 */
export function formatQuoteTotalLine(summary: QuoteSummary): string {
  const note = formatUnpricedNote(summary)
  return `合计 ${formatQuoteTotal(summary)}${note ? `（${note}）` : ''}`
}

/** 只填了一部分时才标注「另有 N 色未填」；一个都没填时页头已写「单价未填」，不再重复。 */
export function formatUnpricedNote(summary: QuoteSummary): string | null {
  if (allPricesUnfilled(summary) || summary.unpriced <= 0) return null
  return `另有 ${summary.unpriced} 色未填`
}
