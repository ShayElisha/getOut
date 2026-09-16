import { randomUUID } from 'node:crypto'
import { getStateCollection } from './db.js'
import { appendAuditLog, summarizeAppDataChange } from './audit.js'
import { sendTempPasswordEmail } from './mail.js'
import {
  generateTempPassword,
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

export function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

export function isValidEmail(email) {
  const e = normalizeEmail(email)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
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
      email: w.email || (isDefaultManager(w) ? process.env.ADMIN_EMAIL || '' : ''),
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
    email: normalizeEmail(w.email),
    certifications: Array.isArray(w.certifications) ? w.certifications : [],
    status: w.status === 'inactive' ? 'inactive' : 'active',
    isManager: Boolean(w.isManager) || isDefaultManager(w),
  }
  if (typeof w.passwordHash === 'string' && w.passwordHash) {
    worker.passwordHash = w.passwordHash
  }
  if ('mustChangePassword' in w) {
    worker.mustChangePassword = Boolean(w.mustChangePassword)
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
      ? data.workers.map(
          ({ passwordHash: _h, mustChangePassword: _m, ...w }) => w,
        )
      : [],
  }
}

function mergeWorkerSecrets(incomingWorkers, prevWorkers) {
  const prevById = new Map((prevWorkers || []).map((w) => [w.id, w]))
  return incomingWorkers.map((w) => {
    const prev = prevById.get(w.id)
    const next = { ...w }
    if (!next.passwordHash && prev?.passwordHash) {
      next.passwordHash = prev.passwordHash
    }
    if ('mustChangePassword' in w) {
      if (w.mustChangePassword && next.isManager) {
        next.mustChangePassword = true
      } else {
        delete next.mustChangePassword
      }
    } else if (prev?.mustChangePassword && next.isManager) {
      next.mustChangePassword = true
    }
    if (!next.isManager) {
      delete next.mustChangePassword
    }
    return next
  })
}

function assertManagersHaveEmail(workers, prevWorkers) {
  const prevById = new Map((prevWorkers || []).map((w) => [w.id, w]))
  for (const w of workers) {
    if (!w.isManager) continue
    if (isValidEmail(w.email)) continue
    const prev = prevById.get(w.id)
    const newlyManager = !prev || !prev.isManager
    if (newlyManager) {
      const err = new Error(
        `לא ניתן למנות מנהל ללא מייל תקין (${w.fullName || 'ללא שם'})`,
      )
      err.status = 400
      throw err
    }
  }
}

function shouldIssueTempPassword(worker, prev) {
  if (!worker.isManager) return false
  if (!isValidEmail(worker.email)) return false
  if (!prev) return true
  if (!prev.isManager) return true
  if (!prev.passwordHash) return true
  return false
}

/**
 * Issue temp passwords + emails for new/promoted managers.
 * @returns {Promise<{ workers: object[], mailErrors: string[] }>}
 */
