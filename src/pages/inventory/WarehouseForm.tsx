import { useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Overlay.tsx'

export function WarehouseForm({
  title,
  initialName = '',
  confirmLabel,
  onCancel,
  onSubmit,
}: {
  title: string
  initialName?: string
  confirmLabel: string
  onCancel: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSubmit(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <label className="pd-field">
          <span>名称</span>
          <input
            className="pd-input"
            value={name}
            autoFocus
            placeholder="例如 MARD 套装"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="pd-dialog-actions">
          <button type="button" className="pd-btn pd-btn-secondary" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button type="submit" className="pd-btn pd-btn-primary" disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => Promise<void> | void
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="pd-muted" style={{ margin: 0 }}>
        {message}
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="pd-dialog-actions">
        <button type="button" className="pd-btn pd-btn-secondary" onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button
          type="button"
          className={danger ? 'pd-btn pd-btn-danger-text' : 'pd-btn pd-btn-primary'}
          onClick={() => void handleConfirm()}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
