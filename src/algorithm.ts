import { INTENSITY_SCORE } from './constants'
import type {
  Intensity,
  Lane,
  LaneAssignment,
  ShiftSchedule,
  ShiftType,
  Worker,
} from './types'

export interface AssignmentResult {
  assignments: LaneAssignment[]
  unassignedWorkerIds: string[]
  understaffedLaneIds: string[]
  warnings: string[]
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
  easyCount: number
  totalAssignments: number
}

const DEFAULT_LOOKBACK_DAYS = 14

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
  load: number
  hardCount: number
  hardInSameShiftType: number
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
    hardCount: 0,
    hardInSameShiftType: 0,
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
      profile.load += INTENSITY_SCORE[lane.intensity]
      if (lane.intensity === 'hard') {
        profile.hardCount += 1
        if (shift.shiftType === currentShiftType) {
          profile.hardInSameShiftType += 1
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

function needsEasyAfterNight(
  profile: WorkerHistoryProfile,
  currentShiftType: ShiftType,
): boolean {
  return currentShiftType === 'afternoon' && profile.lastShiftType === 'night'
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
      load += INTENSITY_SCORE[lane.intensity]
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

  const aWasLastHere = pa.lastLaneIds.has(lane.id) ? 1 : 0
  const bWasLastHere = pb.lastLaneIds.has(lane.id) ? 1 : 0
  if (aWasLastHere !== bWasLastHere) return aWasLastHere - bWasLastHere

  const aTimes = pa.laneCounts.get(lane.id) ?? 0
  const bTimes = pb.laneCounts.get(lane.id) ?? 0
  if (aTimes !== bTimes) return aTimes - bTimes

  const aRecency = pa.laneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
  const bRecency = pb.laneRecency.get(lane.id) ?? Number.POSITIVE_INFINITY
  if (aRecency !== bRecency) return bRecency - aRecency

  const aAfterNight = needsEasyAfterNight(pa, currentShiftType) ? 1 : 0
  const bAfterNight = needsEasyAfterNight(pb, currentShiftType) ? 1 : 0
  if (aAfterNight !== bAfterNight) {
    if (lane.intensity === 'easy') return bAfterNight - aAfterNight
    if (lane.intensity === 'hard') return aAfterNight - bAfterNight
    return bAfterNight - aAfterNight
  }

  if (lane.intensity === 'hard') {
    if (pa.lastWasHard !== pb.lastWasHard) {
      return (pa.lastWasHard ? 1 : 0) - (pb.lastWasHard ? 1 : 0)
    }
    if (pa.hardInSameShiftType !== pb.hardInSameShiftType) {
      return pa.hardInSameShiftType - pb.hardInSameShiftType
    }
    if (pa.hardCount !== pb.hardCount) return pa.hardCount - pb.hardCount
    if (pa.load !== pb.load) return pa.load - pb.load
  } else if (lane.intensity === 'easy') {
    if (pa.lastWasHard !== pb.lastWasHard) {
      return (pb.lastWasHard ? 1 : 0) - (pa.lastWasHard ? 1 : 0)
    }
    if (pa.hardCount !== pb.hardCount) return pb.hardCount - pa.hardCount
    if (pa.load !== pb.load) return pb.load - pa.load
  } else {
    if (pa.hardCount !== pb.hardCount) return pa.hardCount - pb.hardCount
    if (pa.load !== pb.load) return pa.load - pb.load
  }

  return 0
}

export function runAssignmentAlgorithm(
  activeLanes: Lane[],
  presentWorkers: Worker[],
  history: ShiftSchedule[],
  allLanes: Lane[],
  ctx?: AssignmentContext,
): AssignmentResult {
  const warnings: string[] = []
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

  for (const lane of orderedLanes) {
    remainingLaneIds.delete(lane.id)
    const otherOpen = orderedLanes.filter((l) => remainingLaneIds.has(l.id))

    const candidates = [...available]
      .map((id) => workerById.get(id)!)
      .filter((w) => isQualified(w, lane))

    if (candidates.length === 0) {
      assignments.push({ laneId: lane.id, workerIds: [] })
      understaffedLaneIds.push(lane.id)
      warnings.push(`אין עובדים מוסמכים לנתיב "${lane.name}"`)
      continue
    }

    const ranked = shuffle(candidates).sort((a, b) =>
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
    const picked = ranked.slice(0, needed).map((w) => w.id)

    for (const id of picked) available.delete(id)

    assignments.push({ laneId: lane.id, workerIds: picked })

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
    let totalAssignments = 0

    for (const shift of filtered) {
      for (const assignment of shift.assignments) {
        if (!assignment.workerIds.includes(w.id)) continue
        byLane[assignment.laneId] = (byLane[assignment.laneId] ?? 0) + 1
        totalAssignments += 1
        const lane = laneMap.get(assignment.laneId)
        if (!lane) continue
        if (lane.intensity === 'hard') hardCount += 1
        else if (lane.intensity === 'medium') mediumCount += 1
        else easyCount += 1
      }
    }

    return {
      workerId: w.id,
      byLane,
      hardCount,
      mediumCount,
      easyCount,
      totalAssignments,
    }
  })
}
