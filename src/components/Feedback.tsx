import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type FeedbackContextValue = {
  toast: (message: string) => void
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef(0)

  const toast = useCallback((next: string) => {
    window.clearTimeout(hideTimer.current)
    setMessage(next)
    setVisible(true)
    hideTimer.current = window.setTimeout(() => setVisible(false), 3200)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {visible && message
        ? createPortal(
            <div className="pd-toast" role="status">
              {message}
            </div>,
            document.body,
          )
        : null}
    </FeedbackContext.Provider>
  )
}

export function useFeedback(): FeedbackContextValue {
  const value = useContext(FeedbackContext)
  if (!value) {
    throw new Error('useFeedback 必须在 FeedbackProvider 内使用')
  }
  return value
}
