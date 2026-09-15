import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { useApp } from '../context/AppContext'

export function LoginPage() {
  const { login } = useApp()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(phone)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'התחברות נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8 sm:py-10">
      <div className="rounded-2xl border border-line bg-card p-5 shadow-sm sm:rounded-3xl sm:p-8">
        <p className="mb-0.5 text-[10px] font-semibold tracking-[0.18em] text-accent uppercase sm:mb-1 sm:text-xs sm:tracking-[0.2em]">
          GATE OUT
        </p>
        <h1 className="font-display text-[1.75rem] font-bold leading-tight text-brand-deep sm:text-3xl">
          שיבוצון
        </h1>
        <p className="mt-1.5 text-xs text-ink-soft sm:mt-2 sm:text-sm">
          התחברות מנהלים עם מספר טלפון
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3.5 sm:mt-6 sm:space-y-4">
          <label className="block text-xs sm:text-sm">
            <span className="mb-1 block text-ink-soft">מספר טלפון</span>
            <input
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm sm:px-4 sm:py-3 sm:text-base"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XXXXXXXX"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
            />
          </label>

          {error && (
            <p className="rounded-xl bg-hard-soft px-3 py-2 text-xs font-medium text-hard sm:text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !phone.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:py-3"
          >
            <LogIn className="size-4" />
            {busy ? 'מתחבר…' : 'התחברות'}
          </button>
        </form>
      </div>
    </div>
  )
}
