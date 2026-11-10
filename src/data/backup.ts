import { db } from './db.ts'
import { exportPriceTables, replacePriceTables } from './priceRepo.ts'
import { InventoryError } from './types.ts'

export const BACKUP_FORMAT = 'pindou-system-backup'
export const BACKUP_VERSION = 5

type BackupFile = {
  format: string
  version: number
  exportedAt: string
  warehouses: unknown[]
  stockItems: unknown[]
  ledger: unknown[]
  settings: unknown[]
  patterns: unknown[]
  patternBuilds: unknown[]
  patternImages: { id: string; type: string; data: string; thumbType?: string; thumbData?: string }[]
  patternGrids?: unknown[]
  patternProgress?: unknown[]
  workItems?: unknown[]
  workImages?: { id: string; type: string; data: string; thumbType?: string; thumbData?: string }[]
  beadPriceDefaults?: unknown[]
  beadPriceOverrides?: unknown[]
}

async function blobToData(blob: Blob): Promise<{ type: string; data: string }> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { type: blob.type || 'application/octet-stream', data: btoa(binary) }
}

function dataToBlob(type: string, data: string): Blob {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: type || 'application/octet-stream' })
}

export async function exportBackup(): Promise<string> {
  const [warehouses, stockItems, ledger, settings, patterns, patternBuilds, images, patternGrids, patternProgress, workItems, workImageRows, prices] = await Promise.all([
    db.warehouses.toArray(),
    db.stockItems.toArray(),
    db.ledger.toArray(),
    db.settings.toArray(),
    db.patterns.toArray(),
    db.patternBuilds.toArray(),
    db.patternImages.toArray(),
    db.patternGrids.toArray(),
    db.patternProgress.toArray(),
    db.workItems.toArray(),
    db.workImages.toArray(),
    exportPriceTables(),
  ])
  const patternImages = []
  for (const image of images) {
    const main = await blobToData(image.blob)
    const thumb = image.thumbBlob ? await blobToData(image.thumbBlob) : undefined
    patternImages.push({
      id: image.id,
      type: main.type,
      data: main.data,
      thumbType: thumb?.type,
      thumbData: thumb?.data,
    })
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    warehouses,
    stockItems,
    ledger,
    settings,
    patterns,
    patternBuilds,
    patternImages,
    patternGrids,
    patternProgress,
    workItems,
    workImages: [],
    beadPriceDefaults: prices.beadPriceDefaults,
    beadPriceOverrides: prices.beadPriceOverrides,
  }
  const workImages = []
  for (const image of workImageRows) {
    const main = await blobToData(image.blob)
    const thumb = image.thumbBlob ? await blobToData(image.thumbBlob) : undefined
    workImages.push({
      id: image.id,
      type: main.type,
      data: main.data,
      thumbType: thumb?.type,
      thumbData: thumb?.data,
    })
  }
  file.workImages = workImages
  return JSON.stringify(file, null, 2)
}

export function backupDownloadName(now = new Date()): string {
  return `拼豆系统备份-${now.toISOString().slice(0, 10)}.json`
}

export async function exportBackupFile(): Promise<{ json: string; filename: string }> {
  const json = await exportBackup()
  return { json, filename: backupDownloadName() }
}

export async function importBackup(jsonText: string): Promise<void> {
  let parsed: BackupFile
  try {
    parsed = JSON.parse(jsonText) as BackupFile
  } catch {
    throw new InventoryError('备份文件不是有效的 JSON')
  }
  if (parsed.format !== BACKUP_FORMAT || !parsed.version) {
    throw new InventoryError('这不是拼豆系统的备份文件')
  }
  if (!Array.isArray(parsed.warehouses) || !Array.isArray(parsed.stockItems) || !Array.isArray(parsed.ledger)) {
    throw new InventoryError('备份缺少库存数据')
  }
  const patterns = parsed.patterns ?? []
  const patternBuilds = parsed.patternBuilds ?? []
  const patternImages = parsed.patternImages ?? []
  const patternGrids = parsed.patternGrids ?? []
  const patternProgress = parsed.patternProgress ?? []
  const workItems = parsed.workItems ?? []
  const workImages = parsed.workImages ?? []
  const beadPriceDefaults = parsed.beadPriceDefaults ?? []
  const beadPriceOverrides = parsed.beadPriceOverrides ?? []
  await db.transaction(
    'rw',
    [db.warehouses, db.stockItems, db.ledger, db.settings, db.patterns, db.patternImages, db.patternBuilds, db.patternGrids, db.patternProgress, db.workItems, db.workImages, db.beadPriceDefaults, db.beadPriceOverrides],
    async () => {
      await db.warehouses.clear()
      await db.stockItems.clear()
      await db.ledger.clear()
      await db.settings.clear()
      await db.patterns.clear()
      await db.patternImages.clear()
      await db.patternBuilds.clear()
      await db.patternGrids.clear()
      await db.patternProgress.clear()
      await db.workItems.clear()
      await db.workImages.clear()
      await replacePriceTables([], [])
      if (parsed.warehouses.length) await db.warehouses.bulkAdd(parsed.warehouses as never)
      if (parsed.stockItems.length) await db.stockItems.bulkAdd(parsed.stockItems as never)
      if (parsed.ledger.length) await db.ledger.bulkAdd(parsed.ledger as never)
      if (parsed.settings?.length) await db.settings.bulkAdd(parsed.settings as never)
      if (patterns.length) await db.patterns.bulkAdd(patterns as never)
      if (patternBuilds.length) await db.patternBuilds.bulkAdd(patternBuilds as never)
      if (patternGrids.length) await db.patternGrids.bulkAdd(patternGrids as never)
      if (patternProgress.length) await db.patternProgress.bulkAdd(patternProgress as never)
      if (workItems.length) await db.workItems.bulkAdd(workItems as never)
      for (const image of patternImages) {
        await db.patternImages.add({
          id: image.id,
          blob: dataToBlob(image.type, image.data),
          thumbBlob: image.thumbData ? dataToBlob(image.thumbType || image.type, image.thumbData) : dataToBlob(image.type, image.data),
        })
      }
      for (const image of workImages) {
        await db.workImages.add({
          id: image.id,
          blob: dataToBlob(image.type, image.data),
          thumbBlob: image.thumbData ? dataToBlob(image.thumbType || image.type, image.thumbData) : dataToBlob(image.type, image.data),
        })
      }
      await replacePriceTables(beadPriceDefaults as never, beadPriceOverrides as never)
    },
  )
}
