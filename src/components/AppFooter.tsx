const YEAR = new Date().getFullYear()

export function AppFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`mt-auto border-t border-line/80 pt-5 text-center ${className}`}
    >
      <p className="ui-eyebrow">GATE OUT</p>
      <p className="ui-muted mt-1.5">
        שיבוצון · שער יציאה · {YEAR}
      </p>
      <p className="mt-1 text-[10px] text-ink-soft/80">לשימוש פנימי</p>
    </footer>
  )
}
