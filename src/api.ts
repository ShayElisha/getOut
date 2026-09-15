import type { AppData, ShiftSchedule } from './types'
import type { SessionUser } from './auth'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let message = `API error ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body?.error) message = body.error
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export function fetchAppData(): Promise<AppData> {
  return request<AppData>('/api/data')
}

export function saveAppDataRemote(data: AppData): Promise<AppData> {
  return request<AppData>('/api/data', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export function seedAppDataRemote(): Promise<AppData> {
  return request<AppData>('/api/seed', { method: 'POST' })
}

export function saveShiftRemote(schedule: ShiftSchedule): Promise<AppData> {
  return request<AppData>(`/api/shifts/${schedule.id}`, {
    method: 'PUT',
    body: JSON.stringify(schedule),
  })
}

export function deleteShiftRemote(id: string): Promise<AppData> {
  return request<AppData>(`/api/shifts/${id}`, { method: 'DELETE' })
}

export function loginRemote(phone: string): Promise<SessionUser> {
  return request<SessionUser>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}
