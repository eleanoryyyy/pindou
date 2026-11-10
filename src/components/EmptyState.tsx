import { useState, type ReactNode } from 'react'

type EmptyStateProps = {
  mark: string
  description: string
  actionLabel?: string
  laterNote?: string
  onAction?: () => void
  action?: ReactNode
}

export function EmptyState({
  mark,
  description,
  actionLabel,
  laterNote,
  onAction,
  action,
}: EmptyStateProps) {
  const [notice, setNotice] = useState('')

  function handleClick() {
    if (onAction) {
      onAction()
      return
    }
    if (laterNote) {
      setNotice(laterNote)
    }
  }

  return (
    <div className="pd-empty">
      <div className="pd-empty-mark" aria-hidden="true">
        {mark}
      </div>
      <p>{description}</p>
      {action}
      {!action && actionLabel ? (
        <button type="button" className="pd-btn pd-btn-primary" onClick={handleClick}>
          {actionLabel}
        </button>
      ) : null}
      {notice ? <p className="pd-muted hint">{notice}</p> : null}
    </div>
  )
}
