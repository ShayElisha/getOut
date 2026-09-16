import { useState } from 'react'
import { Mail, Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { CertChips, SectionCard } from '../components/ui'
import type { Worker, WorkerStatus } from '../types'

const emptyForm = (): Omit<Worker, 'id'> => ({
  fullName: '',
  phone: '',
  email: '',
  certifications: [],
  status: 'active',
  isManager: false,
})

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function WorkersPage() {
  const { data, addWorker, updateWorker, deleteWorker, resendManagerTempPassword } =
    useApp()
  const [editing, setEditing] = useState<Worker | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [mailBusy, setMailBusy] = useState(false)
  const [mailMessage, setMailMessage] = useState<string | null>(null)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setNameError(null)
    setEmailError(null)
    setMailMessage(null)
    setCreating(true)
  }

  const openEdit = (w: Worker) => {
    setCreating(false)
    setEditing(w)
    setNameError(null)
    setEmailError(null)
    setMailMessage(null)
    setForm({
      fullName: w.fullName,
      phone: w.phone,
      email: w.email || '',
      certifications: [...w.certifications],
      status: w.status,
      isManager: Boolean(w.isManager),
    })
  }

  const close = () => {
    setCreating(false)
    setEditing(null)
    setNameError(null)
    setEmailError(null)
    setMailMessage(null)
  }

  const toggleCert = (c: string) => {
    setForm((f) => ({
      ...f,
      certifications: f.certifications.includes(c)
        ? f.certifications.filter((x) => x !== c)
        : [...f.certifications, c],
    }))
  }

  const save = () => {
    if (!form.fullName.trim()) {
      setNameError('נא להזין שם מלא')
      return
    }
    setNameError(null)
    if (form.isManager && !isValidEmail(form.email || '')) {
      setEmailError('למנהל חובה להזין כתובת מייל תקינה')
      return
    }
    if (form.email?.trim() && !isValidEmail(form.email)) {
      setEmailError('כתובת מייל לא תקינה')
      return
    }
    setEmailError(null)
    const payload = {
      ...form,
      email: form.email?.trim() || '',
    }
    if (editing) updateWorker({ ...editing, ...payload })
    else addWorker(payload)
    close()
  }

  const onManagerChange = (checked: boolean) => {
    if (
      !checked &&
      form.isManager &&
      !confirm('האם הינך בטוח להוריד מניהול?')
    ) {
      return
    }
    setForm({ ...form, isManager: checked })
    if (checked && emailError) setEmailError(null)
  }

  const sendTempPassword = async () => {
    if (!editing?.id) return
    if (!editing.isManager) {
      setEmailError('שמרו קודם את המשתמש כמנהל עם מייל, ואז שלחו סיסמה')
      return
    }
    if (!isValidEmail(editing.email || '')) {
      setEmailError('שמרו מייל תקין למנהל לפני שליחת סיסמה')
      return
    }
    if (
      (form.email || '').trim().toLowerCase() !==
        (editing.email || '').trim().toLowerCase() ||
      form.isManager !== editing.isManager
    ) {
      setMailMessage('יש שינויים שלא נשמרו — שמרו קודם ואז שלחו סיסמה זמנית')
      return
    }
    if (
      !confirm(
        'לשלוח סיסמה זמנית חדשה למייל המנהל? הסיסמה הקודמת תבוטל.',
      )
    ) {
      return
    }
    setMailBusy(true)
    setMailMessage(null)
    try {
      await resendManagerTempPassword(editing.id)
      setMailMessage('סיסמה זמנית נשלחה למייל')
    } catch (e) {
      setMailMessage(e instanceof Error ? e.message : 'שליחת המייל נכשלה')
    } finally {
      setMailBusy(false)
    }
  }

  const formPanel = (title: string) => (
    <div className="ui-panel animate-fade-up border-brand/20 bg-surface p-4 sm:rounded-2xl">
      <h3 className="ui-title mb-4 text-sm sm:text-base">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-medium text-ink-soft sm:text-sm">
            שם מלא
          </span>
          <input
            className="ui-field bg-card"
            value={form.fullName}
            onChange={(e) => {
              setForm({ ...form, fullName: e.target.value })
              if (nameError) setNameError(null)
            }}
            aria-invalid={Boolean(nameError) || undefined}
          />
          {nameError && <p className="ui-field-error">{nameError}</p>}
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-medium text-ink-soft sm:text-sm">
            טלפון
          </span>
          <input
            className="ui-field bg-card"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            dir="ltr"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-ink-soft sm:text-sm">
            מייל{form.isManager ? ' (חובה למנהל)' : ''}
          </span>
          <input
            className="ui-field bg-card"
            type="email"
            value={form.email || ''}
            onChange={(e) => {
              setForm({ ...form, email: e.target.value })
              if (emailError) setEmailError(null)
            }}
            dir="ltr"
            placeholder="name@example.com"
            aria-invalid={Boolean(emailError) || undefined}
          />
          {emailError && <p className="ui-field-error">{emailError}</p>}
          {form.isManager && (
            <p className="mt-1 text-[11px] text-ink-soft">
              בעת מינוי מנהל חדש תישלח סיסמה זמנית למייל זה.
            </p>
          )}
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs font-medium text-ink-soft sm:text-sm">
            סטטוס
          </span>
          <select
            className="ui-field bg-card"
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as WorkerStatus })
            }
          >
            <option value="active">פעיל</option>
            <option value="inactive">לא פעיל</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 rounded border-line accent-brand"
            checked={form.isManager}
            onChange={(e) => onManagerChange(e.target.checked)}
          />
          מנהל (יכול להתחבר למערכת)
        </label>
        <div className="sm:col-span-2">
          <p className="mb-2 text-xs font-medium text-ink-soft sm:text-sm">
            הסמכות
          </p>
          <div className="flex flex-wrap gap-2">
            {data.certificationsCatalog.map((c) => {
              const on = form.certifications.includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCert(c)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? 'bg-brand text-white shadow-sm'
                      : 'bg-card text-ink-soft ring-1 ring-line hover:border-brand/30 hover:text-ink'
                  }`}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={save} className="ui-btn ui-btn-primary">
          שמירה
        </button>
        {editing && form.isManager && (
          <button
            type="button"
            onClick={() => void sendTempPassword()}
            disabled={mailBusy}
            className="ui-btn ui-btn-ghost"
          >
            <Mail className="size-3.5" aria-hidden />
            {mailBusy ? 'שולח…' : 'שליחת סיסמה זמנית למייל'}
          </button>
        )}
        <button type="button" onClick={close} className="ui-btn ui-btn-ghost">
          ביטול
        </button>
      </div>
      {mailMessage && (
        <p className="mt-2 text-xs text-ink-soft sm:text-sm">{mailMessage}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <SectionCard
        title="מאגר בודקים"
        subtitle="שמות, טלפון, מייל, הסמכות · מנהל חייב מייל (סיסמה זמנית נשלחת אוטומטית)"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="ui-btn ui-btn-primary !px-2.5 !py-1.5 text-xs sm:!px-3 sm:!py-2 sm:text-sm"
          >
            <Plus className="size-3.5 sm:size-4" />
            הוספה
          </button>
        }
      >
        {creating && <div className="mb-4 sm:mb-5">{formPanel('בודק חדש')}</div>}

        {data.workers.length === 0 && !creating ? (
          <div className="ui-empty mb-2">
            <p className="ui-empty-title">אין בודקים עדיין</p>
            <p className="ui-empty-text">
              הוסיפו בודקים למאגר כדי להתחיל בשיבוץ.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="ui-btn ui-btn-primary mt-2"
            >
              <Plus className="size-3.5" />
              הוספת בודק
            </button>
          </div>
        ) : null}
        <ul className="divide-y divide-line">
          {data.workers.map((w) => {
            const isEditing = editing?.id === w.id
            return (
              <li key={w.id} className="py-3 sm:py-4">
                <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="text-sm font-semibold text-ink sm:text-base">
                        {w.fullName}
                      </span>
                      {w.isManager && (
                        <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">
                          מנהל
                        </span>
                      )}
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          w.status === 'active'
                            ? 'bg-ok-soft text-ok'
                            : 'bg-surface text-ink-soft'
                        }`}
                      >
                        {w.status === 'active' ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>
                    {w.phone && (
                      <p className="mt-0.5 text-xs text-ink-soft" dir="ltr">
                        {w.phone}
                      </p>
                    )}
                    {w.email && (
                      <p className="mt-0.5 text-xs text-ink-soft" dir="ltr">
                        {w.email}
                      </p>
                    )}
                    <div className="mt-2">
                      <CertChips items={w.certifications} />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => (isEditing ? close() : openEdit(w))}
                      className={`rounded-lg p-2 hover:bg-surface ${
                        isEditing
                          ? 'bg-brand/10 text-brand'
                          : 'text-ink-soft hover:text-brand'
                      }`}
                      aria-label="עריכה"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`למחוק את ${w.fullName}?`))
                          deleteWorker(w.id)
                      }}
                      className="rounded-lg p-2 text-ink-soft hover:bg-hard-soft hover:text-hard"
                      aria-label="מחיקה"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-3">{formPanel('עריכת בודק')}</div>
                )}
              </li>
            )
          })}
        </ul>
      </SectionCard>
    </div>
  )
}
