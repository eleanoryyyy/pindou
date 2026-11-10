import { useState, type FormEvent } from 'react'
import { useFeedback } from '../../components/Feedback.tsx'
import { Drawer } from '../../components/Overlay.tsx'
import { formatQty } from '../../data/inventoryMath.ts'
import { messageOf, setThreshold } from '../../data/repo.ts'
import type { StockLine } from '../../data/types.ts'

export function EditItemDrawer({
  line,
  onClose,
  onDone,
}: {
  line: StockLine
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { toast } = useFeedback()
  const [threshold, setThresholdValue] = useState(line.threshold === null ? '' : String(line.threshold))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const trimmed = threshold.trim()
      await setThreshold({
        warehouseId: line.warehouseId,
        brand: line.brand,
        code: line.code,
        threshold: trimmed === '' ? null : Number(trimmed),
      })
      await onDone()
      toast('阈值已保存')
      onClose()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <Drawer title={`编辑 ${line.brand} ${line.code}`} onClose={onClose}>
      <p className="pd-muted">当前库存 {formatQty(line.quantity)}。库存小于等于阈值时会提醒，并进入补豆清单。</p>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label className="pd-field">
          <span>补豆阈值（留空表示不提醒）</span>
          <input
            className="pd-input"
            inputMode="numeric"
            autoFocus
            value={threshold}
            placeholder="例如 200"
            onChange={(event) => setThresholdValue(event.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="pd-btn pd-btn-primary" disabled={busy}>
          保存
        </button>
      </form>
    </Drawer>
  )
}
