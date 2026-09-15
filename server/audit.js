import { randomUUID } from 'node:crypto'
import { getAuditCollection } from './db.js'

/**
 * @typedef {{ id?: string, fullName?: string, phone?: string } | null} AuditActor
 */

/**
 * @param {{ action: string, actor?: AuditActor, details?: string }} entry
 */
export async function appendAuditLog({ action, actor, details }) {
  const col = await getAuditCollection()
  const doc = {
    id: randomUUID(),
    at: new Date().toISOString(),
    action: String(action || 'unknown'),
    actor: actor
      ? {
          id: actor.id || '',
          fullName: actor.fullName || '',
          phone: actor.phone || '',
        }
      : null,
    details: String(details || ''),
  }
  await col.insertOne(doc)
  return {
    id: doc.id,
    at: doc.at,
    action: doc.action,
    actor: doc.actor,
    details: doc.details,
  }
}

/**
 * @param {{ limit?: number }} [opts]
 */
export async function listAuditLogs(opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 150, 1), 500)
  const col = await getAuditCollection()
  const docs = await col.find({}).sort({ at: -1 }).limit(limit).toArray()
  return docs.map((d) => ({
    id: d.id,
    at: d.at,
    action: d.action,
    actor: d.actor ?? null,
    details: d.details || '',
  }))
}

/** @param {import('express').Request | { headers?: Record<string, string|string[]|undefined>, body?: unknown }} req */
export function actorFromRequest(req) {
  const headers = req.headers || {}
  const id = headerValue(headers['x-actor-id'])
  if (id) {
    return {
      id,
      fullName: decodeURIComponent(headerValue(headers['x-actor-name']) || ''),
      phone: headerValue(headers['x-actor-phone']) || '',
    }
  }
  const body = req.body
  if (body && typeof body === 'object' && body.actor && typeof body.actor === 'object') {
    return {
      id: body.actor.id || '',
      fullName: body.actor.fullName || '',
      phone: body.actor.phone || '',
    }
  }
  return null
}

function headerValue(v) {
  if (Array.isArray(v)) return v[0] || ''
  return v || ''
}

export function summarizeAppDataChange(prev, next) {
  const parts = []
  const pw = prev?.workers ?? []
  const nw = next?.workers ?? []
  if (pw.length !== nw.length) {
    parts.push(`בודקים ${pw.length}→${nw.length}`)
  } else {
    const changedWorkers = nw.filter((w) => {
      const o = pw.find((x) => x.id === w.id)
      if (!o) return true
      return (
        o.fullName !== w.fullName ||
        o.phone !== w.phone ||
        o.status !== w.status ||
        o.isManager !== w.isManager ||
        JSON.stringify(o.certifications) !== JSON.stringify(w.certifications)
      )
    }).length
    if (changedWorkers) parts.push(`עודכנו ${changedWorkers} בודקים`)
  }

  const pl = prev?.lanes ?? []
  const nl = next?.lanes ?? []
  if (pl.length !== nl.length) {
    parts.push(`נתיבים ${pl.length}→${nl.length}`)
  } else {
    const changedLanes = nl.filter((l) => {
      const o = pl.find((x) => x.id === l.id)
      if (!o) return true
      return (
        o.name !== l.name ||
        o.staffingStandard !== l.staffingStandard ||
        o.intensity !== l.intensity ||
        JSON.stringify(o.requiredCertifications) !==
          JSON.stringify(l.requiredCertifications)
      )
    }).length
    if (changedLanes) parts.push(`עודכנו ${changedLanes} נתיבים`)
  }

  const pc = prev?.certificationsCatalog ?? []
  const nc = next?.certificationsCatalog ?? []
  if (JSON.stringify(pc) !== JSON.stringify(nc)) {
    parts.push(`הסמכות ${pc.length}→${nc.length}`)
  }

  return parts.join(' · ')
}
