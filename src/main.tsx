import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { FeedbackProvider } from './components/Feedback.tsx'
import { InventoryProvider } from './inventory/InventoryContext.tsx'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <FeedbackProvider>
        <InventoryProvider>
          <App />
        </InventoryProvider>
      </FeedbackProvider>
    </BrowserRouter>
  </StrictMode>,
)
