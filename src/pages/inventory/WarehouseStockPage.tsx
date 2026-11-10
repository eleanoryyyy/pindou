import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState.tsx'
import { useFeedback } from '../../components/Feedback.tsx'
import { Dialog } from '../../components/Overlay.tsx'
import { exportBackupFile } from '../../data/backup.ts'
import { COLOR_FAMILIES } from '../../data/colorFamily.ts'
import { formatQty } from '../../data/inventoryMath.ts'
import { clearWarehouseInventory, countHeldPatternsInWarehouse, listLedger, listStock, setLastWarehouseId } from '../../data/repo.ts'
import {
  formatClearWarehouseHoldsNote,
  formatClearWarehouseMain,
} from '../../data/warehouseClear.ts'
import type { ColorFamilyId, LedgerEntry, StockLine } from '../../data/types.ts'
import { useInventory } from '../../inventory/InventoryContext.tsx'
import {
  filterStockView,
  isUnthresholdedStockoutFilter,
  restockSummary,
  statusClass,
  toStockLine,
  UNOSET_STOCKOUT_PARAM,
} from '../../inventory/stockView.ts'
import { EditItemDrawer } from './EditItemDrawer.tsx'
import { InboundDrawer } from './InboundDrawer.tsx'
import { OutboundDrawer } from './OutboundDrawer.tsx'

