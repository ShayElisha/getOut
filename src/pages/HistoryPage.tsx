import { useMemo } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SHIFT_TYPE_LABELS } from '../constants'
import { SectionCard } from '../components/ui'
import type { ShiftSchedule, ShiftType } from '../types'

const SHIFT_ORDER: Record<ShiftType, number> = {
  morning: 0,
  afternoon: 1,
  night: 2,
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

  const grouped = useMemo(() => {
    const sorted = sortHistory(data.history)
    const map = new Map<string, ShiftSchedule[]>()
    for (const h of sorted) {
      const list = map.get(h.date) ?? []
      list.push(h)
      map.set(h.date, list)
    }
    return [...map.entries()]
  }, [data.history])

  return (
    <div className="space-y-4">
      <SectionCard
        title="היסטוריית שיבוצים"
        subtitle="מסודר לפי תאריך (מהחדש לישן) · בוקר → צהריים → לילה"
        actions={
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
        }
      >
        {data.history.length === 0 ? (
          <p className="text-sm text-ink-soft">עדיין אין שיבוצים שמורים.</p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([date, items]) => (
              <section key={date}>
                <h3 className="mb-2 border-b border-line pb-1.5 font-display text-sm font-bold text-brand sm:text-base">
                  {formatDateHeader(date)}
                </h3>
                <ul className="divide-y divide-line">
                  {items.map((h) => {
                    const filled = h.assignments.reduce(
                      (n, a) => n + a.workerIds.filter(Boolean).length,
                      0,
                    )
                    return (
                      <li
                        key={h.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <button
                          type="button"
                          onClick={() => loadShiftFromHistory(h.id)}
                          className="min-w-0 flex-1 text-right"
                        >
                          <p className="font-semibold text-ink">
                            {SHIFT_TYPE_LABELS[h.shiftType]}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-soft">
                            {h.activeLaneIds.length} נתיבים · {filled} שיבוצים ·{' '}
                            {h.presentWorkerIds.length} נוכחים
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
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
