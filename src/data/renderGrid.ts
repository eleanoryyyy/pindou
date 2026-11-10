import { findColor } from './palettes.ts'
import { cellAt, skuKey } from './boardMath.ts'
import type { PatternGrid } from './types.ts'

export type GridRenderOptions = {
  cellPx?: number
  showGrid?: boolean
  showCodes?: boolean
  highlight?: string | null
  completed?: string[]
  lineWidthScale?: number
  emptyStyle?: 'preview' | 'transparent'
  /** 干净图纸样式：纯色格、规范网格与色号对比色。默认开启。 */
  clean?: boolean
  /** 四边行号列号，外边距 24px。导出 PNG 时应开启。 */
  showAxes?: boolean
  background?: string | 'transparent'
}

export const AXIS_MARGIN = 24
export const CODE_MIN_PX = 12
export const AXIS_COLOR = '#8A8580'
export const EXPORT_BG = '#FFFFFF'

export const CLEAN_EXPORT_OPTIONS: GridRenderOptions = {
  cellPx: 16,
  showGrid: true,
  showCodes: true,
  showAxes: true,
  background: EXPORT_BG,
}
export const GRID_FINE = 'rgba(44,42,40,0.15)'
export const GRID_MAJOR = 'rgba(44,42,40,0.45)'
export const CODE_ON_LIGHT = '#2C2A28'
export const CODE_ON_DARK = '#FFFFFF'

const WARM_DIM = 'rgba(250,247,245,0.7)'
const WARM_PAPER = '#FAF7F5'

export function highlightStrokeColor(): string {
  if (typeof document === 'undefined') return '#8C4A4A'
  const value = getComputedStyle(document.documentElement).getPropertyValue('--pd-highlight-stroke').trim()
  return value || '#8C4A4A'
}

export function cellHex(brand: string, code: string): string {
  return findColor(brand as 'MARD' | 'COCO', code)?.hex ?? '#CCCCCC'
}

/** WCAG 相对亮度，0.5 为色号深浅分界。 */
export function relativeLuminance(hex: string): number {
  const raw = hex.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw
  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value)) return 1
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  const toLinear = (channel: number) => {
    const s = channel / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function codeTextColor(hex: string): string {
  return relativeLuminance(hex) >= 0.5 ? CODE_ON_LIGHT : CODE_ON_DARK
}

/** 1 起，之后每 5 格：1、5、10… */
export function axisTicks(count: number): number[] {
  if (count <= 0) return []
  const ticks = [1]
  for (let n = 5; n <= count; n += 5) ticks.push(n)
  return ticks
}

export async function gridToPngBlob(grid: PatternGrid, options: GridRenderOptions = {}): Promise<Blob> {
  const canvas = renderGridCanvas(grid, options)
  return canvas.convertToBlob({ type: 'image/png' })
}

export function renderGridCanvas(grid: PatternGrid, options: GridRenderOptions = {}): OffscreenCanvas {
  const cellPx = options.cellPx ?? (grid.cols * grid.rows > 6400 ? 8 : 16)
  const margin = options.showAxes ? AXIS_MARGIN : 0
  const canvas = new OffscreenCanvas(
    Math.max(1, grid.cols * cellPx + margin * 2),
    Math.max(1, grid.rows * cellPx + margin * 2),
  )
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法绘制图纸')
  const background = options.background ?? (options.showAxes ? EXPORT_BG : undefined)
  if (background && background !== 'transparent') {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  drawGrid(ctx, grid, margin, margin, cellPx, options)
  if (options.showAxes) {
    drawAxes(ctx, grid.cols, grid.rows, margin, margin, cellPx)
  }
  if (background && background !== 'transparent') {
    punchEmptyCells(ctx, grid, margin, margin, cellPx)
  }
  return canvas
}

function punchEmptyCells(
  ctx: OffscreenCanvasRenderingContext2D,
  grid: PatternGrid,
  originX: number,
  originY: number,
  cellPx: number,
): void {
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cell = cellAt(grid, col, row)
      if (cell.code) continue
      ctx.clearRect(originX + col * cellPx, originY + row * cellPx, cellPx, cellPx)
    }
  }
}

