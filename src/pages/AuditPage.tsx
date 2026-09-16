import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { fetchAuditLogs, type AuditLogEntry } from '../api'
import { SectionCard } from '../components/ui'

const ACTION_LABELS: Record<string, string> = {
  login: 'התחברות',
  shift_save: 'שמירת שיבוץ',
  shift_update: 'עדכון שיבוץ',
  shift_delete: 'מחיקת שיבוץ',
  data_update: 'עדכון נתונים',
  data_reset: 'איפוס נתונים',
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function AuditPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setLogs(await fetchAuditLogs(200))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'טעינת היומן נכשלה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return logs
    return logs.filter((l) => l.action === filter)
  }, [logs, filter])

  const filterOptions = useMemo(() => {
    const keys = [...new Set(logs.map((l) => l.action))]
    return keys
  }, [logs])

  return (
    <div className="space-y-4">
      <SectionCard
        title="יומן פעולות"
        subtitle="מי עשה מה ומתי — שמירה, מחיקה, עדכונים ואיפוס"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs sm:text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">הכל</option>
              {filterOptions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a] ?? a}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface sm:text-sm"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              רענון
            </button>
          </div>
        }
      >
        {error && (
          <p className="mb-3 rounded-lg border border-hard/30 bg-hard-soft px-3 py-2 text-sm text-hard">
            {error}
          </p>
        )}

        {loading && logs.length === 0 ? (
          <p className="text-sm text-ink-soft">טוען יומן…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-soft">
            עדיין אין רשומות. פעולות כמו שמירת שיבוץ, מחיקה, עדכון בודקים/נתיבים ואיפוס יופיעו כאן.
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="space-y-2 sm:hidden">
              {filtered.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5"
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                    <span className="inline-flex rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
                      {ACTION_LABELS[row.action] ?? row.action}
                    </span>
                    <span className="text-[11px] tabular-nums text-ink-soft">
                      {formatWhen(row.at)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-ink">
                    {row.actor?.fullName || '—'}
                  </p>
                  {row.details && (
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                      {row.details}
                    </p>
                  )}
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-line sm:block">
              <table className="min-w-full border-collapse text-right text-xs">
                <thead>
                  <tr className="bg-brand-deep text-white">
                    <th className="px-3 py-2.5 font-semibold">זמן</th>
                    <th className="px-3 py-2.5 font-semibold">משתמש</th>
                    <th className="px-3 py-2.5 font-semibold">פעולה</th>
                    <th className="px-3 py-2.5 font-semibold">פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={row.id} className={i % 2 === 0 ? 'bg-card' : 'bg-surface'}>
                      <td className="whitespace-nowrap border-b border-line px-3 py-2 tabular-nums text-ink-soft">
                        {formatWhen(row.at)}
                      </td>
                      <td className="border-b border-line px-3 py-2 font-medium text-ink">
                        {row.actor?.fullName || '—'}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <span className="inline-flex rounded-md bg-brand/10 px-1.5 py-0.5 font-semibold text-brand">
                          {ACTION_LABELS[row.action] ?? row.action}
                        </span>
                      </td>
                      <td className="border-b border-line px-3 py-2 text-ink-soft">
                        {row.details || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
