import {
  countsAsDayEasy,
  effectiveIntensityScore,
  INTENSITY_LABELS,
  SHIFT_TYPE_LABELS,
} from './constants'
import type {
  Intensity,
  Lane,
  LaneAssignment,
  ShiftSchedule,
  ShiftType,
  Worker,
} from './types'

/** Why a specific worker was placed on a specific lane */
export interface PlacementExplanation {
  laneId: string
  workerId: string
  /** Hebrew bullet reasons grounded in the ranking math */
  reasons: string[]
}

export interface AssignmentResult {
  assignments: LaneAssignment[]
  unassignedWorkerIds: string[]
  understaffedLaneIds: string[]
  warnings: string[]
  /** Per placement rationale (lane fill order + worker ranking) */
  explanations: PlacementExplanation[]
}

export interface AssignmentContext {
  date: string
  shiftType: ShiftType
  /** Calendar days of history to consider (default 14) */
  lookbackDays?: number
}

export interface WorkerLaneStats {
  workerId: string
  /** laneId → times assigned */
  byLane: Record<string, number>
  hardCount: number
  mediumCount: number
  /** Raw easy lane placements (includes night easy) */
  easyCount: number
  /** Easy only on morning/afternoon — real "rest" credit */
  dayEasyCount: number
  /** Easy placements on night (not treated as rest) */
  nightEasyCount: number
  /** Weighted load (night × multiplier; night-easy ≈ medium) */
  effectiveLoad: number
  hardByShift: Record<ShiftType, number>
  totalAssignments: number
}

const DEFAULT_LOOKBACK_DAYS = 14

const EMPTY_HARD_BY_SHIFT: Record<ShiftType, number> = {
  morning: 0,
  afternoon: 0,
  night: 0,
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Local calendar date distance (avoids UTC off-by-one) */
function daysBetweenLocal(earlier: string, later: string): number {
  const [ey, em, ed] = earlier.split('-').map(Number)
  const [ly, lm, ld] = later.split('-').map(Number)
  if (!ey || !em || !ed || !ly || !lm || !ld) return Number.POSITIVE_INFINITY
  const a = Date.UTC(ey, em - 1, ed)
  const b = Date.UTC(ly, lm - 1, ld)
  return Math.floor((b - a) / (24 * 60 * 60 * 1000))
}

/** History strictly before current date, within lookback window, newest first */
export function filterRelevantHistory(
  history: ShiftSchedule[],
  currentDate: string,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
): ShiftSchedule[] {
  return history
    .filter((h) => {
      if (h.date >= currentDate) return false
      return daysBetweenLocal(h.date, currentDate) <= lookbackDays
    })
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date)
      return b.createdAt.localeCompare(a.createdAt)
    })
}

/** Worker must hold every required certification for the lane */
export function isQualified(worker: Worker, lane: Lane): boolean {
  if (lane.requiredCertifications.length === 0) return true
  return lane.requiredCertifications.every((c) => worker.certifications.includes(c))
}

interface WorkerHistoryProfile {
  /** Effective load across all shifts */
  load: number
  /** Effective load only in the current shift type */
  loadInSameShiftType: number
  hardCount: number
  hardInSameShiftType: number
  /** Easy credit only morning/afternoon */
  dayEasyCount: number
  dayEasyInSameShiftType: number
  laneCounts: Map<string, number>
  lastLaneIds: Set<string>
  laneRecency: Map<string, number>
  lastWasHard: boolean
  lastShiftType: ShiftType | null
  shiftsSeen: number
}

