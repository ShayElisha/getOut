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
import { useLocation, useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { runAssignmentAlgorithm } from '../algorithm'
import {
  ApiError,
  checkLoginRemote,
  deleteShiftRemote,
  fetchAppData,
  loginRemote,
  requestPasswordResetRemote,
  resendManagerTempPasswordRemote,
  saveAppDataRemote,
  saveShiftRemote,
  seedAppDataRemote,
} from '../api'
import {
  clearAppDataCache,
  clearDraftStorage,
  clearSession,
  loadAppDataCache,
  loadDraftJson,
  loadSession,
  loadShiftStep,
  saveAppDataCache,
  saveDraftJson,
  saveSession,
  saveShiftStep,
  type SessionUser,
} from '../auth'
import { getCurrentShiftContext } from '../constants'
import { pathForView, viewFromPath } from '../routes'
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
  /** Background refresh while showing cached data */
  refreshing: boolean
  syncing: boolean
  error: string | null
  user: SessionUser | null
  login: (
    phone: string,
    password: string,
    opts?: { newPassword?: string; newPasswordConfirm?: string },
  ) => Promise<'change_password' | void>
  /** Phone-only probe: which login UI to show next. */
  checkLogin: (
    phone: string,
  ) => Promise<'login' | 'change_password' | 'await_email'>
  requestPasswordReset: (phone: string) => Promise<string>
  resendManagerTempPassword: (workerId: string) => Promise<void>
  logout: () => void
  view: View
  setView: (v: View) => void
  shiftStep: ShiftStep
  setShiftStep: (s: ShiftStep) => void
  draft: ShiftDraft | null
  /** True only after the in-memory shift differs from its clean baseline (and thus is persisted). */
  draftDirty: boolean
  startShift: () => void
  /** Discard in-progress shift draft and return home */
  discardDraft: () => void
  updateDraftMeta: (patch: Partial<Pick<ShiftDraft, 'date' | 'shiftType'>>) => void
  toggleLane: (laneId: string) => void
  toggleWorker: (workerId: string) => void
  setAllActiveLanes: (on: boolean) => void
  setAllActiveWorkers: (on: boolean) => void
  runAutoAssign: () => void
  /** Open an empty board so managers can place present workers by hand. */
  startManualAssign: () => void
  updateAssignment: (laneId: string, slotIndex: number, workerId: string | null) => void
  /** Swap two filled slots between lanes (or within the same lane). */
  swapAssignments: (
    a: { laneId: string; slotIndex: number },
    b: { laneId: string; slotIndex: number },
  ) => void
  /**
   * Remove a worker from the current shift: clears every slot they occupy
   * and drops them from present attendance so save is not blocked.
   */
  removeWorkerFromShift: (workerId: string) => void
  updateLaneNotes: (laneId: string, notes: string) => void
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
  revision: 0,
}

const AppContext = createContext<AppContextValue | null>(null)

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultShiftType(): ShiftType {
  return getCurrentShiftContext().shiftType
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
    return {
      laneId,
      workerIds: padded,
      notes: existing?.notes?.trim() ? existing.notes : undefined,
    }
  })
}

function stripEmpty(assignments: LaneAssignment[]): LaneAssignment[] {
  return assignments.map((a) => ({
    laneId: a.laneId,
    workerIds: a.workerIds.filter(Boolean),
    ...(a.notes?.trim() ? { notes: a.notes.trim() } : {}),
  }))
}

function restoreDraft(): ShiftDraft | null {
  try {
    const raw = loadDraftJson()
    if (!raw) return null
    const parsed = JSON.parse(raw) as ShiftDraft
    if (!parsed?.id || !Array.isArray(parsed.activeLaneIds)) return null
    return parsed
  } catch {
    return null
  }
}

function restoreStep(): ShiftStep {
  const s = loadShiftStep()
  if (s === 'lanes' || s === 'attendance' || s === 'board') return s
  return 'lanes'
}

