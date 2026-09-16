export function PageLoader({
  label = 'טוען נתונים…',
  fullScreen = false,
  size = 'md',
}: {
  label?: string
  fullScreen?: boolean
  size?: 'sm' | 'md'
}) {
  const loader = (
    <div
      className={size === 'sm' ? 'page-loader page-loader--sm' : 'page-loader'}
      role="status"
      aria-label={label}
    />
  )

  if (!fullScreen) {
    return (
      <div className="inline-flex items-center gap-2">
        {loader}
        {label ? <span className="text-xs text-ink-soft sm:text-sm">{label}</span> : null}
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-ink-soft">
      {loader}
      <div className="text-center">
        <p className="mb-0.5 text-[10px] font-semibold tracking-[0.16em] text-accent uppercase">
          GATE OUT
        </p>
        <p className="text-sm font-medium text-ink-soft">{label}</p>
      </div>
    </div>
  )
}
