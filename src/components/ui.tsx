import { INTENSITY_LABELS } from '../constants'
import type { Intensity } from '../types'

export function IntensityBadge({ intensity }: { intensity: Intensity }) {
  const styles: Record<Intensity, string> = {
    easy: 'bg-easy-soft text-easy',
    medium: 'bg-mid-soft text-mid',
    hard: 'bg-hard-soft text-hard',
  }
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs ${styles[intensity]}`}
    >
      {INTENSITY_LABELS[intensity]}
    </span>
  )
}

export function CertChips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-[10px] text-ink-soft sm:text-xs">ללא</span>
  return (
    <div className="flex flex-wrap gap-1 sm:gap-1.5">
      {items.map((c) => (
        <span
          key={c}
          className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-soft ring-1 ring-line sm:px-2 sm:text-xs"
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
    <section className="rounded-xl border border-line bg-card p-3.5 shadow-sm sm:rounded-2xl sm:p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:mb-4 sm:gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-ink sm:text-lg">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-ink-soft sm:text-sm">{subtitle}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
