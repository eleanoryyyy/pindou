import { InventoryError, type LedgerType } from './types.ts'

export type LedgerLike = {
  id: string
  type: LedgerType
  quantity: number
}

export function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InventoryError(`${label}必须是正整数`)
  }
}

export function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new InventoryError(`${label}必须是大于等于 0 的整数`)
  }
}

export function signedDelta(type: LedgerType, quantity: number): number {
  return type === 'in' ? quantity : -quantity
}

export function quantityFromLedger(entries: LedgerLike[]): number {
  return entries.reduce((sum, entry) => sum + signedDelta(entry.type, entry.quantity), 0)
}

export function previewOutbound(current: number, quantity: number): number {
  assertPositiveInt(quantity, '出库数量')
  if (quantity > current) {
    throw new InventoryError(`出库数量不能大于库存（当前 ${current}）`)
  }
  return current - quantity
}

export function previewCorrection(entries: LedgerLike[], id: string, nextQuantity: number): number {
  assertPositiveInt(nextQuantity, '数量')
  const found = entries.some((entry) => entry.id === id)
  if (!found) {
    throw new InventoryError('找不到要修正的流水')
  }
  const next = entries.map((entry) =>
    entry.id === id ? { ...entry, quantity: nextQuantity } : entry,
  )
  const quantity = quantityFromLedger(next)
  if (quantity < 0) {
    throw new InventoryError('修正后库存不能为负数')
  }
  return quantity
}

export function previewDelete(entries: LedgerLike[], id: string): number {
  const found = entries.some((entry) => entry.id === id)
  if (!found) {
    throw new InventoryError('找不到要删除的流水')
  }
  const quantity = quantityFromLedger(entries.filter((entry) => entry.id !== id))
  if (quantity < 0) {
    throw new InventoryError('删除该流水后库存不能为负数')
  }
  return quantity
}

/** 库存小于等于阈值即提醒；未设阈值不提醒。 */
export function isOnRestockList(quantity: number, threshold: number | null): boolean {
  return threshold !== null && quantity <= threshold
}

/** 库存为 0 且未设阈值：库存表显示「缺货」，但不进入补豆清单。 */
export function isUnthresholdedStockout(quantity: number, threshold: number | null): boolean {
  return threshold === null && quantity === 0
}

/** 当前豆仓中「缺货但未设阈值」且已有库存记录的色号数。可按 warehouseId 过滤以免串仓。 */
export function unthresholdedStockoutCount(
  lines: { warehouseId: string; quantity: number; threshold: number | null }[],
  warehouseId: string,
): number {
  return lines.filter(
    (line) => line.warehouseId === warehouseId && isUnthresholdedStockout(line.quantity, line.threshold),
  ).length
}

/** 需补数量 = 阈值 − 库存；相等时为 0。 */
export function restockNeed(quantity: number, threshold: number): number {
  return Math.max(0, threshold - quantity)
}

export function stockStatus(
  quantity: number,
  threshold: number | null,
): { kind: 'ok' | 'warn' | 'danger' | null; label: string } {
  if (threshold === null) {
    return quantity === 0 ? { kind: 'danger', label: '缺货' } : { kind: null, label: '' }
  }
  if (quantity > threshold) {
    return { kind: 'ok', label: '充足' }
  }
  if (quantity === 0) {
    return { kind: 'danger', label: '缺货' }
  }
  if (quantity === threshold) {
    return { kind: 'warn', label: '已到阈值' }
  }
  return { kind: 'warn', label: '偏低' }
}

export function formatQty(quantity: number): string {
  return quantity.toLocaleString('en-US')
}
