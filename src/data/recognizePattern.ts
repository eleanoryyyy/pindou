import { PALETTES, normalizeCode } from './palettes.ts'
import type { BrandId, PatternUsage } from './types.ts'
import { type GridBox } from './detectGrid.ts'

export type { DetectedGrid, GridBox, LegendCompareRow, LegendLine } from './detectGrid.ts'
export {
  compareLegend,
  detectGridRegion,
  detectLegendRegion,
  legendCodesOf,
  parseLegendText,
} from './detectGrid.ts'

export type Raster = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type RecognizeOptions = {
  cols?: number
  rows?: number
  preferBrand?: BrandId
  /** 只切这个矩形里的格子。未提供时按整张图划分。 */
  region?: GridBox
  /** 白色或接近白底、且没有明显文字的格子当空格，不计数、不生成豆子。 */
  blankWhite?: boolean
  /** 有图例时只在这些色号里匹配。 */
  legendCodes?: string[]
  /** 默认：提供 region 或开启 blankWhite 时用抗字环带取样，否则用中心取样。 */
  sampling?: 'center' | 'ring'
}

export type RecognizeCell = { brand: BrandId; code: string }

export type RecognizeResult = {
  cols: number
  rows: number
  usage: Omit<PatternUsage, 'id'>[]
  cells: RecognizeCell[]
  averageDistance: number
  region?: GridBox
  emptyCount: number
}

type PaletteEntry = { brand: BrandId; code: string; hex: string; r: number; g: number; b: number }

const PALETTE_RGB: PaletteEntry[] = PALETTES.flatMap((palette) =>
  palette.colors.map((color) => {
    const hex = color.hex.replace('#', '')
    return {
      brand: palette.brand,
      code: normalizeCode(color.code),
      hex: color.hex,
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    }
  }),
)

function pixel(raster: Raster, x: number, y: number): { r: number; g: number; b: number } {
  const sx = Math.min(raster.width - 1, Math.max(0, Math.round(x)))
  const sy = Math.min(raster.height - 1, Math.max(0, Math.round(y)))
  const i = (sy * raster.width + sx) * 4
  return { r: raster.data[i], g: raster.data[i + 1], b: raster.data[i + 2] }
}

function dist2(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}

function luminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b
}

function nearest(
  rgb: { r: number; g: number; b: number },
  preferBrand?: BrandId,
  allowCodes?: Set<string>,
): PaletteEntry {
  let best: PaletteEntry | undefined
  let bestD = Number.POSITIVE_INFINITY
  for (const entry of PALETTE_RGB) {
    if (preferBrand && entry.brand !== preferBrand) continue
    if (allowCodes && !allowCodes.has(entry.code)) continue
    const d = dist2(rgb, entry)
    if (d < bestD) {
      bestD = d
      best = entry
    }
  }
  if (best) return best
  if (allowCodes) return nearest(rgb, preferBrand)
  if (preferBrand) return nearest(rgb)
  return PALETTE_RGB[0]
}

function medianChannel(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function medianRgb(pixels: { r: number; g: number; b: number }[]): { r: number; g: number; b: number } {
  return {
    r: medianChannel(pixels.map((p) => p.r)),
    g: medianChannel(pixels.map((p) => p.g)),
    b: medianChannel(pixels.map((p) => p.b)),
  }
}

/** 取格子边缘内侧一圈，避开网格线和中心文字，中位数后再丢掉反差大的文字像素。 */
export function sampleCellRing(
  raster: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { rgb: { r: number; g: number; b: number }; contrast: number } {
  const cellW = x1 - x0
  const cellH = y1 - y0
  if (cellW < 4 || cellH < 4) {
    return { rgb: pixel(raster, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)), contrast: 0 }
  }
  const minSide = Math.min(cellW, cellH)
  const inset = Math.max(2, Math.round(minSide * 0.12))
  const ringInner = Math.max(inset + 1, Math.round(minSide * 0.24))
  const ring: { r: number; g: number; b: number }[] = []
  const center: { r: number; g: number; b: number }[] = []
  const xStart = Math.max(0, Math.floor(x0))
  const yStart = Math.max(0, Math.floor(y0))
  const xEnd = Math.min(raster.width, Math.ceil(x1))
  const yEnd = Math.min(raster.height, Math.ceil(y1))
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const dx = x - x0
      const dy = y - y0
      const edge = Math.min(dx, cellW - 1 - dx, dy, cellH - 1 - dy)
      const p = pixel(raster, x, y)
      if (edge >= inset && edge <= ringInner) ring.push(p)
      if (edge >= ringInner + 2) center.push(p)
    }
  }
  const pool = ring.length ? ring : center
  if (!pool.length) {
    return { rgb: pixel(raster, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2)), contrast: 0 }
  }
  let rgb = medianRgb(pool)
  const kept = pool.filter((p) => dist2(p, rgb) <= 35 * 35)
  if (kept.length > pool.length * 0.3) rgb = medianRgb(kept)
  const contrastBase = center.length ? center : pool
  const contrast =
    contrastBase.filter((p) => dist2(p, rgb) > 40 * 40).length / Math.max(1, contrastBase.length)
  return { rgb, contrast }
}

