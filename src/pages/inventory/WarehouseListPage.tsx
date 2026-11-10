import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState.tsx'
import { useFeedback } from '../../components/Feedback.tsx'
import { createWarehouse, deleteWarehouse, renameWarehouse } from '../../data/repo.ts'
import { useInventory } from '../../inventory/InventoryContext.tsx'
import { colorCountByWarehouse } from '../../inventory/stockView.ts'
import { ConfirmDialog, WarehouseForm } from './WarehouseForm.tsx'

export function WarehouseListPage() {
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const { ready, warehouses, allStock, refresh } = useInventory()
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const counts = useMemo(() => colorCountByWarehouse(allStock), [allStock])
  const renaming = warehouses.find((item) => item.id === renamingId)
  const deleting = warehouses.find((item) => item.id === deletingId)

  if (!ready) {
    return <p className="pd-muted">正在读取本地数据…</p>
  }

  return (
    <section>
      <header className="pd-pagehead">
        <h1 className="pd-title">库存</h1>
        {warehouses.length > 0 ? (
          <button type="button" className="pd-btn pd-btn-primary" onClick={() => setCreating(true)}>
            新建豆仓
          </button>
        ) : null}
      </header>

      {warehouses.length === 0 && !creating ? (
        <EmptyState
          mark="豆"
          description="还没有豆仓。先建一个，再往里入库。"
          actionLabel="新建豆仓"
          onAction={() => setCreating(true)}
        />
      ) : warehouses.length > 0 ? (
        <ul className="warehouse-list">
          {warehouses.map((warehouse) => (
            <li key={warehouse.id} className="pd-card warehouse-card">
              <Link className="warehouse-card__name" to={`/inventory/${warehouse.id}`}>
                {warehouse.name}
              </Link>
              <p className="warehouse-card__meta">
                {counts.get(warehouse.id) ?? 0} 个色号
              </p>
              <div className="warehouse-card__actions">
                <Link className="pd-btn pd-btn-secondary" to={`/inventory/${warehouse.id}`}>
                  进入
                </Link>
                <button type="button" className="pd-btn pd-btn-text" onClick={() => setRenamingId(warehouse.id)}>
                  重命名
                </button>
                <button
                  type="button"
                  className="pd-btn pd-btn-text pd-btn-danger-text"
                  onClick={() => setDeletingId(warehouse.id)}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {creating ? (
        <WarehouseForm
          title="新建豆仓"
          confirmLabel="创建"
          onCancel={() => setCreating(false)}
          onSubmit={async (name) => {
            const created = await createWarehouse(name)
            await refresh()
            toast('已创建豆仓')
            setCreating(false)
            navigate(`/inventory/${created.id}`)
          }}
        />
      ) : null}

      {renaming ? (
        <WarehouseForm
          title="重命名豆仓"
          initialName={renaming.name}
          confirmLabel="保存"
          onCancel={() => setRenamingId(null)}
          onSubmit={async (name) => {
            await renameWarehouse(renaming.id, name)
            await refresh()
            toast('已重命名')
            setRenamingId(null)
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="删除豆仓"
          message={`确定删除「${deleting.name}」吗？仓内色号库存和流水会一起删除，且不能恢复。`}
          confirmLabel="确认删除"
          danger
          onCancel={() => setDeletingId(null)}
          onConfirm={async () => {
            await deleteWarehouse(deleting.id)
            await refresh()
            toast('已删除豆仓')
            setDeletingId(null)
          }}
        />
      ) : null}
    </section>
  )
}