function buildWorkerProfile(
  workerId: string,
  history: ShiftSchedule[],
  lanes: Lane[],
  currentShiftType: ShiftType,
): WorkerHistoryProfile {
  const laneMap = new Map(lanes.map((l) => [l.id, l]))
  const profile: WorkerHistoryProfile = {
    load: 0,
    loadInSameShiftType: 0,
    hardCount: 0,
    hardInSameShiftType: 0,
    dayEasyCount: 0,
    dayEasyInSameShiftType: 0,
    laneCounts: new Map(),
    lastLaneIds: new Set(),
    laneRecency: new Map(),
    lastWasHard: false,
    lastShiftType: null,
    shiftsSeen: 0,
  }

  let capturedLastShift = false

  history.forEach((shift, shiftIndex) => {
    const placements: Lane[] = []
    for (const assignment of shift.assignments) {
      if (!assignment.workerIds.includes(workerId)) continue
      const lane = laneMap.get(assignment.laneId)
      if (!lane) continue
      placements.push(lane)
      profile.laneCounts.set(lane.id, (profile.laneCounts.get(lane.id) ?? 0) + 1)
      if (!profile.laneRecency.has(lane.id)) {
        profile.laneRecency.set(lane.id, shiftIndex)
      }

      const points = effectiveIntensityScore(lane.intensity, shift.shiftType)
      profile.load += points
      if (shift.shiftType === currentShiftType) {
        profile.loadInSameShiftType += points
      }

      if (lane.intensity === 'hard') {
        profile.hardCount += 1
        if (shift.shiftType === currentShiftType) {
          profile.hardInSameShiftType += 1
        }
      }

      if (countsAsDayEasy(lane.intensity, shift.shiftType)) {
        profile.dayEasyCount += 1
        if (shift.shiftType === currentShiftType) {
          profile.dayEasyInSameShiftType += 1
        }
      }
    }

    if (placements.length === 0) return

    profile.shiftsSeen += 1
    if (!capturedLastShift) {
      profile.lastShiftType = shift.shiftType
      for (const lane of placements) {
        profile.lastLaneIds.add(lane.id)
        if (lane.intensity === 'hard') profile.lastWasHard = true
      }
      capturedLastShift = true
    }
  })

  return profile
}

/** Most recent placement was a night shift → next shift should avoid hard */
function cameFromNight(profile: WorkerHistoryProfile): boolean {
  return profile.lastShiftType === 'night'
}

export function computeWorkerLoad(
  workerId: string,
  history: ShiftSchedule[],
  lanes: Lane[],
  lookbackShifts = 8,
): number {
  const laneMap = new Map(lanes.map((l) => [l.id, l]))
  let load = 0
  let counted = 0

  for (const shift of history) {
    if (counted >= lookbackShifts) break
    let placed = false
    for (const assignment of shift.assignments) {
      if (!assignment.workerIds.includes(workerId)) continue
      const lane = laneMap.get(assignment.laneId)
      if (!lane) continue
      load += effectiveIntensityScore(lane.intensity, shift.shiftType)
      placed = true
    }
    if (placed) counted += 1
  }
  return load
}

/** Same-day morning shift context for afternoon handoff lanes */
export interface SameDayMorningContext {
  found: boolean
  morningWorkerIds: Set<string>
  workersByLane: Map<string, Set<string>>
  lanesByWorker: Map<string, Set<string>>
}

export function buildSameDayMorningContext(
  history: ShiftSchedule[],
  date: string,
): SameDayMorningContext {
  const mornings = history
    .filter((h) => h.date === date && h.shiftType === 'morning')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const morning = mornings[0]
  const morningWorkerIds = new Set<string>()
  const workersByLane = new Map<string, Set<string>>()
  const lanesByWorker = new Map<string, Set<string>>()

  if (!morning) {
    return { found: false, morningWorkerIds, workersByLane, lanesByWorker }
  }

  for (const id of morning.presentWorkerIds ?? []) morningWorkerIds.add(id)

  for (const assignment of morning.assignments ?? []) {
    const set = workersByLane.get(assignment.laneId) ?? new Set()
    for (const wid of assignment.workerIds) {
      if (!wid) continue
      morningWorkerIds.add(wid)
      set.add(wid)
      const lanes = lanesByWorker.get(wid) ?? new Set()
      lanes.add(assignment.laneId)
      lanesByWorker.set(wid, lanes)
    }
    workersByLane.set(assignment.laneId, set)
  }

  return { found: true, morningWorkerIds, workersByLane, lanesByWorker }
}

/**
 * Afternoon handoff priority (lower = better):
 * 0 — arrives only for afternoon
 * 1 — long shift, was on THIS handoff lane in the morning
 * 2 — long shift, other morning continuer
 */
export function afternoonHandoffTier(
  workerId: string,
  laneId: string,
  morning: SameDayMorningContext | null,
): number {
  if (!morning?.found) return 0
  if (!morning.morningWorkerIds.has(workerId)) return 0
  if (morning.workersByLane.get(laneId)?.has(workerId)) return 1
  return 2
}

function versatility(worker: Worker, otherOpenLanes: Lane[]): number {
  return otherOpenLanes.filter((l) => isQualified(worker, l)).length
}

