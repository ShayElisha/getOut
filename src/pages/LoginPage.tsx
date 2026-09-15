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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-3xl border border-line bg-card p-6 shadow-sm sm:p-8">
        <p className="mb-1 text-xs font-semibold tracking-[0.2em] text-accent uppercase">
          GATE OUT
        </p>
        <h1 className="font-display text-3xl font-bold text-brand-deep">שיבוצון</h1>
        <p className="mt-2 text-sm text-ink-soft">
          התחברות מנהלים עם מספר טלפון (ללא אימות בשלב זה)
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft">מספר טלפון</span>
            <input
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base"
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
            <p className="rounded-xl bg-hard-soft px-3 py-2 text-sm font-medium text-hard">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !phone.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            <LogIn className="size-4" />
            {busy ? 'מתחבר…' : 'התחברות'}
          </button>
        </form>
      </div>
    </div>
  )
}
