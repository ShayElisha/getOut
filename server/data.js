import { randomUUID } from 'node:crypto'
import { getStateCollection } from './db.js'
import { appendAuditLog, summarizeAppDataChange } from './audit.js'
import {
  hashPassword,
  validatePasswordRules,
  verifyPassword,
} from './password.js'

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
  const worker = {
    id: w.id,
    fullName: w.fullName || '',
    phone: w.phone || '',
    certifications: Array.isArray(w.certifications) ? w.certifications : [],
    status: w.status === 'inactive' ? 'inactive' : 'active',
    isManager: Boolean(w.isManager) || isDefaultManager(w),
  }
  if (typeof w.passwordHash === 'string' && w.passwordHash) {
    worker.passwordHash = w.passwordHash
  }
  return worker
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
    revision: Number.isFinite(Number(raw?.revision)) ? Number(raw.revision) : 0,
  }
}

/** Strip secrets before sending AppData to clients. */
export function publicData(data) {
  if (!data) return data
  return {
    ...data,
    workers: Array.isArray(data.workers)
      ? data.workers.map(({ passwordHash: _h, ...w }) => w)
      : [],
  }
}

function mergePasswordHashes(incomingWorkers, prevWorkers) {
  const prevHashes = new Map(
    (prevWorkers || [])
      .filter((w) => w?.id && w.passwordHash)
      .map((w) => [w.id, w.passwordHash]),
  )
  return incomingWorkers.map((w) => {
    if (w.passwordHash) return w
    const kept = prevHashes.get(w.id)
    if (!kept) return w
    return { ...w, passwordHash: kept }
  })
}

export async function readState() {
  const col = await getStateCollection()
  const doc = await col.findOne({ _id: 'main' })
  if (!doc) {
    const seed = createSeedData()
    const revision = 1
    await col.insertOne({
      _id: 'main',
      ...seed,
      revision,
      updatedAt: new Date(),
    })
    return { ...seed, revision }
  }
  return normalizeData(doc)
}

export async function writeState(data, options = {}) {
  const col = await getStateCollection()
  const prevDoc = await col.findOne({ _id: 'main' })
  const prev = prevDoc ? normalizeData(prevDoc) : null
  const currentRevision = prev?.revision ?? 0

  if (
    options.expectedRevision != null &&
    Number(options.expectedRevision) !== currentRevision
  ) {
    const err = new Error(
      'הנתונים עודכנו ע״י מנהל אחר. רעננו את המסך וחזרו על השינוי.',
    )
    err.status = 409
    err.current = publicData(prev)
    throw err
  }

  const normalized = normalizeData(data)
  const payload = {
    ...normalized,
    workers: mergePasswordHashes(normalized.workers, prev?.workers),
  }
  const nextRevision = currentRevision + 1
  const toStore = {
    workers: payload.workers,
    lanes: payload.lanes,
    history: payload.history,
    certificationsCatalog: payload.certificationsCatalog,
    revision: nextRevision,
    updatedAt: new Date(),
  }

  await col.updateOne({ _id: 'main' }, { $set: toStore }, { upsert: true })

  const result = { ...payload, revision: nextRevision }

  if (!options.skipAudit) {
    if (options.action === 'data_reset') {
      await appendAuditLog({
        action: 'data_reset',
        actor: options.actor,
        details: options.details || 'איפוס לכל נתוני הדוגמה',
      })
    } else if (prev) {
      const summary = summarizeAppDataChange(prev, result)
      if (summary) {
        await appendAuditLog({
          action: 'data_update',
          actor: options.actor,
          details: summary,
        })
      }
    }
  }

  return publicData(result)
}

export async function loginByPhone(phoneRaw, credentials = {}) {
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

  const hasPassword = Boolean(manager.passwordHash)
  const password =
    typeof credentials.password === 'string' ? credentials.password : ''
  const passwordConfirm =
    typeof credentials.passwordConfirm === 'string'
      ? credentials.passwordConfirm
      : ''

  // Step 1: phone only — tell the client which password UI to show.
  if (!password) {
    return {
      next: hasPassword ? 'login' : 'setup',
      phone: manager.phone,
    }
  }

  if (!hasPassword) {
    const ruleError = validatePasswordRules(password)
    if (ruleError) {
      const err = new Error(ruleError)
      err.status = 400
      throw err
    }
    if (password !== passwordConfirm) {
      const err = new Error('אימות הסיסמה אינו תואם')
      err.status = 400
      throw err
    }
    const passwordHash = await hashPassword(password)
    await writeState(
      {
        ...data,
        workers: data.workers.map((w) =>
          w.id === manager.id ? { ...w, passwordHash } : w,
        ),
      },
      { skipAudit: true },
    )
    const user = {
      id: manager.id,
      fullName: manager.fullName,
      phone: manager.phone,
    }
    await appendAuditLog({
      action: 'login',
      actor: user,
      details: 'הגדרת סיסמה והתחברות',
    })
    return user
  }

  const ok = await verifyPassword(password, manager.passwordHash)
  if (!ok) {
    const err = new Error('סיסמה שגויה')
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

export async function upsertShift(id, body, actor, options = {}) {
  const state = await readState()
  const schedule = { ...body, id }
  delete schedule.actor
  delete schedule.expectedRevision
  const idx = state.history.findIndex((h) => h.id === schedule.id)
  const isNew = idx === -1
  const history =
    isNew
      ? [schedule, ...state.history]
      : state.history.map((h, i) => (i === idx ? { ...h, ...schedule } : h))
  const saved = await writeState(
    { ...state, history },
    {
      skipAudit: true,
      expectedRevision: options.expectedRevision,
    },
  )
  await appendAuditLog({
    action: isNew ? 'shift_save' : 'shift_update',
    actor,
    details: `${schedule.date || '?'} · ${schedule.shiftType || '?'} · ${(schedule.activeLaneIds || []).length} נתיבים · ${(schedule.assignments || []).reduce((n, a) => n + (a.workerIds?.filter(Boolean).length || 0), 0)} שיבוצים`,
  })
  return saved
}

export async function deleteShift(id, actor, options = {}) {
  const state = await readState()
  const existing = state.history.find((h) => h.id === id)
  const saved = await writeState(
    {
      ...state,
      history: state.history.filter((h) => h.id !== id),
    },
    {
      skipAudit: true,
      expectedRevision: options.expectedRevision,
    },
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