function compareForLane(
  a: Worker,
  b: Worker,
  lane: Lane,
  profiles: Map<string, WorkerHistoryProfile>,
  otherOpen: Lane[],
  currentShiftType: ShiftType,
  morning: SameDayMorningContext | null,
): number {
  const va = versatility(a, otherOpen)
  const vb = versatility(b, otherOpen)
  if (va !== vb) return va - vb

  const pa = profiles.get(a.id)!
  const pb = profiles.get(b.id)!

  if (lane.afternoonHandoff && currentShiftType === 'afternoon') {
    const ta = afternoonHandoffTier(a.id, lane.id, morning)
    const tb = afternoonHandoffTier(b.id, lane.id, morning)
    if (ta !== tb) return ta - tb
  }

  // After night: strongly prefer easy, strongly avoid hard
  const aNight = cameFromNight(pa) ? 1 : 0
  const bNight = cameFromNight(pb) ? 1 : 0
  if (aNight !== bNight) {
    if (lane.intensity === 'hard') return aNight - bNight
    if (lane.intensity === 'easy') return bNight - aNight
    // medium: mild preference for recovering from night
    return bNight - aNight
  }

  const aWasLastHere = pa.lastLaneIds.has(lane.id) ? 1 : 0
  const bWasLastHere = pb.lastLaneIds.has(lane.id) ? 1 : 0
  if (aWasLastHere !== bWasLastHere) return aWasLastHere - bWasLastHere

  const aTimes = pa.laneCounts.get(lane.id) ?? 0
  const bTimes = pb.laneCounts.get(lane.id) ?? 0
  if (aTimes !== bTimes) return aTimes - bTimes

  const aRecency = pa.laneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
  const bRecency = pb.laneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
  if (aRecency !== bRecency) return bRecency - aRecency

  if (lane.intensity === 'hard') {
    if (pa.lastWasHard !== pb.lastWasHard) {
      return (pa.lastWasHard ? 1 : 0) - (pb.lastWasHard ? 1 : 0)
    }
    if (pa.hardInSameShiftType !== pb.hardInSameShiftType) {
      return pa.hardInSameShiftType - pb.hardInSameShiftType
    }
    if (pa.hardCount !== pb.hardCount) return pa.hardCount - pb.hardCount
    if (pa.loadInSameShiftType !== pb.loadInSameShiftType) {
      return pa.loadInSameShiftType - pb.loadInSameShiftType
    }
    if (pa.load !== pb.load) return pa.load - pb.load
  } else if (lane.intensity === 'easy') {
    // Prefer those with more hard / load and fewer day-easy credits
    if (pa.lastWasHard !== pb.lastWasHard) {
      return (pb.lastWasHard ? 1 : 0) - (pa.lastWasHard ? 1 : 0)
    }
    if (pa.dayEasyInSameShiftType !== pb.dayEasyInSameShiftType) {
      return pa.dayEasyInSameShiftType - pb.dayEasyInSameShiftType
    }
    if (pa.dayEasyCount !== pb.dayEasyCount) {
      return pa.dayEasyCount - pb.dayEasyCount
    }
    if (pa.hardCount !== pb.hardCount) return pb.hardCount - pa.hardCount
    if (pa.loadInSameShiftType !== pb.loadInSameShiftType) {
      return pb.loadInSameShiftType - pa.loadInSameShiftType
    }
    if (pa.load !== pb.load) return pb.load - pa.load
  } else {
    if (pa.hardInSameShiftType !== pb.hardInSameShiftType) {
      return pa.hardInSameShiftType - pb.hardInSameShiftType
    }
    if (pa.hardCount !== pb.hardCount) return pa.hardCount - pb.hardCount
    if (pa.loadInSameShiftType !== pb.loadInSameShiftType) {
      return pa.loadInSameShiftType - pb.loadInSameShiftType
    }
    if (pa.load !== pb.load) return pa.load - pb.load
  }

  return 0
}

