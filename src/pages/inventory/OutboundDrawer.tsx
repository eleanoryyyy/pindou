import { useState, type FormEvent } from 'react'
import { useFeedback } from '../../components/Feedback.tsx'
import { Drawer } from '../../components/Overlay.tsx'
import { formatQty } from '../../data/inventoryMath.ts'
import { messageOf, outbound } from '../../data/repo.ts'
import type { StockLine } from '../../data/types.ts'

export function OutboundDrawer({
  line,
  onClose,
  onDone,
}: {
  line: StockLine
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { toast } = useFeedback()
  const [quantity, setQuantity] = useState('1')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await outbound({
        warehouseId: line.warehouseId,
        brand: line.brand,
        code: line.code,
        quantity: Number(quantity),
      })
      await onDone()
      toast('出库已保存')
      onClose()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  return (
    <Drawer title={`出库 ${line.brand} ${line.code}`} onClose={onClose}>
      <p className="pd-muted">当前库存 {formatQty(line.quantity)}，出库数量不能大于库存。</p>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <label className="pd-field">
          <span>出库数量</span>
          <input
            className="pd-input"
            inputMode="numeric"
            autoFocus
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="pd-btn pd-btn-primary" disabled={busy}>
          确认出库
        </button>
      </form>
    </Drawer>
  )
}
