import { ArrowLeft, Clock, Play, Users, LayoutGrid, History } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SHIFT_TYPE_LABELS } from '../constants'

export function HomePage() {
  const { data, startShift, setView, loadShiftFromHistory } = useApp()
  const activeWorkers = data.workers.filter((w) => w.status === 'active').length
  const last = data.history[0]

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-brand-deep via-brand to-[#2a6a8f] px-6 py-10 text-white shadow-lg sm:px-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative max-w-xl">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">מוכנים למשמרת?</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80 sm:text-base">
            בחרו נתיבים, סמנו נוכחות, והפעילו שיבוץ אוטומטי חכם לפי הסמכות, עצימות ועומס היסטורי.
          </p>
          <button
            type="button"
            onClick={startShift}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-md transition hover:brightness-110"
          >
            <Play className="size-4 fill-current" />
            התחלת משמרת חדשה
            <ArrowLeft className="size-4" />
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: Users,
            label: 'בודקים פעילים',
            value: String(activeWorkers),
            sub: `מתוך ${data.workers.length}`,
            onClick: () => setView('workers'),
          },
          {
            icon: LayoutGrid,
            label: 'נתיבים מוגדרים',
            value: String(data.lanes.length),
            sub: 'תקן והסמכות',
            onClick: () => setView('lanes'),
          },
          {
            icon: History,
            label: 'שיבוצים שמורים',
            value: String(data.history.length),
            sub: 'MongoDB',
            onClick: () => setView('history'),
          },
        ].map((card, i) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className={`group rounded-2xl border border-line bg-card p-5 text-right shadow-sm transition hover:border-brand/30 hover:shadow-md animate-fade-up stagger-${i + 1}`}
          >
            <card.icon className="mb-3 size-5 text-brand transition group-hover:scale-110" />
            <p className="text-xs font-medium text-ink-soft">{card.label}</p>
            <p className="mt-1 font-display text-3xl font-bold text-ink">{card.value}</p>
            <p className="mt-1 text-xs text-ink-soft">{card.sub}</p>
          </button>
        ))}
      </section>

      {last && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Clock className="size-4 text-accent" />
            שיבוץ אחרון
          </div>
          <p className="text-ink-soft">
            {new Date(last.date).toLocaleDateString('he-IL')} · {SHIFT_TYPE_LABELS[last.shiftType]} ·{' '}
            {last.assignments.length} נתיבים
          </p>
          <button
            type="button"
            onClick={() => loadShiftFromHistory(last.id)}
            className="mt-3 text-sm font-semibold text-brand hover:underline"
          >
            פתיחה לעריכה
          </button>
        </section>
      )}
    </div>
  )
}
