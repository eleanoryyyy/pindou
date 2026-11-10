import type { HoldLine, PatternProgress } from './types.ts'

/** 清空豆仓时是否释放该仓在进行中作品上的暂扣。作品和拼的进度始终保留。 */
export const CLEAR_WAREHOUSE_RELEASE_HOLDS = true

export function holdsFromOtherWarehouses(holds: HoldLine[], warehouseId: string): HoldLine[] {
  return holds.filter((hold) => hold.warehouseId !== warehouseId)
}

export function countPatternsWithWarehouseHolds(rows: PatternProgress[], warehouseId: string): number {
  return rows.filter((row) => row.holds.some((hold) => hold.warehouseId === warehouseId)).length
}

/** 确认框正文（不含「建议先导出备份」）。 */
export function formatClearWarehouseMain(name: string, skuCount: number): string {
  return `将清空『${name}』的全部 ${skuCount} 个色号和库存，流水也一并清除，不可撤销`
}

export function formatClearWarehouseHoldsNote(patternCount: number): string | null {
  if (!CLEAR_WAREHOUSE_RELEASE_HOLDS || patternCount <= 0) return null
  return `另有 ${patternCount} 个进行中作品的暂扣会一并释放`
}
