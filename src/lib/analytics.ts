import { computeWorkerLaneStats } from '../algorithm'
import type { Lane, ShiftSchedule, ShiftType, Worker } from '../types'

export interface WorkerAnalyticsRow {
  workerId: string
  fullName: string
  effectiveLoad: number
  hardCount: number
  dayEasyCount: number
  nightEasyCount: number
  mediumCount: number
  totalAssignments: number
  shiftsCount: number
  shiftsByType: Record<ShiftType, number>
  hardByShift: Record<ShiftType, number>
  topLaneId: string | null
  topLaneName: string | null
  topLaneCount: number
  hardAfterNightCount: number
}

export interface LaneConcentration {
  laneId: string
  laneName: string
  intensity: Lane['intensity']
  totalAssignments: number
  uniqueWorkers: number
  topWorkerName: string
  topWorkerCount: number
  /** Share of assignments on the single most frequent worker (0–1) */
  concentration: number
}

export interface TeamAnalytics {
  shiftsInRange: number
  workersWithData: number
  avgLoad: number
  maxLoad: number
  minLoad: number
  loadGap: number
  hardAfterNightTotal: number
  shiftMix: Record<ShiftType, number>
  needRelief: WorkerAnalyticsRow[]
  gotRest: WorkerAnalyticsRow[]
  workers: WorkerAnalyticsRow[]
  lanes: LaneConcentration[]
}

const EMPTY_SHIFT: Record<ShiftType, number> = {
  morning: 0,
  afternoon: 0,
  night: 0,
}

function filterHistory(
  history: ShiftSchedule[],
  fromDate?: string,
  toDate?: string,
): ShiftSchedule[] {
  return history.filter((h) => {
    if (fromDate && h.date < fromDate) return false
    if (toDate && h.date > toDate) return false
    return true
  })
}

/** Chronological: date asc, then morning → afternoon → night */
function sortChronological(history: ShiftSchedule[]): ShiftSchedule[] {
  const order: Record<ShiftType, number> = {
    morning: 0,
    afternoon: 1,
    night: 2,
  }
  return [...history].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return order[a.shiftType] - order[b.shiftType]
  })
}

function countHardAfterNight(
  workerId: string,
  historyAsc: ShiftSchedule[],
  laneIntensity: Map<string, Lane['intensity']>,
): number {
  let lastShiftType: ShiftType | null = null
  let count = 0

  for (const shift of historyAsc) {
    let placed = false
    let hadHard = false
    for (const a of shift.assignments) {
      if (!a.workerIds.includes(workerId)) continue
      placed = true
      if (laneIntensity.get(a.laneId) === 'hard') hadHard = true
    }
    if (!placed) continue
    if (lastShiftType === 'night' && hadHard) count += 1
    lastShiftType = shift.shiftType
  }
  return count
}

