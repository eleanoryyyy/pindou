import { normalizeCode } from './palettes.ts'

export type GridBox = {
  x: number
  y: number
  width: number
  height: number
}

export type DetectedGrid = GridBox & {
  cols: number
  rows: number
  cellWidth: number
  cellHeight: number
}

export type LegendLine = {
  code: string
  quantity?: number
}

export type LegendCompareRow = {
  code: string
  legend: number | null
  recognized: number
  delta: number | null
}

export type RasterLike = {
  width: number
  height: number
  data: Uint8ClampedArray
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function pixelLum(raster: RasterLike, x: number, y: number): number {
  const i = (y * raster.width + x) * 4
  return luminance(raster.data[i], raster.data[i + 1], raster.data[i + 2])
}

function lineScores(raster: RasterLike, axis: 'x' | 'y'): Float64Array {
  const along = axis === 'x' ? raster.width : raster.height
  const across = axis === 'x' ? raster.height : raster.width
  const scores = new Float64Array(along)
  for (let i = 1; i < along - 1; i += 1) {
    let hits = 0
    for (let j = 0; j < across; j += 1) {
      const x = axis === 'x' ? i : j
      const y = axis === 'x' ? j : i
      const xm = axis === 'x' ? i - 1 : j
      const ym = axis === 'x' ? j : i - 1
      const xp = axis === 'x' ? i + 1 : j
      const yp = axis === 'x' ? j : i + 1
      const c = pixelLum(raster, x, y)
      const a = pixelLum(raster, xm, ym)
      const b = pixelLum(raster, xp, yp)
      if (c + 6 < a && c + 6 < b) hits += 1
      else if (c < 230 && (a + b) / 2 - c > 8) hits += 1
    }
    scores[i] = hits / across
  }
  return scores
}

function peakPositions(scores: Float64Array, minScore = 0.15, minSep = 4): number[] {
  const raw: number[] = []
  let start = -1
  for (let i = 0; i < scores.length; i += 1) {
    if (scores[i] >= minScore) {
      if (start < 0) start = i
    } else if (start >= 0) {
      let best = start
      for (let k = start + 1; k < i; k += 1) if (scores[k] > scores[best]) best = k
      raw.push(best)
      start = -1
    }
  }
  if (start >= 0) {
    let best = start
    for (let k = start + 1; k < scores.length; k += 1) if (scores[k] > scores[best]) best = k
    raw.push(best)
  }
  const peaks: number[] = []
  for (const peak of raw) {
    if (peaks.length && peak - peaks[peaks.length - 1] < minSep) {
      if (scores[peak] > scores[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = peak
    } else {
      peaks.push(peak)
    }
  }
  return peaks
}

type RegularRun = { first: number; last: number; pitch: number; lines: number; score: number }

function stripMedianLum(raster: RasterLike, a: number, b: number, axis: 'x' | 'y'): { median: number; stdev: number } {
  const mid = Math.round((a + b) / 2)
  const values: number[] = []
  // 只看图的中段，避开标题、图例和页边，不然坐标轴在整列上的中位数会被白边拉高。
  if (axis === 'x') {
    if (mid < 0 || mid >= raster.width) return { median: 255, stdev: 0 }
    const y0 = Math.floor(raster.height * 0.15)
    const y1 = Math.ceil(raster.height * 0.85)
    for (let y = y0; y < y1; y += 2) values.push(pixelLum(raster, mid, y))
  } else {
    if (mid < 0 || mid >= raster.height) return { median: 255, stdev: 0 }
    const x0 = Math.floor(raster.width * 0.15)
    const x1 = Math.ceil(raster.width * 0.85)
    for (let x = x0; x < x1; x += 2) values.push(pixelLum(raster, x, mid))
  }
  if (!values.length) return { median: 255, stdev: 0 }
  values.sort((p, q) => p - q)
  const median = values[Math.floor(values.length / 2)]
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const stdev = Math.sqrt(values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length)
  return { median, stdev }
}

function intervalLooksLikeAxis(raster: RasterLike, a: number, b: number, axis: 'x' | 'y'): boolean {
  const { median, stdev } = stripMedianLum(raster, a, b, axis)
  return median < 200 && stdev < 50
}

function buildRunFromLines(lines: number[]): RegularRun | null {
  if (lines.length < 2) return null
  const spacings = []
  for (let i = 1; i < lines.length; i += 1) spacings.push(lines[i] - lines[i - 1])
  spacings.sort((a, b) => a - b)
  const pitch = spacings[Math.floor(spacings.length / 2)]
  if (pitch < 8) return null
  let error = 0
  for (let i = 0; i < lines.length; i += 1) {
    error += Math.abs(lines[i] - (lines[0] + i * pitch)) / pitch
  }
  const avgError = error / lines.length
  const cells = lines.length - 1
  const score = lines.length + (cells % 10 === 0 ? 8 : cells % 5 === 0 ? 3 : 0) - avgError * 8
  return { first: lines[0], last: lines[lines.length - 1], pitch, lines: lines.length, score }
}

function applyAxisPenalty(run: RegularRun, lines: number[], raster: RasterLike, axis: 'x' | 'y'): RegularRun {
  let score = run.score
  if (intervalLooksLikeAxis(raster, lines[0], lines[1], axis)) score -= 20
  if (intervalLooksLikeAxis(raster, lines[lines.length - 2], lines[lines.length - 1], axis)) score -= 20
  return { ...run, score }
}

function collectLineSequence(peaks: number[], start: number, pitch: number, tol: number): number[] {
  const lines = [peaks[start]]
  let k = start + 1
  while (k < peaks.length) {
    const target = lines[lines.length - 1] + pitch
    if (peaks[k] < target - tol) {
      k += 1
      continue
    }
    if (peaks[k] > target + tol) break
    let closest = k
    let closestD = Math.abs(peaks[k] - target)
    let n = k + 1
    while (n < peaks.length && peaks[n] <= target + tol) {
      const d = Math.abs(peaks[n] - target)
      if (d < closestD) {
        closest = n
        closestD = d
      }
      n += 1
    }
    lines.push(peaks[closest])
    k = closest + 1
  }
  return lines
}

function variantsOf(lines: number[]): number[][] {
  const out: number[][] = [lines]
  const maxDrop = Math.min(2, Math.floor((lines.length - 9) / 1))
  for (let i = 0; i <= maxDrop; i += 1) {
    for (let j = 0; j <= maxDrop; j += 1) {
      if (i === 0 && j === 0) continue
      const next = lines.slice(i, lines.length - j)
      if (next.length >= 9) out.push(next)
    }
  }
  return out
}

function bestRegularRun(peaks: number[], raster: RasterLike, axis: 'x' | 'y', minLines = 9, minPitch = 8, maxPitch = 64): RegularRun | null {
  const cheap: { run: RegularRun; lines: number[] }[] = []
  const seen = new Set<string>()
  for (let pitch = minPitch; pitch <= maxPitch; pitch += 1) {
    const tol = Math.max(3, Math.round(pitch * 0.12))
    for (let start = 0; start < peaks.length; start += 1) {
      const lines = collectLineSequence(peaks, start, pitch, tol)
      if (lines.length < minLines) continue
      for (const variant of variantsOf(lines)) {
        const key = `${variant[0]}:${variant[variant.length - 1]}:${variant.length}`
        if (seen.has(key)) continue
        const run = buildRunFromLines(variant)
        if (!run || run.lines < minLines) continue
        seen.add(key)
        cheap.push({ run, lines: variant })
      }
    }
  }
  if (!cheap.length) return null
  cheap.sort((a, b) => b.run.score - a.run.score || b.run.lines - a.run.lines)
  // 只对接近最高分的候选做轴带检查（例如同为 40 格但框到坐标轴的变体）。
  const maxCheap = cheap[0].run.score
  const finalists = cheap.filter((item) => item.run.score >= maxCheap - 2)
  const longest = cheap.reduce((a, b) => (b.run.last - b.run.first > a.run.last - a.run.first ? b : a)).run
  const mid = (longest.first + longest.last) / 2
  let best: RegularRun | null = null
  for (const item of finalists) {
    const run = applyAxisPenalty(item.run, item.lines, raster, axis)
    const betterScore = best && run.score > best.score + 0.01
    const tied = best && Math.abs(run.score - best.score) <= 0.01
    const closerMid =
      !best ||
      Math.abs((run.first + run.last) / 2 - mid) < Math.abs((best.first + best.last) / 2 - mid) - 0.5
    if (!best || betterScore || (tied && (run.lines > best.lines || (run.lines === best.lines && closerMid)))) {
      best = run
    }
  }
  return best
}

/** 根据细线 + 每 10 格粗线的投影，定位网格外框和列数、行数。找不到稳定网格时返回 null。 */
export function detectGridRegion(raster: RasterLike): DetectedGrid | null {
  if (raster.width < 16 || raster.height < 16) return null
  const vPeaks = peakPositions(lineScores(raster, 'x'))
  const hPeaks = peakPositions(lineScores(raster, 'y'))
  const vRun = bestRegularRun(vPeaks, raster, 'x')
  const hRun = bestRegularRun(hPeaks, raster, 'y')
  if (!vRun || !hRun) return null
  const pitchRatio = vRun.pitch / hRun.pitch
  if (pitchRatio < 0.8 || pitchRatio > 1.25) return null
  const cols = vRun.lines - 1
  const rows = hRun.lines - 1
  if (cols < 8 || rows < 8) return null
  const width = vRun.last - vRun.first
  const height = hRun.last - hRun.first
  if (width < cols * 6 || height < rows * 6) return null
  return {
    x: vRun.first,
    y: hRun.first,
    width,
    height,
    cols,
    rows,
    cellWidth: width / cols,
    cellHeight: height / rows,
  }
}

function clampBox(box: GridBox, width: number, height: number): GridBox {
  const x = Math.max(0, Math.min(width - 1, Math.round(box.x)))
  const y = Math.max(0, Math.min(height - 1, Math.round(box.y)))
  const w = Math.max(1, Math.min(width - x, Math.round(box.width)))
  const h = Math.max(1, Math.min(height - y, Math.round(box.height)))
  return { x, y, width: w, height: h }
}

/**
 * 在网格下方（或指定区域内）寻找一排图例色块，返回包围盒。
 * 只用于框选默认值；色号仍需录入或从文字解析，因为相近色在色卡里容易认错。
 */
export function detectLegendRegion(raster: RasterLike, grid?: GridBox | null): GridBox | null {
  const startY = Math.min(raster.height - 1, Math.max(0, grid ? grid.y + grid.height + 4 : Math.floor(raster.height * 0.7)))
  if (startY >= raster.height - 8) return null
  const lums: number[] = []
  for (let y = startY; y < raster.height; y += 3) {
    for (let x = 0; x < raster.width; x += 4) lums.push(pixelLum(raster, x, y))
  }
  if (!lums.length) return null
  lums.sort((a, b) => a - b)
  const paper = lums[Math.floor(lums.length * 0.7)]
  type Band = { y0: number; y1: number; density: number }
  const bands: Band[] = []
  let bandStart = -1
  for (let y = startY; y < raster.height; y += 1) {
    let nonPaper = 0
    for (let x = 0; x < raster.width; x += 1) {
      if (Math.abs(pixelLum(raster, x, y) - paper) > 12) nonPaper += 1
    }
    const density = nonPaper / raster.width
    // 跳过几乎占满整行的坐标轴色带，留下中等密度的图例行
    const isSwatch = density > 0.04 && density < 0.45
    if (isSwatch) {
      if (bandStart < 0) bandStart = y
    } else if (bandStart >= 0) {
      bands.push({ y0: bandStart, y1: y - 1, density })
      bandStart = -1
    }
  }
  if (bandStart >= 0) bands.push({ y0: bandStart, y1: raster.height - 1, density: 0 })
  const swatch = bands
    .filter((band) => band.y1 - band.y0 >= 14 && band.y1 - band.y0 <= 80)
    .sort((a, b) => a.y0 - b.y0)[0]
  if (!swatch) return null
  let minX = raster.width
  let maxX = 0
  let minY = swatch.y0
  let maxY = swatch.y1
  for (let y = swatch.y0; y <= swatch.y1; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (Math.abs(pixelLum(raster, x, y) - paper) > 12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX <= minX) return null
  // 向下多留一点，把色号下的数量也框进来
  const box = {
    x: Math.max(0, minX - 8),
    y: Math.max(0, minY - 6),
    width: Math.min(raster.width, maxX + 8) - Math.max(0, minX - 8),
    height: Math.min(raster.height, maxY + 36) - Math.max(0, minY - 6),
  }
  return clampBox(box, raster.width, raster.height)
}

/** 解析「A16 11、E17 9」或「A16:11」这类图例文字。 */
export function parseLegendText(text: string): LegendLine[] {
  const lines: LegendLine[] = []
  const seen = new Set<string>()
  const re = /(?:MARD|COCO)?\s*([A-Za-z]{1,3}\d{1,3})\s*(?:[:：=x×*＊]\s*|\s+)?(\d{1,5})?/g
  const source = text.replace(/[,，、;；]/g, ' ')
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) {
    const code = normalizeCode(match[1])
    if (seen.has(code)) continue
    seen.add(code)
    const quantity = match[2] ? Number.parseInt(match[2], 10) : undefined
    lines.push({
      code,
      quantity: quantity !== undefined && Number.isFinite(quantity) ? quantity : undefined,
    })
  }
  return lines
}

export function legendCodesOf(lines: LegendLine[]): string[] {
  return lines.map((line) => line.code)
}

export function compareLegend(
  legend: LegendLine[],
  usage: { code: string; quantity: number }[],
): LegendCompareRow[] {
  const recognized = new Map(usage.map((line) => [normalizeCode(line.code), line.quantity]))
  const codes: string[] = []
  const seen = new Set<string>()
  for (const line of legend) {
    const code = normalizeCode(line.code)
    if (seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }
  for (const line of usage) {
    const code = normalizeCode(line.code)
    if (seen.has(code)) continue
    seen.add(code)
    codes.push(code)
  }
  const legendQty = new Map(legend.map((line) => [normalizeCode(line.code), line.quantity]))
  return codes.map((code) => {
    const expected = legendQty.get(code)
    const got = recognized.get(code) ?? 0
    const hasLegend = expected !== undefined
    return {
      code,
      legend: hasLegend ? expected : null,
      recognized: got,
      delta: hasLegend ? got - (expected as number) : null,
    }
  })
}
