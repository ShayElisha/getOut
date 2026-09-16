import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { listAuditLogs } from './audit.js'
import {
  createSeedData,
  deleteShift,
  loginByPhone,
  readState,
  upsertShift,
  writeState,
} from './data.js'
import { getDb } from './db.js'
import { assertRateLimit, clientKey } from './rateLimit.js'
import { createSessionToken, requireUser } from './session.js'

const PORT = Number(process.env.PORT || 3001)

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

function sendError(res, err) {
  const status = err.status || 500
  if (status >= 500) console.error(err)
  const body = { error: err.message || 'שגיאת שרת' }
  if (err.current) body.current = err.current
  if (err.retryAfterSec) body.retryAfterSec = err.retryAfterSec
  res.status(status).json(body)
}

app.get('/api/health', async (_req, res) => {
  try {
    await getDb()
    res.json({
      ok: true,
      db: true,
      at: new Date().toISOString(),
      service: 'shibutzon-api',
    })
  } catch {
    res.status(500).json({ ok: false, db: false })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const phone = String(req.body?.phone || '')
    await assertRateLimit({
      key: `login:${clientKey(req)}:${phone.replace(/\D/g, '') || 'empty'}`,
      limit: 10,
      windowMs: 15 * 60_000,
    })
    const user = await loginByPhone(phone)
    const token = createSessionToken(user)
    res.json({ ...user, token })
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/data', async (req, res) => {
  try {
    requireUser(req)
    res.json(await readState())
  } catch (err) {
    sendError(res, err)
  }
})

app.put('/api/data', async (req, res) => {
  try {
    const actor = requireUser(req)
    const expectedRevision =
      req.body?.expectedRevision ?? req.headers['x-expected-revision']
    const { expectedRevision: _er, ...data } = req.body || {}
    res.json(
      await writeState(data, {
        actor,
        expectedRevision:
          expectedRevision === undefined || expectedRevision === ''
            ? undefined
            : Number(expectedRevision),
      }),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.post('/api/seed', async (req, res) => {
  try {
    const actor = requireUser(req)
    if (req.body?.confirm !== 'RESET') {
      const err = new Error('לאיפוס יש לשלוח confirm: \"RESET\"')
      err.status = 400
      throw err
    }
    res.json(
      await writeState(createSeedData(), {
        action: 'data_reset',
        actor,
        expectedRevision:
          req.body?.expectedRevision != null
            ? Number(req.body.expectedRevision)
            : undefined,
      }),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.put('/api/shifts/:id', async (req, res) => {
  try {
    const actor = requireUser(req)
    const body = req.body || {}
    const expectedRevision = body.expectedRevision
    delete body.expectedRevision
    res.json(
      await upsertShift(req.params.id, body, actor, {
        expectedRevision:
          expectedRevision === undefined ? undefined : Number(expectedRevision),
      }),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.delete('/api/shifts/:id', async (req, res) => {
  try {
    const actor = requireUser(req)
    const expectedRevision = req.query.expectedRevision
    res.json(
      await deleteShift(req.params.id, actor, {
        expectedRevision:
          expectedRevision === undefined ? undefined : Number(expectedRevision),
      }),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/audit', async (req, res) => {
  try {
    requireUser(req)
    res.json(await listAuditLogs({ limit: req.query.limit }))
  } catch (err) {
    sendError(res, err)
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
