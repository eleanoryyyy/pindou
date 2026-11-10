import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell.tsx'
import { LedgerPage } from './pages/inventory/LedgerPage.tsx'
import { RestockPage } from './pages/inventory/RestockPage.tsx'
import { WarehouseListPage } from './pages/inventory/WarehouseListPage.tsx'
import { WarehouseStockPage } from './pages/inventory/WarehouseStockPage.tsx'
import { PatternsPage } from './pages/PatternsPage.tsx'
import { PatternDetailPage } from './pages/patterns/PatternDetailPage.tsx'
import { StudioPage } from './pages/patterns/StudioPage.tsx'
import { ToolsPage } from './pages/ToolsPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { StyleGuidePage } from './pages/StyleGuidePage.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/inventory" replace />} />
        <Route path="inventory" element={<WarehouseListPage />} />
        <Route path="inventory/:warehouseId" element={<WarehouseStockPage />} />
        <Route path="inventory/:warehouseId/ledger" element={<LedgerPage />} />
        <Route path="inventory/:warehouseId/restock" element={<RestockPage />} />
        <Route path="patterns" element={<PatternsPage />} />
        <Route path="patterns/:patternId" element={<PatternDetailPage />} />
        <Route path="patterns/:patternId/studio" element={<StudioPage />} />
        <Route path="tools" element={<ToolsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="style" element={<StyleGuidePage />} />
        <Route path="*" element={<Navigate to="/inventory" replace />} />
      </Route>
    </Routes>
  )
}
