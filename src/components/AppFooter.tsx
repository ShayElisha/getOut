const YEAR = new Date().getFullYear()

export function AppFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`mt-auto border-t border-line/80 pt-4 text-center ${className}`}
    >
      <p className="text-[10px] font-semibold tracking-[0.16em] text-accent uppercase sm:text-[11px]">
        GATE OUT
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">
        שיבוצון · שער יציאה · {YEAR}
      </p>
      <p className="mt-1 text-[10px] text-ink-soft/80">לשימוש פנימי</p>
    </footer>
  )
}
