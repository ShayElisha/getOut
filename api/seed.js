import { createSeedData, writeState } from '../server/data.js'
import { actorFromRequest } from '../server/audit.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    res.status(200).json(
      await writeState(createSeedData(), {
        action: 'data_reset',
        actor: actorFromRequest(req),
      }),
    )
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to seed data' })
  }
}
