import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  UserMinus,
  UserPlus,
  X,
  Save,
} from 'lucide-react'
import { isQualified } from '../algorithm'
import { useApp } from '../context/AppContext'
import { SHIFT_TYPE_LABELS } from '../constants'
import { CertChips, IntensityBadge } from '../components/ui'
import { ExportBar } from '../components/ExportBar'
import type { ShiftType } from '../types'

const STEPS = [
  { id: 'lanes' as const, label: 'נתיבים' },
  { id: 'attendance' as const, label: 'נוכחות' },
  { id: 'board' as const, label: 'שיבוץ' },
]

type ExtraFlow = 'closed' | 'ask' | 'pick'

export function ShiftPage() {
  const {
    data,
    draft,
    shiftStep,
    setShiftStep,
    updateDraftMeta,
    toggleLane,
    toggleWorker,
    setAllActiveLanes,
    setAllActiveWorkers,
    runAutoAssign,
    updateAssignment,
    addExtraWorkerToLane,
    saveCurrentShift,
    startShift,
  } = useApp()

  const [extraFlow, setExtraFlow] = useState<ExtraFlow>('closed')
  const [extraAskedOnce, setExtraAskedOnce] = useState(false)
  const [pickLaneId, setPickLaneId] = useState('')
  const [pickWorkerId, setPickWorkerId] = useState('')
  const [saveFlash, setSaveFlash] = useState(false)

  const exportLines = useMemo(() => {
    if (!draft) return []
    return draft.activeLaneIds.flatMap((laneId) => {
      const lane = data.lanes.find((l) => l.id === laneId)
      if (!lane) return []
      const assignment = draft.assignments.find((a) => a.laneId === laneId)
      const workers = (assignment?.workerIds ?? [])
        .filter(Boolean)
        .map((id) => data.workers.find((w) => w.id === id)?.fullName ?? id)
      return [
        {
          laneName: lane.name,
          intensity: lane.intensity,
          workers,
          staffingStandard: lane.staffingStandard,
        },
      ]
    })
  }, [draft, data.lanes, data.workers])

  const unassignedNames = useMemo(() => {
    if (!draft) return []
    return draft.unassignedWorkerIds.map(
      (id) => data.workers.find((w) => w.id === id)?.fullName ?? id,
    )
  }, [draft, data.workers])

  const handleAutoAssign = () => {
    setExtraAskedOnce(false)
    setExtraFlow('closed')
    setSaveFlash(false)
    runAutoAssign()
  }

  // Surplus prompt — only once after each auto-assign
  useEffect(() => {
    if (!draft || shiftStep !== 'board' || extraAskedOnce) return
    const moreWorkersThanLanes =
      draft.presentWorkerIds.length > draft.activeLaneIds.length
    const hasUnassigned = draft.unassignedWorkerIds.length > 0
    if (!moreWorkersThanLanes || !hasUnassigned) return

    setExtraAskedOnce(true)
    setPickLaneId(draft.activeLaneIds[0] ?? '')
    setPickWorkerId(draft.unassignedWorkerIds[0] ?? '')
    setExtraFlow('ask')
  }, [draft, shiftStep, extraAskedOnce])

  const confirmExtraAdd = () => {
    if (!pickLaneId || !pickWorkerId) return
    addExtraWorkerToLane(pickLaneId, pickWorkerId)
    setExtraFlow('closed')
  }

  const handleSave = async () => {
    try {
      await saveCurrentShift()
      setSaveFlash(true)
      window.setTimeout(() => setSaveFlash(false), 2000)
    } catch {
      /* error shown via context */
    }
  }

  if (!draft) {
    return (
      <div className="rounded-2xl border border-line bg-card p-8 text-center shadow-sm">
        <p className="text-ink-soft">אין משמרת פעילה.</p>
        <button
          type="button"
          onClick={startShift}
          className="mt-4 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
        >
          התחלת משמרת
        </button>
      </div>
    )
  }

  const stepIndex = STEPS.findIndex((s) => s.id === shiftStep)
  const unassignedWorkers = draft.unassignedWorkerIds
    .map((id) => data.workers.find((w) => w.id === id))
    .filter(Boolean)

  const pickLane = data.lanes.find((l) => l.id === pickLaneId)
  const qualifiedUnassigned = unassignedWorkers.filter(
    (w) => w && pickLane && isQualified(w, pickLane),
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-card p-4 shadow-sm">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-soft">תאריך</span>
          <input
            type="date"
            className="rounded-lg border border-line bg-surface px-3 py-2"
            value={draft.date}
            onChange={(e) => updateDraftMeta({ date: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-ink-soft">סוג משמרת</span>
          <select
            className="rounded-lg border border-line bg-surface px-3 py-2"
            value={draft.shiftType}
            onChange={(e) =>
              updateDraftMeta({ shiftType: e.target.value as ShiftType })
            }
          >
            {(Object.keys(SHIFT_TYPE_LABELS) as ShiftType[]).map((k) => (
              <option key={k} value={k}>
                {SHIFT_TYPE_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="flex gap-2">
        {STEPS.map((s, i) => {
          const done = i < stepIndex
          const active = i === stepIndex
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (s.id === 'board' && draft.assignments.length === 0) return
                  setShiftStep(s.id)
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                  active
                    ? 'bg-brand text-white shadow-sm'
                    : done
                      ? 'bg-ok-soft text-ok'
                      : 'bg-card text-ink-soft ring-1 ring-line'
                }`}
              >
                {done ? <Check className="size-3.5" /> : <span>{i + 1}</span>}
                {s.label}
              </button>
            </li>
          )
        })}
      </ol>

      {shiftStep === 'lanes' && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold">בחירת נתיבים פעילים</h2>
              <p className="text-sm text-ink-soft">
                סמנו אילו נתיבים פתוחים במשמרת זו
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAllActiveLanes(true)}
                className="rounded-lg px-2 py-1 font-medium text-brand hover:bg-surface"
              >
                הכל
              </button>
              <button
                type="button"
                onClick={() => setAllActiveLanes(false)}
                className="rounded-lg px-2 py-1 font-medium text-ink-soft hover:bg-surface"
              >
                ניקוי
              </button>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.lanes.map((lane) => {
              const on = draft.activeLaneIds.includes(lane.id)
              return (
                <li key={lane.id}>
                  <button
                    type="button"
                    onClick={() => toggleLane(lane.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-4 text-right transition ${
                      on
                        ? 'border-brand bg-brand/5 ring-1 ring-brand/30'
                        : 'border-line bg-surface/50 opacity-70'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${
                        on
                          ? 'border-brand bg-brand text-white'
                          : 'border-line bg-card'
                      }`}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{lane.name}</span>
                        <IntensityBadge intensity={lane.intensity} />
                        <span className="text-xs text-ink-soft">
                          תקן {lane.staffingStandard}
                        </span>
                      </div>
                      <div className="mt-2">
                        <CertChips items={lane.requiredCertifications} />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-5 flex justify-start">
            <button
              type="button"
              disabled={draft.activeLaneIds.length === 0}
              onClick={() => setShiftStep('attendance')}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              המשך לנוכחות
              <ChevronLeft className="size-4" />
            </button>
          </div>
        </section>
      )}

      {shiftStep === 'attendance' && (
        <section className="rounded-2xl border border-line bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold">סימון נוכחות</h2>
              <p className="text-sm text-ink-soft">מי מהבודקים נמצא במשמרת</p>
            </div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAllActiveWorkers(true)}
                className="rounded-lg px-2 py-1 font-medium text-brand hover:bg-surface"
              >
                כל הפעילים
              </button>
              <button
                type="button"
                onClick={() => setAllActiveWorkers(false)}
                className="rounded-lg px-2 py-1 font-medium text-ink-soft hover:bg-surface"
              >
                ניקוי
              </button>
            </div>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.workers
              .filter((w) => w.status === 'active')
              .map((w) => {
                const on = draft.presentWorkerIds.includes(w.id)
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => toggleWorker(w.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-right transition ${
                        on
                          ? 'border-brand bg-brand/5 ring-1 ring-brand/30'
                          : 'border-line bg-surface/50 opacity-70'
                      }`}
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${
                          on
                            ? 'border-brand bg-brand text-white'
                            : 'border-line bg-card'
                        }`}
                      >
                        {on && <Check className="size-3" />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{w.fullName}</p>
                        <div className="mt-1">
                          <CertChips items={w.certifications} />
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShiftStep('lanes')}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface"
            >
              <ChevronRight className="size-4" />
              חזרה
            </button>
            <button
              type="button"
              disabled={draft.presentWorkerIds.length === 0}
              onClick={handleAutoAssign}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white shadow-sm disabled:opacity-40"
            >
              <Sparkles className="size-4" />
              שבץ אוטומטית
            </button>
          </div>
        </section>
      )}

      {shiftStep === 'board' && (
        <section className="space-y-4">
          {draft.warnings.length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <AlertTriangle className="size-4" />
                התראות שיבוץ
              </div>
              <ul className="list-inside list-disc space-y-0.5">
                {draft.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">לוח שיבוץ</h2>
              <p className="text-sm text-ink-soft">
                עריכה ידנית מרשימה נפתחת · לחצו שמירה לשמירה בהיסטוריה
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-sm transition ${
                  saveFlash ? 'bg-ok' : 'bg-brand hover:bg-brand-deep'
                }`}
              >
                {saveFlash ? <Check className="size-4" /> : <Save className="size-4" />}
                {saveFlash ? 'נשמר' : 'שמור'}
              </button>
              <button
                type="button"
                onClick={handleAutoAssign}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-sm font-semibold text-brand hover:bg-surface"
              >
                <Sparkles className="size-4" />
                שבץ מחדש
              </button>
              {draft.unassignedWorkerIds.length > 0 &&
                draft.presentWorkerIds.length > draft.activeLaneIds.length && (
                  <button
                    type="button"
                    onClick={() => {
                      setPickLaneId(draft.activeLaneIds[0] ?? '')
                      setPickWorkerId(draft.unassignedWorkerIds[0] ?? '')
                      setExtraFlow('pick')
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-semibold text-accent"
                  >
                    <UserPlus className="size-4" />
                    הוסף לעמדה
                  </button>
                )}
              <ExportBar
                date={draft.date}
                shiftType={draft.shiftType}
                lines={exportLines}
                unassigned={unassignedNames}
              />
            </div>
          </div>

          <div
            className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm"
            style={{ fontFamily: 'Heebo, sans-serif' }}
          >
            <div className="border-b border-line bg-gradient-to-l from-[#0f3350] to-[#1a4a6e] px-5 py-4 text-white">
              <p className="text-[10px] font-semibold tracking-[0.25em] text-white/60">
                שיבוצון
              </p>
              <h3 className="font-display text-xl font-bold">שיבוץ שער יציאה</h3>
              <p className="mt-1 text-sm text-white/80">
                {new Date(draft.date).toLocaleDateString('he-IL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}{' '}
                · {SHIFT_TYPE_LABELS[draft.shiftType]}
              </p>
            </div>
            <div className="grid gap-0 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:divide-x-reverse">
              {draft.activeLaneIds.map((laneId) => {
                const lane = data.lanes.find((l) => l.id === laneId)
                if (!lane) return null
                const assignment = draft.assignments.find((a) => a.laneId === laneId)
                const slots = [...(assignment?.workerIds ?? [])]
                while (slots.length < lane.staffingStandard) slots.push('')

                return (
                  <div key={laneId} className="p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h4 className="font-bold text-[#0f1c2e]">{lane.name}</h4>
                      <div className="flex items-center gap-2">
                        {slots.filter(Boolean).length > lane.staffingStandard && (
                          <span className="rounded-md bg-[#f3e0d4] px-2 py-0.5 text-[10px] font-bold text-[#c45c26]">
                            +תוספת
                          </span>
                        )}
                        <IntensityBadge intensity={lane.intensity} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      {slots.map((workerId, slotIndex) => {
                        const present = data.workers.filter((w) =>
                          draft.presentWorkerIds.includes(w.id),
                        )
                        const options = present.filter(
                          (w) =>
                            isQualified(w, lane) &&
                            (w.id === workerId ||
                              !draft.assignments.some((a) =>
                                a.workerIds.includes(w.id),
                              ) ||
                              draft.assignments
                                .find((a) => a.laneId === laneId)
                                ?.workerIds.includes(w.id)),
                        )
                        const isExtra = slotIndex >= lane.staffingStandard

                        return (
                          <div key={slotIndex} className="flex items-center gap-2">
                            <span className="w-5 text-xs text-[#3d4f66]">
                              {slotIndex + 1}.
                            </span>
                            <select
                              className={`w-full rounded-lg border px-3 py-2 text-sm font-medium text-[#0f1c2e] ${
                                isExtra
                                  ? 'border-[#c45c26]/40 bg-[#f3e0d4]/50'
                                  : 'border-[#d5dee8] bg-[#f3f6f9]'
                              }`}
                              value={workerId || ''}
                              onChange={(e) =>
                                updateAssignment(
                                  laneId,
                                  slotIndex,
                                  e.target.value || null,
                                )
                              }
                            >
                              <option value="">— פנוי —</option>
                              {options.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.fullName}
                                </option>
                              ))}
                              {workerId &&
                                !options.some((w) => w.id === workerId) && (
                                  <option value={workerId}>
                                    {data.workers.find((w) => w.id === workerId)
                                      ?.fullName ?? workerId}
                                  </option>
                                )}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
            {draft.unassignedWorkerIds.length > 0 && (
              <div className="border-t border-line bg-[#f3f6f9] px-5 py-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#3d4f66]">
                  <UserMinus className="size-3.5" />
                  לא שובצו
                </p>
                <p className="text-sm text-[#0f1c2e]">
                  {draft.unassignedWorkerIds
                    .map(
                      (id) => data.workers.find((w) => w.id === id)?.fullName ?? id,
                    )
                    .join(' · ')}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShiftStep('attendance')}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-brand"
          >
            <ChevronRight className="size-4" />
            חזרה לנוכחות
          </button>
        </section>
      )}

      {extraFlow !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md animate-fade-up rounded-2xl border border-line bg-card p-5 shadow-xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <UserPlus className="size-5" />
                </span>
                <h3 className="font-display text-lg font-bold text-ink">
                  בודקים עודפים
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExtraFlow('closed')}
                className="rounded-lg p-1.5 text-ink-soft hover:bg-surface"
                aria-label="סגור"
              >
                <X className="size-4" />
              </button>
            </div>

            {extraFlow === 'ask' && (
              <>
                <p className="text-sm leading-relaxed text-ink-soft">
                  יש יותר בודקים ({draft.presentWorkerIds.length}) ממספר הנתיבים
                  שנבחרו ({draft.activeLaneIds.length}), ונותרו{' '}
                  {draft.unassignedWorkerIds.length} שלא שובצו.
                  <br />
                  האם תרצה להוסיף בודק לעמדה נוספת?
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExtraFlow('pick')}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white"
                  >
                    כן, הוסף לעמדה
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtraFlow('closed')}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface"
                  >
                    לא תודה
                  </button>
                </div>
              </>
            )}

            {extraFlow === 'pick' && (
              <>
                <p className="mb-4 text-sm text-ink-soft">
                  בחר נתיב ובודק להוספה מעבר לתקן העמדה
                </p>
                <div className="space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-ink-soft">עמדה / נתיב</span>
                    <select
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5"
                      value={pickLaneId}
                      onChange={(e) => {
                        setPickLaneId(e.target.value)
                        setPickWorkerId('')
                      }}
                    >
                      {draft.activeLaneIds.map((id) => {
                        const lane = data.lanes.find((l) => l.id === id)
                        return (
                          <option key={id} value={id}>
                            {lane?.name ?? id}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-ink-soft">בודק להוספה</span>
                    <select
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5"
                      value={pickWorkerId}
                      onChange={(e) => setPickWorkerId(e.target.value)}
                    >
                      <option value="">— בחר בודק —</option>
                      {(qualifiedUnassigned.length
                        ? qualifiedUnassigned
                        : unassignedWorkers
                      ).map(
                        (w) =>
                          w && (
                            <option key={w.id} value={w.id}>
                              {w.fullName}
                              {!pickLane || isQualified(w, pickLane)
                                ? ''
                                : ' (ללא הסמכה מלאה)'}
                            </option>
                          ),
                      )}
                    </select>
                  </label>
                  {pickLane &&
                    pickWorkerId &&
                    (() => {
                      const w = data.workers.find((x) => x.id === pickWorkerId)
                      return w && !isQualified(w, pickLane) ? (
                        <p className="text-xs text-warn">
                          שימו לב: לבודק זה חסרה הסמכה מלאה לנתיב שנבחר.
                        </p>
                      ) : null
                    })()}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!pickLaneId || !pickWorkerId}
                    onClick={confirmExtraAdd}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    <UserPlus className="size-4" />
                    הוסף לשיבוץ
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtraFlow('closed')}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-ink-soft hover:bg-surface"
                  >
                    ביטול
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
