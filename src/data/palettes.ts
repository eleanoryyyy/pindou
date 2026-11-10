import cocoJson from './palettes/coco-291.json'
import mardJson from './palettes/mard-221-alfonse-doudou.json'
import type { BrandId, Palette, PaletteColor } from './types.ts'

type PaletteFile = {
  id: string
  brand: BrandId
  title: string
  count: number
  colors: PaletteColor[]
}

const files: PaletteFile[] = [
  mardJson as PaletteFile,
  cocoJson as PaletteFile,
]

export const PALETTES: Palette[] = files.map((file) => ({
  id: file.id,
  brand: file.brand,
  title: file.title,
  count: file.count,
  colors: file.colors,
}))

const colorMap = new Map<string, PaletteColor & { brand: BrandId }>()
for (const palette of PALETTES) {
  for (const color of palette.colors) {
    colorMap.set(`${palette.brand}::${normalizeCode(color.code)}`, { ...color, brand: palette.brand })
  }
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export function listBrands(): BrandId[] {
  return PALETTES.map((palette) => palette.brand)
}

export function getPalette(brand: BrandId): Palette {
  const found = PALETTES.find((palette) => palette.brand === brand)
  if (!found) {
    throw new Error(`未内置色卡：${brand}`)
  }
  return found
}

export function findColor(brand: BrandId, code: string): (PaletteColor & { brand: BrandId }) | undefined {
  return colorMap.get(`${brand}::${normalizeCode(code)}`)
}

export function requireColor(brand: BrandId, code: string): PaletteColor & { brand: BrandId } {
  const found = findColor(brand, code)
  if (!found) {
    throw new Error(`色卡中没有 ${brand} ${normalizeCode(code)}`)
  }
  return found
}

export function searchColors(brand: BrandId, query: string, limit = 20): PaletteColor[] {
  const needle = normalizeCode(query)
  if (!needle) {
    return getPalette(brand).colors.slice(0, limit)
  }
  return getPalette(brand)
    .colors
    .filter((color) => normalizeCode(color.code).includes(needle))
    .slice(0, limit)
}
