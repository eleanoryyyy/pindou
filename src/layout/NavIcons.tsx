import type { ReactElement } from 'react'
import type { NavIcon } from './nav.ts'

const icons: Record<NavIcon, ReactElement> = {
  inventory: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M4 10h16M10 10v10" />
    </svg>
  ),
  patterns: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 4v16M12 4v16M16 4v16M4 8h16M4 12h16M4 16h16" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19 19 5M14 5h5v5M5 14v5h5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
}

export function NavIconGraphic({ name }: { name: NavIcon }) {
  return icons[name]
}
