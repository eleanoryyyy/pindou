import { db } from './db.ts'
import {
  assertNonNegativeInt,
  assertPositiveInt,
  previewCorrection,
  previewDelete,
  previewOutbound,
  quantityFromLedger,
} from './inventoryMath.ts'
import { normalizeCode, requireColor } from './palettes.ts'
import { getTemplate, scaleTemplate } from './templates.ts'
import {
  CLEAR_WAREHOUSE_RELEASE_HOLDS,
  countPatternsWithWarehouseHolds,
  holdsFromOtherWarehouses,
} from './warehouseClear.ts'
import {
  InventoryError,
  stockItemId,
  type BrandId,
  type LedgerEntry,
  type StockItem,
  type Warehouse,
} from './types.ts'

function now(): number {
  return Date.now()
}

function newId(): string {
  return crypto.randomUUID()
}

export async function listWarehouses(): Promise<Warehouse[]> {
  return db.warehouses.orderBy('createdAt').toArray()
}

export async function getWarehouse(id: string): Promise<Warehouse | undefined> {
  return db.warehouses.get(id)
}

export async function createWarehouse(rawName: string): Promise<Warehouse> {
  const name = rawName.trim()
  if (!name) {
    throw new InventoryError('请填写豆仓名称')
  }
  const warehouse: Warehouse = {
    id: newId(),
    name,
    createdAt: now(),
    updatedAt: now(),
  }
  await db.warehouses.add(warehouse)
  await setLastWarehouseId(warehouse.id)
  return warehouse
}

export async function renameWarehouse(id: string, rawName: string): Promise<Warehouse> {
  const name = rawName.trim()
  if (!name) {
    throw new InventoryError('请填写豆仓名称')
  }
  const current = await db.warehouses.get(id)
  if (!current) {
    throw new InventoryError('找不到该豆仓')
  }
  const next = { ...current, name, updatedAt: now() }
  await db.warehouses.put(next)
  return next
}

export async function deleteWarehouse(id: string): Promise<void> {
  const current = await db.warehouses.get(id)
  if (!current) {
    throw new InventoryError('找不到该豆仓')
  }
  await db.transaction('rw', db.warehouses, db.stockItems, db.ledger, db.settings, async () => {
    await db.stockItems.where('warehouseId').equals(id).delete()
    await db.ledger.where('warehouseId').equals(id).delete()
    await db.warehouses.delete(id)
    const last = await db.settings.get('lastWarehouseId')
    if (last?.value === id) {
      await db.settings.delete('lastWarehouseId')
    }
  })
}

/** 只清当前豆仓的库存项、阈值和流水。豆仓本身、其他仓、图纸、单价都不动。 */
export async function clearWarehouseInventory(warehouseId: string): Promise<void> {
  const current = await db.warehouses.get(warehouseId)
  if (!current) {
    throw new InventoryError('找不到该豆仓')
  }
  await db.transaction('rw', db.warehouses, db.stockItems, db.ledger, db.patternProgress, async () => {
    await db.stockItems.where('warehouseId').equals(warehouseId).delete()
    await db.ledger.where('warehouseId').equals(warehouseId).delete()
    await db.warehouses.update(warehouseId, { updatedAt: now() })
    if (CLEAR_WAREHOUSE_RELEASE_HOLDS) {
      const rows = await db.patternProgress.toArray()
      for (const row of rows) {
        const holds = holdsFromOtherWarehouses(row.holds, warehouseId)
        if (holds.length !== row.holds.length) {
          await db.patternProgress.put({ ...row, holds, updatedAt: now() })
        }
      }
    }
  })
}

export async function countHeldPatternsInWarehouse(warehouseId: string): Promise<number> {
  return countPatternsWithWarehouseHolds(await db.patternProgress.toArray(), warehouseId)
}

export async function setLastWarehouseId(id: string): Promise<void> {
  await db.settings.put({ key: 'lastWarehouseId', value: id })
}

export async function getLastWarehouseId(): Promise<string | undefined> {
  return (await db.settings.get('lastWarehouseId'))?.value
}

export async function listStock(warehouseId: string): Promise<StockItem[]> {
  return db.stockItems.where('warehouseId').equals(warehouseId).toArray()
}

export async function listLedger(warehouseId: string): Promise<LedgerEntry[]> {
  const rows = await db.ledger.where('warehouseId').equals(warehouseId).toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
}

