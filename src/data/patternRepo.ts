import { db } from './db.ts'
import { previewDelete, previewOutbound, quantityFromLedger } from './inventoryMath.ts'
import { listLedgerForSku } from './repo.ts'
import { compareToStock, describeCompareError, usageFromPattern, usageTotal } from './patternMath.ts'
import { deleteProgress, ensureProgress, listAllHolds, releaseHolds } from './progressRepo.ts'
import { requireColor } from './palettes.ts'
import { detectGridRegion, isAcceptedImageFile, rasterFromBlob, recognizeUsage, type RecognizeOptions } from './recognizePattern.ts'
import { gridToPngBlob } from './renderGrid.ts'
import { mirrorHorizontal, mirrorVertical, tileFileName, tilePatternName, usageFromGrid, type BoardTile } from './boardMath.ts'
import {
  InventoryError,
  stockItemId,
  type BrandId,
  type LedgerEntry,
  type Pattern,
  type PatternBuild,
  type PatternGrid,
  type PatternGridRecord,
  type PatternOrigin,
  type PatternStatus,
  type PatternUsage,
  type StockItem,
} from './types.ts'

function now(): number {
  return Date.now()
}

function newId(): string {
  return crypto.randomUUID()
}

export function assertImageFile(file: File): void {
  if (!isAcceptedImageFile(file)) {
    throw new InventoryError('只支持 JPG 或 PNG 图片')
  }
}

export function sanitizeUsage(rows: { brand: BrandId; code: string; quantity: number }[]): PatternUsage[] {
  const merged = new Map<string, PatternUsage>()
  for (const row of rows) {
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) {
      throw new InventoryError('用量必须是正整数')
    }
    const color = requireColor(row.brand, row.code)
    const key = `${row.brand}::${color.code}`
    const current = merged.get(key)
    if (current) current.quantity += row.quantity
    else merged.set(key, { id: newId(), brand: row.brand, code: color.code, quantity: row.quantity })
  }
  return [...merged.values()].sort((a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code, 'en', { numeric: true }))
}

async function makeThumb(blob: Blob, maxEdge = 240): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new InventoryError('无法生成缩略图')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const out = await canvas.convertToBlob({ type: 'image/png' })
  return out
}

export async function listPatterns(): Promise<Pattern[]> {
  const rows = await db.patterns.orderBy('createdAt').reverse().toArray()
  return rows
}

export async function getPattern(id: string): Promise<Pattern | undefined> {
  return db.patterns.get(id)
}

export async function getPatternImage(id: string): Promise<Blob | undefined> {
  const row = await db.patternImages.get(id)
  return row?.blob
}

export async function getPatternThumb(id: string): Promise<Blob | undefined> {
  const row = await db.patternImages.get(id)
  return row?.thumbBlob ?? row?.blob
}

function resolveRecognizeOptions(raster: Parameters<typeof recognizeUsage>[0], preferBrand: BrandId, options: RecognizeOptions = {}): RecognizeOptions {
  const detected = options.region ? null : detectGridRegion(raster)
  const cols = options.cols ?? detected?.cols
  const rows = options.rows ?? detected?.rows
  let region = options.region
  if (!region && detected && cols === detected.cols && rows === detected.rows) {
    region = { x: detected.x, y: detected.y, width: detected.width, height: detected.height }
  }
  const useRegion = Boolean(region)
  return {
    preferBrand,
    cols,
    rows,
    region,
    blankWhite: options.blankWhite ?? useRegion,
    legendCodes: options.legendCodes,
    sampling: options.sampling,
  }
}

export async function createPatternFromFile(file: File, name: string, preferBrand: BrandId = 'MARD', options: RecognizeOptions = {}): Promise<Pattern> {
  assertImageFile(file)
  const trimmed = name.trim()
  if (!trimmed) throw new InventoryError('请填写图纸名称')
  const blob = file.slice(0, file.size, file.type || 'image/png')
  const raster = await rasterFromBlob(blob)
  const recognized = recognizeUsage(raster, resolveRecognizeOptions(raster, preferBrand, options))
  const id = newId()
  const pattern: Pattern = {
    id,
    name: trimmed,
    status: 'pending',
    cols: recognized.cols,
    rows: recognized.rows,
    usage: sanitizeUsage(recognized.usage),
    usageEdited: false,
    buildCount: 0,
    createdAt: now(),
    updatedAt: now(),
    mimeType: file.type || 'image/png',
    fileName: file.name,
  }
  const thumbBlob = await makeThumb(blob)
  const gridRecord: PatternGridRecord = {
    id,
    cols: recognized.cols,
    rows: recognized.rows,
    cells: recognized.cells,
    completed: [],
  }
  await db.transaction('rw', [db.patterns, db.patternImages, db.patternGrids], async () => {
    await db.patterns.add(pattern)
    await db.patternImages.add({ id, blob, thumbBlob })
    await db.patternGrids.add(gridRecord)
  })
  return pattern
}

