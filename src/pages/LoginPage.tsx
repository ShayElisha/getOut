import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { AppFooter } from '../components/AppFooter'
import { FieldError, FieldLabel } from '../components/ui'

export function LoginPage() {
  const { login } = useApp()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const phoneTrimmed = phone.trim()
  const phoneInvalid = touched && !phoneTrimmed

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!phoneTrimmed) {
      setError('נא להזין מספר טלפון')
      return
    }
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 sm:py-12">
      <div className="ui-panel-solid p-5 sm:rounded-[1.25rem] sm:p-8">
        <p className="ui-eyebrow mb-1">GATE OUT</p>
        <h1 className="font-display text-[1.85rem] font-bold leading-tight tracking-tight text-brand-deep sm:text-3xl">
          שיבוצון
        </h1>
        <p className="ui-subtitle mt-2 text-xs sm:text-sm">
          התחברות מנהלים עם מספר טלפון
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4 sm:mt-7" noValidate>
          <div>
            <FieldLabel htmlFor="login-phone">מספר טלפון</FieldLabel>
            <input
              id="login-phone"
              className="ui-field"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                if (error) setError(null)
              }}
              onBlur={() => setTouched(true)}
              placeholder="05XXXXXXXX"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
              aria-invalid={phoneInvalid || Boolean(error) || undefined}
              aria-describedby={error || phoneInvalid ? 'login-phone-error' : undefined}
              disabled={busy}
            />
            <div id="login-phone-error">
              <FieldError message={phoneInvalid ? 'נא להזין מספר טלפון' : error} />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="ui-btn ui-btn-primary w-full py-2.5 sm:py-3"
          >
            {busy ? (
              <>
                <span className="page-loader page-loader--sm" aria-hidden />
                מתחבר…
              </>
            ) : (
              <>
                <LogIn className="size-4" aria-hidden />
                התחברות
              </>
            )}
          </button>
        </form>
      </div>

      <AppFooter className="mt-10" />
    </div>
  )
}
