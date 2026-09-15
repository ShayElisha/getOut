import { AppProvider, useApp } from './context/AppContext'
import { Shell } from './components/Shell'
import { HomePage } from './pages/HomePage'
import { ShiftPage } from './pages/ShiftPage'
import { WorkersPage } from './pages/WorkersPage'
import { LanesPage } from './pages/LanesPage'
import { CertsPage } from './pages/CertsPage'
import { HistoryPage } from './pages/HistoryPage'

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

export default function App() {
  return (
    <AppProvider>
      <Shell>
        <Router />
      </Shell>
    </AppProvider>
  )
}
