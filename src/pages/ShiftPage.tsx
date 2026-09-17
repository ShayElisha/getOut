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
  Plus,
  ArrowLeftRight,
  Hand,
  Trash2,
} from 'lucide-react'
import { isQualified, buildSameDayMorningContext, afternoonHandoffTier } from '../algorithm'
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
    startManualAssign,
    updateAssignment,
    swapAssignments,
    removeWorkerFromShift,
    addExtraWorkerToLane,
    addSlotToLane,
    saveCurrentShift,
    startShift,
    discardDraft,
    updateLaneNotes,
  } = useApp()

  const [extraFlow, setExtraFlow] = useState<ExtraFlow>('closed')
  const [extraAskedOnce, setExtraAskedOnce] = useState(false)
  const [pickLaneId, setPickLaneId] = useState('')
  const [pickWorkerId, setPickWorkerId] = useState('')
  const [saveFlash, setSaveFlash] = useState(false)
  const [swapTarget, setSwapTarget] = useState<{
    laneId: string
    slotIndex: number
    workerId: string
  } | null>(null)

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
          notes: assignment?.notes?.trim() || undefined,
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

  const morningCtx = useMemo(() => {
    if (!draft || draft.shiftType !== 'afternoon') return null
    return buildSameDayMorningContext(data.history, draft.date)
  }, [draft, data.history])

  const handoffOptionLabel = (workerId: string, fullName: string, laneId: string) => {
    if (!morningCtx?.found) return fullName
    const tier = afternoonHandoffTier(workerId, laneId, morningCtx)
    if (tier === 0) return `${fullName} · צהריים בלבד`
    if (tier === 1) return `${fullName} · ממשיך (היה כאן בבוקר)`
    return `${fullName} · ממשיך מבוקר`
  }

  const handleAutoAssign = () => {
    setExtraAskedOnce(false)
    setExtraFlow('closed')
    setSaveFlash(false)
    runAutoAssign()
  }

  const handleManualAssign = () => {
    // Skip surplus modal — manual board starts with everyone unassigned on purpose.
    setExtraAskedOnce(true)
    setExtraFlow('closed')
    setSaveFlash(false)
    startManualAssign()
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
    if (!draft) return
    if (draft.unassignedWorkerIds.length > 0) {
      setSaveFlash(false)
      window.alert(
        `לא ניתן לשמור — נשארו ${draft.unassignedWorkerIds.length} בודקים שלא שובצו לעמדה.\nשבצו את כולם (או הוסיפו לעמדה) לפני השמירה.`,
      )
      return
    }
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
      <div className="ui-panel-solid p-8 text-center sm:rounded-2xl">
        <p className="ui-empty-title">אין משמרת פעילה</p>
        <p className="ui-empty-text mt-1">התחילו שיבוץ חדש כדי לבחור נתיבים ונוכחות.</p>
        <button
          type="button"
          onClick={startShift}
          className="ui-btn ui-btn-primary mt-5"
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

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="ui-panel-solid flex flex-wrap items-end gap-3 p-3.5 sm:rounded-2xl sm:p-4">
        <label className="text-xs sm:text-sm">
          <span className="mb-1.5 block text-[10px] font-medium text-ink-soft sm:text-xs">תאריך</span>
          <input
            type="date"
            className="ui-field !w-auto min-w-[9.5rem] !py-1.5 !text-xs sm:!py-2 sm:!text-sm"
            value={draft.date}
            onChange={(e) => updateDraftMeta({ date: e.target.value })}
          />
        </label>
        <label className="text-xs sm:text-sm">
          <span className="mb-1.5 block text-[10px] font-medium text-ink-soft sm:text-xs">סוג משמרת</span>
          <select
            className="ui-field !w-auto min-w-[8rem] !py-1.5 !text-xs sm:!py-2 sm:!text-sm"
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
        <button
          type="button"
          onClick={() => {
            if (confirm('לבטל את טיוטת השיבוץ? הפעולה לא ניתנת לשחזור.')) {
              discardDraft()
            }
          }}
          className="ui-btn ui-btn-danger mr-auto !py-1.5 text-xs sm:text-sm"
        >
          בטל טיוטה
        </button>
      </div>

      <ol className="flex gap-1.5 sm:gap-2">
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
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-1.5 py-2 text-[11px] font-semibold transition sm:gap-2 sm:px-2 sm:py-2.5 sm:text-sm ${
                  active
                    ? 'bg-brand text-white shadow-sm'
                    : done
                      ? 'bg-ok-soft text-ok'
                      : 'bg-card text-ink-soft ring-1 ring-line'
                }`}
              >
                {done ? <Check className="size-3 sm:size-3.5" /> : <span>{i + 1}</span>}
                {s.label}
              </button>
            </li>
          )
        })}
      </ol>

      {shiftStep === 'lanes' && (
        <section className="ui-panel-solid p-4 sm:rounded-2xl sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="ui-title">בחירת נתיבים פעילים</h2>
              <p className="ui-subtitle">
                סמנו אילו נתיבים פתוחים במשמרת זו
              </p>
            </div>
            <div className="flex gap-2 text-[11px] sm:text-xs">
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
          <ul className="flex flex-col gap-2">
            {data.lanes.map((lane) => {
              const on = draft.activeLaneIds.includes(lane.id)
              return (
                <li key={lane.id}>
                  <button
                    type="button"
                    onClick={() => toggleLane(lane.id)}
                    className={`flex w-full items-start gap-2.5 rounded-xl border p-3 text-right transition sm:gap-3 sm:p-4 ${
                      on
                        ? 'border-brand bg-brand/5 shadow-[var(--shadow-panel)] ring-1 ring-brand/25'
                        : 'border-line bg-surface/50 opacity-75 hover:border-brand/25 hover:opacity-100'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-md border sm:size-5 ${
                        on
                          ? 'border-brand bg-brand text-white'
                          : 'border-line bg-card'
                      }`}
                    >
                      {on && <Check className="size-2.5 sm:size-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className="text-sm font-bold sm:text-base">{lane.name}</span>
                        <IntensityBadge intensity={lane.intensity} />
                        <span className="text-[10px] text-ink-soft sm:text-xs">
                          תקן {lane.staffingStandard}
                        </span>
                      </div>
                      <div className="mt-1.5 sm:mt-2">
                        <CertChips items={lane.requiredCertifications} />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 flex justify-start sm:mt-5">
            <button
              type="button"
              disabled={draft.activeLaneIds.length === 0}
              onClick={() => setShiftStep('attendance')}
              className="ui-btn ui-btn-primary disabled:opacity-40"
            >
              המשך לנוכחות
              <ChevronLeft className="size-3.5 sm:size-4" />
            </button>
          </div>
        </section>
      )}

      {shiftStep === 'attendance' && (
        <section className="ui-panel-solid p-4 sm:rounded-2xl sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="ui-title">סימון נוכחות</h2>
              <p className="ui-subtitle">מי מהבודקים נמצא במשמרת</p>
            </div>
            <div className="flex gap-2 text-[11px] sm:text-xs">
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
                      className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-right transition sm:gap-3 sm:p-3 ${
                        on
                          ? 'border-brand bg-brand/5 ring-1 ring-brand/30'
                          : 'border-line bg-surface/50 opacity-70'
                      }`}
                    >
                      <span
                        className={`flex size-[18px] shrink-0 items-center justify-center rounded-md border sm:size-5 ${
                          on
                            ? 'border-brand bg-brand text-white'
                            : 'border-line bg-card'
                        }`}
                      >
                        {on && <Check className="size-2.5 sm:size-3" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold sm:text-base">{w.fullName}</p>
                        <div className="mt-1">
                          <CertChips items={w.certifications} />
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
            <button
              type="button"
              onClick={() => setShiftStep('lanes')}
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-medium text-ink-soft hover:bg-surface sm:px-3 sm:py-2.5 sm:text-sm"
            >
              <ChevronRight className="size-3.5 sm:size-4" />
              חזרה
            </button>
            <button
              type="button"
              disabled={draft.presentWorkerIds.length === 0}
              onClick={handleAutoAssign}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-40 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Sparkles className="size-3.5 sm:size-4" />
              שבץ אוטומטית
            </button>
            <button
              type="button"
              disabled={draft.presentWorkerIds.length === 0}
              onClick={handleManualAssign}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3.5 py-2 text-xs font-bold text-brand shadow-sm hover:bg-surface disabled:opacity-40 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              <Hand className="size-3.5 sm:size-4" />
              שבץ ידני
            </button>
          </div>
        </section>
      )}

      {shiftStep === 'board' && (
        <section className="space-y-3 sm:space-y-4">
          {draft.warnings.length > 0 && (
            <div className="rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-xs text-warn sm:px-4 sm:py-3 sm:text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-bold sm:gap-2">
                <AlertTriangle className="size-3.5 sm:size-4" />
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
              <h2 className="ui-title">לוח שיבוץ</h2>
              <p className="ui-subtitle">
                {draft.unassignedWorkerIds.length > 0
                  ? `לא ניתן לשמור עד שכל הנוכחים ישובצו (${draft.unassignedWorkerIds.length} ממתינים)`
                  : 'עריכה ידנית מרשימה נפתחת · לחצו שמירה לשמירה בהיסטוריה'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={draft.unassignedWorkerIds.length > 0}
                title={
                  draft.unassignedWorkerIds.length > 0
                    ? 'יש בודקים שלא שובצו — לא ניתן לשמור'
                    : undefined
                }
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition sm:px-3 sm:py-2 sm:text-sm ${
                  draft.unassignedWorkerIds.length > 0
                    ? 'cursor-not-allowed bg-brand/40'
                    : saveFlash
                      ? 'bg-ok'
                      : 'bg-brand hover:bg-brand-deep'
                }`}
              >
                {saveFlash ? (
                  <Check className="size-3.5 sm:size-4" />
                ) : (
                  <Save className="size-3.5 sm:size-4" />
                )}
                {saveFlash ? 'נשמר' : 'שמור'}
              </button>
              <button
                type="button"
                onClick={handleAutoAssign}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-surface sm:px-3 sm:py-2 sm:text-sm"
              >
                <Sparkles className="size-3.5 sm:size-4" />
                שבץ מחדש
              </button>
              {draft.unassignedWorkerIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPickLaneId(draft.activeLaneIds[0] ?? '')
                      setPickWorkerId(draft.unassignedWorkerIds[0] ?? '')
                      setExtraFlow('pick')
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent sm:px-3 sm:py-2 sm:text-sm"
                  >
                    <UserPlus className="size-3.5 sm:size-4" />
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
            className="ui-panel-solid overflow-hidden sm:rounded-2xl"
            style={{ fontFamily: 'Heebo, sans-serif' }}
          >
            <div className="border-b border-line bg-gradient-to-l from-[#0f3350] to-[#1a4a6e] px-3.5 py-3 text-white sm:px-5 sm:py-4">
              <p className="text-[9px] font-semibold tracking-[0.22em] text-white/60 sm:text-[10px] sm:tracking-[0.25em]">
                שיבוצון
              </p>
              <h3 className="font-display text-lg font-bold sm:text-xl">שיבוץ שער יציאה</h3>
              <p className="mt-0.5 text-xs text-white/80 sm:mt-1 sm:text-sm">
                {new Date(draft.date).toLocaleDateString('he-IL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}{' '}
                · {SHIFT_TYPE_LABELS[draft.shiftType]}
              </p>
            </div>
            <div className="flex flex-col divide-y divide-line">
              {draft.activeLaneIds.map((laneId) => {
                const lane = data.lanes.find((l) => l.id === laneId)
                if (!lane) return null
                const assignment = draft.assignments.find((a) => a.laneId === laneId)
                const slots = [...(assignment?.workerIds ?? [])]
                while (slots.length < lane.staffingStandard) slots.push('')

                return (
                  <div key={laneId} className="p-3 sm:p-4">
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
                      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                        <h4 className="text-sm font-bold text-[#0f1c2e] sm:text-base">
                          {lane.name}
                        </h4>
                        <button
                          type="button"
                          onClick={() => addSlotToLane(laneId)}
                          className="inline-flex size-6 shrink-0 items-center justify-center rounded-lg border border-[#d5dee8] bg-[#f3f6f9] text-[#1a4a6e] transition hover:border-[#1a4a6e] hover:bg-[#1a4a6e] hover:text-white sm:size-7"
                          title="הוסף בודק לנתיב"
                          aria-label={`הוסף בודק ל${lane.name}`}
                        >
                          <Plus className="size-3.5 sm:size-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <IntensityBadge intensity={lane.intensity} />
                        {lane.afternoonHandoff && (
                          <span className="rounded-md bg-[#f3e0d4] px-1.5 py-0.5 text-[9px] font-bold text-[#c45c26] sm:px-2 sm:text-[10px]">
                            החלפת צהריים
                          </span>
                        )}
                        {slots.filter(Boolean).length > lane.staffingStandard && (
                          <span className="rounded-md bg-[#f3e0d4] px-1.5 py-0.5 text-[9px] font-bold text-[#c45c26] sm:px-2 sm:text-[10px]">
                            +תוספת
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      {slots.map((workerId, slotIndex) => {
                        const present = data.workers.filter((w) =>
                          draft.presentWorkerIds.includes(w.id),
                        )
                        const options = present
                          .filter((w) => {
                            if (w.id === workerId) return true
                            return !draft.assignments.some((a) =>
                              a.workerIds.includes(w.id),
                            )
                          })
                          .slice()
                          .sort((a, b) => {
                            const qa = isQualified(a, lane) ? 0 : 1
                            const qb = isQualified(b, lane) ? 0 : 1
                            if (qa !== qb) return qa - qb
                            if (
                              lane.afternoonHandoff &&
                              draft.shiftType === 'afternoon'
                            ) {
                              const ta = afternoonHandoffTier(
                                a.id,
                                laneId,
                                morningCtx,
                              )
                              const tb = afternoonHandoffTier(
                                b.id,
                                laneId,
                                morningCtx,
                              )
                              if (ta !== tb) return ta - tb
                            }
                            return a.fullName.localeCompare(b.fullName, 'he')
                          })
                        const isExtra = slotIndex >= lane.staffingStandard
                        const selectedWorker = workerId
                          ? data.workers.find((w) => w.id === workerId)
                          : null
                        const selectedLacksCert =
                          selectedWorker != null &&
                          !isQualified(selectedWorker, lane)

                        const optionLabel = (w: (typeof options)[number]) => {
                          let label =
                            lane.afternoonHandoff &&
                            draft.shiftType === 'afternoon'
                              ? handoffOptionLabel(w.id, w.fullName, laneId)
                              : w.fullName
                          if (!isQualified(w, lane)) {
                            label += ' (ללא הסמכה מלאה)'
                          }
                          return label
                        }

                        return (
                          <div key={slotIndex} className="space-y-1">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span className="w-4 text-[10px] text-[#3d4f66] sm:w-5 sm:text-xs">
                                {slotIndex + 1}.
                              </span>
                              <select
                                className={`min-w-0 flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-[#0f1c2e] sm:px-3 sm:py-2 sm:text-sm ${
                                  selectedLacksCert
                                    ? 'border-warn/50 bg-warn-soft/40'
                                    : isExtra
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
                                    {optionLabel(w)}
                                  </option>
                                ))}
                                {workerId &&
                                  !options.some((w) => w.id === workerId) && (
                                    <option value={workerId}>
                                      {optionLabel(
                                        selectedWorker ?? {
                                          id: workerId,
                                          fullName: workerId,
                                          phone: '',
                                          certifications: [],
                                          status: 'active',
                                          isManager: false,
                                        },
                                      )}
                                    </option>
                                  )}
                              </select>
                              {workerId && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSwapTarget({
                                        laneId,
                                        slotIndex,
                                        workerId,
                                      })
                                    }
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#d5dee8] bg-white px-2 py-1.5 text-[10px] font-bold text-[#1a4a6e] hover:border-[#1a4a6e] hover:bg-[#1a4a6e] hover:text-white sm:text-[11px]"
                                    title="החלף עם נתיב אחר"
                                  >
                                    <ArrowLeftRight className="size-3.5" />
                                    החלף
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeWorkerFromShift(workerId)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-hard/30 bg-white px-2 py-1.5 text-[10px] font-bold text-hard hover:border-hard hover:bg-hard hover:text-white sm:text-[11px]"
                                    title="הסר מהשיבוץ ומהנוכחות"
                                  >
                                    <Trash2 className="size-3.5" />
                                    הסר
                                  </button>
                                </>
                              )}
                            </div>
                            {selectedLacksCert && (
                              <p className="pr-5 text-[10px] font-medium text-warn sm:pr-6 sm:text-[11px]">
                                שימו לב: לבודק זה חסרה הסמכה מלאה לנתיב שנבחר.
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <label className="mt-3 block">
                      <span className="mb-1 block text-[10px] font-semibold text-[#3d4f66] sm:text-xs">
                        הערות לנתיב
                      </span>
                      <textarea
                        className="ui-field min-h-[2.75rem] resize-y !py-2 text-xs sm:text-sm"
                        rows={2}
                        placeholder="הערה שתופיע גם בוואטסאפ ובייצוא…"
                        value={assignment?.notes ?? ''}
                        onChange={(e) => updateLaneNotes(laneId, e.target.value)}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
            {draft.unassignedWorkerIds.length > 0 && (
              <div className="border-t border-line bg-[#f3f6f9] px-3.5 py-2.5 sm:px-5 sm:py-3">
                <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-[#3d4f66] sm:mb-2 sm:text-xs">
                  <UserMinus className="size-3 sm:size-3.5" />
                  לא שובצו — ניתן להסיר מהמשמרת בלי לשבץ מחדש
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {draft.unassignedWorkerIds.map((id) => {
                    const name =
                      data.workers.find((w) => w.id === id)?.fullName ?? id
                    return (
                      <li
                        key={id}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#d5dee8] bg-white px-2 py-1 text-xs text-[#0f1c2e]"
                      >
                        <span>{name}</span>
                        <button
                          type="button"
                          onClick={() => removeWorkerFromShift(id)}
                          className="inline-flex size-5 items-center justify-center rounded-md text-hard hover:bg-hard-soft"
                          title={`הסר את ${name} מהשיבוץ`}
                          aria-label={`הסר את ${name} מהשיבוץ`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShiftStep('attendance')}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-brand sm:text-sm"
          >
            <ChevronRight className="size-3.5 sm:size-4" />
            חזרה לנוכחות
          </button>
        </section>
      )}

      {swapTarget &&
        (() => {
          const lane = data.lanes.find((l) => l.id === swapTarget.laneId)
          const current = data.workers.find((w) => w.id === swapTarget.workerId)
          if (!lane || !draft) return null

          type SwapOption = {
            laneId: string
            slotIndex: number
            workerId: string
            laneName: string
            workerName: string
            lacksCertHere: boolean
            currentLacksThere: boolean
          }

          const options: SwapOption[] = []
          for (const otherLaneId of draft.activeLaneIds) {
            const otherLane = data.lanes.find((l) => l.id === otherLaneId)
            if (!otherLane) continue
            const assignment = draft.assignments.find((a) => a.laneId === otherLaneId)
            const slots = assignment?.workerIds ?? []
            slots.forEach((wid, slotIndex) => {
              if (!wid) return
              if (
                otherLaneId === swapTarget.laneId &&
                slotIndex === swapTarget.slotIndex
              ) {
                return
              }
              const otherWorker = data.workers.find((w) => w.id === wid)
              options.push({
                laneId: otherLaneId,
                slotIndex,
                workerId: wid,
                laneName: otherLane.name,
                workerName: otherWorker?.fullName ?? wid,
                lacksCertHere: otherWorker ? !isQualified(otherWorker, lane) : false,
                currentLacksThere: current
                  ? !isQualified(current, otherLane)
                  : false,
              })
            })
          }
          options.sort((a, b) => {
            const byLane = a.laneName.localeCompare(b.laneName, 'he')
            if (byLane !== 0) return byLane
            return a.slotIndex - b.slotIndex
          })

          return (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-4">
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md animate-fade-up rounded-2xl border border-line bg-card p-4 shadow-xl sm:p-5"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-brand/10 text-brand">
                      <ArrowLeftRight className="size-4" />
                    </span>
                    <div>
                      <h3 className="font-display text-base font-bold text-ink">
                        החלפה בין נתיבים
                      </h3>
                      <p className="text-xs text-ink-soft">
                        {lane.name} · {current?.fullName ?? '—'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSwapTarget(null)}
                    className="rounded-lg p-1.5 text-ink-soft hover:bg-surface"
                    aria-label="סגור"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <p className="mb-3 text-xs text-ink-soft">
                  בחרו נתיב להחלפה ישירה — הבודקים יחליפו מקומות
                </p>
                {options.length === 0 ? (
                  <p className="rounded-xl bg-surface px-3 py-3 text-sm text-ink-soft">
                    אין כרגע בודקים משובצים בנתיבים אחרים להחלפה.
                  </p>
                ) : (
                  <ul className="max-h-72 space-y-1.5 overflow-y-auto">
                    {options.map((opt) => (
                      <li key={`${opt.laneId}-${opt.slotIndex}`}>
                        <button
                          type="button"
                          onClick={() => {
                            swapAssignments(
                              {
                                laneId: swapTarget.laneId,
                                slotIndex: swapTarget.slotIndex,
                              },
                              {
                                laneId: opt.laneId,
                                slotIndex: opt.slotIndex,
                              },
                            )
                            setSwapTarget(null)
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-right transition hover:border-brand hover:bg-brand/5"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-ink">
                              {opt.laneName}
                              <span className="mx-1.5 font-normal text-ink-soft">·</span>
                              {opt.workerName}
                            </span>
                            {(opt.lacksCertHere || opt.currentLacksThere) && (
                              <span className="mt-0.5 block text-[10px] font-medium text-warn">
                                {opt.lacksCertHere && opt.currentLacksThere
                                  ? 'שימו לב: לשני הבודקים חסרה הסמכה מלאה אחרי ההחלפה'
                                  : opt.lacksCertHere
                                    ? `שימו לב: ל${opt.workerName} חסרה הסמכה מלאה ל${lane.name}`
                                    : `שימו לב: ל${current?.fullName ?? 'הבודק'} חסרה הסמכה מלאה ל${opt.laneName}`}
                              </span>
                            )}
                          </span>
                          <ArrowLeftRight className="size-3.5 shrink-0 text-brand" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })()}

      {extraFlow !== 'closed' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md animate-fade-up rounded-2xl border border-line bg-card p-4 shadow-xl sm:p-5"
          >
            <div className="mb-2.5 flex items-start justify-between gap-3 sm:mb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent sm:size-9">
                  <UserPlus className="size-4 sm:size-5" />
                </span>
                <h3 className="font-display text-base font-bold text-ink sm:text-lg">
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
                <p className="text-xs leading-relaxed text-ink-soft sm:text-sm">
                  יש יותר בודקים ({draft.presentWorkerIds.length}) ממספר הנתיבים
                  שנבחרו ({draft.activeLaneIds.length}), ונותרו{' '}
                  {draft.unassignedWorkerIds.length} שלא שובצו.
                  <br />
                  האם תרצה להוסיף בודק לעמדה נוספת?
                </p>
                <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
                  <button
                    type="button"
                    onClick={() => setExtraFlow('pick')}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3.5 py-2 text-xs font-bold text-white sm:px-4 sm:py-2.5 sm:text-sm"
                  >
                    כן, הוסף לעמדה
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtraFlow('closed')}
                    className="rounded-xl px-3.5 py-2 text-xs font-medium text-ink-soft hover:bg-surface sm:px-4 sm:py-2.5 sm:text-sm"
                  >
                    לא תודה
                  </button>
                </div>
              </>
            )}

            {extraFlow === 'pick' && (
              <>
                <p className="mb-3 text-xs text-ink-soft sm:mb-4 sm:text-sm">
                  בחר נתיב ובודק להוספה מעבר לתקן העמדה
                </p>
                <div className="space-y-3">
                  <label className="block text-xs sm:text-sm">
                    <span className="mb-1 block text-ink-soft">עמדה / נתיב</span>
                    <select
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs sm:py-2.5 sm:text-sm"
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
                  <label className="block text-xs sm:text-sm">
                    <span className="mb-1 block text-ink-soft">בודק להוספה</span>
                    <select
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs sm:py-2.5 sm:text-sm"
                      value={pickWorkerId}
                      onChange={(e) => setPickWorkerId(e.target.value)}
                    >
                      <option value="">— בחר בודק —</option>
                      {unassignedWorkers.map(
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
                        <p className="text-[11px] text-warn sm:text-xs">
                          שימו לב: לבודק זה חסרה הסמכה מלאה לנתיב שנבחר.
                        </p>
                      ) : null
                    })()}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 sm:mt-5">
                  <button
                    type="button"
                    disabled={!pickLaneId || !pickWorkerId}
                    onClick={confirmExtraAdd}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
                  >
                    <UserPlus className="size-3.5 sm:size-4" />
                    הוסף לשיבוץ
                  </button>
                  <button
                    type="button"
                    onClick={() => setExtraFlow('closed')}
                    className="rounded-xl px-3.5 py-2 text-xs font-medium text-ink-soft hover:bg-surface sm:px-4 sm:py-2.5 sm:text-sm"
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
