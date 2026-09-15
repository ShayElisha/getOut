import { getDb } from '../server/db.js'

export default async function handler(_req, res) {
  try {
    await getDb()
    res.status(200).json({ ok: true, db: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, db: false, error: err.message })
  }
}
