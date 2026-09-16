import { useMemo, useState } from 'react'
import { List, Table2, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SHIFT_TYPE_LABELS } from '../constants'
import { SectionCard } from '../components/ui'
import { buildHistoryMatrix } from '../lib/historyMatrix'
import type { ShiftSchedule, ShiftType } from '../types'

const SHIFT_ORDER: Record<ShiftType, number> = {
  morning: 0,
  afternoon: 1,
  night: 2,
}

type Mode = 'matrix' | 'list'
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

function sortHistory(items: ShiftSchedule[]): ShiftSchedule[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    const so = SHIFT_ORDER[a.shiftType] - SHIFT_ORDER[b.shiftType]
    if (so !== 0) return so
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

function formatDateHeader(date: string): string {
  try {
    return new Date(date + 'T12:00:00').toLocaleDateString('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return date
  }
}

export function HistoryPage() {
  const { data, loadShiftFromHistory, deleteHistoryItem, resetToSeed } = useApp()
  const [mode, setMode] = useState<Mode>('matrix')
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

  const grouped = useMemo(() => {
    const filtered = data.history.filter((h) => {
      if (fromDate && h.date < fromDate) return false
      if (toDate && h.date > toDate) return false
      return true
    })
    const sorted = sortHistory(filtered)
    const map = new Map<string, ShiftSchedule[]>()
    for (const h of sorted) {
      const list = map.get(h.date) ?? []
      list.push(h)
      map.set(h.date, list)
    }
    return [...map.entries()]
  }, [data.history, fromDate, toDate])

  return (
    <div className="space-y-4">
      <SectionCard
        title="היסטוריית שיבוצים"
        subtitle="טבלה: בודקים × תאריך ומשמרת · בכל תא נתיב השיבוץ"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-line bg-surface p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('matrix')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold transition ${
                  mode === 'matrix'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                <Table2 className="size-3.5" />
                טבלה
              </button>
              <button
                type="button"
                onClick={() => setMode('list')}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold transition ${
                  mode === 'list'
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                <List className="size-3.5" />
                רשימה
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    'לאפס את כל הנתונים לדוגמה?\nפעולה זו דורשת אישור כפול ותירשם ביומן.',
                  )
                ) {
                  void resetToSeed()
                }
              }}
              className="text-xs font-medium text-ink-soft hover:text-hard"
            >
              איפוס נתונים
            </button>
          </div>
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
            <p className="ui-empty-text">אחרי שמירת משמרת יופיעו כאן כל השיבוצים.</p>
          </div>
        ) : mode === 'matrix' ? (
          matrix.columns.length === 0 || matrix.rows.length === 0 ? (
            <div className="ui-empty">
              <p className="ui-empty-title">אין נתונים בטווח</p>
              <p className="ui-empty-text">נסו להרחיב את טווח התאריכים.</p>
            </div>
          ) : (
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
          )
        ) : grouped.length === 0 ? (
          <div className="ui-empty">
            <p className="ui-empty-title">אין שיבוצים בטווח</p>
            <p className="ui-empty-text">נסו להרחיב את טווח התאריכים.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <div key={date}>
                <h3 className="mb-2 text-sm font-bold text-ink sm:text-base">
                  {formatDateHeader(date)}
                </h3>
                <ul className="space-y-2">
                  {items.map((h) => (
                    <li
                      key={h.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => loadShiftFromHistory(h.id)}
                        className="min-w-0 flex-1 text-right"
                      >
                        <p className="text-sm font-bold text-ink">
                          {SHIFT_TYPE_LABELS[h.shiftType]}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {h.activeLaneIds.length} נתיבים ·{' '}
                          {h.presentWorkerIds.length} נוכחים ·{' '}
                          {h.assignments.reduce(
                            (n, a) => n + a.workerIds.filter(Boolean).length,
                            0,
                          )}{' '}
                          משובצים
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('למחוק שיבוץ זה מההיסטוריה?')) {
                            void deleteHistoryItem(h.id)
                          }
                        }}
                        className="rounded-lg p-2 text-ink-soft hover:bg-hard-soft hover:text-hard"
                        aria-label="מחיקה"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {mode === 'matrix' && matrix.columns.length > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-ink-soft sm:text-xs">
            לחיצה על כותרת עמודה פותחת את השיבוץ לעריכה. «נוכח» = היה ברשימת
            נוכחות אך לא שובץ לנתיב.
          </p>
        )}
      </SectionCard>
    </div>
  )
}
