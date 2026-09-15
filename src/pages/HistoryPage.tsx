import { Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SHIFT_TYPE_LABELS } from '../constants'
import { SectionCard } from '../components/ui'

export function HistoryPage() {
  const { data, loadShiftFromHistory, deleteHistoryItem, resetToSeed } = useApp()

  return (
    <div className="space-y-4">
      <SectionCard
        title="היסטוריית שיבוצים"
        subtitle="נשמר ב-MongoDB בלחיצה על שמור"
        actions={
          <button
            type="button"
            onClick={() => {
              if (confirm('לאפס את כל הנתונים לדוגמה?')) resetToSeed()
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
          <ul className="divide-y divide-line">
            {data.history.map((h) => {
              const filled = h.assignments.reduce(
                (n, a) => n + a.workerIds.length,
                0,
              )
              return (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <button
                    type="button"
                    onClick={() => loadShiftFromHistory(h.id)}
                    className="min-w-0 flex-1 text-right"
                  >
                    <p className="font-semibold text-ink">
                      {new Date(h.date).toLocaleDateString('he-IL')} ·{' '}
                      {SHIFT_TYPE_LABELS[h.shiftType]}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {h.activeLaneIds.length} נתיבים · {filled} שיבוצים ·{' '}
                      {h.presentWorkerIds.length} נוכחים
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteHistoryItem(h.id)}
                    className="rounded-lg p-2 text-ink-soft hover:bg-hard-soft hover:text-hard"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
