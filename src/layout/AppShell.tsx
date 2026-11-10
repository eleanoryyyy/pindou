import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar.tsx'

type FocusModeValue = {
  focus: boolean
  setFocus: (value: boolean) => void
}

const FocusModeContext = createContext<FocusModeValue | null>(null)

export function useFocusMode(): FocusModeValue {
  const value = useContext(FocusModeContext)
  if (!value) throw new Error('专注模式只能在应用壳里使用')
  return value
}

export function AppShell() {
  const { pathname } = useLocation()
  const isStudio = /^\/patterns\/[^/]+\/studio$/.test(pathname)
  const [focus, setFocus] = useState(false)

  useEffect(() => {
    setFocus(false)
  }, [pathname])

  const value = useMemo(() => ({ focus, setFocus }), [focus])

  return (
    <FocusModeContext.Provider value={value}>
      <div className={`pd-shell pd-app${isStudio ? ' is-studio' : ''}${focus ? ' is-focus' : ''}`}>
        {focus ? null : <Sidebar />}
        <main className={isStudio ? 'pd-studio-main' : 'pd-main'}>
          <Outlet />
        </main>
      </div>
    </FocusModeContext.Provider>
  )
}
