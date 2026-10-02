import { useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE } from './apiBase'

type Props = { onBack: () => void; onComplete: (schoolSlug: string) => void }

export default function AdminRegistration({ onBack, onComplete }: Props) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const values = new FormData(event.currentTarget)
    try {
      const response = await fetch(`${API_BASE}/api/register-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolName: values.get('schoolName'),
          name: values.get('name'),
          username: values.get('username'),
          password: values.get('password')
        })
      })
      const body = await response.json().catch(() => ({ error: 'Could not create the school account.' }))
      if (!response.ok) { setError(body.error || 'Could not create the school account.'); setBusy(false); return }
      setBusy(false)
      onComplete(body.school.slug)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="login-page registration-page">
      <div className="login-art">
        <div className="brand light"><span className="brand-mark">T</span><span>TIMPRIEST EDU</span></div>
        <div className="art-copy">
          <p className="eyebrow">School registration</p>
          <h1>Start your<br /><em>exam centre.</em></h1>
          <p>Create your school and its first Admin account. Teachers and Students are added from the Admin dashboard.</p>
        </div>
        <div className="art-footer"><span className="status-dot" /> Secure · Separate data for every school</div>
      </div>
      <div className="login-panel">
        <div className="login-box">
          <button className="back-link" type="button" onClick={onBack}>← Back to homepage</button>
          <p className="eyebrow">Create Admin account</p>
          <h2>Register your school</h2>
          <p className="login-subtitle">This account will manage your entire examination centre.</p>
          <form onSubmit={submit}>
            <label>School name<input name="schoolName" placeholder="Enter your school's name" required /></label>
            <label>Your full name<input name="name" placeholder="Enter your full name" required /></label>
            <label>Admin username<input name="username" placeholder="Choose a username" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" placeholder="At least 6 characters" minLength={6} autoComplete="new-password" required /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button full" type="submit" disabled={busy}>{busy ? 'Creating school...' : 'Create school account'} <span>→</span></button>
          </form>
          <p className="login-hint">After registering you get your school's own sign-in link to share with teachers and students.</p>
        </div>
        <p className="copyright">TIMPRIEST EDU · CBT Suite</p>
      </div>
    </div>
  )
}
