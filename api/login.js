import { loginByPhone } from '../server/data.js'
import { assertRateLimit, clientKey } from '../server/rateLimit.js'
import { createSessionToken } from '../server/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const phone = String(req.body?.phone || '')
    await assertRateLimit({
      key: `login:${clientKey(req)}:${phone.replace(/\D/g, '') || 'empty'}`,
      limit: 10,
      windowMs: 15 * 60_000,
    })
    const user = await loginByPhone(phone)
    const token = createSessionToken(user)
    res.status(200).json({ ...user, token })
  } catch (err) {
    const status = err.status || 500
    if (status >= 500) console.error(err)
    res.status(status).json({
      error: err.message || 'התחברות נכשלה',
      retryAfterSec: err.retryAfterSec,
    })
  }
}
