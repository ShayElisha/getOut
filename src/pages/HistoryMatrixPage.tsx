import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { SectionCard } from '../components/ui'
import { buildHistoryMatrix } from '../lib/historyMatrix'

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

export function HistoryMatrixPage() {
  const { data, loadShiftFromHistory, setView } = useApp()
  const [range, setRange] = useState<RangePreset>('30')
  const [customFrom, setCustomFrom] = useState(() => daysAgoISO(30))
  const [customTo, setCustomTo] = useState(() => todayISO())

  const { fromDate, toDate } = useMemo(() => {
    if (range === '14') return { fromDate: daysAgoISO(14), toDate: todayISO() }
    if (range === '30') return { fromDate: daysAgoISO(30), toDate: todayISO() }
    if (range === 'custom') {
      const from = customFrom || undefined
      const to = customTo || undefined
      if (from && to && from > to) return { fromDate: to, toDate: from }
      return { fromDate: from, toDate: to }
    }
    return {
      fromDate: undefined as string | undefined,
      toDate: undefined as string | undefined,
    }
  }, [range, customFrom, customTo])

  const matrix = useMemo(
    () =>
      buildHistoryMatrix(data.workers, data.lanes, data.history, {
        fromDate,
        toDate,
      }),
    [data.workers, data.lanes, data.history, fromDate, toDate],
  )

  return (
    <div className="space-y-4">
      <SectionCard
        title="לוח שיבוצים"
        subtitle="בודקים מימין · תאריכים ומשמרות רצים מימין (ישן) לשמאל (חדש) · בתא: נתיב"
        actions={
          <button
            type="button"
            onClick={() => setView('history')}
            className="ui-btn ui-btn-secondary !py-1.5 text-xs sm:text-sm"
          >
            להיסטוריה
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
                onClick={() => {
                  setRange(opt.id)
                  if (opt.id === 'custom') {
                    setCustomFrom(daysAgoISO(30))
                    setCustomTo(todayISO())
                  }
                }}
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
                  className="ui-field !w-auto"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="text-xs sm:text-sm">
                <span className="mb-1 block text-ink-soft">עד תאריך</span>
                <input
                  type="date"
                  className="ui-field !w-auto"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        {data.history.length === 0 ? (
          <div className="ui-empty">
            <p className="ui-empty-title">עדיין אין שיבוצים שמורים</p>
            <p className="ui-empty-text">אחרי שמירת משמרת יופיעו כאן השיבוצים בטבלה.</p>
          </div>
        ) : matrix.columns.length === 0 || matrix.rows.length === 0 ? (
          <div className="ui-empty">
            <p className="ui-empty-title">אין נתונים בטווח</p>
            <p className="ui-empty-text">נסו להרחיב את טווח התאריכים.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-line">
              <table className="min-w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="bg-brand-deep text-white">
                    <th className="sticky right-0 z-20 min-w-[7.5rem] bg-brand-deep px-3 py-2.5 text-right font-semibold shadow-[-4px_0_8px_rgb(0_0_0/0.08)]">
                      בודק
                    </th>
                    {matrix.columns.map((col) => (
                      <th
                        key={col.key}
                        className="min-w-[5.5rem] px-2 py-2 font-medium"
                      >
                        <button
                          type="button"
                          onClick={() => loadShiftFromHistory(col.shiftId)}
                          className="flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-0.5 transition hover:bg-white/10"
                          title="פתיחה לעריכה"
                        >
                          <span className="tabular-nums leading-tight">
                            {col.dateLabel}
                          </span>
                          <span className="text-[10px] font-normal text-white/75">
                            {col.shiftLabel}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row, i) => {
                    const rowBg = i % 2 === 0 ? 'bg-card' : 'bg-surface'
                    return (
                      <tr key={row.workerId} className={rowBg}>
                        <td
                          className={`sticky right-0 z-10 border-b border-line px-3 py-2 font-semibold text-ink shadow-[-4px_0_8px_rgb(0_0_0/0.04)] ${rowBg}`}
                        >
                          {row.fullName}
                        </td>
                        {matrix.columns.map((col) => {
                          const cell = row.cells[col.key]
                          return (
                            <td
                              key={col.key}
                              className="border-b border-line px-2 py-2 text-center align-middle"
                            >
                              {!cell ? (
                                <span className="text-ink-soft/50">—</span>
                              ) : cell.presentOnly ? (
                                <span className="text-[10px] font-medium text-ink-soft">
                                  נוכח
                                </span>
                              ) : (
                                <span className="inline-flex flex-col gap-0.5">
                                  {cell.laneNames.map((name) => (
                                    <span
                                      key={name}
                                      className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand sm:text-[11px]"
                                    >
                                      {name}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-soft sm:text-xs">
              התאריכים מסודרים מימין לשמאל (מהישן לחדש). לחיצה על כותרת עמודה
              פותחת את השיבוץ. «נוכח» = היה בנוכחות אך לא שובץ לנתיב.
            </p>
          </>
        )}
      </SectionCard>
    </div>
  )
}
