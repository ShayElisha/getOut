import { createSeedData, writeState } from '../server/data.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    res.status(200).json(await writeState(createSeedData()))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to seed data' })
  }
}
