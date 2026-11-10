export const NAV_ITEMS = [
  { to: '/inventory', label: '库存', icon: 'inventory' },
  { to: '/patterns', label: '图纸', icon: 'patterns' },
  { to: '/tools', label: '工具', icon: 'tools' },
  { to: '/settings', label: '设置', icon: 'settings' },
] as const

export type NavIcon = (typeof NAV_ITEMS)[number]['icon']

export function isNavActive(pathname: string, to: string): boolean {
  if (to === '/settings') {
    return pathname === '/settings' || pathname === '/style'
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}
