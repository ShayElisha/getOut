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
  BarChart3,
  CalendarDays,
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
  { id: 'analytics', label: 'אנליזה', icon: BarChart3 },
  { id: 'audit', label: 'יומן', icon: ScrollText },
  { id: 'history', label: 'היסטוריה', icon: History },
  { id: 'historyMatrix', label: 'לוח שיבוצים', icon: CalendarDays },
]

const MOBILE_PRIMARY: View[] = ['home', 'shift', 'workers', 'history']
const MOBILE_MORE: View[] = ['lanes', 'certs', 'tracking', 'analytics', 'audit', 'historyMatrix']

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
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:pb-10 lg:pt-9">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-fade-up sm:mb-8">
        <div>
          <p className="ui-eyebrow mb-1">GATE OUT</p>
          <h1 className="font-display text-[1.75rem] font-bold leading-[1.15] tracking-tight text-brand-deep sm:text-4xl">
            שיבוצון
          </h1>
          <p className="ui-subtitle mt-1.5 text-xs sm:text-sm">
            ניהול ושיבוץ עמדות שער יציאה
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user && (
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-card/90 px-2.5 py-1 text-[11px] text-ink-soft shadow-[var(--shadow-panel)] backdrop-blur sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs">
              <span className="font-semibold text-ink">{user.fullName}</span>
              <button
                type="button"
                onClick={logout}
                className="ui-btn ui-btn-ghost !px-2 !py-1 text-[11px] text-brand sm:text-xs"
              >
                <LogOut className="size-3 sm:size-3.5" />
                יציאה
              </button>
            </div>
          )}
          <div className="hidden items-center gap-2 rounded-full border border-line bg-card/90 px-3 py-1.5 text-xs text-ink-soft shadow-[var(--shadow-panel)] backdrop-blur lg:flex">
            <Settings2 className="size-3.5" aria-hidden />
            <span>
              {loading
                ? 'טוען…'
                : refreshing
                  ? 'מעדכן…'
                  : syncing
                    ? 'שומר…'
                    : 'מחובר'}
            </span>
          </div>
        </div>
      </header>

      {(loading || refreshing) && (
        <div
          className="mb-4 flex items-center gap-2.5 rounded-xl border border-line bg-card/90 px-3.5 py-2.5 text-xs text-ink-soft shadow-[var(--shadow-panel)]"
          role="status"
          aria-live="polite"
        >
          <span className="page-loader page-loader--sm shrink-0" aria-hidden />
          {loading ? 'טוען נתונים מהשרת…' : 'מרענן נתונים ברקע…'}
        </div>
      )}

      {error && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hard/30 bg-hard-soft px-4 py-3 text-sm text-hard"
          role="alert"
        >
          <span>שגיאת שרת: {error}</span>
          <button
            type="button"
            onClick={() => void refreshFromServer()}
            className="ui-btn ui-btn-danger !py-1.5"
          >
            נסה שוב
          </button>
        </div>
      )}

      <nav
        className="ui-panel mb-6 hidden gap-1 p-1.5 lg:flex"
        aria-label="ניווט ראשי"
      >
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = view === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-medium transition xl:gap-2 xl:text-sm ${
                active
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-ink-soft hover:bg-surface hover:text-ink'
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </nav>

      <main className="flex-1 animate-fade-up stagger-1">{children}</main>

      <AppFooter className="mb-2 mt-10 sm:mt-12 lg:mb-0" />

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="תפריט נוסף">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            aria-label="סגור"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 animate-fade-up rounded-t-2xl border border-line bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-panel-hover)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="ui-title">עוד</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="ui-btn ui-btn-ghost !p-2"
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
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        active
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-line bg-surface text-ink hover:border-brand/30'
                      }`}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      {label}
                    </button>
                  )
                },
              )}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1.5 shadow-[0_-8px_24px_rgb(15_28_46/0.06)] backdrop-blur lg:hidden"
        aria-label="ניווט מובייל"
      >
        <div className="mx-auto flex max-w-lg justify-around">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.id)).map(
            ({ id, label, icon: Icon }) => {
              const active = view === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => go(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                    active ? 'text-brand' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  <Icon className={`size-5 ${active ? 'stroke-[2.25]' : ''}`} aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              )
            },
          )}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] font-semibold tracking-wide transition ${
              moreActive || moreOpen ? 'text-brand' : 'text-ink-soft hover:text-ink'
            }`}
          >
            <MoreHorizontal
              className={`size-5 ${moreActive || moreOpen ? 'stroke-[2.25]' : ''}`}
              aria-hidden
            />
            <span>עוד</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
