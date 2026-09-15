import { randomUUID } from 'node:crypto'
import { getStateCollection } from './db.js'
import { appendAuditLog, summarizeAppDataChange } from './audit.js'

export const DEFAULT_CERTIFICATIONS = [
  'בדיקת דרכונים',
  'בידוק ביטחוני',
  'נתיב מהיר',
  'כבודה',
  'ראיון',
  'מפקד נתיב',
]

const WORKER_ROSTER = [
  { fullName: 'אביב חי טפלשוילי', phone: '0508676524' },
  { fullName: 'אבירן אברהם דסה', phone: '0539633063' },
  { fullName: 'אדיר דאי', phone: '0528885977' },
  { fullName: 'אוריה כהן', phone: '0536071196' },
  { fullName: 'אירנה גלפרין', phone: '0537273180' },
  { fullName: 'אליאן דדון', phone: '0524776343' },
  { fullName: 'דור בכור', phone: '0502384846' },
  { fullName: 'זיווה אלמדאי', phone: '0505250483' },
  { fullName: 'חיה מנגדיש', phone: '0506945567' },
  { fullName: 'לאון קולסניק', phone: '0542064272' },
  { fullName: 'לירז דרבה', phone: '0539277541' },
  { fullName: 'מעיין איילי', phone: '0539740744' },
  { fullName: 'מעיין באסטקאר', phone: '0534280149' },
  { fullName: 'נתנאל מאיר', phone: '0525651294' },
  { fullName: 'עדי אנגאו', phone: '0538916668' },
  { fullName: 'קורל שמואל', phone: '0549486021' },
  { fullName: 'קיריל ליטבק', phone: '0538658879' },
  { fullName: 'קריסטינה שקיראק', phone: '0526442431' },
  { fullName: 'רונית בכר', phone: '0535586417' },
  { fullName: "שחר צ'קול", phone: '0507433706' },
  { fullName: 'שי אלישע', phone: '0537171884', isManager: true },
  { fullName: 'שיראל טגבה', phone: '0533200457' },
]

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '')
}

function isDefaultManager(w) {
  return w.fullName === 'שי אלישע' || normalizePhone(w.phone) === '0537171884'
}

export function createSeedData() {
  return {
    workers: WORKER_ROSTER.map((w) => ({
      id: randomUUID(),
      fullName: w.fullName,
      phone: w.phone,
      certifications: [],
      status: 'active',
      isManager: Boolean(w.isManager) || isDefaultManager(w),
    })),
    lanes: [
      {
        id: randomUUID(),
        name: 'נתיב 1',
        staffingStandard: 2,
        requiredCertifications: [],
        intensity: 'medium',
      },
      {
        id: randomUUID(),
        name: 'נתיב 2',
        staffingStandard: 1,
        requiredCertifications: [],
        intensity: 'hard',
      },
      {
        id: randomUUID(),
        name: 'נתיב מהיר',
        staffingStandard: 1,
        requiredCertifications: [],
        intensity: 'easy',
      },
      {
        id: randomUUID(),
        name: 'כבודה',
        staffingStandard: 2,
        requiredCertifications: [],
        intensity: 'hard',
      },
      {
        id: randomUUID(),
        name: 'מכס',
        staffingStandard: 1,
        requiredCertifications: [],
        intensity: 'medium',
        afternoonHandoff: true,
      },
      {
        id: randomUUID(),
        name: 'ראיונות',
        staffingStandard: 1,
        requiredCertifications: [],
        intensity: 'medium',
      },
    ],
    history: [],
    certificationsCatalog: [...DEFAULT_CERTIFICATIONS],
  }
}

function normalizeWorker(w) {
  return {
    id: w.id,
    fullName: w.fullName || '',
    phone: w.phone || '',
    certifications: Array.isArray(w.certifications) ? w.certifications : [],
    status: w.status === 'inactive' ? 'inactive' : 'active',
    isManager: Boolean(w.isManager) || isDefaultManager(w),
  }
}

