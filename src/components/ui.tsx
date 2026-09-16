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
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide sm:px-2 sm:text-xs ${styles[intensity]}`}
    >
      {INTENSITY_LABELS[intensity]}
    </span>
  )
}

export function CertChips({ items }: { items: string[] }) {
  if (!items.length) {
    return <span className="ui-muted text-[10px] sm:text-xs">ללא</span>
  }
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
    <section className="ui-panel-solid p-4 sm:rounded-2xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 className="ui-title">{title}</h2>
          {subtitle && <p className="ui-subtitle">{subtitle}</p>}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string
  text?: string
  action?: React.ReactNode
}) {
  return (
    <div className="ui-empty" role="status">
      <p className="ui-empty-title">{title}</p>
      {text ? <p className="ui-empty-text">{text}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`ui-skeleton ${className}`} aria-hidden />
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-soft sm:text-sm">
      {children}
    </label>
  )
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p className="ui-field-error" role="alert">
      {message}
    </p>
  )
}
