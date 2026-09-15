import { randomUUID } from 'node:crypto'
import { getStateCollection } from './db.js'

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

export function normalizeData(raw) {
  return {
    workers: Array.isArray(raw?.workers) ? raw.workers.map(normalizeWorker) : [],
    lanes: Array.isArray(raw?.lanes) ? raw.lanes : [],
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

export async function writeState(data) {
  const col = await getStateCollection()
  const payload = normalizeData(data)
  await col.updateOne(
    { _id: 'main' },
    { $set: { ...payload, updatedAt: new Date() } },
    { upsert: true },
  )
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
  return {
    id: manager.id,
    fullName: manager.fullName,
    phone: manager.phone,
  }
}

export async function upsertShift(id, body) {
  const state = await readState()
  const schedule = { ...body, id }
  const idx = state.history.findIndex((h) => h.id === schedule.id)
  const history =
    idx === -1
      ? [schedule, ...state.history]
      : state.history.map((h, i) => (i === idx ? { ...h, ...schedule } : h))
  return writeState({ ...state, history })
}

export async function deleteShift(id) {
  const state = await readState()
  return writeState({
    ...state,
    history: state.history.filter((h) => h.id !== id),
  })
}
