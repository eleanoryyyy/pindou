import { familyFromHex } from '../data/colorFamily.ts'
import {
  isOnRestockList,
  isUnthresholdedStockout,
  restockNeed,
  stockStatus,
  unthresholdedStockoutCount,
} from '../data/inventoryMath.ts'
import { findColor } from '../data/palettes.ts'
import type { ColorFamilyId, LedgerEntry, StockItem, StockLine, Warehouse } from '../data/types.ts'

export function toStockLine(item: StockItem): StockLine {
  const color = findColor(item.brand, item.code)
  const hex = color?.hex ?? '#CCCCCC'
  const status = stockStatus(item.quantity, item.threshold)
  return {
    ...item,
    hex,
    family: familyFromHex(hex),
    statusKind: status.kind,
    statusLabel: status.label,
    onRestockList: isOnRestockList(item.quantity, item.threshold),
    restockNeed: item.threshold === null ? 0 : restockNeed(item.quantity, item.threshold),
  }
}

export function filterStock(
  lines: StockLine[],
  query: string,
  family: ColorFamilyId | 'all',
): StockLine[] {
  const needle = query.trim().toUpperCase()
  return lines
    .filter((line) => {
      if (family !== 'all' && line.family !== family) return false
      if (!needle) return true
      return (
        line.code.toUpperCase().includes(needle) ||
        line.brand.toUpperCase().includes(needle) ||
        line.hex.toUpperCase().includes(needle)
      )
    })
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.code.localeCompare(b.code, 'en', { numeric: true }))
}

export function restockLines(lines: StockLine[]): StockLine[] {
  return lines
    .filter((line) => line.onRestockList)
    .sort((a, b) => b.restockNeed - a.restockNeed || a.code.localeCompare(b.code, 'en', { numeric: true }))
}

export function restockSummary(lines: StockLine[]): { count: number; need: number } {
  const list = restockLines(lines)
  return {
    count: list.length,
    need: list.reduce((sum, line) => sum + line.restockNeed, 0),
  }
}

export const UNOSET_STOCKOUT_PARAM = 'stockout'
export const UNOSET_STOCKOUT_VALUE = 'no-threshold'

export function unthresholdedStockoutHref(warehouseId: string): string {
  return `/inventory/${warehouseId}?${UNOSET_STOCKOUT_PARAM}=${UNOSET_STOCKOUT_VALUE}`
}

export function isUnthresholdedStockoutFilter(searchParams: URLSearchParams): boolean {
  return searchParams.get(UNOSET_STOCKOUT_PARAM) === UNOSET_STOCKOUT_VALUE
}

export function unthresholdedStockoutHintCount(lines: StockLine[], warehouseId: string): number {
  return unthresholdedStockoutCount(lines, warehouseId)
}

export function filterStockView(
  lines: StockLine[],
  query: string,
  family: ColorFamilyId | 'all',
  unthresholdedStockoutOnly = false,
): StockLine[] {
  const result = filterStock(lines, query, family)
  if (!unthresholdedStockoutOnly) return result
  return result.filter((line) => isUnthresholdedStockout(line.quantity, line.threshold))
}

export function formatRestockText(warehouseName: string, lines: StockLine[]): string {
  const list = restockLines(lines)
  const summary = restockSummary(list)
  const header = [
    `补豆清单（豆仓：${warehouseName}）`,
    `来自低于或等于阈值，共 ${summary.count} 色、需补 ${summary.need} 粒`,
    '',
  ]
  const body = list.map((line) => {
    const extra = line.quantity === line.threshold ? '，已到阈值' : ''
    return `${line.brand} ${line.code}  需补 ${line.restockNeed}（库存 ${line.quantity}，阈值 ${line.threshold}${extra}）`
  })
  return [...header, ...body, ''].join('\n')
}

export function formatRestockCsv(warehouseName: string, lines: StockLine[]): string {
  const list = restockLines(lines)
  const rows = [
    ['豆仓', '品牌', '色号', '库存', '阈值', '需补', '说明'],
    ...list.map((line) => [
      warehouseName,
      line.brand,
      line.code,
      String(line.quantity),
      String(line.threshold ?? ''),
      String(line.restockNeed),
      line.quantity === line.threshold ? '已到阈值' : line.statusLabel,
    ]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}

export function ledgerTypeLabel(type: LedgerEntry['type']): string {
  return type === 'in' ? '入库' : '出库'
}

export function warehouseIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/inventory\/([^/]+)/)
  if (!match) return undefined
  return match[1]
}

export function colorCountByWarehouse(items: StockItem[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const item of items) {
    map.set(item.warehouseId, (map.get(item.warehouseId) ?? 0) + 1)
  }
  return map
}

export function statusClass(kind: StockLine['statusKind']): string {
  if (kind === 'ok') return 'pd-status pd-status-ok'
  if (kind === 'warn') return 'pd-status pd-status-warn'
  if (kind === 'danger') return 'pd-status pd-status-danger'
  return 'pd-muted'
}

export function findWarehouse(warehouses: Warehouse[], id: string | undefined): Warehouse | undefined {
  return warehouses.find((item) => item.id === id)
}