export async function rerecognizePattern(id: string, cols: number, rows: number, preferBrand: BrandId = 'MARD', options: RecognizeOptions = {}): Promise<Pattern> {
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new InventoryError('网格列数和行数必须是正整数')
  }
  const image = await db.patternImages.get(id)
  if (!image) throw new InventoryError('找不到图纸图片')
  const raster = await rasterFromBlob(image.blob)
  const recognized = recognizeUsage(raster, resolveRecognizeOptions(raster, preferBrand, { ...options, cols, rows }))
  const next: Pattern = {
    ...pattern,
    cols,
    rows,
    usage: sanitizeUsage(recognized.usage),
    usageEdited: false,
    updatedAt: now(),
  }
  const gridRecord: PatternGridRecord = {
    id,
    cols,
    rows,
    cells: recognized.cells,
    completed: [],
  }
  await db.transaction('rw', [db.patterns, db.patternGrids], async () => {
    await db.patterns.put(next)
    await db.patternGrids.put(gridRecord)
  })
  return next
}

export async function renamePattern(id: string, name: string): Promise<Pattern> {
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const trimmed = name.trim()
  if (!trimmed) throw new InventoryError('请填写图纸名称')
  const next = { ...pattern, name: trimmed, updatedAt: now() }
  await db.patterns.put(next)
  return next
}

export async function setPatternStatus(id: string, status: PatternStatus): Promise<Pattern> {
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const next = { ...pattern, status, updatedAt: now() }
  await db.patterns.put(next)
  if (status === 'in-progress') {
    await ensureProgress(id)
  }
  if (status === 'pending') {
    await releaseHolds(id)
  }
  return next
}

export async function startPattern(id: string): Promise<Pattern> {
  return setPatternStatus(id, 'in-progress')
}

export async function updatePatternUsage(
  id: string,
  rows: { brand: BrandId; code: string; quantity: number }[],
): Promise<Pattern> {
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const usage = sanitizeUsage(rows)
  if (usage.length === 0) throw new InventoryError('请至少保留一个色号用量')
  const next = { ...pattern, usage, usageEdited: true, updatedAt: now() }
  await db.patterns.put(next)
  return next
}

export async function deletePattern(id: string): Promise<void> {
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  await db.transaction('rw', [db.patterns, db.patternImages, db.patternBuilds, db.patternGrids, db.patternProgress], async () => {
    await db.patterns.delete(id)
    await db.patternImages.delete(id)
    await db.patternBuilds.where('patternId').equals(id).delete()
    await db.patternGrids.delete(id)
    await deleteProgress(id)
  })
}

export async function listPatternBuilds(patternId: string): Promise<PatternBuild[]> {
  const rows = await db.patternBuilds.where('patternId').equals(patternId).toArray()
  return rows.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
}

async function rewriteSku(warehouseId: string, brand: BrandId, code: string): Promise<StockItem> {
  const color = requireColor(brand, code)
  const entries = await listLedgerForSku(warehouseId, brand, color.code)
  const quantity = quantityFromLedger(entries)
  const id = stockItemId(warehouseId, brand, color.code)
  const existing = await db.stockItems.get(id)
  const item: StockItem = {
    id,
    warehouseId,
    brand: color.brand,
    code: color.code,
    quantity,
    threshold: existing?.threshold ?? null,
    updatedAt: now(),
  }
  await db.stockItems.put(item)
  return item
}

