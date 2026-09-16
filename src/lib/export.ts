import { domToPng } from 'modern-screenshot'
import { INTENSITY_LABELS, SHIFT_TYPE_LABELS } from '../constants'
import type { Intensity, ShiftType } from '../types'

export interface ExportLaneLine {
  laneName: string
  intensity: Intensity
  workers: string[]
  staffingStandard: number
}

export interface ExportMeta {
  preparedBy?: string
}

function formatDateHe(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTimeHe(d = new Date()): string {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

/** Official gate document layout (A4-ish, table — not app UI screenshot) */
function buildExportNode(
  date: string,
  shiftType: ShiftType,
  lines: ExportLaneLine[],
  unassigned: string[],
  meta: ExportMeta = {},
): HTMLDivElement {
  const root = document.createElement('div')
  root.setAttribute('dir', 'rtl')
  root.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:794px',
    'background:#ffffff',
    'color:#0f1c2e',
    "font-family:Heebo,Arial,sans-serif",
    'box-sizing:border-box',
    'padding:36px 40px 28px',
    'border:1px solid #c5d0dc',
  ].join(';')

  const issued = formatTimeHe()
  const by = meta.preparedBy ? escapeHtml(meta.preparedBy) : '—'

  root.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0f3350;padding-bottom:14px;margin-bottom:18px">
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#c45c26;text-transform:uppercase">GATE OUT</div>
        <div style="font-size:26px;font-weight:800;color:#0f3350;margin-top:2px;line-height:1.2">שיבוץ שער יציאה</div>
        <div style="font-size:14px;color:#3d4f66;margin-top:6px">${formatDateHe(date)}</div>
      </div>
      <div style="text-align:left;font-size:13px;color:#3d4f66;line-height:1.55;min-width:140px">
        <div><span style="color:#6b7c90">משמרת:</span> <strong style="color:#0f1c2e">${SHIFT_TYPE_LABELS[shiftType]}</strong></div>
        <div><span style="color:#6b7c90">הופק:</span> ${issued}</div>
        <div><span style="color:#6b7c90">ע״י:</span> ${by}</div>
      </div>
    </div>
  `

  const table = document.createElement('table')
  table.style.cssText =
    'width:100%;border-collapse:collapse;font-size:14px;margin-top:4px'
  table.innerHTML = `
    <thead>
      <tr>
        <th style="text-align:right;background:#0f3350;color:#fff;padding:10px 12px;font-weight:700;border:1px solid #0f3350;width:28%">נתיב / עמדה</th>
        <th style="text-align:right;background:#0f3350;color:#fff;padding:10px 12px;font-weight:700;border:1px solid #0f3350;width:14%">עצימות</th>
        <th style="text-align:right;background:#0f3350;color:#fff;padding:10px 12px;font-weight:700;border:1px solid #0f3350;width:10%">תקן</th>
        <th style="text-align:right;background:#0f3350;color:#fff;padding:10px 12px;font-weight:700;border:1px solid #0f3350">בודקים משובצים</th>
      </tr>
    </thead>
  `
  const tbody = document.createElement('tbody')
  lines.forEach((line, i) => {
    const names = line.workers.filter(Boolean)
    const extra = names.length > line.staffingStandard
    const bg = i % 2 === 0 ? '#ffffff' : '#f5f8fb'
    const namesHtml = names.length
      ? names.map((n, idx) => `${idx + 1}. ${escapeHtml(n)}`).join(' &nbsp;·&nbsp; ')
      : '<span style="color:#6b7c90">— פנוי —</span>'
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td style="padding:11px 12px;border:1px solid #d5dee8;background:${bg};font-weight:700;vertical-align:top">
        ${escapeHtml(line.laneName)}
        ${extra ? '<div style="margin-top:4px;font-size:11px;font-weight:700;color:#c45c26">+ תוספת מעבר לתקן</div>' : ''}
      </td>
      <td style="padding:11px 12px;border:1px solid #d5dee8;background:${bg};vertical-align:top">${INTENSITY_LABELS[line.intensity]}</td>
      <td style="padding:11px 12px;border:1px solid #d5dee8;background:${bg};vertical-align:top;font-variant-numeric:tabular-nums">${line.staffingStandard}</td>
      <td style="padding:11px 12px;border:1px solid #d5dee8;background:${bg};vertical-align:top;line-height:1.55">${namesHtml}</td>
    `
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  root.appendChild(table)

  if (unassigned.length > 0) {
    const note = document.createElement('div')
    note.style.cssText =
      'margin-top:16px;padding:12px 14px;border:1px solid #e8c4b0;background:#fdf6f1;font-size:13px'
    note.innerHTML = `
      <div style="font-weight:800;color:#c45c26;margin-bottom:4px">לא שובצו</div>
      <div style="color:#0f1c2e">${unassigned.map(escapeHtml).join(' · ')}</div>
    `
    root.appendChild(note)
  }

  const footer = document.createElement('div')
  footer.style.cssText =
    'margin-top:22px;padding-top:12px;border-top:1px solid #d5dee8;display:flex;justify-content:space-between;font-size:11px;color:#6b7c90'
  footer.innerHTML = `
    <span>מסמך שיבוץ רשמי · שיבוצון</span>
    <span>לשימוש פנימי בשער יציאה</span>
  `
  root.appendChild(footer)

  return root
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function captureSchedulePng(
  date: string,
  shiftType: ShiftType,
  lines: ExportLaneLine[],
  unassigned: string[] = [],
  meta: ExportMeta = {},
): Promise<string> {
  const node = buildExportNode(date, shiftType, lines, unassigned, meta)
  document.body.appendChild(node)

  await document.fonts?.ready.catch(() => undefined)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

  try {
    const dataUrl = await domToPng(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      quality: 1,
    })
    if (!dataUrl || dataUrl === 'data:,') {
      throw new Error('יצירת התמונה נכשלה')
    }
    return dataUrl
  } finally {
    node.remove()
  }
}

export async function downloadBoardImage(
  date: string,
  shiftType: ShiftType,
  lines: ExportLaneLine[],
  unassigned: string[] = [],
  filename?: string,
  meta: ExportMeta = {},
): Promise<void> {
  const dataUrl = await captureSchedulePng(date, shiftType, lines, unassigned, meta)
  const name = filename ?? `shibutz-official-${date}-${shiftType}.png`
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function buildWhatsAppText(
  date: string,
  shiftType: ShiftType,
  lines: { laneName: string; workers: string[] }[],
): string {
  const header = `*שיבוץ שער יציאה — ${formatDateHe(date)} · ${SHIFT_TYPE_LABELS[shiftType]}*`
  const body = lines
    .map((l) => {
      const names = l.workers.length ? l.workers.join(', ') : '—'
      return `• *${l.laneName}:* ${names}`
    })
    .join('\n')
  return `${header}\n\n${body}\n\n_מסמך שיבוצון_`
}

export function openWhatsAppShare(text: string): void {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