export function isBlankWhiteCell(rgb: { r: number; g: number; b: number }, contrast: number): boolean {
  return luminance(rgb) >= 245 && contrast < 0.08
}

function emptyCell(preferBrand?: BrandId): RecognizeCell {
  return { brand: preferBrand ?? 'MARD', code: '' }
}

export function sampleCell(
  raster: Raster,
  col: number,
  row: number,
  cols: number,
  rows: number,
): { r: number; g: number; b: number } {
  const cellW = raster.width / cols
  const cellH = raster.height / rows
  const cx = (col + 0.5) * cellW
  const cy = (row + 0.5) * cellH
  // 1 像素 1 格时不要向邻格取样，否则会混到旁边的色。
  if (cellW < 2 || cellH < 2) {
    return pixel(raster, Math.floor(col * cellW + 1e-6), Math.floor(row * cellH + 1e-6))
  }
  const offsets = [
    [0, 0],
    [-cellW * 0.15, 0],
    [cellW * 0.15, 0],
    [0, -cellH * 0.15],
    [0, cellH * 0.15],
  ]
  let r = 0
  let g = 0
  let b = 0
  for (const [dx, dy] of offsets) {
    const p = pixel(raster, cx + dx, cy + dy)
    r += p.r
    g += p.g
    b += p.b
  }
  const n = offsets.length
  return { r: r / n, g: g / n, b: b / n }
}

function gridScore(raster: Raster, cols: number, rows: number): number {
  const cellW = raster.width / cols
  const cellH = raster.height / rows
  let variance = 0
  let match = 0
  let cells = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const samples = [
        sampleCell(raster, col, row, cols, rows),
        pixel(raster, col * cellW + cellW * 0.25, row * cellH + cellH * 0.25),
        pixel(raster, col * cellW + cellW * 0.75, row * cellH + cellH * 0.75),
      ]
      const mean = {
        r: samples.reduce((s, p) => s + p.r, 0) / samples.length,
        g: samples.reduce((s, p) => s + p.g, 0) / samples.length,
        b: samples.reduce((s, p) => s + p.b, 0) / samples.length,
      }
      variance += samples.reduce((s, p) => s + dist2(p, mean), 0) / samples.length
      const color = nearest(mean)
      match += dist2(mean, color)
      cells += 1
    }
  }
  return variance / cells + match / cells
}

export function suggestGrid(raster: Raster): { cols: number; rows: number } {
  const candidates: { cols: number; rows: number; score: number }[] = []
  for (let cell = 8; cell <= 64; cell += 1) {
    if (raster.width % cell !== 0 || raster.height % cell !== 0) continue
    const cols = raster.width / cell
    const rows = raster.height / cell
    if (cols < 2 || rows < 2 || cols > 200 || rows > 200) continue
    candidates.push({ cols, rows, score: gridScore(raster, cols, rows) })
  }
  if (candidates.length === 0) {
    return { cols: Math.max(1, Math.round(raster.width / 24)), rows: Math.max(1, Math.round(raster.height / 24)) }
  }
  // 均匀色块会被 8px / 12px / 24px 等整除格同时打出低分；取其中最粗的格，避免把一颗豆拆成多格。
  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 4) return a.score - b.score
    return a.cols * a.rows - b.cols * b.rows
  })
  return { cols: candidates[0].cols, rows: candidates[0].rows }
}

