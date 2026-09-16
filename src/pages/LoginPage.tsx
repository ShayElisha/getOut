import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, LogIn } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { AppFooter } from '../components/AppFooter'
import { FieldError, FieldLabel } from '../components/ui'
import {
  PASSWORD_RULES,
  passwordMeetsAllRules,
  validatePasswordRules,
} from '../lib/password'

type Step = 'phone' | 'setup' | 'login'

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
  autoComplete,
  disabled,
  describedBy,
  invalid,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  autoComplete: string
  disabled?: boolean
  describedBy?: string
  invalid?: boolean
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <input
          id={id}
          className="ui-field pe-11"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          required
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute inset-y-0 end-0 flex items-center px-3 text-ink-soft hover:text-brand"
          aria-label={show ? 'הסתר סיסמה' : 'הצג סיסמה'}
          tabIndex={0}
        >
          {show ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { login, checkLogin } = useApp()
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const phoneTrimmed = phone.trim()
  const phoneInvalid = touched && step === 'phone' && !phoneTrimmed

  const ruleStates = useMemo(
    () =>
      PASSWORD_RULES.map((rule) => ({
        ...rule,
        ok: rule.test(password),
      })),
    [password],
  )

  const resetPasswordFields = () => {
    setPassword('')
    setPasswordConfirm('')
    setShowPassword(false)
    setShowConfirm(false)
  }

  const submitPhone = async () => {
    setTouched(true)
    if (!phoneTrimmed) {
      setError('נא להזין מספר טלפון')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await checkLogin(phoneTrimmed)
      resetPasswordFields()
      setStep(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'בדיקת מספר נכשלה')
    } finally {
      setBusy(false)
    }
  }

  const submitPassword = async () => {
    if (!password) {
      setError('נא להזין סיסמה')
      return
    }
    if (step === 'setup') {
      const ruleError = validatePasswordRules(password)
      if (ruleError) {
        setError(ruleError)
        return
      }
      if (password !== passwordConfirm) {
        setError('אימות הסיסמה אינו תואם')
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      await login(
        phoneTrimmed,
        password,
        step === 'setup' ? passwordConfirm : undefined,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'התחברות נכשלה')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (step === 'phone') {
      await submitPhone()
      return
    }
    await submitPassword()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 sm:py-12">
      <div className="ui-panel-solid p-5 sm:rounded-[1.25rem] sm:p-8">
        <p className="ui-eyebrow mb-1">GATE OUT</p>
        <h1 className="font-display text-[1.85rem] font-bold leading-tight tracking-tight text-brand-deep sm:text-3xl">
          שיבוצון
        </h1>
        <p className="ui-subtitle mt-2 text-xs sm:text-sm">
          {step === 'phone'
            ? 'התחברות מנהלים עם מספר טלפון וסיסמה'
            : step === 'setup'
              ? 'הגדרת סיסמה ראשונה לחשבון'
              : 'הזנת סיסמה להתחברות'}
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
                if (step !== 'phone') {
                  setStep('phone')
                  resetPasswordFields()
                }
              }}
              onBlur={() => setTouched(true)}
              placeholder="05XXXXXXXX"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              required
              aria-invalid={phoneInvalid || Boolean(error) || undefined}
              aria-describedby={
                error || phoneInvalid ? 'login-form-error' : undefined
              }
              disabled={busy}
            />
          </div>

          {step !== 'phone' && (
            <>
              <PasswordField
                id="login-password"
                label={step === 'setup' ? 'סיסמה חדשה' : 'סיסמה'}
                value={password}
                onChange={(v) => {
                  setPassword(v)
                  if (error) setError(null)
                }}
                show={showPassword}
                onToggleShow={() => setShowPassword((s) => !s)}
                autoComplete={
                  step === 'setup' ? 'new-password' : 'current-password'
                }
                disabled={busy}
                describedBy={
                  step === 'setup' ? 'login-password-rules' : undefined
                }
                invalid={Boolean(error)}
              />

              {step === 'setup' && (
                <>
                  <PasswordField
                    id="login-password-confirm"
                    label="אימות סיסמה"
                    value={passwordConfirm}
                    onChange={(v) => {
                      setPasswordConfirm(v)
                      if (error) setError(null)
                    }}
                    show={showConfirm}
                    onToggleShow={() => setShowConfirm((s) => !s)}
                    autoComplete="new-password"
                    disabled={busy}
                    invalid={Boolean(error)}
                  />

                  <ul
                    id="login-password-rules"
                    className="space-y-1.5 rounded-xl border border-line bg-surface/80 px-3 py-2.5 text-[11px] sm:text-xs"
                  >
                    {ruleStates.map((rule) => (
                      <li
                        key={rule.id}
                        className={`flex items-center gap-2 ${
                          rule.ok ? 'text-ok' : 'text-ink-soft'
                        }`}
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-full ${
                            rule.ok
                              ? 'bg-ok text-white'
                              : 'bg-line/80 text-transparent'
                          }`}
                          aria-hidden
                        >
                          <Check className="size-2.5 stroke-[3]" />
                        </span>
                        {rule.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <div id="login-form-error">
            <FieldError
              message={
                phoneInvalid && step === 'phone'
                  ? 'נא להזין מספר טלפון'
                  : error
              }
            />
          </div>

          <button
            type="submit"
            disabled={
              busy ||
              (step === 'setup' &&
                (!passwordMeetsAllRules(password) ||
                  password !== passwordConfirm))
            }
            className="ui-btn ui-btn-primary w-full py-2.5 sm:py-3"
          >
            {busy ? (
              <>
                <span className="page-loader page-loader--sm" aria-hidden />
                {step === 'phone' ? 'בודק…' : 'מתחבר…'}
              </>
            ) : step === 'phone' ? (
              'המשך'
            ) : step === 'setup' ? (
              <>
                <LogIn className="size-4" aria-hidden />
                שמירת סיסמה והתחברות
              </>
            ) : (
              <>
                <LogIn className="size-4" aria-hidden />
                התחברות
              </>
            )}
          </button>

          {step !== 'phone' && (
            <button
              type="button"
              className="ui-btn ui-btn-ghost w-full text-xs"
              disabled={busy}
              onClick={() => {
                setStep('phone')
                resetPasswordFields()
                setError(null)
              }}
            >
              חזרה למספר טלפון
            </button>
          )}

          <p className="text-center text-[11px] leading-relaxed text-ink-soft sm:text-xs">
            בהתחברות חלה{' '}
            <Link
              to="/privacy"
              className="font-bold text-brand underline underline-offset-2"
            >
              מדיניות השימוש והפרטיות
            </Link>
          </p>
        </form>
      </div>

      <AppFooter className="mt-10" />
    </div>
  )
}
