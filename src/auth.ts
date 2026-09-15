import type { Worker } from './types'

const SESSION_KEY = 'shibutzon-session'

export interface SessionUser {
  id: string
  fullName: string
  phone: string
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionUser
    if (!parsed?.id || !parsed?.phone) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSession(user: SessionUser): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function sessionFromWorker(w: Worker): SessionUser {
  return { id: w.id, fullName: w.fullName, phone: w.phone }
}
