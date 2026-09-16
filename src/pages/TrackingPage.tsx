import { useMemo, useState } from 'react'
import { Download, Table2 } from 'lucide-react'
import { computeWorkerLaneStats } from '../algorithm'
import { IntensityBadge, SectionCard } from '../components/ui'
import { useApp } from '../context/AppContext'
import { downloadTrackingExcel } from '../lib/trackingExport'

type RangePreset = '14' | '30' | 'all' | 'custom'

function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TrackingPage() {
  const { data } = useApp()
  const [range, setRange] = useState<RangePreset>('all')
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

  const stats = useMemo(
    () =>
      computeWorkerLaneStats(activeWorkers, lanes, data.history, {
        fromDate,
        toDate,
      }),
    [activeWorkers, lanes, data.history, fromDate, toDate],
  )

  const statsByWorker = useMemo(() => {
    const map = new Map(stats.map((s) => [s.workerId, s]))
    return map
  }, [stats])

  const shiftsInRange = useMemo(() => {
    return data.history.filter((h) => {
      if (fromDate && h.date < fromDate) return false
      if (toDate && h.date > toDate) return false
      return true
    }).length
  }, [data.history, fromDate, toDate])

  const maxCell = useMemo(() => {
    let max = 0
    for (const s of stats) {
      for (const n of Object.values(s.byLane)) {
        if (n > max) max = n
      }
    }
    return max
  }, [stats])

  const cellHeat = (n: number) => {
    if (n <= 0 || maxCell <= 0) return ''
    const t = n / maxCell
    if (t >= 0.75) return 'bg-accent/25 font-bold text-accent'
    if (t >= 0.45) return 'bg-brand/15 font-semibold text-brand'
    if (t >= 0.2) return 'bg-surface text-ink'
    return 'text-ink-soft'
  }

  const handleExport = () => {
    downloadTrackingExcel(activeWorkers, lanes, statsByWorker, {
      fromDate,
      toDate,
    })
  }

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
        title="מעקב נתיבים"
        subtitle="כמה פעמים כל בודק שובץ בכל עמדה — לפי היסטוריית השיבוצים השמורים"
        actions={
          <button
            type="button"
            onClick={handleExport}
            disabled={activeWorkers.length === 0 || lanes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-40 sm:text-sm"
          >
            <Download className="size-3.5 sm:size-4" />
            ייצוא לאקסל
          </button>
        }
      >
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1 text-xs">
            {(
              [
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
            אין עדיין שיבוצים שמורים. אחרי שמירת משמרות תופיע כאן טבלת המעקב.
          </p>
        ) : activeWorkers.length === 0 || lanes.length === 0 ? (
          <p className="text-sm text-ink-soft">חסרים בודקים פעילים או נתיבים להצגה.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-ink-soft sm:text-xs">
              <Table2 className="size-3.5 text-brand" />
              <span>
                {shiftsInRange} שיבוצים בטווח
                {fromDate || toDate
                  ? ` · ${fromDate || '…'} → ${toDate || '…'}`
                  : ' · כל ההיסטוריה'}
              </span>
            </div>

            {/* Mobile worker cards */}
            <ul className="space-y-2 lg:hidden">
              {activeWorkers.map((w) => {
                const s = statsByWorker.get(w.id)!
                const topLanes = lanes
                  .map((lane) => ({
                    lane,
                    n: s.byLane[lane.id] ?? 0,
                  }))
                  .filter((x) => x.n > 0)
                  .sort((a, b) => b.n - a.n)
                  .slice(0, 3)
                return (
                  <li
                    key={w.id}
                    className="rounded-xl border border-line bg-surface px-3 py-2.5"
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-ink">{w.fullName}</p>
                      <p className="text-xs font-bold tabular-nums text-brand">
                        {s.totalAssignments || 0} סה״כ
                      </p>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
                      <span className="rounded-md bg-easy-soft px-1.5 py-0.5 font-semibold text-easy">
                        קל יום {s.dayEasyCount || 0}
                      </span>
                      <span className="rounded-md bg-mid-soft px-1.5 py-0.5 font-semibold text-mid">
                        בינוני {s.mediumCount || 0}
                      </span>
                      <span className="rounded-md bg-hard-soft px-1.5 py-0.5 font-semibold text-hard">
                        קשה {s.hardCount || 0}
                      </span>
                      <span className="rounded-md bg-surface px-1.5 py-0.5 font-semibold text-ink-soft ring-1 ring-line">
                        עומס {s.effectiveLoad || 0}
                      </span>
                      {s.nightEasyCount > 0 && (
                        <span className="rounded-md bg-surface px-1.5 py-0.5 font-medium text-ink-soft ring-1 ring-line">
                          קל לילה {s.nightEasyCount}
                        </span>
                      )}
                    </div>
                    {topLanes.length > 0 ? (
                      <ul className="space-y-1 text-[11px] text-ink-soft">
                        {topLanes.map(({ lane, n }) => (
                          <li key={lane.id} className="flex justify-between gap-2">
                            <span>{lane.name}</span>
                            <span className="font-semibold tabular-nums text-ink">{n}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-ink-soft">אין שיבוצים בטווח</p>
                    )}
                    {s.hardCount >= 3 && s.hardCount > s.dayEasyCount && (
                      <p className="mt-1.5 text-[10px] font-semibold text-accent">
                        עומס קשה גבוה יחסית (קל לילה לא נספר כמנוחה)
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Desktop matrix */}
            <div className="hidden overflow-x-auto rounded-xl border border-line lg:block">
              <table className="min-w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="bg-brand-deep text-white">
                    <th className="sticky right-0 z-10 bg-brand-deep px-3 py-2.5 text-right font-semibold">
                      בודק
                    </th>
                    {lanes.map((lane) => (
                      <th
                        key={lane.id}
                        className="min-w-[5.5rem] px-2 py-2 font-medium"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="leading-tight">{lane.name}</span>
                          <IntensityBadge intensity={lane.intensity} />
                        </div>
                      </th>
                    ))}
                    <th className="min-w-[3rem] px-2 py-2 font-semibold text-easy-soft">
                      קל יום
                    </th>
                    <th className="min-w-[3rem] px-2 py-2 font-semibold text-mid-soft">
                      בינוני
                    </th>
                    <th className="min-w-[3rem] px-2 py-2 font-semibold text-hard-soft">
                      קשה
                    </th>
                    <th className="min-w-[3.5rem] px-2 py-2 font-semibold">עומס</th>
                    <th className="min-w-[3rem] px-3 py-2 font-semibold">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeWorkers.map((w, i) => {
                    const s = statsByWorker.get(w.id)!
                    const rowBg = i % 2 === 0 ? 'bg-card' : 'bg-surface'
                    return (
                      <tr key={w.id} className={rowBg}>
                        <td
                          className={`sticky right-0 z-10 border-b border-line px-3 py-2 font-semibold text-ink ${rowBg}`}
                        >
                          {w.fullName}
                        </td>
                        {lanes.map((lane) => {
                          const n = s.byLane[lane.id] ?? 0
                          return (
                            <td
                              key={lane.id}
                              className={`border-b border-line px-2 py-2 text-center tabular-nums ${cellHeat(n)}`}
                            >
                              {n === 0 ? '—' : n}
                            </td>
                          )
                        })}
                        <td className="border-b border-line px-2 py-2 text-center tabular-nums text-easy">
                          {s.dayEasyCount || '—'}
                        </td>
                        <td className="border-b border-line px-2 py-2 text-center tabular-nums text-mid">
                          {s.mediumCount || '—'}
                        </td>
                        <td className="border-b border-line px-2 py-2 text-center tabular-nums text-hard">
                          {s.hardCount || '—'}
                        </td>
                        <td className="border-b border-line px-2 py-2 text-center tabular-nums text-ink">
                          {s.effectiveLoad || '—'}
                        </td>
                        <td className="border-b border-line px-3 py-2 text-center font-bold tabular-nums">
                          {s.totalAssignments || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-soft sm:text-xs">
              קל יום = מנוחה אמיתית (בוקר/צהריים). קל בלילה לא נספר כמנוחה ונכנס לעומס
              מוגדל. הייצוא כולל את הטווח הנבחר (CSV לאקסל).
            </p>
          </>
        )}
      </SectionCard>
    </div>
  )
}
