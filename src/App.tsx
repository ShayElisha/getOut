import { AppProvider, useApp } from './context/AppContext'
import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { ShiftPage } from './pages/ShiftPage'
import { WorkersPage } from './pages/WorkersPage'
import { LanesPage } from './pages/LanesPage'
import { CertsPage } from './pages/CertsPage'
import { HistoryPage } from './pages/HistoryPage'
import { LoginPage } from './pages/LoginPage'

function Router() {
  const { view } = useApp()
  switch (view) {
    case 'shift':
      return <ShiftPage />
    case 'workers':
      return <WorkersPage />
    case 'lanes':
      return <LanesPage />
    case 'certs':
      return <CertsPage />
    case 'history':
      return <HistoryPage />
    default:
      return <HomePage />
  }
}

function Gate() {
  const { user, loading } = useApp()
  if (!user) return <LoginPage />
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-soft">
        טוען נתונים מ-MongoDB…
      </div>
    )
  }
  return (
    <Shell>
      <Router />
    </Shell>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  )
}
