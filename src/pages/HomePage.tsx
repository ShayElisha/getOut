import { ArrowLeft, Clock, Play, Users, LayoutGrid, History } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SHIFT_TYPE_LABELS } from '../constants'

export function HomePage() {
  const { data, startShift, setView, loadShiftFromHistory } = useApp()
  const activeWorkers = data.workers.filter((w) => w.status === 'active').length
  const last = data.history[0]

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-brand-deep via-brand to-[#2a6a8f] px-4 py-7 text-white shadow-lg sm:rounded-3xl sm:px-10 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative max-w-xl">
          <h2 className="font-display text-xl font-bold sm:text-3xl">מוכנים למשמרת?</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-white/80 sm:mt-2 sm:text-base">
            בחרו נתיבים, סמנו נוכחות, והפעילו שיבוץ אוטומטי חכם לפי הסמכות, עצימות ועומס היסטורי.
          </p>
          <button
            type="button"
            onClick={startShift}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:brightness-110 sm:mt-6 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm"
          >
            <Play className="size-3.5 fill-current sm:size-4" />
            התחלת משמרת חדשה
            <ArrowLeft className="size-3.5 sm:size-4" />
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
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
            className={`group rounded-xl border border-line bg-card p-3.5 text-right shadow-sm transition hover:border-brand/30 hover:shadow-md animate-fade-up stagger-${i + 1} sm:rounded-2xl sm:p-5`}
          >
            <card.icon className="mb-2 size-4 text-brand transition group-hover:scale-110 sm:mb-3 sm:size-5" />
            <p className="text-[11px] font-medium text-ink-soft sm:text-xs">{card.label}</p>
            <p className="mt-0.5 font-display text-2xl font-bold text-ink sm:mt-1 sm:text-3xl">
              {card.value}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-soft sm:mt-1 sm:text-xs">{card.sub}</p>
          </button>
        ))}
      </section>

      {last && (
        <section className="rounded-xl border border-line bg-card p-3.5 shadow-sm sm:rounded-2xl sm:p-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink sm:mb-3 sm:gap-2 sm:text-sm">
            <Clock className="size-3.5 text-accent sm:size-4" />
            שיבוץ אחרון
          </div>
          <p className="text-xs text-ink-soft sm:text-sm">
            {new Date(last.date).toLocaleDateString('he-IL')} · {SHIFT_TYPE_LABELS[last.shiftType]} ·{' '}
            {last.assignments.length} נתיבים
          </p>
          <button
            type="button"
            onClick={() => loadShiftFromHistory(last.id)}
            className="mt-2 text-xs font-semibold text-brand hover:underline sm:mt-3 sm:text-sm"
          >
            פתיחה לעריכה
          </button>
        </section>
      )}
    </div>
  )
}
