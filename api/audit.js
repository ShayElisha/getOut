import { listAuditLogs } from '../server/audit.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const limit = req.query?.limit
    res.status(200).json(await listAuditLogs({ limit }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load audit log' })
  }
}
