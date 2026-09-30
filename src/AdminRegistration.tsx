import { useState } from 'react'
import type { FormEvent } from 'react'

type Props = { onBack: () => void; onComplete: () => void }

export default function AdminRegistration({ onBack, onComplete }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const values = new FormData(event.currentTarget)
    const response = await fetch('https://cbt-exam-platform-production.up.railway.app/api/register-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: values.get('name'), username: values.get('username'), schoolName: values.get('schoolName'), password: values.get('password') }) })
    if (!response.ok) { const body = await response.json().catch(() => ({ error: 'Could not create Admin account.' })); setError(body.error); setBusy(false); return }
    setBusy(false); onComplete()
  }
  return <div className="login-page registration-page"><div className="login-art"><div className="brand light"><span className="brand-mark">T</span><span>TIMPRIEST EDU</span></div><div className="art-copy"><p className="eyebrow">School registration</p><h1>Start your<br /><em>exam centre.</em></h1><p>Create the first Admin account for your school. Teachers and Students can be added from the Admin dashboard.</p></div><div className="art-footer"><span className="status-dot" /> LAN-ready · SQLite database</div></div><div className="login-panel"><div className="login-box"><button className="back-link" onClick={onBack}>← Back to homepage</button><p className="eyebrow">Create Admin account</p><h2>Register your school</h2><p className="login-subtitle">This account will manage your entire examination centre.</p><form onSubmit={submit}><label>School name<input name="schoolName" placeholder="Your school's full name" required /></label><label>Full name<input name="name" placeholder="Your full name" required /></label><label>Admin username<input name="username" placeholder="Choose a username" required /></label><label>Password<input name="password" type="password" placeholder="Create a password" minLength={6} required /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button full" type="submit" disabled={busy}>{busy ? 'Creating account...' : 'Create Admin account'} <span>→</span></button></form><p className="login-hint">After registration, use your Admin username and password to sign in.</p></div><p className="copyright">TIMPRIEST EDU · Offline CBT Suite</p></div></div>
}
