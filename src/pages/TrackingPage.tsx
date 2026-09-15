import { useMemo, useState } from 'react'
import { Table2 } from 'lucide-react'
import { computeWorkerLaneStats } from '../algorithm'
import { IntensityBadge, SectionCard } from '../components/ui'
import { useApp } from '../context/AppContext'

type RangePreset = '14' | '30' | 'all'

function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TrackingPage() {
  const { data } = useApp()
  const [range, setRange] = useState<RangePreset>('all')

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

  const fromDate =
    range === '14' ? daysAgoISO(14) : range === '30' ? daysAgoISO(30) : undefined

  const stats = useMemo(
    () =>
      computeWorkerLaneStats(activeWorkers, lanes, data.history, {
        fromDate,
      }),
    [activeWorkers, lanes, data.history, fromDate],
  )

  const statsByWorker = useMemo(() => {
    const map = new Map(stats.map((s) => [s.workerId, s]))
    return map
  }, [stats])

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

  return (
    <div className="space-y-4">
      <SectionCard
        title="מעקב נתיבים"
        subtitle="כמה פעמים כל בודק שובץ בכל עמדה — לפי היסטוריית השיבוצים השמורים"
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 text-xs">
            {(
              [
                { id: '14' as const, label: '14 יום' },
                { id: '30' as const, label: '30 יום' },
                { id: 'all' as const, label: 'הכל' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
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
        }
      >
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
                {data.history.length} שיבוצים בהיסטוריה
                {fromDate ? ` · מסונן מ-${fromDate}` : ''}
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full border-collapse text-right text-[11px] sm:text-xs">
                <thead>
                  <tr className="bg-brand-deep text-white">
                    <th className="sticky right-0 z-10 bg-brand-deep px-2 py-2.5 text-right font-semibold sm:px-3">
                      בודק
                    </th>
                    {lanes.map((lane) => (
                      <th
                        key={lane.id}
                        className="min-w-[4.5rem] px-1.5 py-2 font-medium sm:min-w-[5.5rem] sm:px-2"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="leading-tight">{lane.name}</span>
                          <IntensityBadge intensity={lane.intensity} />
                        </div>
                      </th>
                    ))}
                    <th className="min-w-[3rem] px-1.5 py-2 font-semibold text-easy-soft sm:px-2">
                      קל
                    </th>
                    <th className="min-w-[3rem] px-1.5 py-2 font-semibold text-mid-soft sm:px-2">
                      בינוני
                    </th>
                    <th className="min-w-[3rem] px-1.5 py-2 font-semibold text-hard-soft sm:px-2">
                      קשה
                    </th>
                    <th className="min-w-[3rem] px-2 py-2 font-semibold sm:px-3">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {activeWorkers.map((w, i) => {
                    const s = statsByWorker.get(w.id)!
                    const rowBg = i % 2 === 0 ? 'bg-card' : 'bg-surface'
                    return (
                      <tr key={w.id} className={rowBg}>
                        <td
                          className={`sticky right-0 z-10 border-b border-line px-2 py-2 font-semibold text-ink sm:px-3 ${rowBg}`}
                        >
                          {w.fullName}
                        </td>
                        {lanes.map((lane) => {
                          const n = s.byLane[lane.id] ?? 0
                          return (
                            <td
                              key={lane.id}
                              className={`border-b border-line px-1.5 py-2 text-center tabular-nums sm:px-2 ${cellHeat(n)}`}
                            >
                              {n === 0 ? '—' : n}
                            </td>
                          )
                        })}
                        <td className="border-b border-line px-1.5 py-2 text-center tabular-nums text-easy sm:px-2">
                          {s.easyCount || '—'}
                        </td>
                        <td className="border-b border-line px-1.5 py-2 text-center tabular-nums text-mid sm:px-2">
                          {s.mediumCount || '—'}
                        </td>
                        <td className="border-b border-line px-1.5 py-2 text-center tabular-nums text-hard sm:px-2">
                          {s.hardCount || '—'}
                        </td>
                        <td className="border-b border-line px-2 py-2 text-center font-bold tabular-nums sm:px-3">
                          {s.totalAssignments || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-ink-soft sm:text-xs">
              צבע חזק יותר = יותר שיבוצים לאותה עמדה. השיבוץ האוטומטי עובר על מוסמכים בלבד,
              ממלא קודם נתיבים עם מעט אפשרויות, ואז דוחה מי שהיה אחרון / הרבה באותו נתיב
              בשבועיים האחרונים ומווסת עמדות קשות.
            </p>
          </>
        )}
      </SectionCard>
    </div>
  )
}
