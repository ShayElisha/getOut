import { deleteShift, upsertShift } from '../../server/data.js'
import { actorFromRequest } from '../../server/audit.js'

export default async function handler(req, res) {
  const id = req.query.id
  if (!id || Array.isArray(id)) {
    res.status(400).json({ error: 'Missing shift id' })
    return
  }

  try {
    if (req.method === 'PUT') {
      res.status(200).json(await upsertShift(id, req.body, actorFromRequest(req)))
      return
    }
    if (req.method === 'DELETE') {
      res.status(200).json(await deleteShift(id, actorFromRequest(req)))
      return
    }
    res.setHeader('Allow', 'PUT, DELETE')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to handle shift request' })
  }
}
