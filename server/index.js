import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { actorFromRequest, listAuditLogs } from './audit.js'
import {
  createSeedData,
  deleteShift,
  loginByPhone,
  readState,
  upsertShift,
  writeState,
} from './data.js'
import { getDb } from './db.js'

const PORT = Number(process.env.PORT || 3001)

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    await getDb()
    res.json({ ok: true, db: true })
  } catch {
    res.status(500).json({ ok: false, db: false })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const user = await loginByPhone(req.body?.phone)
    res.json(user)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'התחברות נכשלה' })
  }
})

app.get('/api/data', async (_req, res) => {
  try {
    res.json(await readState())
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load data' })
  }
})

app.put('/api/data', async (req, res) => {
  try {
    res.json(await writeState(req.body, { actor: actorFromRequest(req) }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save data' })
  }
})

app.post('/api/seed', async (req, res) => {
  try {
    res.json(
      await writeState(createSeedData(), {
        action: 'data_reset',
        actor: actorFromRequest(req),
      }),
    )
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to seed data' })
  }
})

app.put('/api/shifts/:id', async (req, res) => {
  try {
    res.json(await upsertShift(req.params.id, req.body, actorFromRequest(req)))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save shift' })
  }
})

app.delete('/api/shifts/:id', async (req, res) => {
  try {
    res.json(await deleteShift(req.params.id, actorFromRequest(req)))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete shift' })
  }
})

app.get('/api/audit', async (req, res) => {
  try {
    const limit = req.query.limit
    res.json(await listAuditLogs({ limit }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load audit log' })
  }
})

async function start() {
  await getDb()
  await readState()
  app.listen(PORT, () => {
    console.log(`API listening on http://127.0.0.1:${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server', err)
  process.exit(1)
})