export function WarehouseStockPage() {
  const { warehouseId = '' } = useParams()
  const { ready, warehouses, refresh } = useInventory()
  const { toast } = useFeedback()
  const warehouse = warehouses.find((item) => item.id === warehouseId)
  const [lines, setLines] = useState<StockLine[]>([])
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState<ColorFamilyId | 'all'>('all')
  const filterUnthresholdedStockout = isUnthresholdedStockoutFilter(searchParams)
  const [inboundOpen, setInboundOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [heldPatterns, setHeldPatterns] = useState(0)
  const [clearBusy, setClearBusy] = useState(false)
  const [clearError, setClearError] = useState('')
  const [outboundLine, setOutboundLine] = useState<StockLine | null>(null)
  const [editLine, setEditLine] = useState<StockLine | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    if (!warehouseId) return
    const [stock, entries] = await Promise.all([listStock(warehouseId), listLedger(warehouseId)])
    setLines(stock.map(toStockLine))
    setLedger(entries)
    setLoaded(true)
    await setLastWarehouseId(warehouseId)
  }

  useEffect(() => {
    if (!warehouseId) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId])

  const visible = useMemo(
    () => filterStockView(lines, query, family, filterUnthresholdedStockout),
    [lines, query, family, filterUnthresholdedStockout],
  )
  const summary = useMemo(() => restockSummary(lines), [lines])
  const hasFilter = query.trim() !== '' || family !== 'all' || filterUnthresholdedStockout

  function clearUnthresholdedStockoutFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete(UNOSET_STOCKOUT_PARAM)
    setSearchParams(next, { replace: true })
  }

  async function reloadAll() {
    await load()
    await refresh()
  }

  async function openClearDialog() {
    setClearError('')
    setHeldPatterns(await countHeldPatternsInWarehouse(warehouseId))
    setClearing(true)
  }

  async function handleExportBackup() {
    const { json, filename } = await exportBackupFile()
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast('已导出备份')
  }

  async function handleClearWarehouse() {
    setClearBusy(true)
    setClearError('')
    try {
      await clearWarehouseInventory(warehouseId)
      await reloadAll()
      setClearing(false)
      toast('已清空豆仓')
    } catch (err) {
      setClearError(err instanceof Error ? err.message : '清空失败')
      setClearBusy(false)
    }
  }

  if (ready && !warehouse) {
    return <Navigate to="/inventory" replace />
  }

  if (!ready || !warehouse || !loaded) {
    return <p className="pd-muted">正在读取库存…</p>
  }

  return (
    <section>
      <header className="pd-pagehead">
        <div>
          <h1 className="pd-title">{warehouse.name}</h1>
          <p className="pd-muted" style={{ margin: '4px 0 0' }}>
            <Link to="/inventory" className="pd-btn pd-btn-text" style={{ paddingLeft: 0 }}>
              全部豆仓
            </Link>
          </p>
        </div>
        <div className="pd-pagehead-actions">
          <Link to={`/inventory/${warehouse.id}/ledger`} className="pd-btn pd-btn-secondary">
            流水{ledger.length > 0 ? ` · ${ledger.length}` : ''}
          </Link>
          {summary.count > 0 ? (
            <Link to={`/inventory/${warehouse.id}/restock`} className="pd-btn pd-btn-secondary">
              补豆清单 · {summary.count} 种
            </Link>
          ) : (
            <Link to={`/inventory/${warehouse.id}/restock`} className="pd-btn pd-btn-text">
              补豆清单
            </Link>
          )}
          <button type="button" className="pd-btn pd-btn-primary" onClick={() => setInboundOpen(true)}>
            入库
          </button>
          <button type="button" className="pd-btn pd-btn-text pd-btn-danger-text" onClick={() => void openClearDialog()}>
            清空
          </button>
        </div>
      </header>

      {lines.length === 0 ? (
        <EmptyState
          mark="豆"
          description="这个仓还是空的。"
          actionLabel="入库"
          onAction={() => setInboundOpen(true)}
        />
      ) : (
        <>
          <div className="pd-toolbar">
            <input
              className="pd-input"
              value={query}
              placeholder="搜索色号"
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索色号"
            />
            <div className="pd-chips">
              <button
                type="button"
                className={family === 'all' ? 'pd-chip is-on' : 'pd-chip'}
                onClick={() => setFamily('all')}
              >
                全部
              </button>
              {COLOR_FAMILIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={family === item.id ? 'pd-chip is-on' : 'pd-chip'}
                  onClick={() => setFamily(item.id)}
                >
                  <span className="pd-chip-dot" style={{ background: item.dot }} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {filterUnthresholdedStockout ? (
            <p className="pd-muted stock-filter-hint">
              正在筛选：缺货且未设阈值
              <button type="button" className="pd-btn pd-btn-text" onClick={clearUnthresholdedStockoutFilter}>
                清除筛选
              </button>
            </p>
          ) : null}

          {summary.count > 0 ? (
            <p className="pd-muted" style={{ margin: '0 0 8px' }}>
              {summary.count} 个色号小于等于阈值，可看
              <Link to={`/inventory/${warehouse.id}/restock`}> 补豆清单</Link>
              。
            </p>
          ) : null}

          {visible.length === 0 ? (
            <p className="pd-muted">没有符合条件的色号。{hasFilter ? '可以清空搜索或改回全部色系。' : ''}</p>
          ) : (
            <table className="pd-table inventory-table">
              <thead>
                <tr>
                  <th className="col-swatch"></th>
                  <th className="col-code">色号</th>
                  <th className="col-brand">品牌</th>
                  <th className="is-num col-qty">数量</th>
                  <th className="is-num col-threshold">阈值</th>
                  <th className="col-status">状态</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <div className="pd-swatch" style={{ background: line.hex }} />
                    </td>
                    <td>
                      <b>{line.code}</b>
                    </td>
                    <td className="pd-muted">{line.brand}</td>
                    <td className={`is-num ${line.statusKind ? statusClass(line.statusKind) : ''}`}>
                      {formatQty(line.quantity)}
                    </td>
                    <td className="is-num">{line.threshold === null ? '—' : formatQty(line.threshold)}</td>
                    <td className={statusClass(line.statusKind)}>{line.statusLabel || '—'}</td>
                    <td className="col-actions">
                      <div className="pd-row-actions">
                        <button type="button" className="pd-btn pd-btn-text" onClick={() => setOutboundLine(line)}>
                          出库
                        </button>
                        <button type="button" className="pd-btn pd-btn-text" onClick={() => setEditLine(line)}>
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {inboundOpen ? (
        <InboundDrawer warehouseId={warehouse.id} onClose={() => setInboundOpen(false)} onDone={reloadAll} />
      ) : null}
      {outboundLine ? (
        <OutboundDrawer line={outboundLine} onClose={() => setOutboundLine(null)} onDone={reloadAll} />
      ) : null}
      {editLine ? <EditItemDrawer line={editLine} onClose={() => setEditLine(null)} onDone={reloadAll} /> : null}
      {clearing && warehouse ? (
        <Dialog title="清空豆仓？" onClose={() => !clearBusy && setClearing(false)}>
          <p className="clear-warehouse-body">{formatClearWarehouseMain(warehouse.name, lines.length)}</p>
          {formatClearWarehouseHoldsNote(heldPatterns) ? (
            <p className="clear-warehouse-note">{formatClearWarehouseHoldsNote(heldPatterns)}</p>
          ) : null}
          <p className="clear-warehouse-backup">
            建议先导出备份
            {' '}
            <button type="button" className="pd-btn pd-btn-text" onClick={() => void handleExportBackup()}>
              先导出
            </button>
          </p>
          {clearError ? <p className="form-error">{clearError}</p> : null}
          <div className="pd-dialog-actions is-split">
            <button type="button" className="pd-btn pd-btn-secondary" autoFocus onClick={() => setClearing(false)} disabled={clearBusy}>
              取消
            </button>
            <button type="button" className="pd-btn pd-btn-danger" onClick={() => void handleClearWarehouse()} disabled={clearBusy}>
              清空
            </button>
          </div>
        </Dialog>
      ) : null}
    </section>
  )
}
