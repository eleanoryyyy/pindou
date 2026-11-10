import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useFeedback } from '../../components/Feedback.tsx'
import { Dialog } from '../../components/Overlay.tsx'
import { formatQty } from '../../data/inventoryMath.ts'
import { deleteLedgerEntry, listLedger, listWarehouses, messageOf, updateLedgerQuantity } from '../../data/repo.ts'
import type { LedgerEntry, Warehouse } from '../../data/types.ts'
import { useInventory } from '../../inventory/InventoryContext.tsx'
import { formatDateTime, ledgerTypeLabel } from '../../inventory/stockView.ts'
import { ConfirmDialog } from './WarehouseForm.tsx'

export function LedgerPage() {
  const { warehouseId = '' } = useParams()
  const { toast } = useFeedback()
  const { refresh } = useInventory()
  const [warehouse, setWarehouse] = useState<Warehouse | undefined>()
  const [rows, setRows] = useState<LedgerEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState<LedgerEntry | null>(null)
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editError, setEditError] = useState('')

  async function load() {
    const warehouses = await listWarehouses()
    const current = warehouses.find((item) => item.id === warehouseId)
    if (!current) {
      setMissing(true)
      setLoaded(true)
      return
    }
    setWarehouse(current)
    setRows(await listLedger(warehouseId))
    setLoaded(true)
  }

  useEffect(() => {
    void load()
  }, [warehouseId])

  if (loaded && missing) {
    return <Navigate to="/inventory" replace />
  }
  if (!loaded || !warehouse) {
    return <p className="pd-muted">正在读取流水…</p>
  }

  return (
    <section>
      <header className="pd-pagehead">
        <div>
          <h1 className="pd-title">流水</h1>
          <p className="pd-muted" style={{ margin: '4px 0 0' }}>
            豆仓：{warehouse.name}
          </p>
        </div>
        <Link to={`/inventory/${warehouse.id}`} className="pd-btn pd-btn-secondary">
          返回库存
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="pd-muted">还没有出入库记录。</p>
      ) : (
        <table className="pd-table ledger-table">
          <thead>
            <tr>
              <th className="col-time">时间</th>
              <th className="col-type">类型</th>
              <th className="col-code">色号</th>
              <th className="col-brand">品牌</th>
              <th className="is-num col-qty">数量</th>
              <th className="col-warehouse">豆仓</th>
              <th>备注</th>
              <th className="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>{ledgerTypeLabel(row.type)}</td>
                <td>
                  <b>{row.code}</b>
                </td>
                <td className="pd-muted">{row.brand}</td>
                <td className="is-num">{formatQty(row.quantity)}</td>
                <td>{warehouse.name}</td>
                <td className="ledger-note">{row.note ?? '—'}</td>
                <td className="col-actions">
                  <div className="pd-row-actions">
                    <button
                      type="button"
                      className="pd-btn pd-btn-text"
                      onClick={() => {
                        setEditing(row)
                        setEditQty(String(row.quantity))
                        setEditError('')
                      }}
                    >
                      修正
                    </button>
                    <button type="button" className="pd-btn pd-btn-text" onClick={() => setDeleting(row)}>
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing ? (
        <Dialog title={`修正流水 ${editing.brand} ${editing.code}`} onClose={() => setEditing(null)}>
          <p className="pd-muted">
            类型：{ledgerTypeLabel(editing.type)}。修改数量后会按新数量回写库存，不会再叠加一次。
          </p>
          <label className="pd-field">
            <span>数量</span>
            <input
              className="pd-input"
              inputMode="numeric"
              value={editQty}
              onChange={(event) => setEditQty(event.target.value)}
            />
          </label>
          {editError ? <p className="form-error">{editError}</p> : null}
          <div className="pd-dialog-actions">
            <button type="button" className="pd-btn pd-btn-secondary" onClick={() => setEditing(null)}>
              取消
            </button>
            <button
              type="button"
              className="pd-btn pd-btn-primary"
              onClick={() => {
                void (async () => {
                  try {
                    await updateLedgerQuantity(editing.id, Number(editQty))
                    await load()
                    await refresh()
                    toast('流水已修正，库存已回写')
                    setEditing(null)
                  } catch (err) {
                    setEditError(messageOf(err))
                  }
                })()
              }}
            >
              保存
            </button>
          </div>
        </Dialog>
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="删除流水"
          message={`确定删除这条${ledgerTypeLabel(deleting.type)}记录（${deleting.brand} ${deleting.code}，数量 ${deleting.quantity}）吗？删除后会回写库存。`}
          confirmLabel="确认删除"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteLedgerEntry(deleting.id)
            await load()
            await refresh()
            toast('流水已删除，库存已回写')
            setDeleting(null)
          }}
        />
      ) : null}
    </section>
  )
}
