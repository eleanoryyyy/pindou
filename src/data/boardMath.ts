import type { BrandId, GridCell, PatternGrid, PatternUsage } from './types.ts'

export function skuKey(brand: BrandId, code: string): string {
  return `${brand}::${code}`
}

export function parseSkuKey(key: string): { brand: BrandId; code: string } {
  const [brand, code] = key.split('::')
  return { brand: brand as BrandId, code }
}

export function cellAt(grid: PatternGrid, col: number, row: number): GridCell {
  return grid.cells[row * grid.cols + col]
}

export function usageFromGrid(grid: PatternGrid): Omit<PatternUsage, 'id'>[] {
  const counts = new Map<string, { brand: BrandId; code: string; quantity: number }>()
  for (const cell of grid.cells) {
    if (!cell.code) continue
    const key = skuKey(cell.brand, cell.code)
    const current = counts.get(key)
    if (current) current.quantity += 1
    else counts.set(key, { brand: cell.brand, code: cell.code, quantity: 1 })
  }
  return [...counts.values()].sort(
    (a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code, 'en', { numeric: true }),
  )
}

export function countsFromGrid(grid: PatternGrid): Record<string, number> {
  return Object.fromEntries(usageFromGrid(grid).map((line) => [line.code, line.quantity]))
}

export function cellsWithCode(grid: PatternGrid, code: string): { col: number; row: number }[] {
  const found: { col: number; row: number }[] = []
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      if (cellAt(grid, col, row).code === code) found.push({ col, row })
    }
  }
  return found
}

export function subgrid(grid: PatternGrid, originCol: number, originRow: number, cols: number, rows: number): PatternGrid {
  const cells: GridCell[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push(cellAt(grid, originCol + col, originRow + row))
    }
  }
  return { cols, rows, cells }
}

export type BoardTile = {
  row: number
  col: number
  originCol: number
  originRow: number
  cols: number
  rows: number
  sizeLabel: string
  grid: PatternGrid
  counts: Record<string, number>
}

export function splitBoards(grid: PatternGrid, boardSize: number): BoardTile[] {
  if (!Number.isInteger(boardSize) || boardSize < 1) {
    throw new Error('板尺寸必须是正整数')
  }
  const tiles: BoardTile[] = []
  let boardRow = 0
  for (let originRow = 0; originRow < grid.rows; originRow += boardSize) {
    let boardCol = 0
    for (let originCol = 0; originCol < grid.cols; originCol += boardSize) {
      const cols = Math.min(boardSize, grid.cols - originCol)
      const rows = Math.min(boardSize, grid.rows - originRow)
      const tile = subgrid(grid, originCol, originRow, cols, rows)
      tiles.push({
        row: boardRow,
        col: boardCol,
        originCol,
        originRow,
        cols,
        rows,
        sizeLabel: `${cols}x${rows}`,
        grid: tile,
        counts: countsFromGrid(tile),
      })
      boardCol += 1
    }
    boardRow += 1
  }
  return tiles
}

export type BoardPlacement = {
  grid: PatternGrid
  originCol: number
  originRow: number
}

export function mergeBoards(placements: BoardPlacement[]): PatternGrid {
  if (placements.length === 0) {
    return { cols: 0, rows: 0, cells: [] }
  }
  let cols = 0
  let rows = 0
  for (const item of placements) {
    cols = Math.max(cols, item.originCol + item.grid.cols)
    rows = Math.max(rows, item.originRow + item.grid.rows)
  }
  const cells: GridCell[] = Array.from({ length: cols * rows }, () => ({ brand: 'MARD', code: '' }))
  for (const item of placements) {
    for (let row = 0; row < item.grid.rows; row += 1) {
      for (let col = 0; col < item.grid.cols; col += 1) {
        const x = item.originCol + col
        const y = item.originRow + row
        cells[y * cols + x] = cellAt(item.grid, col, row)
      }
    }
  }
  return { cols, rows, cells }
}

