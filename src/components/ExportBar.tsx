import { useState } from 'react'
import { Download, Loader2, MessageCircle } from 'lucide-react'
import {
  buildWhatsAppText,
  downloadBoardImage,
  openWhatsAppShare,
  type ExportLaneLine,
} from '../lib/export'
import type { ShiftType } from '../types'

interface ExportBarProps {
  date: string
  shiftType: ShiftType
  lines: ExportLaneLine[]
  unassigned: string[]
}

export function ExportBar({ date, shiftType, lines, unassigned }: ExportBarProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadBoardImage(date, shiftType, lines, unassigned)
    } catch (e) {
      console.error(e)
      setError('ייצוא התמונה נכשל. נסו שוב.')
    } finally {
      setBusy(false)
    }
  }

  const handleWhatsApp = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadBoardImage(date, shiftType, lines, unassigned)
    } catch (e) {
      console.error(e)
      setError('הורדת התמונה נכשלה — נפתח שיתוף טקסט בלבד.')
    } finally {
      setBusy(false)
      openWhatsAppShare(
        buildWhatsAppText(
          date,
          shiftType,
          lines.map((l) => ({ laneName: l.laneName, workers: l.workers })),
        ),
      )
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={handleDownload}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          ייצוא תמונה
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleWhatsApp}
          className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1ebe57] disabled:opacity-60"
        >
          <MessageCircle className="size-4" />
          שיתוף ב-WhatsApp
        </button>
      </div>
      {error && <p className="text-xs font-medium text-hard">{error}</p>}
    </div>
  )
}
