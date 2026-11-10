import { getPalette } from './palettes.ts'
import type { BrandId, KitTemplate } from './types.ts'

function starterFromGroups(brand: BrandId, quantity: number): KitTemplate['items'] {
  const palette = getPalette(brand)
  const firstOfGroup = new Map<string, string>()
  for (const color of palette.colors) {
    if (!firstOfGroup.has(color.group)) {
      firstOfGroup.set(color.group, color.code)
    }
  }
  return [...firstOfGroup.values()].map((code) => ({ code, quantity }))
}

function fullSet(brand: BrandId, quantity: number): KitTemplate['items'] {
  return getPalette(brand).colors.map((color) => ({ code: color.code, quantity }))
}

export const KIT_TEMPLATES: KitTemplate[] = [
  {
    id: 'mard-group-starter-100',
    name: 'MARD 各组首色（每色 100 粒）',
    brand: 'MARD',
    items: starterFromGroups('MARD', 100),
  },
  {
    id: 'coco-group-starter-100',
    name: 'COCO 各组首色（每色 100 粒）',
    brand: 'COCO',
    items: starterFromGroups('COCO', 100),
  },
  {
    id: 'mard-221-100',
    name: 'MARD 221 全套（每色 100 粒）',
    brand: 'MARD',
    items: fullSet('MARD', 100),
  },
  {
    id: 'coco-291-100',
    name: 'COCO 291 全套（每色 100 粒）',
    brand: 'COCO',
    items: fullSet('COCO', 100),
  },
]

export function getTemplate(id: string): KitTemplate {
  const found = KIT_TEMPLATES.find((item) => item.id === id)
  if (!found) {
    throw new Error('找不到该套装模板')
  }
  return found
}
