import nodemailer from 'nodemailer'

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && (process.env.SMTP_FROM || process.env.SMTP_USER))
}

function smtpPass() {
  return process.env.SMTP_PASS || process.env.SMTP_PASSWORD || ''
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = smtpPass()
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  })
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
export async function sendMail({ to, subject, text, html }) {
  if (!to) {
    const err = new Error('כתובת מייל חסרה')
    err.status = 400
    throw err
  }
  if (!smtpConfigured()) {
    console.warn(
      `[mail] SMTP לא מוגדר — המייל לא נשלח אל ${to}\nנושא: ${subject}\n${text}`,
    )
    return { queued: false, devLogged: true }
  }

  const from =
    process.env.SMTP_FROM ||
    `${process.env.APP_NAME || 'GATE OUT'} <${process.env.SMTP_USER}>`

  const transporter = createTransport()
  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || undefined,
    })
    return { queued: true, devLogged: false }
  } catch (err) {
    console.error('[mail] send failed', err instanceof Error ? err.message : err)
    const e = new Error('שליחת המייל נכשלה')
    e.status = 502
    throw e
  } finally {
    transporter.close?.()
  }
}

/**
 * @param {{ to: string, fullName: string, tempPassword: string, reason: 'invite' | 'reset' }} opts
 */
export async function sendTempPasswordEmail({
  to,
  fullName,
  tempPassword,
  reason,
}) {
  const appName = process.env.APP_NAME || 'שיבוצון · GATE OUT'
  const isReset = reason === 'reset'
  const subject = isReset
    ? `${appName} — איפוס סיסמה`
    : `${appName} — סיסמה זמנית להתחברות`
  const intro = isReset
    ? 'התקבלה בקשה לאיפוס סיסמה בחשבון המנהל שלך.'
    : 'סומנת כמנהל/ת במערכת השיבוץ. להלן סיסמה זמנית להתחברות.'
  const text = [
    `שלום ${fullName || ''},`,
    '',
    intro,
    '',
    `סיסמה זמנית: ${tempPassword}`,
    '',
    'לאחר ההתחברות תידרש/י להגדיר סיסמה קבועה חדשה.',
    'אם לא ביקשת פעולה זו — פנה/י למנהל המערכת.',
    '',
    appName,
  ].join('\n')

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;color:#0f1c2e">
      <p>שלום ${escapeHtml(fullName || '')},</p>
      <p>${intro}</p>
      <p style="font-size:18px"><strong>סיסמה זמנית:</strong>
        <code style="background:#f3f6f9;padding:4px 8px;border-radius:6px">${escapeHtml(tempPassword)}</code>
      </p>
      <p>לאחר ההתחברות תידרש/י להגדיר סיסמה קבועה חדשה.</p>
      <p style="color:#3d4f66;font-size:13px">אם לא ביקשת פעולה זו — פנה/י למנהל המערכת.</p>
      <p style="color:#3d4f66;font-size:12px">${escapeHtml(appName)}</p>
    </div>
  `

  return sendMail({ to, subject, text, html })
}

/**
 * @param {{ to?: string }} [opts]
 */
export async function sendTestEmail(opts = {}) {
  const to = String(
    opts.to || process.env.SMTP_USER || process.env.SMTP_FROM || '',
  )
    .replace(/.*<([^>]+)>.*/, '$1')
    .trim()
  if (!to) {
    const err = new Error('SMTP_USER לא מוגדר — אין יעד לבדיקה')
    err.status = 400
    throw err
  }
  const appName = process.env.APP_NAME || 'שיבוצון · GATE OUT'
  const at = new Date().toISOString()
  return sendMail({
    to,
    subject: `${appName} — בדיקת שליחת מייל`,
    text: `בדיקת SMTP הצליחה.\nזמן: ${at}\n`,
    html: `<p dir="rtl">בדיקת <strong>SMTP</strong> הצליחה.</p><p>זמן: ${escapeHtml(at)}</p>`,
  })
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