export function recognizeUsage(raster: Raster, options: RecognizeOptions = {}): RecognizeResult {
  const region = options.region
    ? {
        x: Math.max(0, options.region.x),
        y: Math.max(0, options.region.y),
        width: Math.min(raster.width - Math.max(0, options.region.x), Math.max(1, options.region.width)),
        height: Math.min(raster.height - Math.max(0, options.region.y), Math.max(1, options.region.height)),
      }
    : undefined
  const suggested = region ? { cols: 0, rows: 0 } : suggestGrid(raster)
  const cols = options.cols ?? (region ? Math.max(1, Math.round(region.width / 24)) : suggested.cols)
  const rows = options.rows ?? (region ? Math.max(1, Math.round(region.height / 24)) : suggested.rows)
  const useRing = options.sampling === 'ring' || (options.sampling !== 'center' && Boolean(region || options.blankWhite))
  // 图例只限制可匹配的色号，不按图例数量改格子或重算用量。每格独立取色后再累计。
  const allowCodes =
    options.legendCodes && options.legendCodes.length
      ? new Set(options.legendCodes.map((code) => normalizeCode(code)))
      : undefined
  const counts = new Map<string, { brand: BrandId; code: string; quantity: number }>()
  const cells: RecognizeCell[] = []
  let distance = 0
  let emptyCount = 0
  const originX = region ? region.x : 0
  const originY = region ? region.y : 0
  const spanW = region ? region.width : raster.width
  const spanH = region ? region.height : raster.height
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let rgb: { r: number; g: number; b: number }
      let contrast = 0
      if (useRing) {
        const x0 = originX + (col * spanW) / cols
        const y0 = originY + (row * spanH) / rows
        const x1 = originX + ((col + 1) * spanW) / cols
        const y1 = originY + ((row + 1) * spanH) / rows
        const sampled = sampleCellRing(raster, x0, y0, x1, y1)
        rgb = sampled.rgb
        contrast = sampled.contrast
      } else {
        rgb = sampleCell(raster, col, row, cols, rows)
      }
      if (options.blankWhite && isBlankWhiteCell(rgb, contrast)) {
        cells.push(emptyCell(options.preferBrand))
        emptyCount += 1
        continue
      }
      const color = nearest(rgb, options.preferBrand, allowCodes)
      distance += Math.sqrt(dist2(rgb, color))
      cells.push({ brand: color.brand, code: color.code })
      const key = `${color.brand}::${color.code}`
      const current = counts.get(key)
      if (current) current.quantity += 1
      else counts.set(key, { brand: color.brand, code: color.code, quantity: 1 })
    }
  }
  const usage = [...counts.values()].sort((a, b) => b.quantity - a.quantity || a.code.localeCompare(b.code, 'en', { numeric: true }))
  const filled = cols * rows - emptyCount
  return {
    cols,
    rows,
    usage,
    cells,
    averageDistance: distance / (filled || 1),
    region,
    emptyCount,
  }
}

/** 像素画：允许 1 像素 1 格，也识别放大 N 倍的色块。分数接近时取更粗的格。 */
function isSolidPixelGrid(raster: Raster, cols: number, rows: number, maxDist2 = 16): boolean {
  const cellW = raster.width / cols
  const cellH = raster.height / rows
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = Math.round(col * cellW)
      const y0 = Math.round(row * cellH)
      const x1 = Math.round((col + 1) * cellW)
      const y1 = Math.round((row + 1) * cellH)
      const first = pixel(raster, x0, y0)
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          if (dist2(pixel(raster, x, y), first) > maxDist2) return false
        }
      }
    }
  }
  return true
}

export function suggestPixelGrid(raster: Raster): { cols: number; rows: number } {
  const candidates: { cols: number; rows: number }[] = []
  const maxCell = Math.max(1, Math.min(64, raster.width, raster.height))
  for (let cell = 1; cell <= maxCell; cell += 1) {
    if (raster.width % cell !== 0 || raster.height % cell !== 0) continue
    const cols = raster.width / cell
    const rows = raster.height / cell
    if (cols < 1 || rows < 1 || cols > 256 || rows > 256) continue
    if (isSolidPixelGrid(raster, cols, rows)) candidates.push({ cols, rows })
  }
  if (candidates.length === 0) {
    return { cols: raster.width, rows: raster.height }
  }
  candidates.sort((a, b) => a.cols * a.rows - b.cols * b.rows)
  return { cols: candidates[0].cols, rows: candidates[0].rows }
}

export function recognizePixelArt(raster: Raster, options: RecognizeOptions = {}): RecognizeResult {
  const suggested = suggestPixelGrid(raster)
  return recognizeUsage(raster, {
    preferBrand: options.preferBrand,
    cols: options.cols ?? suggested.cols,
    rows: options.rows ?? suggested.rows,
  })
}

export function gridFromRecognize(result: RecognizeResult): import('./types.ts').PatternGrid {
  return { cols: result.cols, rows: result.rows, cells: result.cells }
}

export async function rasterFromBlob(blob: Blob): Promise<Raster> {
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('无法读取图片')
  }
  ctx.drawImage(bitmap, 0, 0)
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return { width: image.width, height: image.height, data: image.data }
}

export function isAcceptedImageFile(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg') return true
  const name = file.name.toLowerCase()
  return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
}