function normalizeLane(l) {
  const std = Number(l?.staffingStandard)
  return {
    id: l.id,
    name: l.name || '',
    staffingStandard: std === 2 ? 2 : 1,
    requiredCertifications: Array.isArray(l.requiredCertifications)
      ? l.requiredCertifications
      : [],
    intensity:
      l.intensity === 'easy' || l.intensity === 'hard' || l.intensity === 'medium'
        ? l.intensity
        : 'medium',
    afternoonHandoff: Boolean(l.afternoonHandoff),
  }
}

export function normalizeData(raw) {
  return {
    workers: Array.isArray(raw?.workers) ? raw.workers.map(normalizeWorker) : [],
    lanes: Array.isArray(raw?.lanes) ? raw.lanes.map(normalizeLane) : [],
    history: Array.isArray(raw?.history) ? raw.history : [],
    certificationsCatalog: Array.isArray(raw?.certificationsCatalog)
      ? raw.certificationsCatalog
      : [...DEFAULT_CERTIFICATIONS],
  }
}

export async function readState() {
  const col = await getStateCollection()
  const doc = await col.findOne({ _id: 'main' })
  if (!doc) {
    const seed = createSeedData()
    await col.insertOne({ _id: 'main', ...seed, updatedAt: new Date() })
    return seed
  }
  return normalizeData(doc)
}

export async function writeState(data, options = {}) {
  const col = await getStateCollection()
  const prev = options.skipAudit ? null : await readState().catch(() => null)
  const payload = normalizeData(data)
  await col.updateOne(
    { _id: 'main' },
    { $set: { ...payload, updatedAt: new Date() } },
    { upsert: true },
  )

  if (!options.skipAudit) {
    if (options.action === 'data_reset') {
      await appendAuditLog({
        action: 'data_reset',
        actor: options.actor,
        details: options.details || 'איפוס לכל נתוני הדוגמה',
      })
    } else if (prev) {
      const summary = summarizeAppDataChange(prev, payload)
      if (summary) {
        await appendAuditLog({
          action: 'data_update',
          actor: options.actor,
          details: summary,
        })
      }
    }
  }

  return payload
}

export async function loginByPhone(phoneRaw) {
  const phone = normalizePhone(phoneRaw)
  if (!phone) {
    const err = new Error('נא להזין מספר טלפון')
    err.status = 400
    throw err
  }
  const data = await readState()
  const manager = data.workers.find(
    (w) =>
      w.isManager &&
      w.status === 'active' &&
      normalizePhone(w.phone) === phone,
  )
  if (!manager) {
    const err = new Error('אין הרשאת מנהל למספר זה')
    err.status = 401
    throw err
  }
  const user = {
    id: manager.id,
    fullName: manager.fullName,
    phone: manager.phone,
  }
  await appendAuditLog({
    action: 'login',
    actor: user,
    details: 'התחברות למערכת',
  })
  return user
}

export async function upsertShift(id, body, actor) {
  const state = await readState()
  const schedule = { ...body, id }
  delete schedule.actor
  const idx = state.history.findIndex((h) => h.id === schedule.id)
  const isNew = idx === -1
  const history =
    isNew
      ? [schedule, ...state.history]
      : state.history.map((h, i) => (i === idx ? { ...h, ...schedule } : h))
  const saved = await writeState({ ...state, history }, { skipAudit: true })
  await appendAuditLog({
    action: isNew ? 'shift_save' : 'shift_update',
    actor,
    details: `${schedule.date || '?'} · ${schedule.shiftType || '?'} · ${(schedule.activeLaneIds || []).length} נתיבים · ${(schedule.assignments || []).reduce((n, a) => n + (a.workerIds?.filter(Boolean).length || 0), 0)} שיבוצים`,
  })
  return saved
}

export async function deleteShift(id, actor) {
  const state = await readState()
  const existing = state.history.find((h) => h.id === id)
  const saved = await writeState(
    {
      ...state,
      history: state.history.filter((h) => h.id !== id),
    },
    { skipAudit: true },
  )
  await appendAuditLog({
    action: 'shift_delete',
    actor,
    details: existing
      ? `נמחק שיבוץ ${existing.date} · ${existing.shiftType}`
      : `נמחק שיבוץ ${id}`,
  })
  return saved
}
