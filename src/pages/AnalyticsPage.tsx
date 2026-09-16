import { useMemo, useState } from 'react'
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  Table2,
  AlertTriangle,
  Moon,
} from 'lucide-react'
import { computeTeamAnalytics } from '../lib/analytics'
import { SectionCard, IntensityBadge } from '../components/ui'
import { useApp } from '../context/AppContext'
import { SHIFT_TYPE_LABELS } from '../constants'
import type { ShiftType } from '../types'

type RangePreset = '7' | '14' | '30' | 'all' | 'custom'

function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function LoadBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
      <div
        className="h-full rounded-full bg-brand transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function AnalyticsPage() {
  const { data, setView } = useApp()
  const [range, setRange] = useState<RangePreset>('14')
  const [customFrom, setCustomFrom] = useState(() => daysAgoISO(30))
  const [customTo, setCustomTo] = useState(() => todayISO())

  const activeWorkers = useMemo(
    () =>
      data.workers
        .filter((w) => w.status === 'active')
        .slice()
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'he')),
    [data.workers],
  )

  const lanes = useMemo(
    () => data.lanes.slice().sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [data.lanes],
  )

  const { fromDate, toDate } = useMemo(() => {
    if (range === '7') return { fromDate: daysAgoISO(7), toDate: todayISO() }
    if (range === '14') return { fromDate: daysAgoISO(14), toDate: todayISO() }
    if (range === '30') return { fromDate: daysAgoISO(30), toDate: todayISO() }
    if (range === 'custom') {
      const from = customFrom || undefined
      const to = customTo || undefined
      if (from && to && from > to) return { fromDate: to, toDate: from }
      return { fromDate: from, toDate: to }
    }
    return { fromDate: undefined as string | undefined, toDate: undefined as string | undefined }
  }, [range, customFrom, customTo])

  const analytics = useMemo(
    () =>
      computeTeamAnalytics(activeWorkers, lanes, data.history, {
        fromDate,
        toDate,
      }),
    [activeWorkers, lanes, data.history, fromDate, toDate],
  )

  const maxShiftMix = Math.max(
    1,
    analytics.shiftMix.morning,
    analytics.shiftMix.afternoon,
    analytics.shiftMix.night,
  )

  const selectPreset = (id: RangePreset) => {
    setRange(id)
    if (id === 'custom') {
      setCustomFrom(daysAgoISO(30))
      setCustomTo(todayISO())
    }
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="סטטיסטיקות ואנליזה"
        subtitle="תובנות הוגנות לפי עומס אפקטיבי — קל לילה לא נספר כמנוחה"
        actions={
          <button
            type="button"
            onClick={() => setView('tracking')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:border-brand/40 sm:text-sm"
          >
            <Table2 className="size-3.5 sm:size-4" />
            מעקב מפורט
          </button>
        }
      >
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1 text-xs">
            {(
              [
                { id: '7' as const, label: '7 ימים' },
                { id: '14' as const, label: '14 יום' },
                { id: '30' as const, label: '30 יום' },
                { id: 'all' as const, label: 'הכל' },
                { id: 'custom' as const, label: 'טווח מותאם' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectPreset(opt.id)}
                className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
                  range === opt.id
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {range === 'custom' && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface/60 px-3 py-2.5">
              <label className="text-xs sm:text-sm">
                <span className="mb-1 block text-ink-soft">מתאריך</span>
                <input
                  type="date"
                  className="rounded-lg border border-line bg-card px-2.5 py-1.5"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="text-xs sm:text-sm">
                <span className="mb-1 block text-ink-soft">עד תאריך</span>
                <input
                  type="date"
                  className="rounded-lg border border-line bg-card px-2.5 py-1.5"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        {data.history.length === 0 ? (
          <p className="text-sm text-ink-soft">
            אין שיבוצים שמורים עדיין. אחרי שמירת משמרות יופיעו כאן התובנות.
          </p>
        ) : analytics.workersWithData === 0 ? (
          <p className="text-sm text-ink-soft">אין שיבוצים בטווח שנבחר.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            {[
              {
                label: 'משמרות בטווח',
                value: String(analytics.shiftsInRange),
                icon: BarChart3,
              },
              {
                label: 'עומס ממוצע',
                value: String(analytics.avgLoad),
                icon: BarChart3,
              },
              {
                label: 'פער הוגנות',
                value: String(analytics.loadGap),
                icon: AlertTriangle,
              },
              {
                label: 'קשה אחרי לילה',
                value: String(analytics.hardAfterNightTotal),
                icon: Moon,
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-line bg-surface/80 px-3 py-2.5"
              >
                <div className="mb-1 flex items-center gap-1.5 text-ink-soft">
                  <card.icon className="size-3.5" />
                  <span className="text-[10px] font-medium sm:text-[11px]">
                    {card.label}
                  </span>
                </div>
                <p className="font-display text-xl font-bold tabular-nums text-brand-deep sm:text-2xl">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {analytics.workersWithData > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard
              title="מי צריך הקלה"
              subtitle="עומס גבוה · הרבה קשה · מעט קל יום"
            >
              <ul className="space-y-2.5">
                {analytics.needRelief.map((w, i) => (
                  <li
                    key={w.workerId}
                    className="rounded-xl border border-line bg-surface px-3 py-2.5"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-lg bg-hard-soft text-[11px] font-bold text-hard">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-ink">{w.fullName}</p>
                          <p className="text-[11px] text-ink-soft">
                            {w.shiftsCount} משמרות · קשה {w.hardCount} · קל יום{' '}
                            {w.dayEasyCount}
                            {w.hardAfterNightCount > 0
                              ? ` · קשה אחרי לילה ×${w.hardAfterNightCount}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold tabular-nums text-hard">
                          {w.effectiveLoad}
                        </p>
                        <p className="text-[10px] text-ink-soft">עומס</p>
                      </div>
                    </div>
                    <LoadBar value={w.effectiveLoad} max={analytics.maxLoad} />
                    {w.topLaneName && (
                      <p className="mt-1.5 text-[10px] text-ink-soft">
                        נתיב חוזר: {w.topLaneName} ({w.topLaneCount})
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard
              title="מי קיבל יותר מנוחה"
              subtitle="עומס נמוך יחסית בטווח"
            >
              <ul className="space-y-2.5">
                {analytics.gotRest.map((w, i) => (
                  <li
                    key={w.workerId}
                    className="rounded-xl border border-line bg-surface px-3 py-2.5"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-lg bg-easy-soft text-[11px] font-bold text-easy">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-ink">{w.fullName}</p>
                          <p className="text-[11px] text-ink-soft">
                            {w.shiftsCount} משמרות · קל יום {w.dayEasyCount} · קשה{' '}
                            {w.hardCount}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-bold tabular-nums text-easy">
                          {w.effectiveLoad}
                        </p>
                        <p className="text-[10px] text-ink-soft">עומס</p>
                      </div>
                    </div>
                    <LoadBar value={w.effectiveLoad} max={analytics.maxLoad} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <SectionCard
            title="פיזור משמרות בצוות"
            subtitle="כמה משמרות מכל סוג נשמרו בטווח"
          >
            <div className="space-y-3">
              {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[]).map((type) => {
                const n = analytics.shiftMix[type]
                const pct = Math.round((n / maxShiftMix) * 100)
                return (
                  <div key={type}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-semibold text-ink">
                        {SHIFT_TYPE_LABELS[type]}
                      </span>
                      <span className="tabular-nums text-ink-soft">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-accent/80"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="עומס לפי בודק"
            subtitle="ממוין מהגבוה לנמוך · בוקר / צהריים / לילה"
          >
            <ul className="space-y-2">
              {analytics.workers.map((w) => (
                <li
                  key={w.workerId}
                  className="rounded-xl border border-line bg-surface/70 px-3 py-2.5"
                >
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{w.fullName}</p>
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="rounded-md bg-hard-soft px-1.5 py-0.5 font-semibold text-hard">
                        קשה {w.hardCount}
                      </span>
                      <span className="rounded-md bg-easy-soft px-1.5 py-0.5 font-semibold text-easy">
                        קל יום {w.dayEasyCount}
                      </span>
                      <span className="rounded-md bg-card px-1.5 py-0.5 font-semibold text-brand ring-1 ring-line">
                        עומס {w.effectiveLoad}
                      </span>
                    </div>
                  </div>
                  <LoadBar value={w.effectiveLoad} max={analytics.maxLoad} />
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-ink-soft">
                    {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[]).map((t) => (
                      <span key={t}>
                        {SHIFT_TYPE_LABELS[t]} {w.shiftsByType[t]}
                        {w.hardByShift[t] > 0 ? ` (קשה ${w.hardByShift[t]})` : ''}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard
            title="ריכוז בנתיבים"
            subtitle="נתיבים שבהם אותו בודק חוזר הרבה — סימן לחוסר פיזור"
          >
            {analytics.lanes.length === 0 ? (
              <p className="text-sm text-ink-soft">אין נתוני נתיבים בטווח.</p>
            ) : (
              <ul className="space-y-2">
                {analytics.lanes.slice(0, 8).map((lane) => (
                  <li
                    key={lane.laneId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <IntensityBadge intensity={lane.intensity} />
                      <div>
                        <p className="text-sm font-bold text-ink">{lane.laneName}</p>
                        <p className="text-[11px] text-ink-soft">
                          {lane.uniqueWorkers} בודקים · {lane.totalAssignments} שיבוצים
                        </p>
                      </div>
                    </div>
                    <div className="text-left text-xs">
                      <p className="font-semibold text-ink">
                        {lane.topWorkerName}{' '}
                        <span className="tabular-nums text-accent">
                          ×{lane.topWorkerCount}
                        </span>
                      </p>
                      <p className="text-[10px] text-ink-soft">
                        {Math.round(lane.concentration * 100)}% מהשיבוצים
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <p className="flex flex-wrap items-center gap-2 text-[11px] text-ink-soft sm:text-xs">
            <TrendingUp className="size-3.5 text-hard" />
            עומס גבוה = צריך הקלה
            <span className="text-line">·</span>
            <TrendingDown className="size-3.5 text-easy" />
            עומס נמוך = קיבל יותר מנוחה
          </p>
        </>
      )}
    </div>
  )
}
