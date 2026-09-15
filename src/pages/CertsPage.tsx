import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SectionCard } from '../components/ui'

export function CertsPage() {
  const { data, addCertification, removeCertification } = useApp()
  const [name, setName] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    addCertification(name)
    setName('')
  }

  return (
    <SectionCard
      title="קטלוג הסמכות"
      subtitle="הסמכות משותפות לבודקים ולדרישות הנתיבים"
    >
      <form onSubmit={submit} className="mb-5 flex flex-wrap gap-2">
        <input
          className="min-w-[200px] flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
          placeholder="שם הסמכה חדשה"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus className="size-4" />
          הוספה
        </button>
      </form>
      <ul className="flex flex-wrap gap-2">
        {data.certificationsCatalog.map((c) => (
          <li
            key={c}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium"
          >
            {c}
            <button
              type="button"
              onClick={() => removeCertification(c)}
              className="text-ink-soft hover:text-hard"
              aria-label={`מחק ${c}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
