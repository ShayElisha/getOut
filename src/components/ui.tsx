import { INTENSITY_LABELS } from '../constants'
import type { Intensity } from '../types'

export function IntensityBadge({ intensity }: { intensity: Intensity }) {
  const styles: Record<Intensity, string> = {
    easy: 'bg-easy-soft text-easy',
    medium: 'bg-mid-soft text-mid',
    hard: 'bg-hard-soft text-hard',
  }
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${styles[intensity]}`}>
      {INTENSITY_LABELS[intensity]}
    </span>
  )
}

export function CertChips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-xs text-ink-soft">ללא</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span
          key={c}
          className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-line"
        >
          {c}
        </span>
      ))}
    </div>
  )
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
