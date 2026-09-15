import {
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  Settings2,
  Users,
  BadgeCheck,
  LogOut,
} from 'lucide-react'
import type { View } from '../types'
import { useApp } from '../context/AppContext'

const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'ראשי', icon: Home },
  { id: 'shift', label: 'שיבוץ', icon: ClipboardList },
  { id: 'workers', label: 'בודקים', icon: Users },
  { id: 'lanes', label: 'נתיבים', icon: LayoutGrid },
  { id: 'certs', label: 'הסמכות', icon: BadgeCheck },
  { id: 'history', label: 'היסטוריה', icon: History },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const {
    view,
    setView,
    startShift,
    draft,
    loading,
    syncing,
    error,
    refreshFromServer,
    user,
    logout,
  } = useApp()

  const go = (id: View) => {
    if (id === 'shift' && !draft) {
      startShift()
      return
    }
    setView(id)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-3.5 pb-20 pt-4 sm:px-6 sm:pt-6 lg:pb-8 lg:pt-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up sm:mb-8 sm:gap-4">
        <div>
          <p className="mb-0.5 text-[10px] font-semibold tracking-[0.18em] text-accent uppercase sm:mb-1 sm:text-xs sm:tracking-[0.2em]">
            GATE OUT
          </p>
          <h1 className="font-display text-[1.65rem] font-bold leading-tight tracking-tight text-brand-deep sm:text-4xl">
            שיבוצון
          </h1>
          <p className="mt-0.5 text-xs text-ink-soft sm:mt-1 sm:text-sm">
            ניהול ושיבוץ עמדות שער יציאה
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user && (
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-card/80 px-2.5 py-1 text-[11px] text-ink-soft backdrop-blur sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
              <span className="font-semibold text-ink">{user.fullName}</span>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-medium text-brand hover:bg-surface sm:px-2 sm:py-1"
              >
                <LogOut className="size-3 sm:size-3.5" />
                יציאה
              </button>
            </div>
          )}
          <div className="hidden items-center gap-2 rounded-full border border-line bg-card/80 px-3 py-1.5 text-xs text-ink-soft backdrop-blur lg:flex">
            <Settings2 className="size-3.5" />
            {loading ? 'מתחבר ל-MongoDB…' : syncing ? 'שומר ל-MongoDB…' : 'מחובר ל-MongoDB'}
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hard/30 bg-hard-soft px-4 py-3 text-sm text-hard">
          <span>שגיאת שרת: {error}</span>
          <button
            type="button"
            onClick={() => void refreshFromServer()}
            className="font-semibold underline"
          >
            נסה שוב
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20 text-ink-soft">
          טוען נתונים מ-MongoDB…
        </div>
      ) : (
        <>
          <nav className="mb-6 hidden gap-1 rounded-2xl border border-line bg-card/90 p-1.5 shadow-sm backdrop-blur lg:flex">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = view === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-ink-soft hover:bg-surface hover:text-ink'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              )
            })}
          </nav>

          <main className="flex-1 animate-fade-up stagger-1">{children}</main>

          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-1.5 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-lg justify-around">
              {NAV.filter((n) => n.id !== 'certs').map(({ id, label, icon: Icon }) => {
                const active = view === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => go(id)}
                    className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[9px] font-medium tracking-wide ${
                      active ? 'text-brand' : 'text-ink-soft'
                    }`}
                  >
                    <Icon className={`size-[18px] ${active ? 'stroke-[2.25]' : ''}`} />
                    <span className="truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          </nav>
        </>
      )}
    </div>
  )
}