export function computeTeamAnalytics(
  workers: Worker[],
  lanes: Lane[],
  history: ShiftSchedule[],
  options?: { fromDate?: string; toDate?: string },
): TeamAnalytics {
  const filtered = filterHistory(history, options?.fromDate, options?.toDate)
  const historyAsc = sortChronological(filtered)
  const laneMap = new Map(lanes.map((l) => [l.id, l]))
  const laneIntensity = new Map(lanes.map((l) => [l.id, l.intensity]))
  const nameById = new Map(workers.map((w) => [w.id, w.fullName]))

  const baseStats = computeWorkerLaneStats(workers, lanes, filtered)

  const shiftMix: Record<ShiftType, number> = { ...EMPTY_SHIFT }
  for (const h of filtered) shiftMix[h.shiftType] += 1

  const workersRows: WorkerAnalyticsRow[] = baseStats.map((s) => {
    const shiftsByType: Record<ShiftType, number> = { ...EMPTY_SHIFT }
    let shiftsCount = 0

    for (const shift of filtered) {
      const placed = shift.assignments.some((a) => a.workerIds.includes(s.workerId))
      if (!placed) continue
      shiftsCount += 1
      shiftsByType[shift.shiftType] += 1
    }

    let topLaneId: string | null = null
    let topLaneCount = 0
    for (const [laneId, n] of Object.entries(s.byLane)) {
      if (n > topLaneCount) {
        topLaneCount = n
        topLaneId = laneId
      }
    }

    const hardAfterNightCount = countHardAfterNight(
      s.workerId,
      historyAsc,
      laneIntensity,
    )

    return {
      workerId: s.workerId,
      fullName: nameById.get(s.workerId) ?? s.workerId,
      effectiveLoad: s.effectiveLoad,
      hardCount: s.hardCount,
      dayEasyCount: s.dayEasyCount,
      nightEasyCount: s.nightEasyCount,
      mediumCount: s.mediumCount,
      totalAssignments: s.totalAssignments,
      shiftsCount,
      shiftsByType,
      hardByShift: { ...s.hardByShift },
      topLaneId,
      topLaneName: topLaneId ? (laneMap.get(topLaneId)?.name ?? topLaneId) : null,
      topLaneCount,
      hardAfterNightCount,
    }
  })

  const withData = workersRows.filter((w) => w.totalAssignments > 0)
  const loads = withData.map((w) => w.effectiveLoad)
  const avgLoad =
    loads.length === 0
      ? 0
      : Math.round((loads.reduce((a, b) => a + b, 0) / loads.length) * 10) / 10
  const maxLoad = loads.length ? Math.max(...loads) : 0
  const minLoad = loads.length ? Math.min(...loads) : 0

  const scored = [...withData].sort((a, b) => {
    const scoreA = a.effectiveLoad * 2 + a.hardCount - a.dayEasyCount * 1.5
    const scoreB = b.effectiveLoad * 2 + b.hardCount - b.dayEasyCount * 1.5
    return scoreB - scoreA
  })

  const needRelief = scored.slice(0, 5)
  const gotRest = [...scored].reverse().slice(0, 5)

  // Lane concentration
  const laneWorkerCounts = new Map<string, Map<string, number>>()
  for (const shift of filtered) {
    for (const a of shift.assignments) {
      if (!laneMap.has(a.laneId)) continue
      const map = laneWorkerCounts.get(a.laneId) ?? new Map()
      for (const wid of a.workerIds) {
        if (!wid) continue
        map.set(wid, (map.get(wid) ?? 0) + 1)
      }
      laneWorkerCounts.set(a.laneId, map)
    }
  }

  const laneRows: LaneConcentration[] = lanes
    .map((lane) => {
      const map = laneWorkerCounts.get(lane.id) ?? new Map()
      let total = 0
      let topWorkerId = ''
      let topWorkerCount = 0
      for (const [wid, n] of map) {
        total += n
        if (n > topWorkerCount) {
          topWorkerCount = n
          topWorkerId = wid
        }
      }
      return {
        laneId: lane.id,
        laneName: lane.name,
        intensity: lane.intensity,
        totalAssignments: total,
        uniqueWorkers: map.size,
        topWorkerName: topWorkerId ? (nameById.get(topWorkerId) ?? topWorkerId) : '—',
        topWorkerCount,
        concentration: total > 0 ? topWorkerCount / total : 0,
      }
    })
    .filter((l) => l.totalAssignments > 0)
    .sort((a, b) => b.concentration - a.concentration || b.totalAssignments - a.totalAssignments)

  return {
    shiftsInRange: filtered.length,
    workersWithData: withData.length,
    avgLoad,
    maxLoad,
    minLoad,
    loadGap: Math.round((maxLoad - minLoad) * 10) / 10,
    hardAfterNightTotal: withData.reduce((s, w) => s + w.hardAfterNightCount, 0),
    shiftMix,
    needRelief,
    gotRest,
    workers: [...withData].sort((a, b) => b.effectiveLoad - a.effectiveLoad),
    lanes: laneRows,
  }
}