export async function completePattern(patternId: string, warehouseId: string): Promise<PatternBuild> {
  const pattern = await db.patterns.get(patternId)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const warehouse = await db.warehouses.get(warehouseId)
  if (!warehouse) throw new InventoryError('找不到该豆仓')
  if (pattern.usage.length === 0) throw new InventoryError('该图纸还没有用量，无法出库')
  const stock = await db.stockItems.where('warehouseId').equals(warehouseId).toArray()
  const allHolds = await listAllHolds()
  const compare = compareToStock(usageFromPattern(pattern), stock, warehouseId, {
    holds: allHolds,
    ignoreHoldPatternIds: [patternId],
  })
  if (!compare.ok) {
    throw new InventoryError(describeCompareError(compare))
  }
  // 正式出库按完整用量记账；本图暂扣只是预留，出库后清空，不再用差额扣账。
  for (const line of pattern.usage) {
    const current = stock.find((item) => item.brand === line.brand && item.code === line.code)?.quantity ?? 0
    previewOutbound(current, line.quantity)
  }

  const buildId = newId()
  const createdAt = now()
  const times = pattern.buildCount + 1
  const ledgerIds: string[] = []
  const entries: LedgerEntry[] = pattern.usage.map((line) => {
    const id = newId()
    ledgerIds.push(id)
    return {
      id,
      warehouseId,
      brand: line.brand,
      code: line.code,
      type: 'out' as const,
      quantity: line.quantity,
      createdAt,
      note: `完工出库：${pattern.name}（第 ${times} 次）`,
      patternId,
      buildId,
    }
  })
  const build: PatternBuild = {
    id: buildId,
    patternId,
    warehouseId,
    createdAt,
    ledgerIds,
    usageSnapshot: pattern.usage.map((line) => ({ brand: line.brand, code: line.code, quantity: line.quantity })),
  }
  const nextPattern: Pattern = {
    ...pattern,
    status: 'done',
    buildCount: times,
    updatedAt: createdAt,
  }

  await db.transaction('rw', [db.warehouses, db.stockItems, db.ledger, db.patterns, db.patternBuilds, db.patternProgress], async () => {
    for (const entry of entries) {
      await db.ledger.add(entry)
      await rewriteSku(warehouseId, entry.brand, entry.code)
    }
    await db.patternBuilds.add(build)
    await db.patterns.put(nextPattern)
    await db.warehouses.update(warehouseId, { updatedAt: createdAt })
    await releaseHolds(patternId)
  })
  return build
}

export async function undoPatternBuild(buildId: string): Promise<Pattern> {
  const build = await db.patternBuilds.get(buildId)
  if (!build) throw new InventoryError('找不到这次完工出库')
  const pattern = await db.patterns.get(build.patternId)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const existing = (await db.ledger.bulkGet(build.ledgerIds)).filter((row): row is LedgerEntry => Boolean(row))
  for (const entry of existing) {
    const siblings = await listLedgerForSku(entry.warehouseId, entry.brand, entry.code)
    previewDelete(siblings, entry.id)
  }

  const createdAt = now()
  const nextCount = Math.max(0, pattern.buildCount - 1)
  const nextPattern: Pattern = {
    ...pattern,
    buildCount: nextCount,
    status: nextCount === 0 ? 'pending' : pattern.status,
    updatedAt: createdAt,
  }

  await db.transaction('rw', [db.warehouses, db.stockItems, db.ledger, db.patterns, db.patternBuilds, db.patternProgress], async () => {
    for (const entry of existing) {
      await db.ledger.delete(entry.id)
      await rewriteSku(entry.warehouseId, entry.brand, entry.code)
    }
    await db.patternBuilds.delete(buildId)
    await db.patterns.put(nextPattern)
    await db.warehouses.update(build.warehouseId, { updatedAt: createdAt })
    await releaseHolds(build.patternId)
  })
  return nextPattern
}


export async function getPatternGrid(id: string): Promise<PatternGridRecord | undefined> {
  return db.patternGrids.get(id)
}

export async function ensurePatternGrid(id: string, preferBrand: BrandId = 'MARD'): Promise<PatternGridRecord> {
  const existing = await db.patternGrids.get(id)
  if (existing && existing.cells.length === existing.cols * existing.rows && existing.cols > 0) {
    return existing
  }
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const image = await db.patternImages.get(id)
  if (!image) throw new InventoryError('找不到图纸图片')
  const raster = await rasterFromBlob(image.blob)
  const recognized = recognizeUsage(raster, resolveRecognizeOptions(raster, preferBrand, { cols: pattern.cols, rows: pattern.rows }))
  const record: PatternGridRecord = {
    id,
    cols: recognized.cols,
    rows: recognized.rows,
    cells: recognized.cells,
    completed: existing?.completed ?? [],
  }
  await db.patternGrids.put(record)
  if (pattern.cols !== record.cols || pattern.rows !== record.rows) {
    await db.patterns.put({ ...pattern, cols: record.cols, rows: record.rows, updatedAt: now() })
  }
  return record
}

export async function setCompletedColors(id: string, completed: string[]): Promise<PatternGridRecord> {
  const record = await ensurePatternGrid(id)
  const next = { ...record, completed: [...new Set(completed)] }
  await db.patternGrids.put(next)
  return next
}

