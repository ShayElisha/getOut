import { domToPng } from 'modern-screenshot'
import { INTENSITY_LABELS, SHIFT_TYPE_LABELS } from '../constants'
import type { Intensity, ShiftType } from '../types'

export interface ExportLaneLine {
  laneName: string
  intensity: Intensity
  workers: string[]
  staffingStandard: number
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

const INTENSITY_STYLE: Record<Intensity, { bg: string; color: string }> = {
  easy: { bg: '#dcfce7', color: '#15803d' },
  medium: { bg: '#e0f2fe', color: '#0369a1' },
  hard: { bg: '#ffe4e9', color: '#9f1239' },
}

/** Build a plain HTML board (hex only, no selects) for reliable capture */
function buildExportNode(
  date: string,
  shiftType: ShiftType,
  lines: ExportLaneLine[],
  unassigned: string[],
): HTMLDivElement {
  const root = document.createElement('div')
  root.setAttribute('dir', 'rtl')
  root.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:720px',
    'background:#ffffff',
    'color:#0f1c2e',
    "font-family:Heebo,Arial,sans-serif",
    'border-radius:16px',
    'overflow:hidden',
    'border:1px solid #d5dee8',
  ].join(';')

  const header = document.createElement('div')
  header.style.cssText =
    'background:linear-gradient(to left,#0f3350,#1a4a6e);padding:20px 24px;color:#ffffff'
  header.innerHTML = `
    <div style="font-size:10px;font-weight:700;letter-spacing:0.25em;color:rgba(255,255,255,0.55);margin-bottom:4px">שיבוצון</div>
    <div style="font-size:22px;font-weight:800">שיבוץ שער יציאה</div>
    <div style="font-size:14px;margin-top:6px;color:rgba(255,255,255,0.85)">${formatDateHe(date)} · ${SHIFT_TYPE_LABELS[shiftType]}</div>
  `
  root.appendChild(header)

  const grid = document.createElement('div')
  grid.style.cssText =
    'display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #d5dee8'

  lines.forEach((line, index) => {
    const cell = document.createElement('div')
    const borderSide = index % 2 === 0 ? 'border-left:1px solid #d5dee8;' : ''
    const borderTop = index >= 2 ? 'border-top:1px solid #d5dee8;' : ''
    cell.style.cssText = `padding:16px;${borderSide}${borderTop}`

    const badge = INTENSITY_STYLE[line.intensity]
    const extra = line.workers.filter(Boolean).length > line.staffingStandard
    const names =
      line.workers.filter(Boolean).length > 0
        ? line.workers
            .filter(Boolean)
            .map(
              (n, i) =>
                `<div style="background:#f3f6f9;border:1px solid #d5dee8;border-radius:8px;padding:8px 12px;margin-top:6px;font-size:14px;font-weight:600">${i + 1}. ${escapeHtml(n)}</div>`,
            )
            .join('')
        : `<div style="background:#f3f6f9;border:1px dashed #d5dee8;border-radius:8px;padding:8px 12px;margin-top:6px;font-size:14px;color:#3d4f66">— פנוי —</div>`

    cell.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <div style="font-size:16px;font-weight:800">${escapeHtml(line.laneName)}</div>
        <div style="display:flex;gap:6px;align-items:center">
          ${extra ? '<span style="background:#f3e0d4;color:#c45c26;font-size:10px;font-weight:800;padding:2px 8px;border-radius:6px">+תוספת</span>' : ''}
          <span style="background:${badge.bg};color:${badge.color};font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px">${INTENSITY_LABELS[line.intensity]}</span>
        </div>
      </div>
      ${names}
    `
    grid.appendChild(cell)
  })

  // Odd last cell — stretch full width look is fine in 2-col grid
  root.appendChild(grid)

  if (unassigned.length > 0) {
    const footer = document.createElement('div')
    footer.style.cssText =
      'border-top:1px solid #d5dee8;background:#f3f6f9;padding:12px 24px'
    footer.innerHTML = `
      <div style="font-size:11px;font-weight:800;color:#3d4f66;margin-bottom:4px">לא שובצו</div>
      <div style="font-size:14px">${unassigned.map(escapeHtml).join(' · ')}</div>
    `
    root.appendChild(footer)
  }

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
): Promise<string> {
  const node = buildExportNode(date, shiftType, lines, unassigned)
  document.body.appendChild(node)

  // Wait for layout + fonts
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
): Promise<void> {
  const dataUrl = await captureSchedulePng(date, shiftType, lines, unassigned)
  const name = filename ?? `shibutz-${date}-${shiftType}.png`
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
  const header = `*שיבוץ שער — ${formatDateHe(date)} · ${SHIFT_TYPE_LABELS[shiftType]}*`
  const body = lines
    .map((l) => {
      const names = l.workers.length ? l.workers.join(', ') : '—'
      return `• *${l.laneName}:* ${names}`
    })
    .join('\n')
  return `${header}\n\n${body}\n\n_נוצר בשיבוצון_`
}

export function openWhatsAppShare(text: string): void {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
