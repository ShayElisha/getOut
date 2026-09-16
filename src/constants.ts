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

/** Display hours for each shift window */
export const SHIFT_WINDOW_LABELS: Record<ShiftType, string> = {
  morning: '06:00–15:00',
  afternoon: '15:00–21:30',
  night: '21:30–06:00',
}

function toDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Current operational shift by clock:
 * morning until 15:00, afternoon until 21:30, night until 06:00.
 * Night after midnight still belongs to the previous calendar date.
 */
export function getCurrentShiftContext(now = new Date()): {
  date: string
  shiftType: ShiftType
  windowLabel: string
} {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const morningStart = 6 * 60
  const afternoonStart = 15 * 60
  const nightStart = 21 * 60 + 30

  if (minutes >= morningStart && minutes < afternoonStart) {
    return {
      date: toDateISO(now),
      shiftType: 'morning',
      windowLabel: SHIFT_WINDOW_LABELS.morning,
    }
  }
  if (minutes >= afternoonStart && minutes < nightStart) {
    return {
      date: toDateISO(now),
      shiftType: 'afternoon',
      windowLabel: SHIFT_WINDOW_LABELS.afternoon,
    }
  }
  if (minutes >= nightStart) {
    return {
      date: toDateISO(now),
      shiftType: 'night',
      windowLabel: SHIFT_WINDOW_LABELS.night,
    }
  }
  // 00:00–05:59 → night that started yesterday evening
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return {
    date: toDateISO(yesterday),
    shiftType: 'night',
    windowLabel: SHIFT_WINDOW_LABELS.night,
  }
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
