import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { v4 as uuid } from 'uuid'
import { runAssignmentAlgorithm } from '../algorithm'
import {
  deleteShiftRemote,
  fetchAppData,
  loginRemote,
  saveAppDataRemote,
  saveShiftRemote,
  seedAppDataRemote,
} from '../api'
import {
  clearSession,
  loadSession,
  saveSession,
  type SessionUser,
} from '../auth'
import { createSeedData, isDefaultManager } from '../storage'
import type {
  AppData,
  Lane,
  LaneAssignment,
  ShiftSchedule,
  ShiftType,
  View,
  Worker,
} from '../types'

export type ShiftStep = 'lanes' | 'attendance' | 'board'

export interface ShiftDraft {
  id: string
  date: string
  shiftType: ShiftType
  activeLaneIds: string[]
  presentWorkerIds: string[]
  assignments: LaneAssignment[]
  warnings: string[]
  unassignedWorkerIds: string[]
}

interface AppContextValue {
  data: AppData
  loading: boolean
  syncing: boolean
  error: string | null
  user: SessionUser | null
  login: (phone: string) => Promise<void>
  logout: () => void
  view: View
  setView: (v: View) => void
  shiftStep: ShiftStep
  setShiftStep: (s: ShiftStep) => void
  draft: ShiftDraft | null
  startShift: () => void
  updateDraftMeta: (patch: Partial<Pick<ShiftDraft, 'date' | 'shiftType'>>) => void
  toggleLane: (laneId: string) => void
  toggleWorker: (workerId: string) => void
  setAllActiveLanes: (on: boolean) => void
  setAllActiveWorkers: (on: boolean) => void
  runAutoAssign: () => void
  updateAssignment: (laneId: string, slotIndex: number, workerId: string | null) => void
  addExtraWorkerToLane: (laneId: string, workerId: string) => void
  addSlotToLane: (laneId: string) => void
  saveCurrentShift: () => Promise<void>
  loadShiftFromHistory: (id: string) => void
  deleteHistoryItem: (id: string) => Promise<void>
  addWorker: (w: Omit<Worker, 'id'>) => void
  updateWorker: (w: Worker) => void
  deleteWorker: (id: string) => void
  addLane: (l: Omit<Lane, 'id'>) => void
  updateLane: (l: Lane) => void
  deleteLane: (id: string) => void
  addCertification: (name: string) => void
  removeCertification: (name: string) => void
  resetToSeed: () => Promise<void>
  refreshFromServer: () => Promise<void>
}

const emptyData: AppData = {
  workers: [],
  lanes: [],
  history: [],
  certificationsCatalog: [],
}

const AppContext = createContext<AppContextValue | null>(null)

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultShiftType(): ShiftType {
  const h = new Date().getHours()
  if (h < 14) return 'morning'
  if (h < 22) return 'afternoon'
  return 'night'
}

function padAssignments(
  assignments: LaneAssignment[],
  lanes: Lane[],
  activeLaneIds: string[],
): LaneAssignment[] {
  return activeLaneIds.map((laneId) => {
    const lane = lanes.find((l) => l.id === laneId)
    const std = lane?.staffingStandard ?? 1
    const existing = assignments.find((a) => a.laneId === laneId)
    const filled = [...(existing?.workerIds ?? [])].filter(Boolean)
    const targetLen = Math.max(std, filled.length)
    const padded = [...filled]
    while (padded.length < targetLen) padded.push('')
    return { laneId, workerIds: padded }
  })
}