export function drawGrid(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  grid: PatternGrid,
  originX: number,
  originY: number,
  cellPx: number,
  options: GridRenderOptions = {},
): void {
  const completed = new Set(options.completed ?? [])
  const showCodes = Boolean(options.showCodes) && cellPx >= CODE_MIN_PX
  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const cell = cellAt(grid, col, row)
      const key = skuKey(cell.brand, cell.code)
      const x = originX + col * cellPx
      const y = originY + row * cellPx
      const empty = !cell.code
      if (empty) {
        if (options.emptyStyle === 'preview') {
          const lw = options.lineWidthScale ?? 1
          ctx.fillStyle = WARM_PAPER
          ctx.fillRect(x, y, cellPx, cellPx)
          ctx.save()
          ctx.strokeStyle = GRID_FINE
          ctx.lineWidth = lw
          ctx.setLineDash([Math.max(2, 4 * lw), Math.max(2, 3 * lw)])
          ctx.strokeRect(x + lw / 2, y + lw / 2, cellPx - lw, cellPx - lw)
          ctx.restore()
        }
        continue
      }
      const hex = cellHex(cell.brand, cell.code)
      ctx.fillStyle = hex
      ctx.fillRect(x, y, cellPx, cellPx)
      const isHi = options.highlight && options.highlight === key && !completed.has(key)
      if (options.highlight && !isHi) {
        ctx.fillStyle = WARM_DIM
        ctx.fillRect(x, y, cellPx, cellPx)
      }
      if (isHi && cellPx >= 2) {
        const lw = options.lineWidthScale ?? 1
        ctx.strokeStyle = highlightStrokeColor()
        ctx.lineWidth = lw
        ctx.strokeRect(x + lw / 2, y + lw / 2, cellPx - lw, cellPx - lw)
      }
      if (showCodes) {
        ctx.fillStyle = codeTextColor(hex)
        ctx.font = `600 ${Math.max(8, Math.floor(cellPx * 0.4))}px Nunito, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(cell.code, x + cellPx / 2, y + cellPx / 2)
      }
    }
  }
  if (options.showGrid && cellPx >= 2) {
    drawGridLines(ctx, grid.cols, grid.rows, originX, originY, cellPx, 10, options.lineWidthScale ?? 1)
  }
}

export function drawGridLines(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  cols: number,
  rows: number,
  originX: number,
  originY: number,
  cellPx: number,
  every = 10,
  lineWidthScale = 1,
): void {
  const width = cols * cellPx
  const height = rows * cellPx
  for (let col = 0; col <= cols; col += 1) {
    const major = col % every === 0
    ctx.beginPath()
    ctx.strokeStyle = major ? GRID_MAJOR : GRID_FINE
    ctx.lineWidth = (major ? 2 : 1) * lineWidthScale
    const x = originX + col * cellPx + (major ? 0 : 0.5 * lineWidthScale)
    ctx.moveTo(x, originY)
    ctx.lineTo(x, originY + height)
    ctx.stroke()
  }
  for (let row = 0; row <= rows; row += 1) {
    const major = row % every === 0
    ctx.beginPath()
    ctx.strokeStyle = major ? GRID_MAJOR : GRID_FINE
    ctx.lineWidth = (major ? 2 : 1) * lineWidthScale
    const y = originY + row * cellPx + (major ? 0 : 0.5 * lineWidthScale)
    ctx.moveTo(originX, y)
    ctx.lineTo(originX + width, y)
    ctx.stroke()
  }
}

export function drawAxes(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  cols: number,
  rows: number,
  originX: number,
  originY: number,
  cellPx: number,
): void {
  ctx.save()
  ctx.fillStyle = AXIS_COLOR
  ctx.font = '600 12px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const width = cols * cellPx
  const height = rows * cellPx
  for (const tick of axisTicks(cols)) {
    const x = originX + (tick - 0.5) * cellPx
    ctx.fillText(String(tick), x, originY - AXIS_MARGIN / 2)
    ctx.fillText(String(tick), x, originY + height + AXIS_MARGIN / 2)
  }
  for (const tick of axisTicks(rows)) {
    const y = originY + (tick - 0.5) * cellPx
    ctx.textAlign = 'center'
    ctx.fillText(String(tick), originX - AXIS_MARGIN / 2, y)
    ctx.fillText(String(tick), originX + width + AXIS_MARGIN / 2, y)
  }
  ctx.restore()
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
