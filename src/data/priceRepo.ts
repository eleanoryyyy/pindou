import { db } from './db.ts'
import { overrideId, priceSkuKey } from './priceMath.ts'
import type { BeadPriceDefault, BeadPriceOverride, BrandId, Warehouse } from './types.ts'

export type PriceBook = {
  warehouseId: string
  defaultLi: number | null
  overrides: Map<string, number>
}

export function emptyPriceBook(warehouseId: string): PriceBook {
  return { warehouseId, defaultLi: null, overrides: new Map() }
}

export function effectivePrice(book: PriceBook, brand: BrandId, code: string): { li: number | null; custom: boolean } {
  const key = priceSkuKey(brand, code)
  if (book.overrides.has(key)) return { li: book.overrides.get(key) ?? null, custom: true }
  return { li: book.defaultLi, custom: false }
}

export function resolvePriceWarehouseId(scope: string, warehouses: Warehouse[], lastId?: string): string | undefined {
  if (scope !== 'all') return scope
  if (lastId && warehouses.some((item) => item.id === lastId)) return lastId
  return warehouses[0]?.id
}

export async function loadPriceBook(warehouseId: string): Promise<PriceBook> {
  const [defaults, overrides] = await Promise.all([
    db.beadPriceDefaults.get(warehouseId),
    db.beadPriceOverrides.where('warehouseId').equals(warehouseId).toArray(),
  ])
  const map = new Map<string, number>()
  for (const row of overrides) map.set(priceSkuKey(row.brand, row.code), row.li)
  return { warehouseId, defaultLi: defaults ? defaults.li : null, overrides: map }
}

export async function setDefaultPrice(warehouseId: string, li: number | null): Promise<void> {
  if (li === null) {
    await db.beadPriceDefaults.delete(warehouseId)
    return
  }
  const row: BeadPriceDefault = { warehouseId, li: Math.round(li), updatedAt: Date.now() }
  await db.beadPriceDefaults.put(row)
}

export async function setOverridePrice(warehouseId: string, brand: BrandId, code: string, li: number): Promise<void> {
  const row: BeadPriceOverride = {
    id: overrideId(warehouseId, brand, code),
    warehouseId,
    brand,
    code,
    li: Math.round(li),
    updatedAt: Date.now(),
  }
  await db.beadPriceOverrides.put(row)
}

export async function clearOverridePrice(warehouseId: string, brand: BrandId, code: string): Promise<void> {
  await db.beadPriceOverrides.delete(overrideId(warehouseId, brand, code))
}

export async function exportPriceTables(): Promise<{ beadPriceDefaults: BeadPriceDefault[]; beadPriceOverrides: BeadPriceOverride[] }> {
  const [beadPriceDefaults, beadPriceOverrides] = await Promise.all([db.beadPriceDefaults.toArray(), db.beadPriceOverrides.toArray()])
  return { beadPriceDefaults, beadPriceOverrides }
}

export async function replacePriceTables(defaults: BeadPriceDefault[], overrides: BeadPriceOverride[]): Promise<void> {
  await db.beadPriceDefaults.clear()
  await db.beadPriceOverrides.clear()
  if (defaults.length) await db.beadPriceDefaults.bulkAdd(defaults)
  if (overrides.length) await db.beadPriceOverrides.bulkAdd(overrides)
}
