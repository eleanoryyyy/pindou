import { db } from './db.ts'
import { availableStockQuantity } from './patternMath.ts'
import { InventoryError, stockItemId, type BrandId, type HoldLine, type PatternProgress } from './types.ts'

function now(): number {
  return Date.now()
}

export async function getProgress(patternId: string): Promise<PatternProgress | undefined> {
  return db.patternProgress.get(patternId)
}

export async function listProgress(): Promise<PatternProgress[]> {
  const rows = await db.patternProgress.toArray()
  return rows.sort((a, b) => b.updatedAt - a.updatedAt || a.patternId.localeCompare(b.patternId))
}

export async function listAllHolds(): Promise<(HoldLine & { patternId: string })[]> {
  const rows = await db.patternProgress.toArray()
  return rows.flatMap((row) => row.holds.map((hold) => ({ ...hold, patternId: row.patternId })))
}

export function emptyProgress(patternId: string, stamp = now()): PatternProgress {
  return {
    id: patternId,
    patternId,
    boardLabel: '',
    colorKey: '',
    holds: [],
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export async function ensureProgress(patternId: string): Promise<PatternProgress> {
  const existing = await db.patternProgress.get(patternId)
  if (existing) return existing
  const row = emptyProgress(patternId)
  await db.patternProgress.put(row)
  return row
}

export async function saveProgress(
  patternId: string,
  patch: Partial<Pick<PatternProgress, 'boardLabel' | 'colorKey' | 'holds'>>,
): Promise<PatternProgress> {
  const current = await ensureProgress(patternId)
  const next: PatternProgress = {
    ...current,
    ...patch,
    holds: patch.holds ? normalizeHolds(patch.holds) : current.holds,
    updatedAt: now(),
  }
  await db.patternProgress.put(next)
  return next
}

function normalizeHolds(holds: HoldLine[]): HoldLine[] {
  const merged = new Map<string, HoldLine>()
  for (const hold of holds) {
    if (!Number.isInteger(hold.quantity) || hold.quantity <= 0) {
      throw new InventoryError('暂扣数量必须是正整数')
    }
    const key = `${hold.warehouseId}::${hold.brand}::${hold.code}`
    const current = merged.get(key)
    if (current) current.quantity += hold.quantity
    else merged.set(key, { ...hold })
  }
  return [...merged.values()]
}

export function holdsForPatternInWarehouse(holds: HoldLine[], warehouseId: string): HoldLine[] {
  return holds.filter((hold) => hold.warehouseId === warehouseId)
}

export function heldQuantity(holds: HoldLine[], warehouseId: string, brand: BrandId, code: string): number {
  return holds
    .filter((hold) => hold.warehouseId === warehouseId && hold.brand === brand && hold.code === code)
    .reduce((sum, hold) => sum + hold.quantity, 0)
}

export async function addHold(
  patternId: string,
  warehouseId: string,
  brand: BrandId,
  code: string,
  quantity: number,
): Promise<PatternProgress> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InventoryError('暂扣数量必须是正整数')
  }
  const warehouse = await db.warehouses.get(warehouseId)
  if (!warehouse) throw new InventoryError('找不到该豆仓')
  const stock = await db.stockItems.get(stockItemId(warehouseId, brand, code))
  const ledgerQty = stock?.quantity ?? 0
  const allHolds = await listAllHolds()
  const already = allHolds
    .filter((hold) => hold.warehouseId === warehouseId && hold.brand === brand && hold.code === code)
    .reduce((sum, hold) => sum + hold.quantity, 0)
  const available = availableStockQuantity(ledgerQty, already)
  if (quantity > available) {
    throw new InventoryError(`暂扣不能大于可用库存（还可暂扣 ${available} 粒）`)
  }
  const current = await ensureProgress(patternId)
  return saveProgress(patternId, {
    holds: [...current.holds, { warehouseId, brand, code, quantity }],
  })
}

export async function removeHold(
  patternId: string,
  warehouseId: string,
  brand: BrandId,
  code: string,
): Promise<PatternProgress> {
  const current = await ensureProgress(patternId)
  return saveProgress(patternId, {
    holds: current.holds.filter(
      (hold) => !(hold.warehouseId === warehouseId && hold.brand === brand && hold.code === code),
    ),
  })
}

export async function releaseHolds(patternId: string): Promise<PatternProgress | undefined> {
  const current = await db.patternProgress.get(patternId)
  if (!current) return undefined
  if (current.holds.length === 0) return current
  const next: PatternProgress = { ...current, holds: [], updatedAt: now() }
  await db.patternProgress.put(next)
  return next
}

export async function deleteProgress(patternId: string): Promise<void> {
  await db.patternProgress.delete(patternId)
}
