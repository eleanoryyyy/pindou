import type { ColorFamilyId } from './types.ts'

export const COLOR_FAMILIES: { id: ColorFamilyId; label: string; dot: string }[] = [
  { id: 'red-pink', label: '红粉', dot: '#c45c5c' },
  { id: 'yellow-orange', label: '黄橙', dot: '#e8c47a' },
  { id: 'green', label: '绿', dot: '#6b9b7a' },
  { id: 'blue-purple', label: '蓝紫', dot: '#5b7fa6' },
  { id: 'neutral', label: '中性', dot: '#b4b4b4' },
]

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const raw = hex.replace('#', '')
  const value = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw
  const r = Number.parseInt(value.slice(0, 2), 16) / 255
  const g = Number.parseInt(value.slice(2, 4), 16) / 255
  const b = Number.parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) {
    return { h: 0, s: 0, l }
  }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h = (h * 60 + 360) % 360
  return { h, s, l }
}

/** 用开源色卡的官方 HEX 做色系归类，不自编色号。 */
export function familyFromHex(hex: string): ColorFamilyId {
  const { h, s, l } = hexToHsl(hex)
  if (s < 0.12 || l >= 0.92 || l <= 0.12) {
    return 'neutral'
  }
  if (h < 15 || h >= 345 || (h >= 290 && h < 345)) {
    return 'red-pink'
  }
  if (h < 70) {
    return 'yellow-orange'
  }
  if (h < 170) {
    return 'green'
  }
  return 'blue-purple'
}

export function familyLabel(id: ColorFamilyId): string {
  return COLOR_FAMILIES.find((item) => item.id === id)?.label ?? id
}
