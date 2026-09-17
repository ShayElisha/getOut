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
/** Station rotation always looks at least this many calendar days (morning/afternoon only). */
const ROTATION_LOOKBACK_DAYS = 14

function isDayShift(shiftType: ShiftType): boolean {
  return shiftType === 'morning' || shiftType === 'afternoon'
}

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
  /**
   * Station rotation (key rule): morning/afternoon only over ≥14 days.
   * Night placements are ignored for rotation.
   */
  rotationLaneCounts: Map<string, number>
  /** Lower index = more recent day-shift placement on that lane */
  rotationLaneRecency: Map<string, number>
  /** Lanes from most recent morning/afternoon placement */
  lastDayLaneIds: Set<string>
  /**
   * Lanes held on the previous calendar day (any morning/afternoon).
   * Hard rotation: same station day-after-day is forbidden when alternatives exist.
   */
  prevCalendarDayLaneIds: Set<string>
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
  currentDate: string,
): WorkerHistoryProfile {
  const laneMap = new Map(lanes.map((l) => [l.id, l]))
  const prevDate = previousLocalDate(currentDate)
  const profile: WorkerHistoryProfile = {
    load: 0,
    loadInSameShiftType: 0,
    hardCount: 0,
    hardInSameShiftType: 0,
    dayEasyCount: 0,
    dayEasyInSameShiftType: 0,
    laneCounts: new Map(),
    lastLaneIds: new Set(),
    rotationLaneCounts: new Map(),
    rotationLaneRecency: new Map(),
    lastDayLaneIds: new Set(),
    prevCalendarDayLaneIds: new Set(),
    laneRecency: new Map(),
    lastWasHard: false,
    lastShiftType: null,
    shiftsSeen: 0,
  }

  let capturedLastShift = false
  let capturedLastDayShift = false
  let dayShiftIndex = 0

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

      if (prevDate && shift.date === prevDate && isDayShift(shift.shiftType)) {
        profile.prevCalendarDayLaneIds.add(lane.id)
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

    // Rotation: day shifts only (night does not count toward station history)
    if (isDayShift(shift.shiftType)) {
      for (const lane of placements) {
        profile.rotationLaneCounts.set(
          lane.id,
          (profile.rotationLaneCounts.get(lane.id) ?? 0) + 1,
        )
        if (!profile.rotationLaneRecency.has(lane.id)) {
          profile.rotationLaneRecency.set(lane.id, dayShiftIndex)
        }
      }
      if (!capturedLastDayShift) {
        for (const lane of placements) {
          profile.lastDayLaneIds.add(lane.id)
        }
        capturedLastDayShift = true
      }
      dayShiftIndex += 1
    }
  })

  return profile
}