export async function listLedgerForSku(
  warehouseId: string,
  brand: BrandId,
  code: string,
): Promise<LedgerEntry[]> {
  const normalized = normalizeCode(code)
  const rows = await db.ledger
    .where('[warehouseId+brand+code]')
    .equals([warehouseId, brand, normalized])
    .toArray()
  return rows.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

async function rewriteSku(warehouseId: string, brand: BrandId, code: string): Promise<StockItem> {
  const normalized = normalizeCode(code)
  const color = requireColor(brand, normalized)
  const entries = await listLedgerForSku(warehouseId, brand, color.code)
  const quantity = quantityFromLedger(entries)
  const id = stockItemId(warehouseId, brand, color.code)
  const existing = await db.stockItems.get(id)
  const item: StockItem = {
    id,
    warehouseId,
    brand,
    code: color.code,
    quantity,
    threshold: existing?.threshold ?? null,
    updatedAt: now(),
  }
  await db.stockItems.put(item)
  return item
}

export async function inbound(input: {
  warehouseId: string
  items: { brand: BrandId; code: string; quantity: number }[]
  note?: string
}): Promise<LedgerEntry[]> {
  const warehouse = await db.warehouses.get(input.warehouseId)
  if (!warehouse) {
    throw new InventoryError('找不到该豆仓')
  }
  const prepared = input.items.map((item) => {
    assertPositiveInt(item.quantity, '入库数量')
    const color = requireColor(item.brand, item.code)
    return { brand: item.brand, code: color.code, quantity: item.quantity }
  })
  if (prepared.length === 0) {
    throw new InventoryError('请至少录入一个色号')
  }

  const created: LedgerEntry[] = []
  await db.transaction('rw', db.warehouses, db.stockItems, db.ledger, async () => {
    for (const item of prepared) {
      const entry: LedgerEntry = {
        id: newId(),
        warehouseId: input.warehouseId,
        brand: item.brand,
        code: item.code,
        type: 'in',
        quantity: item.quantity,
        createdAt: now(),
        note: input.note,
      }
      await db.ledger.add(entry)
      await rewriteSku(input.warehouseId, item.brand, item.code)
      created.push(entry)
    }
    await db.warehouses.update(input.warehouseId, { updatedAt: now() })
  })
  return created
}

export async function applyTemplate(warehouseId: string, templateId: string, perColor = 100): Promise<LedgerEntry[]> {
  const template = getTemplate(templateId)
  const items = scaleTemplate(template, perColor)
  return inbound({
    warehouseId,
    items: items.map((item) => ({
      brand: template.brand,
      code: item.code,
      quantity: item.quantity,
    })),
    note: `套装：${template.name}（每色 ${perColor} 粒）`,
  })
}

export async function outbound(input: {
  warehouseId: string
  brand: BrandId
  code: string
  quantity: number
}): Promise<LedgerEntry> {
  const warehouse = await db.warehouses.get(input.warehouseId)
  if (!warehouse) {
    throw new InventoryError('找不到该豆仓')
  }
  const color = requireColor(input.brand, input.code)
  const current = (await db.stockItems.get(stockItemId(input.warehouseId, input.brand, color.code)))
    ?.quantity ?? 0
  previewOutbound(current, input.quantity)

  const entry: LedgerEntry = {
    id: newId(),
    warehouseId: input.warehouseId,
    brand: input.brand,
    code: color.code,
    type: 'out',
    quantity: input.quantity,
    createdAt: now(),
  }
  await db.transaction('rw', db.warehouses, db.stockItems, db.ledger, async () => {
    await db.ledger.add(entry)
    await rewriteSku(input.warehouseId, input.brand, color.code)
    await db.warehouses.update(input.warehouseId, { updatedAt: now() })
  })
  return entry
}

export async function setThreshold(input: {
  warehouseId: string
  brand: BrandId
  code: string
  threshold: number | null
}): Promise<StockItem> {
  if (input.threshold !== null) {
    assertNonNegativeInt(input.threshold, '补豆阈值')
  }
  const warehouse = await db.warehouses.get(input.warehouseId)
  if (!warehouse) {
    throw new InventoryError('找不到该豆仓')
  }
  const color = requireColor(input.brand, input.code)
  const id = stockItemId(input.warehouseId, input.brand, color.code)
  const existing = await db.stockItems.get(id)
  const item: StockItem = {
    id,
    warehouseId: input.warehouseId,
    brand: input.brand,
    code: color.code,
    quantity: existing?.quantity ?? 0,
    threshold: input.threshold,
    updatedAt: now(),
  }
  await db.stockItems.put(item)
  return item
}

export async function updateLedgerQuantity(id: string, nextQuantity: number): Promise<LedgerEntry> {
  const entry = await db.ledger.get(id)
  if (!entry) {
    throw new InventoryError('找不到要修正的流水')
  }
  const siblings = await listLedgerForSku(entry.warehouseId, entry.brand, entry.code)
  previewCorrection(siblings, id, nextQuantity)
  const next = { ...entry, quantity: nextQuantity }
  await db.transaction('rw', db.stockItems, db.ledger, db.warehouses, async () => {
    await db.ledger.put(next)
    await rewriteSku(entry.warehouseId, entry.brand, entry.code)
    await db.warehouses.update(entry.warehouseId, { updatedAt: now() })
  })
  return next
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  const entry = await db.ledger.get(id)
  if (!entry) {
    throw new InventoryError('找不到要删除的流水')
  }
  const siblings = await listLedgerForSku(entry.warehouseId, entry.brand, entry.code)
  previewDelete(siblings, id)
  await db.transaction('rw', db.stockItems, db.ledger, db.warehouses, async () => {
    await db.ledger.delete(id)
    await rewriteSku(entry.warehouseId, entry.brand, entry.code)
    await db.warehouses.update(entry.warehouseId, { updatedAt: now() })
  })
}

export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '操作失败，请再试一次'
}
