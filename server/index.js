import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT || 3001)
const URI = process.env.MONGODB_URI

if (!URI) {
  console.error('Missing MONGODB_URI in .env')
  process.exit(1)
}

const DEFAULT_CERTIFICATIONS = [
  'בדיקת דרכונים',
  'בידוק ביטחוני',
  'נתיב מהיר',
  'כבודה',
  'ראיון',
  'מפקד נתיב',
]

const WORKER_ROSTER = [
  { fullName: 'אביב חי טפלשוילי', phone: '0508676524' },
  { fullName: 'אבירן אברהם דסה', phone: '0539633063' },
  { fullName: 'אדיר דאי', phone: '0528885977' },
  { fullName: 'אוריה כהן', phone: '0536071196' },
  { fullName: 'אירנה גלפרין', phone: '0537273180' },
  { fullName: 'אליאן דדון', phone: '0524776343' },
  { fullName: 'דור בכור', phone: '0502384846' },
  { fullName: 'זיווה אלמדאי', phone: '0505250483' },
  { fullName: 'חיה מנגדיש', phone: '0506945567' },
  { fullName: 'לאון קולסניק', phone: '0542064272' },
  { fullName: 'לירז דרבה', phone: '0539277541' },
  { fullName: 'מעיין איילי', phone: '0539740744' },
  { fullName: 'מעיין באסטקאר', phone: '0534280149' },
  { fullName: 'נתנאל מאיר', phone: '0525651294' },
  { fullName: 'עדי אנגאו', phone: '0538916668' },
  { fullName: 'קורל שמואל', phone: '0549486021' },
  { fullName: 'קיריל ליטבק', phone: '0538658879' },
  { fullName: 'קריסטינה שקיראק', phone: '0526442431' },
  { fullName: 'רונית בכר', phone: '0535586417' },
  { fullName: "שחר צ'קול", phone: '0507433706' },
  { fullName: 'שי אלישע', phone: '0537171884' },
  { fullName: 'שיראל טגבה', phone: '0533200457' },
]

function createSeedData() {
  return {
    workers: WORKER_ROSTER.map((w) => ({
      id: randomUUID(),
      fullName: w.fullName,
      phone: w.phone,
      certifications: [],
      status: 'active',
    })),
    lanes: [
      {
        id: randomUUID(),
        name: 'נתיב 1',
        staffingStandard: 2,
        requiredCertifications: [],
        intensity: 'medium',
      },
      {
        id: randomUUID(),
        name: 'נתיב 2',
        staffingStandard: 1,
        requiredCertifications: [],
        intensity: 'hard',
      },
      {
        id: randomUUID(),
        name: 'נתיב מהיר',
        staffingStandard: 1,
        requiredCertifications: [],
        intensity: 'easy',
      },
      {
        id: randomUUID(),
        name: 'כבודה',
        staffingStandard: 2,
        requiredCertifications: [],
        intensity: 'hard',
      },
      {
        id: randomUUID(),
        name: 'ראיונות',
        staffingStandard: 1,
        requiredCertifications: [],
        intensity: 'medium',
      },
    ],
    history: [],
    certificationsCatalog: [...DEFAULT_CERTIFICATIONS],
  }
}

function normalizeData(raw) {
  return {
    workers: Array.isArray(raw?.workers) ? raw.workers : [],
    lanes: Array.isArray(raw?.lanes) ? raw.lanes : [],
    history: Array.isArray(raw?.history) ? raw.history : [],
    certificationsCatalog: Array.isArray(raw?.certificationsCatalog)
      ? raw.certificationsCatalog
      : [...DEFAULT_CERTIFICATIONS],
  }
}

const client = new MongoClient(URI)
const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

let db

async function getStateCollection() {
  return db.collection('app_state')
}

async function readState() {
  const col = await getStateCollection()
  const doc = await col.findOne({ _id: 'main' })
  if (!doc) {
    const seed = createSeedData()
    await col.insertOne({ _id: 'main', ...seed, updatedAt: new Date() })
    return seed
  }
  return normalizeData(doc)
}

async function writeState(data) {
  const col = await getStateCollection()
  const payload = normalizeData(data)
  await col.updateOne(
    { _id: 'main' },
    { $set: { ...payload, updatedAt: new Date() } },
    { upsert: true },
  )
  return payload
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: Boolean(db) })
})

app.get('/api/data', async (_req, res) => {
  try {
    const data = await readState()
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load data' })
  }
})

app.put('/api/data', async (req, res) => {
  try {
    const data = await writeState(req.body)
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save data' })
  }
})

app.post('/api/seed', async (_req, res) => {
  try {
    const data = await writeState(createSeedData())
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to seed data' })
  }
})

app.put('/api/shifts/:id', async (req, res) => {
  try {
    const state = await readState()
    const schedule = { ...req.body, id: req.params.id }
    const idx = state.history.findIndex((h) => h.id === schedule.id)
    const history =
      idx === -1
        ? [schedule, ...state.history]
        : state.history.map((h, i) => (i === idx ? { ...h, ...schedule } : h))
    const data = await writeState({ ...state, history })
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save shift' })
  }
})

app.delete('/api/shifts/:id', async (req, res) => {
  try {
    const state = await readState()
    const data = await writeState({
      ...state,
      history: state.history.filter((h) => h.id !== req.params.id),
    })
    res.json(data)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to delete shift' })
  }
})

async function start() {
  await client.connect()
  db = client.db()
  // warm / ensure seed exists
  await readState()
  app.listen(PORT, () => {
    console.log(`API listening on http://127.0.0.1:${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server', err)
  process.exit(1)
})
