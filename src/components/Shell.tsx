import { useMemo, useState } from 'react'
import {
  ClipboardList,
  History,
  Home,
  LayoutGrid,
  Settings2,
  Users,
  BadgeCheck,
  LogOut,
  Table2,
  ScrollText,
  MoreHorizontal,
  X,
} from 'lucide-react'
import type { View } from '../types'
import { useApp } from '../context/AppContext'
import { AppFooter } from './AppFooter'

const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'ראשי', icon: Home },
  { id: 'shift', label: 'שיבוץ', icon: ClipboardList },
  { id: 'workers', label: 'בודקים', icon: Users },
  { id: 'lanes', label: 'נתיבים', icon: LayoutGrid },
  { id: 'certs', label: 'הסמכות', icon: BadgeCheck },
  { id: 'tracking', label: 'מעקב', icon: Table2 },
  { id: 'audit', label: 'יומן', icon: ScrollText },
  { id: 'history', label: 'היסטוריה', icon: History },
]

const MOBILE_PRIMARY: View[] = ['home', 'shift', 'workers', 'history']
const MOBILE_MORE: View[] = ['lanes', 'certs', 'tracking', 'audit']

export function Shell({ children }: { children: React.ReactNode }) {
  const {
    view,
    setView,
    startShift,
    draft,
    loading,
    syncing,
    refreshing,
    error,
    refreshFromServer,
    user,
    logout,
  } = useApp()
  const [moreOpen, setMoreOpen] = useState(false)

  const go = (id: View) => {
    setMoreOpen(false)
    if (id === 'shift' && !draft) {
      startShift()
      return
    }
    setView(id)
  }

  const moreActive = useMemo(() => MOBILE_MORE.includes(view), [view])

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-3.5 pb-24 pt-4 sm:px-6 sm:pt-6 lg:pb-8 lg:pt-8">
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
            {loading
              ? 'טוען…'
              : refreshing
                ? 'מעדכן…'
                : syncing
                  ? 'שומר…'
                  : 'מחובר'}
          </div>
        </div>
      </header>

      {(loading || refreshing) && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-card/80 px-3 py-2 text-xs text-ink-soft">
          <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {loading ? 'טוען נתונים מהשרת…' : 'מרענן נתונים ברקע…'}
        </div>
      )}

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

      <>
          <nav className="mb-6 hidden gap-1 rounded-2xl border border-line bg-card/90 p-1.5 shadow-sm backdrop-blur lg:flex">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = view === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-medium transition xl:gap-2 xl:text-sm ${
                    active
                      ? 'bg-brand text-white shadow-sm'
                      : 'text-ink-soft hover:bg-surface hover:text-ink'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </nav>

          <main className="flex-1 animate-fade-up stagger-1">{children}</main>

          <AppFooter className="mb-2 mt-8 sm:mt-10 lg:mb-0" />

          {moreOpen && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-ink/40"
                aria-label="סגור"
                onClick={() => setMoreOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 animate-fade-up rounded-t-2xl border border-line bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-base font-bold text-ink">עוד</h2>
                  <button
                    type="button"
                    onClick={() => setMoreOpen(false)}
                    className="rounded-lg p-1.5 text-ink-soft hover:bg-surface"
                    aria-label="סגור"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {NAV.filter((n) => MOBILE_MORE.includes(n.id)).map(
                    ({ id, label, icon: Icon }) => {
                      const active = view === id
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => go(id)}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                            active
                              ? 'border-brand bg-brand/10 text-brand'
                              : 'border-line bg-surface text-ink hover:border-brand/30'
                          }`}
                        >
                          <Icon className="size-5 shrink-0" />
                          {label}
                        </button>
                      )
                    },
                  )}
                </div>
              </div>
            </div>
          )}

          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-lg justify-around">
              {NAV.filter((n) => MOBILE_PRIMARY.includes(n.id)).map(
                ({ id, label, icon: Icon }) => {
                  const active = view === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(id)}
                      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] font-semibold tracking-wide ${
                        active ? 'text-brand' : 'text-ink-soft'
                      }`}
                    >
                      <Icon className={`size-5 ${active ? 'stroke-[2.25]' : ''}`} />
                      <span className="truncate">{label}</span>
                    </button>
                  )
                },
              )}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] font-semibold tracking-wide ${
                  moreActive || moreOpen ? 'text-brand' : 'text-ink-soft'
                }`}
              >
                <MoreHorizontal
                  className={`size-5 ${moreActive || moreOpen ? 'stroke-[2.25]' : ''}`}
                />
                <span>עוד</span>
              </button>
            </div>
          </nav>
        </>
    </div>
  )
}