/** Calendar date minus one local day (YYYY-MM-DD). */
export function previousLocalDate(isoDate: string): string | null {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() - 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function workerAssignedOnShift(
  workerId: string,
  shift: ShiftSchedule,
): boolean {
  if (shift.presentWorkerIds?.includes(workerId)) return true
  return (shift.assignments ?? []).some((a) => a.workerIds.includes(workerId))
}

/**
 * Night recovery applies only on the afternoon of the calendar day after a night shift.
 * Night dated D (starts evening D) → recovery window = afternoon of D+1.
 */
export function needsAfternoonNightRecovery(
  workerId: string,
  history: ShiftSchedule[],
  currentDate: string,
  currentShiftType: ShiftType,
): boolean {
  if (currentShiftType !== 'afternoon') return false
  const nightDate = previousLocalDate(currentDate)
  if (!nightDate) return false
  return history.some(
    (h) =>
      h.date === nightDate &&
      h.shiftType === 'night' &&
      workerAssignedOnShift(workerId, h),
  )
}

/** Only treat versatility as decisive when the gap is at least this many open lanes. */
const VERSATILITY_MIN_GAP = 2

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

function easyStaffingRemaining(otherOpen: Lane[]): number {
  return otherOpen
    .filter((l) => l.intensity === 'easy')
    .reduce((n, l) => n + l.staffingStandard, 0)
}

/**
 * Ranking for a lane (lower = better). Order is intentional and stable:
 * 1) afternoon handoff
 * 2) KEY — no same station day-after-day; prefer never / longest-ago (day shifts only)
 * 3) night→afternoon recovery (day after night only)
 * 4) load / hard balance by intensity
 * 5) versatility only if gap ≥ VERSATILITY_MIN_GAP
 */
function compareForLane(
  a: Worker,
  b: Worker,
  lane: Lane,
  profiles: Map<string, WorkerHistoryProfile>,
  otherOpen: Lane[],
  currentShiftType: ShiftType,
  morning: SameDayMorningContext | null,
  recoveringIds: Set<string>,
): number {
  const pa = profiles.get(a.id)!
  const pb = profiles.get(b.id)!

  if (lane.afternoonHandoff && currentShiftType === 'afternoon') {
    const ta = afternoonHandoffTier(a.id, lane.id, morning)
    const tb = afternoonHandoffTier(b.id, lane.id, morning)
    if (ta !== tb) return ta - tb
  }

  // Station rotation is a key rule for morning/afternoon only (not night).
  if (isDayShift(currentShiftType)) {
    // 1) Never same station calendar-day after day
    const aPrevDay = pa.prevCalendarDayLaneIds.has(lane.id) ? 1 : 0
    const bPrevDay = pb.prevCalendarDayLaneIds.has(lane.id) ? 1 : 0
    if (aPrevDay !== bPrevDay) return aPrevDay - bPrevDay

    // 2) Prefer never been on this station in the 14-day day-shift window
    const aRot = pa.rotationLaneCounts.get(lane.id) ?? 0
    const bRot = pb.rotationLaneCounts.get(lane.id) ?? 0
    const aNever = aRot === 0 ? 0 : 1
    const bNever = bRot === 0 ? 0 : 1
    if (aNever !== bNever) return aNever - bNever

    // 3) Prefer who was there longest ago (highest recency index = older)
    const aRotRec = pa.rotationLaneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
    const bRotRec = pb.rotationLaneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
    if (aRotRec !== bRotRec) return bRotRec - aRotRec

    // 4) Prefer fewer visits in the window
    if (aRot !== bRot) return aRot - bRot

    // 5) Avoid if this was their most recent day-shift station
    const aDayLast = pa.lastDayLaneIds.has(lane.id) ? 1 : 0
    const bDayLast = pb.lastDayLaneIds.has(lane.id) ? 1 : 0
    if (aDayLast !== bDayLast) return aDayLast - bDayLast
  }

  const aRec = recoveringIds.has(a.id) ? 1 : 0
  const bRec = recoveringIds.has(b.id) ? 1 : 0
  if (aRec !== bRec) {
    if (lane.intensity === 'hard') return aRec - bRec
    if (lane.intensity === 'easy') return bRec - aRec
    const easyLeft = easyStaffingRemaining(otherOpen)
    if (easyLeft > 0) return aRec - bRec
    return bRec - aRec
  }

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

  const va = versatility(a, otherOpen)
  const vb = versatility(b, otherOpen)
  if (Math.abs(va - vb) >= VERSATILITY_MIN_GAP) return va - vb

  return 0
}

/**
 * Station rotation pool (morning/afternoon only):
 * 1) Hard: no same station day-after-day if any other candidate exists
 * 2) Prefer never been in 14-day day-shift window
 * 3) Else fewest visits, then longest ago on that station
 */
function applyStationRotationPool(
  pool: Worker[],
  lane: Lane,
  profiles: Map<string, WorkerHistoryProfile>,
  staffingStandard: number,
  currentShiftType: ShiftType,
): Worker[] {
  if (!isDayShift(currentShiftType)) return pool

  const notPrevDay = pool.filter(
    (w) => !profiles.get(w.id)!.prevCalendarDayLaneIds.has(lane.id),
  )
  if (notPrevDay.length > 0) {
    pool = notPrevDay
  }

  const neverHere = pool.filter(
    (w) => (profiles.get(w.id)!.rotationLaneCounts.get(lane.id) ?? 0) === 0,
  )
  if (neverHere.length >= staffingStandard) {
    return neverHere
  }

  const minCount = Math.min(
    ...pool.map((w) => profiles.get(w.id)!.rotationLaneCounts.get(lane.id) ?? 0),
  )
  const atMin = pool.filter(
    (w) => (profiles.get(w.id)!.rotationLaneCounts.get(lane.id) ?? 0) === minCount,
  )
  if (atMin.length < staffingStandard) return pool

  const finiteRec = atMin
    .map((w) => profiles.get(w.id)!.rotationLaneRecency.get(lane.id))
    .filter((r): r is number => r != null && Number.isFinite(r))
  if (finiteRec.length === 0) return atMin

  const oldestRec = Math.max(...finiteRec)
  const oldest = atMin.filter(
    (w) => profiles.get(w.id)!.rotationLaneRecency.get(lane.id) === oldestRec,
  )
  return oldest.length >= staffingStandard ? oldest : atMin
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
  recoveringIds: Set<string>,
): string[] {
  const reasons: string[] = []
  const p = profiles.get(worker.id)!
  const intensityHe = INTENSITY_LABELS[lane.intensity]
  const recovering = recoveringIds.has(worker.id)

  reasons.push(lanePriorityNote)

  if (poolSize <= 1) {
    reasons.push('מועמד יחיד פנוי לנתיב — שיבוץ שיורי (אין בחירה בין מועמדים)')
  } else if (lane.requiredCertifications.length > 0) {
    reasons.push(
      `מוסמך לנתיב (נדרש: ${lane.requiredCertifications.join(', ')}) — מתוך ${poolSize} מועמדים פנויים`,
    )
  } else {
    reasons.push(`נבחר מתוך ${poolSize} מועמדים פנויים לנתיב הפתוח`)
  }

  if (lane.afternoonHandoff && currentShiftType === 'afternoon' && morning?.found) {
    const tier = afternoonHandoffTier(worker.id, lane.id, morning)
    reasons.push(`החלפת צהריים: ${handoffTierLabel(tier)}`)
  }

  if (recovering) {
    if (lane.intensity === 'hard') {
      reasons.push(
        'התאוששות מלילה (צהריים ביום שאחרי לילה) — עדיף להימנע מקשה, אך לא נמצאו מספיק מועמדים אחרים',
      )
    } else if (lane.intensity === 'easy') {
      reasons.push(
        'התאוששות מלילה (צהריים ביום שאחרי לילה) — עדיפות לנתיב קל',
      )
    } else {
      const easyLeft = easyStaffingRemaining(otherOpen)
      reasons.push(
        easyLeft > 0
          ? 'התאוששות מלילה — נשמר לנתיב קל שנותר; שובץ לבינוני רק אם לא הייתה חלופה'
          : 'התאוששות מלילה — אין נתיב קל שנותר; בינוני עדיף על קשה',
      )
    }
  } else if (p.lastShiftType) {
    reasons.push(
      `שיבוץ אחרון: ${SHIFT_TYPE_LABELS[p.lastShiftType]}${
        p.lastWasHard ? ' (קשה)' : ''
      }`,
    )
  }

  const rotTimes = p.rotationLaneCounts.get(lane.id) ?? 0
  if (isDayShift(currentShiftType)) {
    if (p.prevCalendarDayLaneIds.has(lane.id)) {
      reasons.push(
        `רוטציה קשיחה: הייתה בעמדה זו אתמול (בוקר/צהריים) — נמנעים מיום אחרי יום; שובצה רק כי אין חלופה`,
      )
    } else if (rotTimes === 0) {
      reasons.push(
        `רוטציה (בוקר/צהריים, ${ROTATION_LOOKBACK_DAYS} יום, ללא לילה): לא הייתה בעמדה זו כלל — עדיפות גבוהה`,
      )
    } else {
      const rec = p.rotationLaneRecency.get(lane.id)
      reasons.push(
        `רוטציה (בוקר/צהריים, ${ROTATION_LOOKBACK_DAYS} יום, ללא לילה): ${rotTimes} פעמים בעמדה; מעדיפים מי שלא היה / שהיה הכי מזמן`,
      )
      if (rec != null) {
        reasons.push(`מיקום אחרון בעמדה זו לפני כ־${rec + 1} משמרות יום בהיסטוריה`)
      }
    }
  } else if (p.lastLaneIds.has(lane.id)) {
    reasons.push('שיבוץ לילה — רוטציית עמדות ל־14 יום לא חלה; היה בנתיב בשיבוץ האחרון')
  }

  if (lane.intensity === 'hard') {
    reasons.push(
      `איזון עומס לקשה: ${p.hardCount} קשים בסך הכל, עומס משוקלל ${fmtLoad(p.load)}`,
    )
  } else if (lane.intensity === 'easy') {
    reasons.push(
      `איזון מנוחה לקל: ${p.hardCount} קשים בהיסטוריה, עומס ${fmtLoad(p.load)}`,
    )
  } else {
    reasons.push(
      `איזון לנתיב ${intensityHe}: עומס ${fmtLoad(p.loadInSameShiftType)} בסוג משמרת זה / ${fmtLoad(p.load)} כולל`,
    )
  }

  const flex = versatility(worker, otherOpen)
  if (otherOpen.length > 0) {
    const rivalFlex = ranked[rank + 1]
      ? versatility(ranked[rank + 1]!, otherOpen)
      : flex
    if (Math.abs(flex - rivalFlex) >= VERSATILITY_MIN_GAP) {
      reasons.push(
        `גמישות לנתיבים שנותרו: מוסמך ל-${flex} מתוך ${otherOpen.length} (הפרש משמעותי מול מועמדים אחרים)`,
      )
    }
  }

  const rival = ranked[rank + 1]
  if (rival) {
    const rp = profiles.get(rival.id)!
    const diffs: string[] = []
    if (
      lane.afternoonHandoff &&
      currentShiftType === 'afternoon' &&
      morning?.found
    ) {
      const ta = afternoonHandoffTier(worker.id, lane.id, morning)
      const tb = afternoonHandoffTier(rival.id, lane.id, morning)
      if (ta !== tb) {
        diffs.push(
          `עדיפות החלפה טובה יותר מול ${rival.fullName}`,
        )
      }
    }
    const aRec = recoveringIds.has(worker.id)
    const bRec = recoveringIds.has(rival.id)
    if (aRec !== bRec) {
      if (lane.intensity === 'easy' && aRec) {
        diffs.push(`התאוששות מלילה בצהריים — בניגוד ל${rival.fullName}`)
      } else if (lane.intensity === 'hard' && !aRec) {
        diffs.push(`לא בעדיפות התאוששות מלילה — בניגוד ל${rival.fullName}`)
      } else if (lane.intensity !== 'easy' && !aRec && bRec) {
        diffs.push(`נשמר ${rival.fullName} למנוחה אחרי לילה`)
      }
    }
    if (isDayShift(currentShiftType)) {
      if (p.prevCalendarDayLaneIds.has(lane.id) !== rp.prevCalendarDayLaneIds.has(lane.id)) {
        if (!p.prevCalendarDayLaneIds.has(lane.id)) {
          diffs.push(
            `לא הייתה בעמדה זו אתמול (בניגוד ל${rival.fullName})`,
          )
        }
      }
      const aRot = p.rotationLaneCounts.get(lane.id) ?? 0
      const bRot = rp.rotationLaneCounts.get(lane.id) ?? 0
      if ((aRot === 0) !== (bRot === 0)) {
        diffs.push(
          aRot === 0
            ? `לא הייתה בעמדה ב־${ROTATION_LOOKBACK_DAYS} יום (בניגוד ל${rival.fullName})`
            : `הייתה בעמדה בחלון הרוטציה — בניגוד ל${rival.fullName}`,
        )
      } else if (aRot !== bRot) {
        diffs.push(
          `פחות פעמים בעמדה (${aRot} מול ${bRot} של ${rival.fullName})`,
        )
      } else {
        const aRec = p.rotationLaneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
        const bRec = rp.rotationLaneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
        if (aRec !== bRec && aRec > bRec) {
          diffs.push(
            `הייתה בעמדה לפני יותר זמן מ${rival.fullName}`,
          )
        } else if (p.lastDayLaneIds.has(lane.id) !== rp.lastDayLaneIds.has(lane.id)) {
          if (!p.lastDayLaneIds.has(lane.id)) {
            diffs.push(`לא חזרה מיידית לעמדה במשמרת יום (בניגוד ל${rival.fullName})`)
          }
        }
      }
    } else if (p.lastLaneIds.has(lane.id) !== rp.lastLaneIds.has(lane.id)) {
      if (!p.lastLaneIds.has(lane.id)) {
        diffs.push(`לא חזר מיד לאותו נתיב (בניגוד ל${rival.fullName})`)
      }
    }

    const aTimes = p.laneCounts.get(lane.id) ?? 0
    const bTimes = rp.laneCounts.get(lane.id) ?? 0
    if (aTimes !== bTimes && !isDayShift(currentShiftType)) {
      diffs.push(
        `פחות פעמים בנתיב זה (${aTimes} מול ${bTimes} של ${rival.fullName})`,
      )
    }
    const va = versatility(worker, otherOpen)
    const vb = versatility(rival, otherOpen)
    if (Math.abs(va - vb) >= VERSATILITY_MIN_GAP) {
      diffs.push(`גמישות ${va} מול ${vb} של ${rival.fullName}`)
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
  const lookbackDays = Math.max(
    ctx?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS,
    ROTATION_LOOKBACK_DAYS,
  )
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
      buildWorkerProfile(w.id, relevant, allLanes, currentShiftType, currentDate),
    )
  }

  // Night recovery: afternoon only, calendar day after the night shift date.
  const recoveringIds = new Set<string>()
  if (currentShiftType === 'afternoon') {
    for (const w of presentWorkers) {
      if (
        needsAfternoonNightRecovery(w.id, history, currentDate, currentShiftType)
      ) {
        recoveringIds.add(w.id)
      }
    }
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

    // Hard: keep afternoon day-after-night recoverees off hard when possible
    let pool = candidates
    if (lane.intensity === 'hard' && recoveringIds.size > 0) {
      const rested = candidates.filter((w) => !recoveringIds.has(w.id))
      if (rested.length >= lane.staffingStandard) {
        pool = rested
      }
    }

    // Key rule: station rotation over ≥14 days (morning/afternoon; night excluded)
    pool = applyStationRotationPool(
      pool,
      lane,
      profiles,
      lane.staffingStandard,
      currentShiftType,
    )

    const ranked = shuffle(pool).sort((a, b) =>
      compareForLane(
        a,
        b,
        lane,
        profiles,
        otherOpen,
        currentShiftType,
        morningCtx,
        recoveringIds,
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
          recoveringIds,
        ),
      })
    })

    if (lane.intensity === 'hard') {
      for (const id of picked) {
        const name = workerById.get(id)?.fullName ?? id
        if (recoveringIds.has(id)) {
          warnings.push(
            `אחרי לילה → קשה בצהריים: "${name}" שובץ בנתיב "${lane.name}" (אין מספיק מועמדים אחרים)`,
          )
        }
      }
    }

    if (isDayShift(currentShiftType)) {
      for (const id of picked) {
        const prof = profiles.get(id)
        if (!prof?.prevCalendarDayLaneIds.has(lane.id)) continue
        const name = workerById.get(id)?.fullName ?? id
        warnings.push(
          `יום אחרי יום: "${name}" שובץ שוב ב"${lane.name}" אחרי שהיה שם אתמול (אין מועמד אחר פנוי)`,
        )
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