async function applyManagerInvites(workers, prevWorkers, options = {}) {
  if (options.skipManagerInvites) {
    return { workers, mailErrors: [] }
  }
  const prevById = new Map((prevWorkers || []).map((w) => [w.id, w]))
  const mailErrors = []
  const nextWorkers = []

  for (const w of workers) {
    const prev = prevById.get(w.id)
    if (!shouldIssueTempPassword(w, prev)) {
      nextWorkers.push(w)
      continue
    }
    const tempPassword = generateTempPassword()
    try {
      await sendTempPasswordEmail({
        to: w.email,
        fullName: w.fullName,
        tempPassword,
        reason: 'invite',
      })
    } catch (e) {
      mailErrors.push(
        `${w.fullName}: ${e instanceof Error ? e.message : 'שליחת מייל נכשלה'}`,
      )
      nextWorkers.push(w)
      continue
    }
    const passwordHash = await hashPassword(tempPassword)
    nextWorkers.push({
      ...w,
      passwordHash,
      mustChangePassword: true,
    })
    await appendAuditLog({
      action: 'manager_invite',
      actor: options.actor || null,
      details: `סיסמה זמנית נשלחה אל ${w.fullName} (${w.email})`,
    })
  }

  if (mailErrors.length > 0) {
    const err = new Error(
      `שליחת מייל למנהל נכשלה — השינויים לא נשמרו: ${mailErrors.join(' · ')}`,
    )
    err.status = 502
    throw err
  }

  return { workers: nextWorkers, mailErrors }
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
  let workers = mergeWorkerSecrets(normalized.workers, prev?.workers)
  if (!options.skipManagerInvites) {
    assertManagersHaveEmail(workers, prev?.workers)
  }

  const invited = await applyManagerInvites(workers, prev?.workers, options)
  workers = invited.workers

  const payload = {
    ...normalized,
    workers,
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
  const newPassword =
    typeof credentials.newPassword === 'string' ? credentials.newPassword : ''
  const newPasswordConfirm =
    typeof credentials.newPasswordConfirm === 'string'
      ? credentials.newPasswordConfirm
      : typeof credentials.passwordConfirm === 'string'
        ? credentials.passwordConfirm
        : ''

  // Step 1: phone only
  if (!password) {
    if (!hasPassword) {
      return {
        next: 'await_email',
        phone: manager.phone,
        message:
          'טרם הוגדרה סיסמה. פנה/י למנהל שישלח סיסמה זמנית למייל, או השתמשו באיפוס סיסמה.',
      }
    }
    return {
      next: 'login',
      phone: manager.phone,
      mustChangePassword: Boolean(manager.mustChangePassword),
    }
  }

  if (!hasPassword) {
    const err = new Error(
      'אין סיסמה לחשבון. יש לבקש סיסמה זמנית במייל ממנהל המערכת או דרך איפוס סיסמה.',
    )
    err.status = 400
    throw err
  }

  const ok = await verifyPassword(password, manager.passwordHash)
  if (!ok) {
    const err = new Error('סיסמה שגויה')
    err.status = 401
    throw err
  }

  // Forced permanent password after temp / reset
  if (manager.mustChangePassword) {
    if (!newPassword) {
      return {
        next: 'change_password',
        phone: manager.phone,
      }
    }
    const ruleError = validatePasswordRules(newPassword)
    if (ruleError) {
      const err = new Error(ruleError)
      err.status = 400
      throw err
    }
    if (newPassword !== newPasswordConfirm) {
      const err = new Error('אימות הסיסמה אינו תואם')
      err.status = 400
      throw err
    }
    if (newPassword === password) {
      const err = new Error('יש לבחור סיסמה קבועה שונה מהסיסמה הזמנית')
      err.status = 400
      throw err
    }
    const passwordHash = await hashPassword(newPassword)
    await writeState(
      {
        ...data,
        workers: data.workers.map((w) =>
          w.id === manager.id
            ? { ...w, passwordHash, mustChangePassword: false }
            : w,
        ),
      },
      { skipAudit: true, skipManagerInvites: true },
    )
    const user = {
      id: manager.id,
      fullName: manager.fullName,
      phone: manager.phone,
    }
    await appendAuditLog({
      action: 'login',
      actor: user,
      details: 'הגדרת סיסמה קבועה והתחברות',
    })
    return user
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

/** Self-service / admin: email a new temporary password. */
export async function requestPasswordReset(phoneRaw) {
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

  // Generic response — do not reveal whether the phone exists
  const generic = {
    ok: true,
    message: 'אם המספר רשום כמנהל, נשלחה סיסמה זמנית למייל המשויך.',
  }

  if (!manager || !isValidEmail(manager.email)) {
    return generic
  }

  const tempPassword = generateTempPassword()
  try {
    await sendTempPasswordEmail({
      to: manager.email,
      fullName: manager.fullName,
      tempPassword,
      reason: 'reset',
    })
  } catch (e) {
    console.error('password reset mail failed', e)
    const err = new Error(
      e instanceof Error && e.status === 503
        ? e.message
        : 'שליחת מייל האיפוס נכשלה. נסו שוב מאוחר יותר.',
    )
    err.status = e?.status || 502
    throw err
  }

  const passwordHash = await hashPassword(tempPassword)
  await writeState(
    {
      ...data,
      workers: data.workers.map((w) =>
        w.id === manager.id
          ? { ...w, passwordHash, mustChangePassword: true }
          : w,
      ),
    },
    { skipAudit: true, skipManagerInvites: true },
  )

  await appendAuditLog({
    action: 'password_reset',
    actor: { id: manager.id, fullName: manager.fullName, phone: manager.phone },
    details: `איפוס סיסמה נשלח אל ${manager.email}`,
  })

  return generic
}

/** Authenticated: re-send temporary password to a manager. */
export async function resendManagerTempPassword(workerId, actor) {
  const data = await readState()
  const manager = data.workers.find((w) => w.id === workerId)
  if (!manager || !manager.isManager) {
    const err = new Error('המשתמש אינו מנהל')
    err.status = 400
    throw err
  }
  if (!isValidEmail(manager.email)) {
    const err = new Error('למנהל חובה כתובת מייל תקינה לפני שליחת סיסמה')
    err.status = 400
    throw err
  }

  const tempPassword = generateTempPassword()
  await sendTempPasswordEmail({
    to: manager.email,
    fullName: manager.fullName,
    tempPassword,
    reason: 'invite',
  })

  const passwordHash = await hashPassword(tempPassword)
  await writeState(
    {
      ...data,
      workers: data.workers.map((w) =>
        w.id === manager.id
          ? { ...w, passwordHash, mustChangePassword: true }
          : w,
      ),
    },
    { skipAudit: true, skipManagerInvites: true },
  )

  await appendAuditLog({
    action: 'manager_invite',
    actor: actor || null,
    details: `סיסמה זמנית נשלחה מחדש אל ${manager.fullName} (${manager.email})`,
  })
  return { ok: true }
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
