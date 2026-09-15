import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { CertChips, IntensityBadge, SectionCard } from '../components/ui'
import type { Intensity, Lane } from '../types'

const emptyForm = (): Omit<Lane, 'id'> => ({
  name: '',
  staffingStandard: 1,
  requiredCertifications: [],
  intensity: 'medium',
})

export function LanesPage() {
  const { data, addLane, updateLane, deleteLane } = useApp()
  const [editing, setEditing] = useState<Lane | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm())

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setCreating(true)
  }

  const openEdit = (l: Lane) => {
    setCreating(false)
    setEditing(l)
    setForm({
      name: l.name,
      staffingStandard: l.staffingStandard,
      requiredCertifications: [...l.requiredCertifications],
      intensity: l.intensity,
    })
  }

  const close = () => {
    setCreating(false)
    setEditing(null)
  }

  const toggleCert = (c: string) => {
    setForm((f) => ({
      ...f,
      requiredCertifications: f.requiredCertifications.includes(c)
        ? f.requiredCertifications.filter((x) => x !== c)
        : [...f.requiredCertifications, c],
    }))
  }

  const save = () => {
    if (!form.name.trim()) return
    if (editing) updateLane({ ...editing, ...form })
    else addLane(form)
    close()
  }

  const showForm = creating || editing

  return (
    <SectionCard
      title="נתיבים ועמדות"
      subtitle="תקן כוח אדם, הסמכות נדרשות ודרגת עצימות"
      actions={
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          <Plus className="size-4" />
          הוספה
        </button>
      }
    >
      {showForm && (
        <div className="mb-5 rounded-xl border border-brand/20 bg-surface p-4">
          <h3 className="mb-3 text-sm font-bold">{editing ? 'עריכת נתיב' : 'נתיב חדש'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-ink-soft">שם הנתיב</span>
              <input
                className="w-full rounded-lg border border-line bg-card px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink-soft">תקן עובדים</span>
              <select
                className="w-full rounded-lg border border-line bg-card px-3 py-2"
                value={form.staffingStandard}
                onChange={(e) =>
                  setForm({
                    ...form,
                    staffingStandard: Number(e.target.value) as 1 | 2,
                  })
                }
              >
                <option value={1}>1 בודק</option>
                <option value={2}>2 בודקים</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-ink-soft">דרגת עצימות</span>
              <select
                className="w-full rounded-lg border border-line bg-card px-3 py-2"
                value={form.intensity}
                onChange={(e) =>
                  setForm({ ...form, intensity: e.target.value as Intensity })
                }
              >
                <option value="easy">קל</option>
                <option value="medium">בינוני</option>
                <option value="hard">קשה</option>
              </select>
            </label>
            <div className="sm:col-span-2">
              <p className="mb-2 text-sm text-ink-soft">
                הסמכות נדרשות (העובד חייב להחזיק בכולן)
              </p>
              <div className="flex flex-wrap gap-2">
                {data.certificationsCatalog.map((c) => {
                  const on = form.requiredCertifications.includes(c)
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
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {data.lanes.map((l) => (
          <li
            key={l.id}
            className="rounded-xl border border-line bg-surface/60 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-ink">{l.name}</h3>
                <p className="mt-1 text-xs text-ink-soft">תקן: {l.staffingStandard}</p>
              </div>
              <IntensityBadge intensity={l.intensity} />
            </div>
            <div className="mt-3">
              <CertChips items={l.requiredCertifications} />
            </div>
            <div className="mt-3 flex gap-1">
              <button
                type="button"
                onClick={() => openEdit(l)}
                className="rounded-lg p-2 text-ink-soft hover:bg-card hover:text-brand"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`למחוק את ${l.name}?`)) deleteLane(l.id)
                }}
                className="rounded-lg p-2 text-ink-soft hover:bg-hard-soft hover:text-hard"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
