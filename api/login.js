import { loginByPhone } from '../server/data.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const user = await loginByPhone(req.body?.phone)
    res.status(200).json(user)
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'התחברות נכשלה' })
  }
}
