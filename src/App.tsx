import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { ShiftPage } from './pages/ShiftPage'
import { WorkersPage } from './pages/WorkersPage'
import { LanesPage } from './pages/LanesPage'
import { CertsPage } from './pages/CertsPage'
import { HistoryPage } from './pages/HistoryPage'
import { TrackingPage } from './pages/TrackingPage'
import { AuditPage } from './pages/AuditPage'
import { LoginPage } from './pages/LoginPage'

function ProtectedShell() {
  const { user, loading } = useApp()
  if (!user) return <Navigate to="/login" replace />
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-soft">
        טוען נתונים מ-MongoDB…
      </div>
    )
  }
  return (
    <Shell>
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="shift" element={<ShiftPage />} />
        <Route path="shift/:shiftId" element={<ShiftPage />} />
        <Route path="workers" element={<WorkersPage />} />
        <Route path="lanes" element={<LanesPage />} />
        <Route path="certs" element={<CertsPage />} />
        <Route path="tracking" element={<TrackingPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:shiftId" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedShell />} />
      </Routes>
    </AppProvider>
  )
}
