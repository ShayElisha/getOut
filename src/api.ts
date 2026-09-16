import type { AppData, ShiftSchedule } from './types'
import { clearSession, loadSession, type SessionUser } from './auth'

export class ApiError extends Error {
  status: number
  current?: AppData

  constructor(message: string, status: number, current?: AppData) {
    super(message)
    this.status = status
    this.current = current
  }
}

function authHeaders(): HeadersInit {
  const s = loadSession()
  if (!s?.token) return {}
  return { Authorization: `Bearer ${s.token}` }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let message = `API error ${res.status}`
    let current: AppData | undefined
    try {
      const body = (await res.json()) as {
        error?: string
        current?: AppData
      }
      if (body?.error) message = body.error
      if (body?.current) current = body.current
    } catch {
      /* ignore */
    }
    if (res.status === 401) {
      clearSession()
    }
    throw new ApiError(message, res.status, current)
  }
  return res.json() as Promise<T>
}

export function fetchAppData(): Promise<AppData> {
  return request<AppData>('/api/data')
}

export function saveAppDataRemote(data: AppData): Promise<AppData> {
  const { revision, ...rest } = data
  return request<AppData>('/api/data', {
    method: 'PUT',
    body: JSON.stringify({ ...rest, expectedRevision: revision ?? 0 }),
  })
}

export function seedAppDataRemote(expectedRevision?: number): Promise<AppData> {
  return request<AppData>('/api/seed', {
    method: 'POST',
    body: JSON.stringify({
      confirm: 'RESET',
      expectedRevision,
    }),
  })
}

export function saveShiftRemote(
  schedule: ShiftSchedule,
  expectedRevision?: number,
): Promise<AppData> {
  return request<AppData>(`/api/shifts/${schedule.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...schedule, expectedRevision }),
  })
}

export function deleteShiftRemote(
  id: string,
  expectedRevision?: number,
): Promise<AppData> {
  const q =
    expectedRevision == null ? '' : `?expectedRevision=${expectedRevision}`
  return request<AppData>(`/api/shifts/${id}${q}`, { method: 'DELETE' })
}

export type LoginNextStep = 'setup' | 'login'

export function checkLoginRemote(
  phone: string,
): Promise<{ next: LoginNextStep; phone: string }> {
  return request<{ next: LoginNextStep; phone: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export function loginRemote(
  phone: string,
  password: string,
  passwordConfirm?: string,
): Promise<SessionUser & { token: string }> {
  return request<SessionUser & { token: string }>('/api/login', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      password,
      ...(passwordConfirm !== undefined ? { passwordConfirm } : {}),
    }),
  })
}

export interface AuditLogEntry {
  id: string
  at: string
  action: string
  actor: { id: string; fullName: string; phone: string } | null
  details: string
}

export function fetchAuditLogs(limit = 150): Promise<AuditLogEntry[]> {
  return request<AuditLogEntry[]>(`/api/audit?limit=${limit}`)
}
