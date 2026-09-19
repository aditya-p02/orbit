import { useState } from 'react'

const API_BASE = ''

export default function Login({ onAuth }: { onAuth: (user: string) => void }) {
  const [user, setUser] = useState('admin')
  const [pw, setPw] = useState('orbit2026')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user.trim() || !pw.trim()) {
      setErr('Please fill in both fields.')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: user.trim(), password: pw.trim() }),
        credentials: 'include',
      })
      if (res.ok) {
        onAuth(user.trim())
      } else {
        const data = await res.json().catch(() => ({}))
        setErr(data.detail || 'Invalid credentials')
      }
    } catch {
      setErr('Cannot reach API. Is the backend running on :8000?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="orbit-page flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight text-primary">
            Orbit
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Rogue AP Detection · Security Console
          </div>
        </div>

        <form onSubmit={submit} className="bg-card rounded-2xl card-shadow border border-border/60 p-7">
          <h1 className="mb-6 text-lg font-semibold text-foreground">Sign in</h1>

          <Field label="Operator" value={user} onChange={setUser} />
          <div className="h-4" />
          <Field label="Passphrase" value={pw} onChange={setPw} type="password" />

          {err && <div className="mt-4 text-sm text-status-flagged">{err}</div>}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-[filter] hover:brightness-105 active:brightness-95 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Enter console'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Session stored locally · all API routes protected
        </p>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  )
}