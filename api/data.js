import { readState, writeState } from '../server/data.js'
import { actorFromRequest } from '../server/audit.js'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.status(200).json(await readState())
      return
    }
    if (req.method === 'PUT') {
      res.status(200).json(await writeState(req.body, { actor: actorFromRequest(req) }))
      return
    }
    res.setHeader('Allow', 'GET, PUT')
    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to handle data request' })
  }
}
