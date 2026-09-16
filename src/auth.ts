import type { Worker } from './types'

const SESSION_KEY = 'shibutzon-session'
const DRAFT_KEY = 'shibutzon-draft'
const SHIFT_STEP_KEY = 'shibutzon-shift-step'

export interface SessionUser {
  id: string
  fullName: string
  phone: string
  token: string
}

export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionUser
    if (!parsed?.id || !parsed?.phone || !parsed?.token) return null
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

export function sessionFromWorker(w: Worker, token: string): SessionUser {
  return { id: w.id, fullName: w.fullName, phone: w.phone, token }
}

export function loadDraftJson(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY)
  } catch {
    return null
  }
}

export function saveDraftJson(json: string): void {
  localStorage.setItem(DRAFT_KEY, json)
}

export function clearDraftStorage(): void {
  localStorage.removeItem(DRAFT_KEY)
  localStorage.removeItem(SHIFT_STEP_KEY)
}

export function loadShiftStep(): string | null {
  try {
    return localStorage.getItem(SHIFT_STEP_KEY)
  } catch {
    return null
  }
}

export function saveShiftStep(step: string): void {
  localStorage.setItem(SHIFT_STEP_KEY, step)
}
