import { Link, NavLink, useLocation } from 'react-router-dom'
import { useInventory } from '../inventory/InventoryContext.tsx'
import { findWarehouse, warehouseIdFromPath } from '../inventory/stockView.ts'
import { isNavActive, NAV_ITEMS } from './nav.ts'
import { NavIconGraphic } from './NavIcons.tsx'

export function Sidebar() {
  const { pathname } = useLocation()
  const { warehouses } = useInventory()
  const current = findWarehouse(warehouses, warehouseIdFromPath(pathname))

  return (
    <nav className="pd-sidenav" aria-label="主导航">
      <div className="pd-brand">个人豆仓</div>
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(pathname, item.to)
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={active ? 'pd-nav-item is-on' : 'pd-nav-item'}
            aria-current={active ? 'page' : undefined}
          >
            <NavIconGraphic name={item.icon} />
            {item.label}
          </NavLink>
        )
      })}
      <div className="pd-nav-foot pd-muted" style={{ padding: '0 12px' }}>
        {current ? (
          <Link to={`/inventory/${current.id}`} className="pd-btn pd-btn-text" style={{ paddingLeft: 0 }}>
            当前豆仓：{current.name}
          </Link>
        ) : warehouses.length > 0 ? (
          <Link to="/inventory" className="pd-btn pd-btn-text" style={{ paddingLeft: 0 }}>
            已有 {warehouses.length} 个豆仓
          </Link>
        ) : (
          '还没有豆仓'
        )}
      </div>
    </nav>
  )
}