/** Stable snapshot used to detect whether the user changed the current shift. */
function snapshotDraft(d: ShiftDraft): string {
  return JSON.stringify({
    id: d.id,
    date: d.date,
    shiftType: d.shiftType,
    activeLaneIds: d.activeLaneIds,
    presentWorkerIds: d.presentWorkerIds,
    assignments: d.assignments.map((a) => ({
      laneId: a.laneId,
      workerIds: a.workerIds,
      notes: a.notes?.trim() ?? '',
    })),
    warnings: d.warnings,
    unassignedWorkerIds: d.unassignedWorkerIds,
  })
}

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const initialCache = useMemo(() => loadAppDataCache(), [])
  const [data, setData] = useState<AppData>(() => initialCache ?? emptyData)
  const [loading, setLoading] = useState(() => !initialCache)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SessionUser | null>(() => loadSession())
  const view = viewFromPath(location.pathname)
  const [shiftStep, setShiftStepState] = useState<ShiftStep>(() => restoreStep())
  const [draft, setDraft] = useState<ShiftDraft | null>(() => restoreDraft())
  /** Restored drafts were already persisted → treat as dirty until discarded/saved clean. */
  const [draftDirty, setDraftDirty] = useState(() => restoreDraft() != null)
  const draftBaselineRef = useRef<string | null>(null)

  const dataRef = useRef(data)
  dataRef.current = data
  const syncTimer = useRef<number | null>(null)
  const skipNextSync = useRef(true)
  const userRef = useRef(user)
  userRef.current = user

  const adoptCleanDraft = useCallback((next: ShiftDraft) => {
    draftBaselineRef.current = snapshotDraft(next)
    setDraftDirty(false)
    setDraft(next)
  }, [])

  const applyRemoteData = useCallback((remote: AppData) => {
    const workers = remote.workers.map((w) => ({
      ...w,
      isManager: Boolean(w.isManager) || isDefaultManager(w),
    }))
    const next = { ...remote, workers }
    skipNextSync.current = true
    setData(next)
    saveAppDataCache(next)
    return next
  }, [])

  const setView = useCallback(
    (v: View) => {
      navigate(pathForView(v))
    },
    [navigate],
  )

  const setShiftStep = useCallback((s: ShiftStep) => {
    setShiftStepState(s)
  }, [])

  // Persist draft only after a real edit vs. the clean baseline.
  useEffect(() => {
    if (!draft) {
      setDraftDirty(false)
      draftBaselineRef.current = null
      clearDraftStorage()
      return
    }
    const baseline = draftBaselineRef.current
    const dirty = baseline === null || snapshotDraft(draft) !== baseline
    setDraftDirty(dirty)
    if (dirty) {
      saveDraftJson(JSON.stringify(draft))
      saveShiftStep(shiftStep)
    } else {
      clearDraftStorage()
    }
  }, [draft, shiftStep])

  // Leaving the shift flow without edits should not keep a phantom draft in memory.
  useEffect(() => {
    const onShift =
      location.pathname === '/shift' || location.pathname.startsWith('/shift/')
    const loadingHistoryItem = /^\/history\/[^/]+\/?$/.test(location.pathname)
    if (onShift || loadingHistoryItem || !draft) return
    const baseline = draftBaselineRef.current
    if (baseline !== null && snapshotDraft(draft) === baseline) {
      setDraft(null)
      clearDraftStorage()
      setShiftStepState('lanes')
    }
  }, [location.pathname, draft])

  const handleAuthFailure = useCallback(() => {
    clearSession()
    clearAppDataCache()
    setUser(null)
    draftBaselineRef.current = null
    setDraftDirty(false)
    setDraft(null)
    clearDraftStorage()
    setData(emptyData)
    navigate('/login', { replace: true })
  }, [navigate])

  const persistNow = useCallback(async (next: AppData) => {
    setSyncing(true)
    setError(null)
    try {
      const saved = await saveAppDataRemote(next)
      skipNextSync.current = true
      setData(saved)
      saveAppDataCache(saved)
      return saved
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        handleAuthFailure()
      }
      if (e instanceof ApiError && e.status === 409 && e.current) {
        skipNextSync.current = true
        setData(e.current)
        saveAppDataCache(e.current)
      }
      const msg = e instanceof Error ? e.message : 'שגיאת שמירה לשרת'
      setError(msg)
      throw e
    } finally {
      setSyncing(false)
    }
  }, [handleAuthFailure])

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
    if (!userRef.current?.token) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    const hasLocal =
      dataRef.current.workers.length > 0 || dataRef.current.lanes.length > 0
    if (hasLocal) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const remote = await fetchAppData()
      applyRemoteData(remote)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        handleAuthFailure()
        return
      }
      setError(e instanceof Error ? e.message : 'לא ניתן להתחבר לשרת')
      if (dataRef.current.workers.length === 0) {
        setData(createSeedData())
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [handleAuthFailure, applyRemoteData])

  const checkLogin = useCallback(async (phone: string) => {
    const result = await checkLoginRemote(phone)
    if (
      result.next !== 'login' &&
      result.next !== 'change_password' &&
      result.next !== 'await_email'
    ) {
      throw new Error('תגובת התחברות לא תקינה')
    }
    return result.next
  }, [])

  const login = useCallback(
    async (
      phone: string,
      password: string,
      opts?: { newPassword?: string; newPasswordConfirm?: string },
    ) => {
      const session = await loginRemote(phone, password, opts)
      if ('next' in session && session.next === 'change_password') {
        return 'change_password'
      }
      if (!('token' in session) || !session.token) {
        throw new Error('לא התקבל טוקן התחברות')
      }
      saveSession(session)
      setUser(session)
      navigate('/', { replace: true })
    },
    [navigate],
  )

  const requestPasswordReset = useCallback(async (phone: string) => {
    const result = await requestPasswordResetRemote(phone)
    return result.message || 'אם המספר רשום, נשלח מייל עם סיסמה זמנית.'
  }, [])

  const resendManagerTempPassword = useCallback(async (workerId: string) => {
    await resendManagerTempPasswordRemote(workerId)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    clearAppDataCache()
    clearDraftStorage()
    setUser(null)
    draftBaselineRef.current = null
    setDraftDirty(false)
    setDraft(null)
    setData(emptyData)
    navigate('/login', { replace: true })
  }, [navigate])

  useEffect(() => {
    if (!user?.token) {
      setLoading(false)
      setRefreshing(false)
      return
    }
    void refreshFromServer()
  }, [user?.token, refreshFromServer])

  // Redirect unauthenticated users away from app routes
  useEffect(() => {
    const path = location.pathname.replace(/\/+$/, '') || '/'
    const isPublic = path === '/login' || path === '/privacy'
    if (!user && !isPublic) {
      navigate('/login', { replace: true })
    }
    if (user && path === '/login') {
      navigate('/', { replace: true })
    }
  }, [user, location.pathname, navigate])

  // Deep-link: /history/:id → load shift
  useEffect(() => {
    const m = location.pathname.match(/^\/history\/([^/]+)\/?$/)
    if (!m || !user || loading) return
    const id = decodeURIComponent(m[1])
    const item = data.history.find((h) => h.id === id)
    if (!item) return
    const assigned = new Set(item.assignments.flatMap((a) => a.workerIds))
    adoptCleanDraft({
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
    navigate('/shift', { replace: true })
  }, [
    location.pathname,
    user,
    loading,
    data.history,
    data.lanes,
    navigate,
    setShiftStep,
    adoptCleanDraft,
  ])

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
    adoptCleanDraft({
      id: uuid(),
      date: todayISO(),
      shiftType: defaultShiftType(),
      activeLaneIds: [],
      presentWorkerIds: [],
      assignments: [],
      warnings: [],
      unassignedWorkerIds: [],
    })
    setShiftStep('lanes')
    setView('shift')
  }, [adoptCleanDraft, setShiftStep, setView])

  const discardDraft = useCallback(() => {
    draftBaselineRef.current = null
    setDraftDirty(false)
    setDraft(null)
    clearDraftStorage()
    setShiftStep('lanes')
    setView('home')
  }, [setShiftStep, setView])

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
      if (!has) {
        return {
          ...d,
          presentWorkerIds: [...d.presentWorkerIds, workerId],
        }
      }
      const presentWorkerIds = d.presentWorkerIds.filter((id) => id !== workerId)
      const assignments = padAssignments(d.assignments, data.lanes, d.activeLaneIds).map(
        (a) => {
          const workerIds = a.workerIds.map((id) => (id === workerId ? '' : id))
          const lane = data.lanes.find((l) => l.id === a.laneId)
          const std = lane?.staffingStandard ?? 1
          while (workerIds.length > std && !workerIds[workerIds.length - 1]) {
            workerIds.pop()
          }
          return { ...a, workerIds }
        },
      )
      const assignedIds = new Set(assignments.flatMap((a) => a.workerIds.filter(Boolean)))
      return {
        ...d,
        presentWorkerIds,
        assignments,
        unassignedWorkerIds: presentWorkerIds.filter((id) => !assignedIds.has(id)),
      }
    })
  }, [data.lanes])

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
        assignments: padAssignments(
          result.assignments.map((a) => {
            const prev = d.assignments.find((x) => x.laneId === a.laneId)
            return prev?.notes?.trim()
              ? { ...a, notes: prev.notes }
              : a
          }),
          data.lanes,
          d.activeLaneIds,
        ),
        warnings: result.warnings,
        unassignedWorkerIds: result.unassignedWorkerIds,
      }
    })
    setShiftStep('board')
  }, [data.history, data.lanes, data.workers])

  const startManualAssign = useCallback(() => {
    setDraft((d) => {
      if (!d) return d
      // Keep existing lane notes if the user already edited a draft board.
      const notesByLane = new Map(
        d.assignments
          .filter((a) => a.notes?.trim())
          .map((a) => [a.laneId, a.notes!] as const),
      )
      const empty = padAssignments([], data.lanes, d.activeLaneIds).map((a) =>
        notesByLane.has(a.laneId) ? { ...a, notes: notesByLane.get(a.laneId) } : a,
      )
      return {
        ...d,
        assignments: empty,
        warnings: [],
        unassignedWorkerIds: [...d.presentWorkerIds],
      }
    })
    setShiftStep('board')
  }, [data.lanes])

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

  const swapAssignments = useCallback(
    (
      a: { laneId: string; slotIndex: number },
      b: { laneId: string; slotIndex: number },
    ) => {
      setDraft((d) => {
        if (!d) return d
        if (a.laneId === b.laneId && a.slotIndex === b.slotIndex) return d
        const padded = padAssignments(d.assignments, data.lanes, d.activeLaneIds).map(
          (row) => ({ ...row, workerIds: [...row.workerIds] }),
        )
        const laneA = padded.find((row) => row.laneId === a.laneId)
        const laneB = padded.find((row) => row.laneId === b.laneId)
        if (!laneA || !laneB) return d
        while (laneA.workerIds.length <= a.slotIndex) laneA.workerIds.push('')
        while (laneB.workerIds.length <= b.slotIndex) laneB.workerIds.push('')
        const tmp = laneA.workerIds[a.slotIndex] || ''
        laneA.workerIds[a.slotIndex] = laneB.workerIds[b.slotIndex] || ''
        laneB.workerIds[b.slotIndex] = tmp

        const trimTrailing = (row: (typeof padded)[number]) => {
          const lane = data.lanes.find((l) => l.id === row.laneId)
          const std = lane?.staffingStandard ?? 1
          while (
            row.workerIds.length > std &&
            !row.workerIds[row.workerIds.length - 1]
          ) {
            row.workerIds.pop()
          }
        }
        trimTrailing(laneA)
        trimTrailing(laneB)

        const assignedIds = new Set(padded.flatMap((row) => row.workerIds.filter(Boolean)))
        return {
          ...d,
          assignments: padded,
          unassignedWorkerIds: d.presentWorkerIds.filter((id) => !assignedIds.has(id)),
        }
      })
    },
    [data.lanes],
  )

  const updateLaneNotes = useCallback(
    (laneId: string, notes: string) => {
      setDraft((d) => {
        if (!d) return d
        const padded = padAssignments(d.assignments, data.lanes, d.activeLaneIds).map(
          (a) =>
            a.laneId === laneId
              ? { ...a, notes: notes.trim() ? notes : undefined }
              : a,
        )
        return { ...d, assignments: padded }
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

  const removeWorkerFromShift = useCallback(
    (workerId: string) => {
      setDraft((d) => {
        if (!d) return d
        const presentWorkerIds = d.presentWorkerIds.filter((id) => id !== workerId)
        const assignments = padAssignments(d.assignments, data.lanes, d.activeLaneIds).map(
          (a) => {
            const workerIds = a.workerIds.map((id) => (id === workerId ? '' : id))
            const lane = data.lanes.find((l) => l.id === a.laneId)
            const std = lane?.staffingStandard ?? 1
            while (workerIds.length > std && !workerIds[workerIds.length - 1]) {
              workerIds.pop()
            }
            return { ...a, workerIds }
          },
        )
        const assignedIds = new Set(assignments.flatMap((a) => a.workerIds.filter(Boolean)))
        return {
          ...d,
          presentWorkerIds,
          assignments,
          unassignedWorkerIds: presentWorkerIds.filter((id) => !assignedIds.has(id)),
        }
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
      const saved = await saveShiftRemote(schedule, data.revision ?? 0)
      skipNextSync.current = true
      setData(saved)
      saveAppDataCache(saved)
      // Saved state becomes the new clean baseline — no lingering draft in storage.
      draftBaselineRef.current = snapshotDraft(draft)
      setDraftDirty(false)
      clearDraftStorage()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) handleAuthFailure()
      if (e instanceof ApiError && e.status === 409 && e.current) {
        skipNextSync.current = true
        setData(e.current)
        saveAppDataCache(e.current)
      }
      setError(e instanceof Error ? e.message : 'שמירת השיבוץ נכשלה')
      throw e
    } finally {
      setSyncing(false)
    }
  }, [draft, toSchedule, data.revision, handleAuthFailure])

  const loadShiftFromHistory = useCallback(
    (id: string) => {
      navigate(`/history/${encodeURIComponent(id)}`)
    },
    [navigate],
  )

  const deleteHistoryItem = useCallback(async (id: string) => {
    setSyncing(true)
    try {
      const saved = await deleteShiftRemote(id, dataRef.current.revision ?? 0)
      skipNextSync.current = true
      setData(saved)
      saveAppDataCache(saved)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) handleAuthFailure()
      if (e instanceof ApiError && e.status === 409 && e.current) {
        skipNextSync.current = true
        setData(e.current)
        saveAppDataCache(e.current)
      }
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה')
    } finally {
      setSyncing(false)
    }
  }, [handleAuthFailure])

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
      const seeded = await seedAppDataRemote(dataRef.current.revision ?? 0)
      skipNextSync.current = true
      setData(seeded)
      saveAppDataCache(seeded)
      draftBaselineRef.current = null
      setDraftDirty(false)
      setDraft(null)
      clearDraftStorage()
      setView('home')
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) handleAuthFailure()
      if (e instanceof ApiError && e.status === 409 && e.current) {
        skipNextSync.current = true
        setData(e.current)
        saveAppDataCache(e.current)
      }
      setError(e instanceof Error ? e.message : 'איפוס נכשל')
    } finally {
      setSyncing(false)
    }
  }, [setView, handleAuthFailure])

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      loading,
      refreshing,
      syncing,
      error,
      user,
      login,
      checkLogin,
      requestPasswordReset,
      resendManagerTempPassword,
      logout,
      view,
      setView,
      shiftStep,
      setShiftStep,
      draft,
      draftDirty,
      startShift,
      discardDraft,
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
      updateLaneNotes,
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
      refreshing,
      syncing,
      error,
      user,
      login,
      checkLogin,
      requestPasswordReset,
      resendManagerTempPassword,
      logout,
      view,
      setView,
      shiftStep,
      setShiftStep,
      draft,
      draftDirty,
      startShift,
      discardDraft,
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
      updateLaneNotes,
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
