import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return createPortal(
    <div
      className="pd-dialog-wrap"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="pd-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title" className="pd-title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  title,
  children,
  onClose,
  className,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  className?: string
}) {
  return createPortal(
    <>
      <button type="button" className="pd-backdrop" aria-label="关闭面板" onClick={onClose} />
      <aside className={className ? `pd-drawer ${className}` : 'pd-drawer'} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="pd-pagehead">
          <h2 id="drawer-title" className="pd-title">
            {title}
          </h2>
          <button type="button" className="pd-btn pd-btn-text" onClick={onClose}>
            关闭
          </button>
        </header>
        {children}
      </aside>
    </>,
    document.body,
  )
}