export async function recalcUsageFromGrid(id: string): Promise<Pattern> {
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const record = await db.patternGrids.get(id)
  if (!record || record.cells.length !== record.cols * record.rows || record.cols < 1) {
    throw new InventoryError('没有可用来重算的格子矩阵')
  }
  const next: Pattern = {
    ...pattern,
    usage: sanitizeUsage(usageFromGrid({ cols: record.cols, rows: record.rows, cells: record.cells })),
    usageEdited: false,
    updatedAt: now(),
  }
  await db.patterns.put(next)
  return next
}

export async function replacePatternGrid(
  id: string,
  grid: PatternGrid,
  options: { resetCompleted?: boolean; rewriteImage?: boolean; origin?: PatternOrigin } = {},
): Promise<Pattern> {
  const pattern = await db.patterns.get(id)
  if (!pattern) throw new InventoryError('找不到该图纸')
  const existing = await db.patternGrids.get(id)
  const usage = sanitizeUsage(usageFromGrid(grid))
  const next: Pattern = {
    ...pattern,
    cols: grid.cols,
    rows: grid.rows,
    usage,
    usageEdited: false,
    updatedAt: now(),
    origin: options.origin ?? pattern.origin,
  }
  const record: PatternGridRecord = {
    id,
    cols: grid.cols,
    rows: grid.rows,
    cells: grid.cells,
    completed: options.resetCompleted ? [] : (existing?.completed ?? []),
  }
  let blob: Blob | undefined
  let thumbBlob: Blob | undefined
  if (options.rewriteImage) {
    blob = await gridToPngBlob(grid, { cellPx: 16, showGrid: false })
    thumbBlob = await makeThumb(blob)
    next.mimeType = 'image/png'
  }
  const tables = options.rewriteImage
    ? [db.patterns, db.patternGrids, db.patternImages]
    : [db.patterns, db.patternGrids]
  await db.transaction('rw', tables, async () => {
    await db.patterns.put(next)
    await db.patternGrids.put(record)
    if (blob && thumbBlob) await db.patternImages.put({ id, blob, thumbBlob })
  })
  return next
}

export async function mirrorAndSave(id: string, direction: 'horizontal' | 'vertical'): Promise<Pattern> {
  const record = await ensurePatternGrid(id)
  const grid = { cols: record.cols, rows: record.rows, cells: record.cells }
  const nextGrid = direction === 'horizontal' ? mirrorHorizontal(grid) : mirrorVertical(grid)
  return replacePatternGrid(id, nextGrid, {
    rewriteImage: true,
    origin: { kind: 'mirror', sourceId: id },
  })
}

export async function createPatternFromGrid(
  name: string,
  grid: PatternGrid,
  options: { fileName?: string; origin?: PatternOrigin; cellPx?: number } = {},
): Promise<Pattern> {
  const trimmed = name.trim()
  if (!trimmed) throw new InventoryError('请填写图纸名称')
  if (grid.cols < 1 || grid.rows < 1 || grid.cells.length !== grid.cols * grid.rows) {
    throw new InventoryError('格子矩阵不完整，无法保存')
  }
  const blob = await gridToPngBlob(grid, { cellPx: options.cellPx ?? 16, showGrid: false })
  const thumbBlob = await makeThumb(blob)
  const id = newId()
  const pattern: Pattern = {
    id,
    name: trimmed,
    status: 'pending',
    cols: grid.cols,
    rows: grid.rows,
    usage: sanitizeUsage(usageFromGrid(grid)),
    usageEdited: false,
    buildCount: 0,
    createdAt: now(),
    updatedAt: now(),
    mimeType: 'image/png',
    fileName: options.fileName ?? `${trimmed}.png`,
    origin: options.origin,
  }
  const record: PatternGridRecord = { id, cols: grid.cols, rows: grid.rows, cells: grid.cells, completed: [] }
  await db.transaction('rw', [db.patterns, db.patternImages, db.patternGrids], async () => {
    await db.patterns.add(pattern)
    await db.patternImages.add({ id, blob, thumbBlob })
    await db.patternGrids.add(record)
  })
  return pattern
}

export async function saveSplitTiles(parent: Pattern, tiles: BoardTile[], boardSize: number): Promise<Pattern[]> {
  const created: Pattern[] = []
  for (const tile of tiles) {
    const saved = await createPatternFromGrid(tilePatternName(parent.name, tile), tile.grid, {
      fileName: tileFileName(parent.name, tile),
      origin: {
        kind: 'split',
        sourceId: parent.id,
        sourceName: parent.name,
        boardRow: tile.row,
        boardCol: tile.col,
        originCol: tile.originCol,
        originRow: tile.originRow,
        splitSize: boardSize,
      },
    })
    created.push(saved)
  }
  return created
}

export { usageTotal }
