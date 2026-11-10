import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db } from '../data/db.ts'
import { listAllHolds, listWarehouses, type HoldLine, type StockItem, type Warehouse } from '../data/index.ts'

export type HeldStock = HoldLine & { patternId: string }

type InventoryContextValue = {
  ready: boolean
  warehouses: Warehouse[]
  allStock: StockItem[]
  allHolds: HeldStock[]
  refresh: () => Promise<void>
}

const InventoryContext = createContext<InventoryContextValue | null>(null)

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [allStock, setAllStock] = useState<StockItem[]>([])
  const [allHolds, setAllHolds] = useState<HeldStock[]>([])

  const refresh = useCallback(async () => {
    const [nextWarehouses, nextStock, nextHolds] = await Promise.all([
      listWarehouses(),
      db.stockItems.toArray(),
      listAllHolds(),
    ])
    setWarehouses(nextWarehouses)
    setAllStock(nextStock)
    setAllHolds(nextHolds)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ ready, warehouses, allStock, allHolds, refresh }),
    [ready, warehouses, allStock, allHolds, refresh],
  )

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>
}

export function useInventory(): InventoryContextValue {
  const value = useContext(InventoryContext)
  if (!value) {
    throw new Error('useInventory 必须在 InventoryProvider 内使用')
  }
  return value
}
