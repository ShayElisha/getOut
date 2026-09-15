import type { Intensity, ShiftType } from './types'

export const INTENSITY_LABELS: Record<Intensity, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
}

export const INTENSITY_SCORE: Record<Intensity, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  night: 'לילה',
}

export const DEFAULT_CERTIFICATIONS = [
  'בדיקת דרכונים',
  'בידוק ביטחוני',
  'נתיב מהיר',
  'כבודה',
  'ראיון',
  'מפקד נתיב',
]

export const STORAGE_KEY = 'shibutzon-v2'