function fmtLoad(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

/** Why this lane is filled before other remaining lanes */
function explainLanePriority(
  lane: Lane,
  orderedLanes: Lane[],
  laneIndex: number,
  presentWorkers: Worker[],
  currentShiftType: ShiftType,
): string {
  const parts: string[] = []
  parts.push(
    `סדר מילוי: נתיב #${laneIndex + 1} מתוך ${orderedLanes.length} (קודם ממלאים נדירים/קשים)`,
  )

  if (currentShiftType === 'afternoon' && lane.afternoonHandoff) {
    parts.push('עדיפות החלפת צהריים (מכס)')
  }
  if (lane.requiredCertifications.length > 0) {
    parts.push(
      `דורש הסמכות (${lane.requiredCertifications.join(', ')}) — לפני נתיבים פתוחים`,
    )
  } else {
    parts.push('נתיב פתוח (ללא הסמכה חובה)')
  }

  const qualified = presentWorkers.filter((w) => isQualified(w, lane)).length
  parts.push(
    `${qualified} מוסמכים מבין הנוכחים · עצימות ${INTENSITY_LABELS[lane.intensity]} · תקן ${lane.staffingStandard}`,
  )
  return parts.join(' · ')
}

function handoffTierLabel(tier: number): string {
  if (tier === 0) return 'מגיע לצהריים בלבד (עדיפות מחליף)'
  if (tier === 1) return 'ממשיך משמרת ארוכה — היה באותו נתיב בבוקר'
  return 'ממשיך משמרת ארוכה — היה בנתיב אחר בבוקר'
}

/**
 * Build Hebrew reasons for why `worker` ranked at `rank` among candidates for this lane.
 */
function buildPlacementReasons(
  worker: Worker,
  lane: Lane,
  ranked: Worker[],
  rank: number,
  profiles: Map<string, WorkerHistoryProfile>,
  otherOpen: Lane[],
  currentShiftType: ShiftType,
  morning: SameDayMorningContext | null,
  poolSize: number,
  lanePriorityNote: string,
): string[] {
  const reasons: string[] = []
  const p = profiles.get(worker.id)!
  const intensityHe = INTENSITY_LABELS[lane.intensity]

  reasons.push(lanePriorityNote)

  if (lane.requiredCertifications.length > 0) {
    reasons.push(
      `מוסמך לנתיב (נדרש: ${lane.requiredCertifications.join(', ')}) — מתוך ${poolSize} מועמדים פנויים`,
    )
  } else {
    reasons.push(`נבחר מתוך ${poolSize} מועמדים פנויים לנתיב הפתוח`)
  }

  if (rank === 0) {
    reasons.push('דורג ראשון בין המועמדים לפי כללי האיזון')
  } else {
    reasons.push(`דורג #${rank + 1} בין המועמדים (אחרי שמילאו את התקן הראשון)`)
  }

  const flex = versatility(worker, otherOpen)
  if (otherOpen.length > 0) {
    reasons.push(
      `גמישות לנתיבים שנותרו: מוסמך ל-${flex} מתוך ${otherOpen.length} — מעדיפים לשמור גמישים לנתיבים הבאים`,
    )
  }

  if (lane.afternoonHandoff && currentShiftType === 'afternoon' && morning?.found) {
    const tier = afternoonHandoffTier(worker.id, lane.id, morning)
    reasons.push(`החלפת צהריים: ${handoffTierLabel(tier)}`)
  }

  if (cameFromNight(p)) {
    const lastHe = p.lastShiftType
      ? SHIFT_TYPE_LABELS[p.lastShiftType]
      : 'לילה'
    if (lane.intensity === 'hard') {
      reasons.push(
        `שיבוץ אחרון היה ${lastHe} — עדיף להימנע מקשה אחרי לילה, אך לא נמצאו מספיק מועמדים אחרים`,
      )
    } else if (lane.intensity === 'easy') {
      reasons.push(
        `שיבוץ אחרון היה ${lastHe} — עדיפות לנתיב קל להתאוששות אחרי לילה`,
      )
    } else {
      reasons.push(
        `שיבוץ אחרון היה ${lastHe} — העדפה קלה לנתיב בינוני (לא קשה) אחרי לילה`,
      )
    }
  } else if (p.lastShiftType) {
    reasons.push(
      `שיבוץ אחרון: ${SHIFT_TYPE_LABELS[p.lastShiftType]}${
        p.lastWasHard ? ' (קשה)' : ''
      }`,
    )
  }

  const timesHere = p.laneCounts.get(lane.id) ?? 0
  if (p.lastLaneIds.has(lane.id)) {
    reasons.push('היה בנתיב זה בשיבוץ האחרון — בדרך כלל נמנעים מחזרה מיידית (אין חלופה טובה יותר)')
  } else if (timesHere === 0) {
    reasons.push('לא שובץ בנתיב זה בחלון ההיסטוריה — תורמים לרוטציה')
  } else {
    const recency = p.laneRecency.get(lane.id)
    const when =
      recency === 0
        ? 'בשיבוץ האחרון לפני הנוכחי'
        : recency != null
          ? `לפני כ־${recency + 1} שיבוצים בהיסטוריה`
          : 'בעבר'
    reasons.push(`היה בנתיב זה ${timesHere} פעמים (${when}) — פחות מחזרות ממועמדים אחרים`)
  }

  if (lane.intensity === 'hard') {
    reasons.push(
      `איזון עומס לקשה: ${p.hardInSameShiftType} קשים במשמרות ${SHIFT_TYPE_LABELS[currentShiftType]}, ${p.hardCount} קשים בסך הכל, עומס משוקלל ${fmtLoad(p.load)} (מעדיפים מי שפחות נשא קשה/עומס)`,
    )
  } else if (lane.intensity === 'easy') {
    reasons.push(
      `איזון מנוחה לקל: ${p.hardCount} קשים בהיסטוריה, ${p.dayEasyCount} קרדיטי קל יום, עומס ${fmtLoad(p.load)} (מעדיפים מי שנשא יותר קשה/עומס וקיבל פחות מנוחה)`,
    )
  } else {
    reasons.push(
      `איזון לנתיב ${intensityHe}: ${p.hardInSameShiftType} קשים באותו סוג משמרת, עומס ${fmtLoad(p.loadInSameShiftType)} בסוג זה / ${fmtLoad(p.load)} כולל`,
    )
  }

  // Contrast with the next-ranked leftover candidate (if any)
  const rival = ranked[rank + 1]
  if (rival) {
    const rp = profiles.get(rival.id)!
    const diffs: string[] = []
    const va = versatility(worker, otherOpen)
    const vb = versatility(rival, otherOpen)
    if (va !== vb) {
      diffs.push(
        `גמישות נמוכה יותר (${va} מול ${vb} של ${rival.fullName})`,
      )
    }
    if (
      lane.afternoonHandoff &&
      currentShiftType === 'afternoon' &&
      morning?.found
    ) {
      const ta = afternoonHandoffTier(worker.id, lane.id, morning)
      const tb = afternoonHandoffTier(rival.id, lane.id, morning)
      if (ta !== tb) {
        diffs.push(
          `עדיפות החלפה טובה יותר מול ${rival.fullName} (${handoffTierLabel(ta)} מול ${handoffTierLabel(tb)})`,
        )
      }
    }
    const aNight = cameFromNight(p)
    const bNight = cameFromNight(rp)
    if (aNight !== bNight && lane.intensity === 'hard') {
      diffs.push(
        aNight
          ? `נבחר למרות התאוששות מלילה (אין מספיק חלופות)`
          : `לא התאושש מלילה — בניגוד ל${rival.fullName}`,
      )
    }
    if (p.lastLaneIds.has(lane.id) !== rp.lastLaneIds.has(lane.id)) {
      if (!p.lastLaneIds.has(lane.id)) {
        diffs.push(`לא חזר מיד לאותו נתיב (בניגוד ל${rival.fullName})`)
      }
    }
    const aTimes = p.laneCounts.get(lane.id) ?? 0
    const bTimes = rp.laneCounts.get(lane.id) ?? 0
    if (aTimes !== bTimes) {
      diffs.push(
        `פחות פעמים בנתיב זה (${aTimes} מול ${bTimes} של ${rival.fullName})`,
      )
    }
    if (lane.intensity === 'hard' && p.hardCount !== rp.hardCount) {
      diffs.push(
        `פחות שיבוצי קשה (${p.hardCount} מול ${rp.hardCount} של ${rival.fullName})`,
      )
    }
    if (lane.intensity === 'easy' && p.load !== rp.load) {
      diffs.push(
        `עומס גבוה יותר למילוי מנוחה (${fmtLoad(p.load)} מול ${fmtLoad(rp.load)} של ${rival.fullName})`,
      )
    }
    if (diffs.length > 0) {
      reasons.push(`לעומת המועמד הבא (${rival.fullName}): ${diffs.join('; ')}`)
    }
  }

  return reasons
}

export function runAssignmentAlgorithm(
  activeLanes: Lane[],
  presentWorkers: Worker[],
  history: ShiftSchedule[],
  allLanes: Lane[],
  ctx?: AssignmentContext,
): AssignmentResult {
  const warnings: string[] = []
  const explanations: PlacementExplanation[] = []
  const available = new Set(presentWorkers.map((w) => w.id))
  const workerById = new Map(presentWorkers.map((w) => [w.id, w]))

  const currentDate = ctx?.date ?? '9999-12-31'
  const currentShiftType = ctx?.shiftType ?? 'morning'
  const lookbackDays = ctx?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS
  const relevant = filterRelevantHistory(history, currentDate, lookbackDays)
  const morningCtx =
    currentShiftType === 'afternoon'
      ? buildSameDayMorningContext(history, currentDate)
      : null

  if (
    currentShiftType === 'afternoon' &&
    activeLanes.some((l) => l.afternoonHandoff) &&
    !morningCtx?.found
  ) {
    warnings.push(
      'אין שיבוץ בוקר שמור להיום — כללי החלפת צהריים (מכס) פועלים חלקית בלבד',
    )
  }

  const profiles = new Map<string, WorkerHistoryProfile>()
  for (const w of presentWorkers) {
    profiles.set(
      w.id,
      buildWorkerProfile(w.id, relevant, allLanes, currentShiftType),
    )
  }

  const intensityOrder: Record<Intensity, number> = { hard: 0, medium: 1, easy: 2 }

  const orderedLanes = [...activeLanes].sort((a, b) => {
    if (currentShiftType === 'afternoon') {
      const aH = a.afternoonHandoff ? 0 : 1
      const bH = b.afternoonHandoff ? 0 : 1
      if (aH !== bH) return aH - bH
    }

    const aOpen = a.requiredCertifications.length === 0 ? 1 : 0
    const bOpen = b.requiredCertifications.length === 0 ? 1 : 0
    if (aOpen !== bOpen) return aOpen - bOpen

    const qa = presentWorkers.filter((w) => isQualified(w, a)).length
    const qb = presentWorkers.filter((w) => isQualified(w, b)).length
    if (qa !== qb) return qa - qb

    if (intensityOrder[a.intensity] !== intensityOrder[b.intensity]) {
      return intensityOrder[a.intensity] - intensityOrder[b.intensity]
    }
    return b.staffingStandard - a.staffingStandard
  })

  const assignments: LaneAssignment[] = []
  const understaffedLaneIds: string[] = []
  const remainingLaneIds = new Set(orderedLanes.map((l) => l.id))

  for (let laneIndex = 0; laneIndex < orderedLanes.length; laneIndex++) {
    const lane = orderedLanes[laneIndex]!
    remainingLaneIds.delete(lane.id)
    const otherOpen = orderedLanes.filter((l) => remainingLaneIds.has(l.id))
    const lanePriorityNote = explainLanePriority(
      lane,
      orderedLanes,
      laneIndex,
      presentWorkers,
      currentShiftType,
    )

    const candidates = [...available]
      .map((id) => workerById.get(id)!)
      .filter((w) => isQualified(w, lane))

    if (candidates.length === 0) {
      assignments.push({ laneId: lane.id, workerIds: [] })
      understaffedLaneIds.push(lane.id)
      warnings.push(`אין עובדים מוסמכים לנתיב "${lane.name}"`)
      continue
    }

    // Hard after night: prefer non-night recoverees; warn if forced
    let pool = candidates
    if (lane.intensity === 'hard') {
      const rested = candidates.filter((w) => !cameFromNight(profiles.get(w.id)!))
      if (rested.length >= lane.staffingStandard) {
        pool = rested
      } else if (rested.length > 0 && rested.length < candidates.length) {
        // Prefer rested first by sorting; still allow night recoverees if needed
        pool = candidates
      }
    }

    const ranked = shuffle(pool).sort((a, b) =>
      compareForLane(
        a,
        b,
        lane,
        profiles,
        otherOpen,
        currentShiftType,
        morningCtx,
      ),
    )

    const needed = lane.staffingStandard
    const pickedWorkers = ranked.slice(0, needed)
    const picked = pickedWorkers.map((w) => w.id)

    for (const id of picked) available.delete(id)

    assignments.push({ laneId: lane.id, workerIds: picked })

    pickedWorkers.forEach((worker, rank) => {
      explanations.push({
        laneId: lane.id,
        workerId: worker.id,
        reasons: buildPlacementReasons(
          worker,
          lane,
          ranked,
          rank,
          profiles,
          otherOpen,
          currentShiftType,
          morningCtx,
          pool.length,
          lanePriorityNote,
        ),
      })
    })

    if (lane.intensity === 'hard') {
      for (const id of picked) {
        const name = workerById.get(id)?.fullName ?? id
        if (cameFromNight(profiles.get(id)!)) {
          warnings.push(
            `אחרי לילה → קשה: "${name}" שובץ בנתיב "${lane.name}" (אין מספיק מועמדים אחרים)`,
          )
        }
      }
    }

    if (
      lane.afternoonHandoff &&
      currentShiftType === 'afternoon' &&
      morningCtx?.found
    ) {
      for (const id of picked) {
        const tier = afternoonHandoffTier(id, lane.id, morningCtx)
        if (tier === 1) {
          warnings.push(
            `נתיב "${lane.name}" — ממשיך מבוקר (היה שם בבוקר); לא נמצא מחליף צהריים`,
          )
        } else if (tier === 2) {
          warnings.push(
            `נתיב "${lane.name}" — מולא ע״י ממשיך משמרת ארוכה אחר (אין מחליף צהריים / איש הבוקר לא ממשיך)`,
          )
        }
      }
    }

    if (picked.length < needed) {
      understaffedLaneIds.push(lane.id)
      warnings.push(
        `נתיב "${lane.name}" דורש ${needed} בודקים מוסמכים, שובצו ${picked.length}`,
      )
    }
  }

  const unassigned = [...available]
  const unassignedWorkers = unassigned.map((id) => workerById.get(id)!)
  const emptyLanes = assignments.filter((a) => a.workerIds.length === 0)
  if (emptyLanes.length > 0 && unassignedWorkers.length > 0) {
    for (const a of emptyLanes) {
      const lane = activeLanes.find((l) => l.id === a.laneId)
      if (!lane) continue
      const anyMatch = unassignedWorkers.some((w) => isQualified(w, lane))
      if (!anyMatch) {
        warnings.push(
          `נתיב "${lane.name}" נשאר ריק — לנוכחים הנותרים אין את ההסמכות הנדרשות`,
        )
      }
    }
  }

  return {
    assignments,
    unassignedWorkerIds: unassigned,
    understaffedLaneIds,
    warnings: [...new Set(warnings)],
    explanations,
  }
}

export function computeWorkerLaneStats(
  workers: Worker[],
  lanes: Lane[],
  history: ShiftSchedule[],
  options?: { fromDate?: string; toDate?: string },
): WorkerLaneStats[] {
  const laneMap = new Map(lanes.map((l) => [l.id, l]))
  const filtered = history.filter((h) => {
    if (options?.fromDate && h.date < options.fromDate) return false
    if (options?.toDate && h.date > options.toDate) return false
    return true
  })

  return workers.map((w) => {
    const byLane: Record<string, number> = {}
    for (const lane of lanes) byLane[lane.id] = 0

    let hardCount = 0
    let mediumCount = 0
    let easyCount = 0
    let dayEasyCount = 0
    let nightEasyCount = 0
    let effectiveLoad = 0
    let totalAssignments = 0
    const hardByShift: Record<ShiftType, number> = { ...EMPTY_HARD_BY_SHIFT }

    for (const shift of filtered) {
      for (const assignment of shift.assignments) {
        if (!assignment.workerIds.includes(w.id)) continue
        byLane[assignment.laneId] = (byLane[assignment.laneId] ?? 0) + 1
        totalAssignments += 1
        const lane = laneMap.get(assignment.laneId)
        if (!lane) continue

        effectiveLoad += effectiveIntensityScore(lane.intensity, shift.shiftType)

        if (lane.intensity === 'hard') {
          hardCount += 1
          hardByShift[shift.shiftType] += 1
        } else if (lane.intensity === 'medium') {
          mediumCount += 1
        } else {
          easyCount += 1
          if (shift.shiftType === 'night') nightEasyCount += 1
          else dayEasyCount += 1
        }
      }
    }

    return {
      workerId: w.id,
      byLane,
      hardCount,
      mediumCount,
      easyCount,
      dayEasyCount,
      nightEasyCount,
      effectiveLoad: Math.round(effectiveLoad * 10) / 10,
      hardByShift,
      totalAssignments,
    }
  })
}
