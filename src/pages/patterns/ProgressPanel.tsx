import { useEffect, useState, type FormEvent } from 'react'
import { formatQty } from '../../data/inventoryMath.ts'
import { skuKey } from '../../data/boardMath.ts'
import { findColor } from '../../data/palettes.ts'
import { startPattern } from '../../data/patternRepo.ts'
import { addHold, getProgress, removeHold, saveProgress } from '../../data/progressRepo.ts'
import { messageOf } from '../../data/repo.ts'
import type { BrandId, Pattern, PatternProgress } from '../../data/types.ts'
import { useInventory } from '../../inventory/InventoryContext.tsx'

export function ProgressPanel({
  pattern,
  compact = false,
  onUpdated,
}: {
  pattern: Pattern
  compact?: boolean
  onUpdated?: () => void | Promise<void>
}) {
  const { warehouses, refresh } = useInventory()
  const [progress, setProgress] = useState<PatternProgress | undefined>()
  const [boardLabel, setBoardLabel] = useState('')
  const [colorKey, setColorKey] = useState('')
  const [holdWarehouse, setHoldWarehouse] = useState('')
  const [holdColor, setHoldColor] = useState('')
  const [holdQty, setHoldQty] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function reload() {
    const row = await getProgress(pattern.id)
    setProgress(row)
    setBoardLabel(row?.boardLabel ?? '')
    setColorKey(row?.colorKey ?? '')
  }

  useEffect(() => {
    void reload()
  }, [pattern.id, pattern.status, pattern.updatedAt])

  useEffect(() => {
    if (!holdWarehouse && warehouses[0]) setHoldWarehouse(warehouses[0].id)
  }, [warehouses, holdWarehouse])

  useEffect(() => {
    if (!holdColor && pattern.usage[0]) {
      setHoldColor(skuKey(pattern.usage[0].brand, pattern.usage[0].code))
    }
  }, [pattern.usage, holdColor])

  async function notify() {
    await refresh()
    await onUpdated?.()
  }

  async function handleSaveMeta() {
    setSaving(true)
    setError('')
    try {
      if (pattern.status !== 'in-progress') await startPattern(pattern.id)
      const row = await saveProgress(pattern.id, { boardLabel: boardLabel.trim(), colorKey })
      setProgress(row)
      await notify()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleAddHold(event: FormEvent) {
    event.preventDefault()
    const [brand, code] = holdColor.split('::') as [BrandId, string]
    setError('')
    try {
      if (pattern.status !== 'in-progress') await startPattern(pattern.id)
      const row = await addHold(pattern.id, holdWarehouse, brand, code, Number(holdQty))
      setProgress(row)
      setHoldQty('')
      await notify()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  async function handleRemoveHold(warehouseId: string, brand: BrandId, code: string) {
    setError('')
    try {
      const row = await removeHold(pattern.id, warehouseId, brand, code)
      setProgress(row)
      await notify()
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const holdTotal = progress?.holds.reduce((sum, hold) => sum + hold.quantity, 0) ?? 0

  return (
    <div className={`progress-panel${compact ? ' is-compact' : ' pd-card'}`}>
      <h2 className="pd-section-title">进行中作品</h2>
      <p className="pd-muted hint">记下当前拼到哪一板、哪一色。取出但还没拼完的豆子可以暂扣，暂扣会占用可用库存，但不会写成出库流水。</p>
      {error ? <p className="form-error">{error}</p> : null}

      <div className="progress-fields">
        <label className="pd-field">
          <span>当前板</span>
          <input
            className="pd-input"
            value={boardLabel}
            aria-label="当前板"
            placeholder="例如 第1行第1列"
            onChange={(event) => setBoardLabel(event.target.value)}
            onBlur={() => void handleSaveMeta()}
          />
        </label>
        <label className="pd-field">
          <span>当前色</span>
          <select
            className="pd-input"
            aria-label="当前色"
            value={colorKey}
            onChange={(event) => {
              setColorKey(event.target.value)
            }}
            onBlur={() => void handleSaveMeta()}
          >
            <option value="">未选择</option>
            {pattern.usage.map((line) => {
              const key = skuKey(line.brand, line.code)
              return (
                <option key={key} value={key}>
                  {line.brand} {line.code}
                </option>
              )
            })}
          </select>
        </label>
        <button type="button" className="pd-btn pd-btn-secondary" onClick={() => void handleSaveMeta()} disabled={saving}>
          记下进度
        </button>
      </div>

      <h3 className="pd-section-title" style={{ marginTop: 20 }}>暂扣</h3>
      {progress && progress.holds.length > 0 ? (
        <ul className="progress-holds">
          {progress.holds.map((hold) => {
            const warehouse = warehouses.find((item) => item.id === hold.warehouseId)
            const color = findColor(hold.brand, hold.code)
            return (
              <li key={`${hold.warehouseId}::${hold.brand}::${hold.code}`}>
                <span className="pd-swatch" style={{ background: color?.hex ?? '#CCC' }} />
                <span>
                  {hold.brand} {hold.code} · {formatQty(hold.quantity)} · {warehouse?.name ?? '豆仓'}
                </span>
                <button
                  type="button"
                  className="pd-btn pd-btn-text"
                  onClick={() => void handleRemoveHold(hold.warehouseId, hold.brand, hold.code)}
                >
                  释放
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="pd-muted">还没有暂扣的豆子。</p>
      )}
      <p className="pd-muted hint">合计暂扣 {formatQty(holdTotal)}。</p>

      <form className="progress-hold-form" onSubmit={(event) => void handleAddHold(event)}>
        <label className="pd-field">
          <span>豆仓</span>
          <select className="pd-input" aria-label="暂扣豆仓" value={holdWarehouse} onChange={(event) => setHoldWarehouse(event.target.value)}>
            {warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="pd-field">
          <span>色号</span>
          <select className="pd-input" aria-label="暂扣色号" value={holdColor} onChange={(event) => setHoldColor(event.target.value)}>
            {pattern.usage.map((line) => {
              const key = skuKey(line.brand, line.code)
              return (
                <option key={key} value={key}>
                  {line.brand} {line.code}
                </option>
              )
            })}
          </select>
        </label>
        <label className="pd-field">
          <span>数量</span>
          <input className="pd-input" aria-label="暂扣数量" value={holdQty} inputMode="numeric" onChange={(event) => setHoldQty(event.target.value)} />
        </label>
        <button type="submit" className="pd-btn pd-btn-secondary">
          暂扣
        </button>
      </form>
    </div>
  )
}