function stripEmpty(assignments: LaneAssignment[]): LaneAssignment[] {
  return assignments.map((a) => ({
    laneId: a.laneId,
    workerIds: a.workerIds.filter(Boolean),
  }))
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SessionUser | null>(() => loadSession())
  const [view, setView] = useState<View>('home')
  const [shiftStep, setShiftStep] = useState<ShiftStep>('lanes')
  const [draft, setDraft] = useState<ShiftDraft | null>(null)

  const dataRef = useRef(data)
  dataRef.current = data
  const syncTimer = useRef<number | null>(null)
  const skipNextSync = useRef(true)

  const persistNow = useCallback(async (next: AppData) => {
    setSyncing(true)
    setError(null)
    try {
      const saved = await saveAppDataRemote(next)
      setData(saved)
      return saved
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאת שמירה לשרת'
      setError(msg)
      throw e
    } finally {
      setSyncing(false)
    }
  }, [])

  const queuePersist = useCallback(
    (next: AppData) => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current)
      syncTimer.current = window.setTimeout(() => {
        void persistNow(next).catch(() => undefined)
      }, 400)
    },
    [persistNow],
  )

  const patchData = useCallback(
    (updater: (prev: AppData) => AppData) => {
      setData((prev) => {
        const next = updater(prev)
        queuePersist(next)
        return next
      })
    },
    [queuePersist],
  )

  const refreshFromServer = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const remote = await fetchAppData()
      // Ensure שי אלישע keeps manager flag if missing in old records
      const workers = remote.workers.map((w) => ({
        ...w,
        isManager: Boolean(w.isManager) || isDefaultManager(w),
      }))
      skipNextSync.current = true
      setData({ ...remote, workers })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא ניתן להתחבר לשרת')
      if (dataRef.current.workers.length === 0) {
        setData(createSeedData())
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(async (phone: string) => {
    const session = await loginRemote(phone)
    saveSession(session)
    setUser(session)
    setView('home')
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
    setDraft(null)
    setView('home')
  }, [])

  useEffect(() => {
    void refreshFromServer()
  }, [refreshFromServer])

  const toSchedule = useCallback((d: ShiftDraft): ShiftSchedule => {
    const now = new Date().toISOString()
    return {
      id: d.id,
      date: d.date,
      shiftType: d.shiftType,
      activeLaneIds: d.activeLaneIds,
      presentWorkerIds: d.presentWorkerIds,
      assignments: stripEmpty(d.assignments),
      createdAt: now,
      updatedAt: now,
    }
  }, [])

  const startShift = useCallback(() => {
    setDraft({
      id: uuid(),
      date: todayISO(),
      shiftType: defaultShiftType(),
      activeLaneIds: data.lanes.map((l) => l.id),
      presentWorkerIds: data.workers.filter((w) => w.status === 'active').map((w) => w.id),
      assignments: [],
      warnings: [],
      unassignedWorkerIds: [],
    })
    setShiftStep('lanes')
    setView('shift')
  }, [data.lanes, data.workers])

  const updateDraftMeta = useCallback(
    (patch: Partial<Pick<ShiftDraft, 'date' | 'shiftType'>>) => {
      setDraft((d) => (d ? { ...d, ...patch } : d))
    },
    [],
  )

  const toggleLane = useCallback((laneId: string) => {
    setDraft((d) => {
      if (!d) return d
      const has = d.activeLaneIds.includes(laneId)
      return {
        ...d,
        activeLaneIds: has
          ? d.activeLaneIds.filter((id) => id !== laneId)
          : [...d.activeLaneIds, laneId],
      }
    })
  }, [])

  const toggleWorker = useCallback((workerId: string) => {
    setDraft((d) => {
      if (!d) return d
      const has = d.presentWorkerIds.includes(workerId)
      return {
        ...d,
        presentWorkerIds: has
          ? d.presentWorkerIds.filter((id) => id !== workerId)
          : [...d.presentWorkerIds, workerId],
      }
    })
  }, [])

  const setAllActiveLanes = useCallback(
    (on: boolean) => {
      setDraft((d) =>
        d ? { ...d, activeLaneIds: on ? data.lanes.map((l) => l.id) : [] } : d,
      )
    },
    [data.lanes],
  )

  const setAllActiveWorkers = useCallback(
    (on: boolean) => {
      setDraft((d) =>
        d
          ? {
              ...d,
              presentWorkerIds: on
                ? data.workers.filter((w) => w.status === 'active').map((w) => w.id)
                : [],
            }
          : d,
      )
    },
    [data.workers],
  )

  const runAutoAssign = useCallback(() => {
    setDraft((d) => {
      if (!d) return d
      const activeLanes = data.lanes.filter((l) => d.activeLaneIds.includes(l.id))
      const present = data.workers.filter((w) => d.presentWorkerIds.includes(w.id))
      const result = runAssignmentAlgorithm(
        activeLanes,
        present,
        data.history,
        data.lanes,
        { date: d.date, shiftType: d.shiftType },
      )
      return {
        ...d,
        assignments: padAssignments(result.assignments, data.lanes, d.activeLaneIds),
        warnings: result.warnings,
        unassignedWorkerIds: result.unassignedWorkerIds,
      }
    })
    setShiftStep('board')
  }, [data.history, data.lanes, data.workers])

  const updateAssignment = useCallback(
    (laneId: string, slotIndex: number, workerId: string | null) => {
      setDraft((d) => {
        if (!d) return d
        const padded = padAssignments(d.assignments, data.lanes, d.activeLaneIds).map(
          (a) => ({ ...a, workerIds: [...a.workerIds] }),
        )

        if (workerId) {
          for (const a of padded) {
            a.workerIds = a.workerIds.map((id) => (id === workerId ? '' : id))
          }
        }

        const target = padded.find((a) => a.laneId === laneId)
        if (target) {
          target.workerIds[slotIndex] = workerId ?? ''
          const lane = data.lanes.find((l) => l.id === laneId)
          const std = lane?.staffingStandard ?? 1
          while (
            target.workerIds.length > std &&
            !target.workerIds[target.workerIds.length - 1]
          ) {
            target.workerIds.pop()
          }
        }

        const assignedIds = new Set(padded.flatMap((a) => a.workerIds.filter(Boolean)))
        return {
          ...d,
          assignments: padded,
          unassignedWorkerIds: d.presentWorkerIds.filter((id) => !assignedIds.has(id)),
        }
      })
    },
    [data.lanes],
  )

  const addExtraWorkerToLane = useCallback(
    (laneId: string, workerId: string) => {
      setDraft((d) => {
        if (!d) return d
        const padded = padAssignments(d.assignments, data.lanes, d.activeLaneIds).map(
          (a) => ({
            ...a,
            workerIds: a.workerIds.filter((id) => id !== workerId),
          }),
        )
        const target = padded.find((a) => a.laneId === laneId)
        if (!target) return d
        target.workerIds.push(workerId)

        const assignedIds = new Set(padded.flatMap((a) => a.workerIds.filter(Boolean)))
        return {
          ...d,
          assignments: padded,
          unassignedWorkerIds: d.presentWorkerIds.filter((id) => !assignedIds.has(id)),
        }
      })
    },
    [data.lanes],
  )

  const addSlotToLane = useCallback(
    (laneId: string) => {
      setDraft((d) => {
        if (!d) return d
        const padded = padAssignments(d.assignments, data.lanes, d.activeLaneIds).map(
          (a) => ({ ...a, workerIds: [...a.workerIds] }),
        )
        const target = padded.find((a) => a.laneId === laneId)
        if (!target) return d
        target.workerIds.push('')
        return { ...d, assignments: padded }
      })
    },
    [data.lanes],
  )

  const saveCurrentShift = useCallback(async () => {
    if (!draft) return
    const assignedIds = new Set(
      draft.assignments.flatMap((a) => a.workerIds.filter(Boolean)),
    )
    const unassigned = draft.presentWorkerIds.filter((id) => !assignedIds.has(id))
    if (unassigned.length > 0) {
      const message = `לא ניתן לשמור — נשארו ${unassigned.length} בודקים שלא שובצו לעמדה`
      setError(message)
      throw new Error(message)
    }
    const schedule = toSchedule(draft)
    setSyncing(true)
    setError(null)
    try {
      const saved = await saveShiftRemote(schedule)
      skipNextSync.current = true
      setData(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירת השיבוץ נכשלה')
      throw e
    } finally {
      setSyncing(false)
    }
  }, [draft, toSchedule])

  const loadShiftFromHistory = useCallback(
    (id: string) => {
      const item = data.history.find((h) => h.id === id)
      if (!item) return
      const assigned = new Set(item.assignments.flatMap((a) => a.workerIds))
      setDraft({
        id: item.id,
        date: item.date,
        shiftType: item.shiftType,
        activeLaneIds: item.activeLaneIds,
        presentWorkerIds: item.presentWorkerIds,
        assignments: padAssignments(item.assignments, data.lanes, item.activeLaneIds),
        warnings: [],
        unassignedWorkerIds: item.presentWorkerIds.filter((wid) => !assigned.has(wid)),
      })
      setShiftStep('board')
      setView('shift')
    },
    [data.history, data.lanes],
  )

  const deleteHistoryItem = useCallback(async (id: string) => {
    setSyncing(true)
    try {
      const saved = await deleteShiftRemote(id)
      skipNextSync.current = true
      setData(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה')
    } finally {
      setSyncing(false)
    }
  }, [])

  const addWorker = useCallback(
    (w: Omit<Worker, 'id'>) => {
      patchData((prev) => ({
        ...prev,
        workers: [
          ...prev.workers,
          { ...w, id: uuid(), isManager: Boolean(w.isManager) },
        ],
      }))
    },
    [patchData],
  )

  const updateWorker = useCallback(
    (w: Worker) => {
      patchData((prev) => ({
        ...prev,
        workers: prev.workers.map((x) => (x.id === w.id ? w : x)),
      }))
    },
    [patchData],
  )

  const deleteWorker = useCallback(
    (id: string) => {
      patchData((prev) => ({
        ...prev,
        workers: prev.workers.filter((w) => w.id !== id),
      }))
    },
    [patchData],
  )

  const addLane = useCallback(
    (l: Omit<Lane, 'id'>) => {
      patchData((prev) => ({ ...prev, lanes: [...prev.lanes, { ...l, id: uuid() }] }))
    },
    [patchData],
  )

  const updateLane = useCallback(
    (l: Lane) => {
      patchData((prev) => ({
        ...prev,
        lanes: prev.lanes.map((x) => (x.id === l.id ? l : x)),
      }))
    },
    [patchData],
  )

  const deleteLane = useCallback(
    (id: string) => {
      patchData((prev) => ({
        ...prev,
        lanes: prev.lanes.filter((l) => l.id !== id),
      }))
    },
    [patchData],
  )

  const addCertification = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      patchData((prev) => {
        if (prev.certificationsCatalog.includes(trimmed)) return prev
        return {
          ...prev,
          certificationsCatalog: [...prev.certificationsCatalog, trimmed],
        }
      })
    },
    [patchData],
  )

  const removeCertification = useCallback(
    (name: string) => {
      patchData((prev) => ({
        ...prev,
        certificationsCatalog: prev.certificationsCatalog.filter((c) => c !== name),
      }))
    },
    [patchData],
  )

  const resetToSeed = useCallback(async () => {
    setSyncing(true)
    try {
      const seeded = await seedAppDataRemote()
      skipNextSync.current = true
      setData(seeded)
      setDraft(null)
      setView('home')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'איפוס נכשל')
    } finally {
      setSyncing(false)
    }
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      loading,
      syncing,
      error,
      user,
      login,
      logout,
      view,
      setView,
      shiftStep,
      setShiftStep,
      draft,
      startShift,
      updateDraftMeta,
      toggleLane,
      toggleWorker,
      setAllActiveLanes,
      setAllActiveWorkers,
      runAutoAssign,
      updateAssignment,
      addExtraWorkerToLane,
      addSlotToLane,
      saveCurrentShift,
      loadShiftFromHistory,
      deleteHistoryItem,
      addWorker,
      updateWorker,
      deleteWorker,
      addLane,
      updateLane,
      deleteLane,
      addCertification,
      removeCertification,
      resetToSeed,
      refreshFromServer,
    }),
    [
      data,
      loading,
      syncing,
      error,
      user,
      login,
      logout,
      view,
      shiftStep,
      draft,
      startShift,
      updateDraftMeta,
      toggleLane,
      toggleWorker,
      setAllActiveLanes,
      setAllActiveWorkers,
      runAutoAssign,
      updateAssignment,
      addExtraWorkerToLane,
      addSlotToLane,
      saveCurrentShift,
      loadShiftFromHistory,
      deleteHistoryItem,
      addWorker,
      updateWorker,
      deleteWorker,
      addLane,
      updateLane,
      deleteLane,
      addCertification,
      removeCertification,
      resetToSeed,
      refreshFromServer,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
