import { INTENSITY_SCORE } from './constants'
import type { Intensity, Lane, LaneAssignment, ShiftSchedule, Worker } from './types'

export interface AssignmentResult {
  assignments: LaneAssignment[]
  unassignedWorkerIds: string[]
  understaffedLaneIds: string[]
  warnings: string[]
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Worker must hold every required certification for the lane */
export function isQualified(worker: Worker, lane: Lane): boolean {
  if (lane.requiredCertifications.length === 0) return true
  return lane.requiredCertifications.every((c) => worker.certifications.includes(c))
}

export function computeWorkerLoad(
  workerId: string,
  history: ShiftSchedule[],
  lanes: Lane[],
  lookback = 8,
): number {
  const laneMap = new Map(lanes.map((l) => [l.id, l]))
  let load = 0
  let counted = 0

  for (const shift of history) {
    if (counted >= lookback) break
    for (const assignment of shift.assignments) {
      if (!assignment.workerIds.includes(workerId)) continue
      const lane = laneMap.get(assignment.laneId)
      if (!lane) continue
      load += INTENSITY_SCORE[lane.intensity]
      counted += 1
    }
  }
  return load
}

function recentHardCount(
  workerId: string,
  history: ShiftSchedule[],
  lanes: Lane[],
  lookback = 5,
): number {
  const laneMap = new Map(lanes.map((l) => [l.id, l]))
  let hard = 0
  let seen = 0

  for (const shift of history) {
    if (seen >= lookback) break
    for (const assignment of shift.assignments) {
      if (!assignment.workerIds.includes(workerId)) continue
      seen += 1
      const lane = laneMap.get(assignment.laneId)
      if (lane?.intensity === 'hard') hard += 1
    }
  }
  return hard
}

function preferenceScore(
  workerId: string,
  lane: Lane,
  history: ShiftSchedule[],
  allLanes: Lane[],
): number {
  const load = computeWorkerLoad(workerId, history, allLanes)
  const hardRecent = recentHardCount(workerId, history, allLanes)
  const laneScore = INTENSITY_SCORE[lane.intensity]
  const balance =
    load * (4 - laneScore) +
    hardRecent * (lane.intensity === 'easy' ? 5 : lane.intensity === 'medium' ? 2 : -3)
  const hardFill = lane.intensity === 'hard' ? -load * 2 : 0
  return balance + hardFill + Math.random() * 0.01
}

/**
 * How many other still-open lanes this worker can also fill.
 * Lower = more specialized → should be reserved for constrained lanes.
 */
function versatility(
  worker: Worker,
  otherOpenLanes: Lane[],
): number {
  return otherOpenLanes.filter((l) => isQualified(worker, l)).length
}

/**
 * Smart assignment (scarcity-first):
 * 1. Fill restricted / scarce-cert lanes before open lanes
 * 2. Prefer specialized workers for constrained lanes (don't waste them on open posts)
 * 3. Then balance by historical intensity load
 * 4. Fair random tie-break
 */
export function runAssignmentAlgorithm(
  activeLanes: Lane[],
  presentWorkers: Worker[],
  history: ShiftSchedule[],
  allLanes: Lane[],
): AssignmentResult {
  const warnings: string[] = []
  const available = new Set(presentWorkers.map((w) => w.id))
  const workerById = new Map(presentWorkers.map((w) => [w.id, w]))

  const intensityOrder: Record<Intensity, number> = { hard: 0, medium: 1, easy: 2 }

  // Scarcest / most restricted lanes first; open (no certs) last
  const orderedLanes = [...activeLanes].sort((a, b) => {
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

    // Prefer least versatile (specialists) for this lane, then fairness/load
    const ranked = shuffle(candidates).sort((a, b) => {
      const va = versatility(a, otherOpen)
      const vb = versatility(b, otherOpen)
      if (va !== vb) return va - vb

      // On open lanes, prefer generalists who are already "left over"
      // (already handled by processing open lanes last)

      return (
        preferenceScore(b.id, lane, history, allLanes) -
        preferenceScore(a.id, lane, history, allLanes)
      )
    })

    const needed = lane.staffingStandard
    const picked = ranked.slice(0, needed).map((w) => w.id)

    for (const id of picked) available.delete(id)

    assignments.push({ laneId: lane.id, workerIds: picked })

    if (picked.length < needed) {
      understaffedLaneIds.push(lane.id)
      warnings.push(
        `נתיב "${lane.name}" דורש ${needed} בודקים מוסמכים, שובצו ${picked.length}`,
      )
    }
  }

  // Clarify leftover: separate unqualified-for-all-remaining vs true surplus
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
