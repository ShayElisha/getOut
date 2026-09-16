import { listAuditLogs } from '../server/audit.js'
import { requireUser } from '../server/session.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    requireUser(req)
    const limit = req.query?.limit
    res.status(200).json(await listAuditLogs({ limit }))
  } catch (err) {
    const status = err.status || 500
    if (status >= 500) console.error(err)
    res.status(status).json({ error: err.message || 'Failed to load audit log' })
  }
}
