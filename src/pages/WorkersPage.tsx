import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { CertChips, SectionCard } from '../components/ui'
import type { Worker, WorkerStatus } from '../types'

const emptyForm = (): Omit<Worker, 'id'> => ({
  fullName: '',
  phone: '',
  certifications: [],
  status: 'active',
  isManager: false,
})

export function WorkersPage() {
  const { data, addWorker, updateWorker, deleteWorker } = useApp()
  const [editing, setEditing] = useState<Worker | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm())

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setCreating(true)
  }

  const openEdit = (w: Worker) => {
    setCreating(false)
    setEditing(w)
    setForm({
      fullName: w.fullName,
      phone: w.phone,
      certifications: [...w.certifications],
      status: w.status,
      isManager: Boolean(w.isManager),
    })
  }

  const close = () => {
    setCreating(false)
    setEditing(null)
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
    if (!form.fullName.trim()) return
    if (editing) updateWorker({ ...editing, ...form })
    else addWorker(form)
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
  }

  const formPanel = (title: string) => (
    <div className="rounded-xl border border-brand/20 bg-surface p-4 animate-fade-up">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft">שם מלא</span>
          <input
            className="w-full rounded-lg border border-line bg-card px-3 py-2"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft">טלפון</span>
          <input
            className="w-full rounded-lg border border-line bg-card px-3 py-2"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            dir="ltr"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-soft">סטטוס</span>
          <select
            className="w-full rounded-lg border border-line bg-card px-3 py-2"
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
            className="size-4 rounded border-line"
            checked={form.isManager}
            onChange={(e) => onManagerChange(e.target.checked)}
          />
          מנהל (יכול להתחבר למערכת)
        </label>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm text-ink-soft">הסמכות</p>
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
                      ? 'bg-brand text-white'
                      : 'bg-card text-ink-soft ring-1 ring-line'
                  }`}
                >
                  {c}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          שמירה
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-xl px-4 py-2 text-sm font-medium text-ink-soft"
        >
          ביטול
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <SectionCard
        title="מאגר בודקים"
        subtitle="שמות, טלפון, הסמכות וסטטוס · הרשאת מנהל בעריכה בלבד"
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-2.5 py-1.5 text-xs font-semibold text-white sm:px-3 sm:py-2 sm:text-sm"
          >
            <Plus className="size-3.5 sm:size-4" />
            הוספה
          </button>
        }
      >
        {creating && <div className="mb-4 sm:mb-5">{formPanel('בודק חדש')}</div>}

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
                        if (confirm(`למחוק את ${w.fullName}?`)) deleteWorker(w.id)
                      }}
                      className="rounded-lg p-2 text-ink-soft hover:bg-hard-soft hover:text-hard"
                      aria-label="מחיקה"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {isEditing && <div className="mt-3">{formPanel('עריכת בודק')}</div>}
              </li>
            )
          })}
        </ul>
      </SectionCard>
    </div>
  )
}
