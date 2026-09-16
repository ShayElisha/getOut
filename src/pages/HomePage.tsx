import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Clock,
  Play,
  Users,
  LayoutGrid,
  Table2,
  Download,
  Loader2,
  RotateCcw,
  BarChart3,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  getCurrentShiftContext,
  INTENSITY_LABELS,
  SHIFT_TYPE_LABELS,
} from '../constants'
import { fetchAuditLogs } from '../api'
import { downloadBoardImage, type ExportLaneLine } from '../lib/export'
import { IntensityBadge, SectionCard } from '../components/ui'
import type { ShiftSchedule } from '../types'

export function HomePage() {
  const {
    data,
    draft,
    startShift,
    discardDraft,
    setView,
    setShiftStep,
    loadShiftFromHistory,
    user,
  } = useApp()
  const activeWorkers = data.workers.filter((w) => w.status === 'active').length
  const last = data.history[0]
  const [savedBy, setSavedBy] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const currentCtx = useMemo(
    () => getCurrentShiftContext(new Date(nowTick)),
    [nowTick],
  )

  const currentShift: ShiftSchedule | null = useMemo(() => {
    const matches = data.history.filter(
      (h) => h.date === currentCtx.date && h.shiftType === currentCtx.shiftType,
    )
    if (matches.length === 0) return null
    return matches.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  }, [data.history, currentCtx.date, currentCtx.shiftType])

  const currentTableRows = useMemo(() => {
    if (!currentShift) return []
    return currentShift.activeLaneIds
      .map((laneId) => {
        const lane = data.lanes.find((l) => l.id === laneId)
        if (!lane) return null
        const assignment = currentShift.assignments.find((a) => a.laneId === laneId)
        const workers = (assignment?.workerIds ?? [])
          .filter(Boolean)
          .map((id) => data.workers.find((w) => w.id === id)?.fullName ?? id)
        return {
          laneId,
          laneName: lane.name,
          intensity: lane.intensity,
          staffingStandard: lane.staffingStandard,
          workers,
        }
      })
      .filter(Boolean) as {
      laneId: string
      laneName: string
      intensity: 'easy' | 'medium' | 'hard'
      staffingStandard: number
      workers: string[]
    }[]
  }, [currentShift, data.lanes, data.workers])

  const currentUnassigned = useMemo(() => {
    if (!currentShift) return []
    const assigned = new Set(
      currentShift.assignments.flatMap((a) => a.workerIds.filter(Boolean)),
    )
    return currentShift.presentWorkerIds
      .filter((id) => !assigned.has(id))
      .map((id) => data.workers.find((w) => w.id === id)?.fullName ?? id)
  }, [currentShift, data.workers])

  const resumeShift = () => {
    if (!draft) return
    if (draft.assignments.some((a) => a.workerIds.some(Boolean))) {
      setShiftStep('board')
    } else if (draft.presentWorkerIds.length > 0) {
      setShiftStep('attendance')
    } else {
      setShiftStep('lanes')
    }
    setView('shift')
  }

  const draftSummary = useMemo(() => {
    if (!draft) return null
    const assigned = new Set(
      draft.assignments.flatMap((a) => a.workerIds.filter(Boolean)),
    ).size
    return {
      dateLabel: new Date(draft.date + 'T12:00:00').toLocaleDateString('he-IL'),
      shiftLabel: SHIFT_TYPE_LABELS[draft.shiftType],
      lanes: draft.activeLaneIds.length,
      present: draft.presentWorkerIds.length,
      assigned,
    }
  }, [draft])

  const lastStats = useMemo(() => {
    if (!last) return null
    const assignedIds = new Set(
      last.assignments.flatMap((a) => a.workerIds.filter(Boolean)),
    )
    const assigned = assignedIds.size
    const unassigned = last.presentWorkerIds.filter((id) => !assignedIds.has(id)).length
    return {
      assigned,
      unassigned,
      lanes: last.activeLaneIds.length,
      present: last.presentWorkerIds.length,
      savedAt: last.updatedAt
        ? new Date(last.updatedAt).toLocaleString('he-IL', {
            dateStyle: 'short',
            timeStyle: 'short',
          })
        : null,
    }
  }, [last])

  useEffect(() => {
    if (!last) {
      setSavedBy(null)
      return
    }
    let cancelled = false
    let idleId: number | undefined
    let timeoutId: number | undefined

    const run = () => {
      void (async () => {
        try {
          const logs = await fetchAuditLogs(80)
          if (cancelled) return
          const match = logs.find(
            (l) =>
              (l.action === 'shift_save' || l.action === 'shift_update') &&
              l.details.includes(last.date) &&
              l.details.includes(last.shiftType),
          )
          setSavedBy(match?.actor?.fullName || null)
        } catch {
          if (!cancelled) setSavedBy(null)
        }
      })()
    }

    const ric = window.requestIdleCallback
    if (typeof ric === 'function') {
      idleId = ric(run, { timeout: 2500 })
    } else {
      timeoutId = window.setTimeout(run, 800)
    }

    return () => {
      cancelled = true
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [last])

  const exportLast = async () => {
    if (!last) return
    setExportBusy(true)
    setExportError(null)
    try {
      const lines: ExportLaneLine[] = last.activeLaneIds.flatMap((laneId) => {
        const lane = data.lanes.find((l) => l.id === laneId)
        if (!lane) return []
        const assignment = last.assignments.find((a) => a.laneId === laneId)
        const workers = (assignment?.workerIds ?? [])
          .filter(Boolean)
          .map((id) => data.workers.find((w) => w.id === id)?.fullName ?? id)
        return [
          {
            laneName: lane.name,
            intensity: lane.intensity,
            workers,
            staffingStandard: lane.staffingStandard,
            notes: assignment?.notes?.trim() || undefined,
          },
        ]
      })
      const assignedIds = new Set(
        last.assignments.flatMap((a) => a.workerIds.filter(Boolean)),
      )
      const unassigned = last.presentWorkerIds
        .filter((id) => !assignedIds.has(id))
        .map((id) => data.workers.find((w) => w.id === id)?.fullName ?? id)

      await downloadBoardImage(
        last.date,
        last.shiftType,
        lines,
        unassigned,
        undefined,
        { preparedBy: savedBy || user?.fullName },
      )
    } catch (e) {
      console.error(e)
      setExportError('ייצוא נכשל. נסו שוב.')
    } finally {
      setExportBusy(false)
    }
  }

  const currentDateLabel = new Date(
    currentCtx.date + 'T12:00:00',
  ).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

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
          {draft && draftSummary ? (
            <>
              <p className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-white/60 uppercase sm:text-xs">
                משמרת פעילה
              </p>
              <h2 className="font-display text-xl font-bold sm:text-3xl">
                המשך שיבוץ של היום
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-white/80 sm:mt-2 sm:text-base">
                {draftSummary.dateLabel} · {draftSummary.shiftLabel} ·{' '}
                {draftSummary.lanes} נתיבים · {draftSummary.present} נוכחים
                {draftSummary.assigned > 0
                  ? ` · ${draftSummary.assigned} משובצים`
                  : ''}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 sm:mt-6 sm:gap-3">
                <button
                  type="button"
                  onClick={resumeShift}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:brightness-110 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm"
                >
                  <RotateCcw className="size-3.5 sm:size-4" />
                  המשך שיבוץ
                  <ArrowLeft className="size-3.5 sm:size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        'להתחיל משמרת חדשה? הטיוטה הנוכחית תוחלף.',
                      )
                    ) {
                      startShift()
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/20 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm"
                >
                  <Play className="size-3.5 fill-current sm:size-4" />
                  משמרת חדשה
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('לבטל את טיוטת השיבוץ? הפעולה לא ניתנת לשחזור.')) {
                      discardDraft()
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-transparent px-4 py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white sm:rounded-2xl sm:px-5 sm:py-3 sm:text-sm"
                >
                  בטל טיוטה
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-xl font-bold sm:text-3xl">
                מוכנים למשמרת?
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-white/80 sm:mt-2 sm:text-base">
                בחרו נתיבים, סמנו נוכחות, והפעילו שיבוץ אוטומטי לפי הסמכות, היסטוריית
                תאריכים, רוטציית נתיבים וויסות עמדות קשות.
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
            </>
          )}
        </div>
      </section>

      <SectionCard
        title={`משמרת נוכחית · ${SHIFT_TYPE_LABELS[currentCtx.shiftType]}`}
        subtitle={`${currentDateLabel} · ${currentCtx.windowLabel}`}
        actions={
          currentShift ? (
            <button
              type="button"
              onClick={() => loadShiftFromHistory(currentShift.id)}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-brand hover:bg-card sm:text-sm"
            >
              פתיחה לעריכה
            </button>
          ) : undefined
        }
      >
        {!currentShift ? (
          <p className="text-sm text-ink-soft">
            אין שיבוץ שמור למשמרת {SHIFT_TYPE_LABELS[currentCtx.shiftType]} בחלון
            הזמן הנוכחי ({currentCtx.windowLabel}).
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="min-w-full border-collapse text-right text-[11px] sm:text-xs">
                <thead>
                  <tr className="bg-brand-deep text-white">
                    <th className="px-2.5 py-2.5 font-semibold sm:px-3">נתיב</th>
                    <th className="px-2.5 py-2.5 font-semibold sm:px-3">עצימות</th>
                    <th className="px-2.5 py-2.5 font-semibold sm:px-3">תקן</th>
                    <th className="px-2.5 py-2.5 font-semibold sm:px-3">בודקים משובצים</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTableRows.map((row, i) => (
                    <tr
                      key={row.laneId}
                      className={i % 2 === 0 ? 'bg-card' : 'bg-surface'}
                    >
                      <td className="border-b border-line px-2.5 py-2 font-semibold text-ink sm:px-3">
                        {row.laneName}
                      </td>
                      <td className="border-b border-line px-2.5 py-2 sm:px-3">
                        <IntensityBadge intensity={row.intensity} />
                        <span className="sr-only">{INTENSITY_LABELS[row.intensity]}</span>
                      </td>
                      <td className="border-b border-line px-2.5 py-2 tabular-nums text-ink-soft sm:px-3">
                        {row.staffingStandard}
                      </td>
                      <td className="border-b border-line px-2.5 py-2 text-ink sm:px-3">
                        {row.workers.length > 0
                          ? row.workers.join(' · ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {currentUnassigned.length > 0 && (
              <p className="mt-3 text-xs text-ink-soft sm:text-sm">
                לא שובצו: {currentUnassigned.join(' · ')}
              </p>
            )}
          </>
        )}
      </SectionCard>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
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
            icon: Table2,
            label: 'מעקב עמדות',
            value: String(data.history.length),
            sub: 'טבלת בודק × נתיב',
            onClick: () => setView('tracking'),
          },
          {
            icon: BarChart3,
            label: 'אנליזה',
            value: String(data.history.length),
            sub: 'הוגנות ועומס',
            onClick: () => setView('analytics'),
          },
        ].map((card, i) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className={`group ui-panel-solid p-3.5 text-right transition hover:border-brand/30 hover:shadow-[var(--shadow-panel-hover)] animate-fade-up stagger-${i + 1} sm:rounded-2xl sm:p-5`}
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

      {last && lastStats && (
        <section className="rounded-xl border border-line bg-card p-3.5 shadow-sm sm:rounded-2xl sm:p-5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink sm:mb-3 sm:gap-2 sm:text-sm">
            <Clock className="size-3.5 text-accent sm:size-4" />
            שיבוץ אחרון
          </div>
          <p className="text-sm font-semibold text-ink">
            {new Date(last.date + 'T12:00:00').toLocaleDateString('he-IL')} ·{' '}
            {SHIFT_TYPE_LABELS[last.shiftType]}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink-soft sm:text-sm">
            <li>
              {lastStats.lanes} נתיבים · {lastStats.present} נוכחים ·{' '}
              {lastStats.assigned} שובצו
              {lastStats.unassigned > 0
                ? ` · ${lastStats.unassigned} לא שובצו`
                : ''}
            </li>
            {savedBy && <li>נשמר ע״י {savedBy}</li>}
            {lastStats.savedAt && <li>עודכן ב־{lastStats.savedAt}</li>}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-4 sm:gap-3">
            <button
              type="button"
              onClick={() => loadShiftFromHistory(last.id)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-deep sm:text-sm"
            >
              פתיחה לעריכה
            </button>
            <button
              type="button"
              disabled={exportBusy}
              onClick={() => void exportLast()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-brand hover:bg-card disabled:opacity-50 sm:text-sm"
            >
              {exportBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              ייצוא מסמך
            </button>
          </div>
          {exportError && (
            <p className="mt-2 text-[11px] font-medium text-hard">{exportError}</p>
          )}
        </section>
      )}
    </div>
  )
}
