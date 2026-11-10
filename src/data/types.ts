export type BrandId = 'MARD' | 'COCO'

export type LedgerType = 'in' | 'out'

export type Warehouse = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type StockItem = {
  id: string
  warehouseId: string
  brand: BrandId
  code: string
  quantity: number
  threshold: number | null
  updatedAt: number
}

export type LedgerEntry = {
  id: string
  warehouseId: string
  brand: BrandId
  code: string
  type: LedgerType
  quantity: number
  createdAt: number
  note?: string
  patternId?: string
  buildId?: string
}

export type PaletteColor = {
  code: string
  hex: string
  group: string
}

export type Palette = {
  id: string
  brand: BrandId
  title: string
  count: number
  colors: PaletteColor[]
}

export type KitTemplate = {
  id: string
  name: string
  brand: BrandId
  items: { code: string; quantity: number }[]
}

export type ColorFamilyId = 'red-pink' | 'yellow-orange' | 'green' | 'blue-purple' | 'neutral'

export type StockLine = StockItem & {
  hex: string
  family: ColorFamilyId
  statusKind: 'ok' | 'warn' | 'danger' | null
  statusLabel: string
  onRestockList: boolean
  restockNeed: number
}

export class InventoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InventoryError'
  }
}

export function stockItemId(warehouseId: string, brand: BrandId, code: string): string {
  return `${warehouseId}::${brand}::${code}`
}

export type PatternStatus = 'pending' | 'in-progress' | 'done'

export type PatternUsage = {
  id: string
  brand: BrandId
  code: string
  quantity: number
}

export type PatternOrigin = {
  kind: 'split' | 'merge' | 'pixel' | 'mirror'
  sourceId?: string
  sourceName?: string
  boardRow?: number
  boardCol?: number
  originCol?: number
  originRow?: number
  splitSize?: number
}

export type Pattern = {
  id: string
  name: string
  status: PatternStatus
  cols: number
  rows: number
  usage: PatternUsage[]
  usageEdited: boolean
  buildCount: number
  createdAt: number
  updatedAt: number
  mimeType: string
  fileName: string
  origin?: PatternOrigin
}

export type PatternImage = {
  id: string
  blob: Blob
  thumbBlob: Blob
}

export type PatternBuild = {
  id: string
  patternId: string
  warehouseId: string
  createdAt: number
  ledgerIds: string[]
  usageSnapshot: { brand: BrandId; code: string; quantity: number }[]
}

export type GridCell = {
  brand: BrandId
  code: string
}

export type PatternGrid = {
  cols: number
  rows: number
  cells: GridCell[]
}

export type PatternGridRecord = {
  id: string
  cols: number
  rows: number
  cells: GridCell[]
  completed: string[]
}

export const PATTERN_STATUS_LABEL: Record<PatternStatus, string> = {
  pending: '待拼',
  'in-progress': '进行中',
  done: '已完成',
}


export type HoldLine = {
  warehouseId: string
  brand: BrandId
  code: string
  quantity: number
}

export type PatternProgress = {
  id: string
  patternId: string
  boardLabel: string
  colorKey: string
  holds: HoldLine[]
  createdAt: number
  updatedAt: number
}

export type WorkItem = {
  id: string
  date: number
  note: string
  patternId?: string
  mimeType: string
  fileName: string
  createdAt: number
  updatedAt: number
}

export type WorkImage = {
  id: string
  blob: Blob
  thumbBlob: Blob
}

/** 豆仓默认单价，存整数厘。没有记录表示默认价未填。li 为 0 表示已填的 0 元。 */
export type BeadPriceDefault = {
  warehouseId: string
  li: number
  updatedAt: number
}

/** 色号自定单价，按豆仓 + 品牌 + 色号记忆，存整数厘。 */
export type BeadPriceOverride = {
  id: string
  warehouseId: string
  brand: BrandId
  code: string
  li: number
  updatedAt: number
}
