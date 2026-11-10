import Dexie, { type EntityTable } from 'dexie'
import type { BeadPriceDefault, BeadPriceOverride, LedgerEntry, Pattern, PatternBuild, PatternGridRecord, PatternImage, PatternProgress, StockItem, Warehouse, WorkImage, WorkItem } from './types.ts'

export type AppSetting = {
  key: string
  value: string
}

class PindouDb extends Dexie {
  warehouses!: EntityTable<Warehouse, 'id'>
  stockItems!: EntityTable<StockItem, 'id'>
  ledger!: EntityTable<LedgerEntry, 'id'>
  settings!: EntityTable<AppSetting, 'key'>
  patterns!: EntityTable<Pattern, 'id'>
  patternImages!: EntityTable<PatternImage, 'id'>
  patternBuilds!: EntityTable<PatternBuild, 'id'>
  patternGrids!: EntityTable<PatternGridRecord, 'id'>
  patternProgress!: EntityTable<PatternProgress, 'id'>
  workItems!: EntityTable<WorkItem, 'id'>
  workImages!: EntityTable<WorkImage, 'id'>
  beadPriceDefaults!: EntityTable<BeadPriceDefault, 'warehouseId'>
  beadPriceOverrides!: EntityTable<BeadPriceOverride, 'id'>

  constructor() {
    super('pindou-system')
    // v1：第 1 阶段豆仓 / 库存 / 流水。升级只追加表，不改已有 store，旧数据保留。
    this.version(1).stores({
      warehouses: 'id, name, createdAt',
      stockItems: 'id, warehouseId, [warehouseId+brand+code]',
      ledger: 'id, warehouseId, createdAt, [warehouseId+brand+code]',
      settings: 'key',
    })
    this.version(2).stores({
      warehouses: 'id, name, createdAt',
      stockItems: 'id, warehouseId, [warehouseId+brand+code]',
      ledger: 'id, warehouseId, createdAt, [warehouseId+brand+code]',
      settings: 'key',
      patterns: 'id, status, createdAt, name',
      patternImages: 'id',
      patternBuilds: 'id, patternId, createdAt, warehouseId',
    })
    // v3：格子色号矩阵与制作勾选进度。只追加表。
    this.version(3).stores({
      warehouses: 'id, name, createdAt',
      stockItems: 'id, warehouseId, [warehouseId+brand+code]',
      ledger: 'id, warehouseId, createdAt, [warehouseId+brand+code]',
      settings: 'key',
      patterns: 'id, status, createdAt, name',
      patternImages: 'id',
      patternBuilds: 'id, patternId, createdAt, warehouseId',
      patternGrids: 'id',
    })
    // v4：进行中进度 / 暂扣、作品集与照片。只追加表。
    this.version(4).stores({
      warehouses: 'id, name, createdAt',
      stockItems: 'id, warehouseId, [warehouseId+brand+code]',
      ledger: 'id, warehouseId, createdAt, [warehouseId+brand+code]',
      settings: 'key',
      patterns: 'id, status, createdAt, name',
      patternImages: 'id',
      patternBuilds: 'id, patternId, createdAt, warehouseId',
      patternGrids: 'id',
      patternProgress: 'id, patternId, updatedAt',
      workItems: 'id, createdAt, patternId',
      workImages: 'id',
    })
    // v5：补色计价。豆仓默认单价与色号自定单价。只追加表。
    this.version(5).stores({
      warehouses: 'id, name, createdAt',
      stockItems: 'id, warehouseId, [warehouseId+brand+code]',
      ledger: 'id, warehouseId, createdAt, [warehouseId+brand+code]',
      settings: 'key',
      patterns: 'id, status, createdAt, name',
      patternImages: 'id',
      patternBuilds: 'id, patternId, createdAt, warehouseId',
      patternGrids: 'id',
      patternProgress: 'id, patternId, updatedAt',
      workItems: 'id, createdAt, patternId',
      workImages: 'id',
      beadPriceDefaults: 'warehouseId',
      beadPriceOverrides: 'id, warehouseId, [warehouseId+brand+code]',
    })
  }
}

export const db = new PindouDb()