export function gridsEqual(a: PatternGrid, b: PatternGrid): boolean {
  if (a.cols !== b.cols || a.rows !== b.rows || a.cells.length !== b.cells.length) return false
  return a.cells.every((cell, index) => cell.brand === b.cells[index].brand && cell.code === b.cells[index].code)
}

export function mirrorHorizontal(grid: PatternGrid): PatternGrid {
  const cells: GridCell[] = []
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      cells.push(cellAt(grid, grid.cols - 1 - col, row))
    }
  }
  return { cols: grid.cols, rows: grid.rows, cells }
}

export function mirrorVertical(grid: PatternGrid): PatternGrid {
  const cells: GridCell[] = []
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      cells.push(cellAt(grid, col, grid.rows - 1 - row))
    }
  }
  return { cols: grid.cols, rows: grid.rows, cells }
}

export function sizeLabel(cols: number, rows: number): string {
  return `${cols}×${rows}`
}

export function safeFileName(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '_')
}

export function tilePositionLabel(tile: Pick<BoardTile, 'row' | 'col'>): string {
  return `第${tile.row + 1}行第${tile.col + 1}列`
}

export function tileFileName(patternName: string, tile: Pick<BoardTile, 'row' | 'col'>): string {
  return safeFileName(`${patternName}-${tilePositionLabel(tile)}.png`)
}

export function tilePatternName(patternName: string, tile: Pick<BoardTile, 'row' | 'col'>): string {
  return `${patternName} · ${tilePositionLabel(tile)}`
}

export function parseSplitPosition(name: string): { boardRow: number; boardCol: number } | undefined {
  const modern = name.match(/第\s*(\d+)\s*行第\s*(\d+)\s*列/)
  if (modern) return { boardRow: Number(modern[1]) - 1, boardCol: Number(modern[2]) - 1 }
  const legacy = name.match(/板 r(\d+)c(\d+)/)
  if (legacy) return { boardRow: Number(legacy[1]), boardCol: Number(legacy[2]) }
  return undefined
}

export function resolveTileOrigin(
  pattern: {
    name: string
    origin?: { originCol?: number; originRow?: number; boardCol?: number; boardRow?: number; splitSize?: number }
  },
  splitSizeHint?: number,
): { originCol: number; originRow: number; source: 'origin' | 'name' | 'none' } {
  const origin = pattern.origin
  if (origin && Number.isInteger(origin.originCol) && Number.isInteger(origin.originRow)) {
    return { originCol: origin.originCol as number, originRow: origin.originRow as number, source: 'origin' }
  }
  const splitSize = origin?.splitSize ?? splitSizeHint
  if (splitSize && Number.isInteger(origin?.boardCol) && Number.isInteger(origin?.boardRow)) {
    return { originCol: (origin!.boardCol as number) * splitSize, originRow: (origin!.boardRow as number) * splitSize, source: 'origin' }
  }
  const parsed = parseSplitPosition(pattern.name)
  if (parsed && splitSize) {
    return { originCol: parsed.boardCol * splitSize, originRow: parsed.boardRow * splitSize, source: 'name' }
  }
  return { originCol: 0, originRow: 0, source: 'none' }
}

export function usageDiffersFromGrid(
  usage: { brand: BrandId; code: string; quantity: number }[],
  grid: PatternGrid,
): boolean {
  const expected = usageFromGrid(grid)
  if (usage.length !== expected.length) return true
  const map = new Map(expected.map((line) => [skuKey(line.brand, line.code), line.quantity]))
  return usage.some((line) => map.get(skuKey(line.brand, line.code)) !== line.quantity)
}

export function tileCardTitle(tile: Pick<BoardTile, 'row' | 'col' | 'cols' | 'rows'>): string {
  return `第 ${tile.row + 1} 行第 ${tile.col + 1} 列 · ${tile.cols}×${tile.rows}`
}

export function applyDisplayMirrors(grid: PatternGrid, flipH: boolean, flipV: boolean): PatternGrid {
  let next = grid
  if (flipH) next = mirrorHorizontal(next)
  if (flipV) next = mirrorVertical(next)
  return next
}

export function isEmptyCell(cell: GridCell): boolean {
  return !cell.code
}
