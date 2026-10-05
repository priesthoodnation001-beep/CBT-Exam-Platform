import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE } from './apiBase'

// The owner's control page, at  /creator  on the website. It needs CREATOR_USERNAME and CREATOR_PASSWORD in the Railway variables.

type School = { id: string; name: string; slug: string; email: string | null; created_at: string; credits: number; admins: number; teachers: number; students: number; exams: number; results: number }
type Overview = { schools: School[]; totals: { schools: number; students: number; creditsHeld: number; paymentsCount: number; revenueNaira: number }; paymentsReady: boolean }
type Payment = { reference: string; school: string; credits: number; amountNaira: number; createdAt: string; paidAt: string | null; status: string }
type Detail = { school: { id: string; name: string; slug: string; email: string | null }; accounts: { id: string; role: string; name: string; username: string | null }[]; history: { change: number; reason: string; created_at: string }[] }
type LogEntry = { at: string; action: string; details: string }

const TOKEN_KEY = 'timpriest-creator'

async function call<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/creator${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed.') as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return body as T
}

const money = (value: number) => `₦${value.toLocaleString()}`
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '')

export default function CreatorPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [tab, setTab] = useState<'Schools' | 'Payments' | 'Activity'>('Schools')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [creditChange, setCreditChange] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [passwordFor, setPasswordFor] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmSlug, setConfirmSlug] = useState('')

  const signOut = () => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); setOverview(null); setDetail(null) }

  // runs an action, shows any error, and returns to sign-in if the session ran out
  const guard = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() } catch (error) {
      if ((error as { status?: number }).status === 401) signOut()
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally { setBusy(false) }
  }

  const loadAll = async () => {
    const [summary, paymentList, activity] = await Promise.all([
      call<Overview>('/overview', token),
      call<{ payments: Payment[] }>('/payments', token),
      call<{ log: LogEntry[] }>('/log', token)
    ])
    setOverview(summary); setPayments(paymentList.payments); setLog(activity.log)
  }

  const openSchool = async (id: string) => {
    const result = await call<Detail>(`/schools/${id}`, token)
    setDetail(result); setCreditChange(''); setCreditReason(''); setPasswordFor(''); setNewPassword(''); setConfirmSlug('')
  }

  useEffect(() => { if (token) void guard(loadAll) }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    void guard(async () => {
      const result = await call<{ token: string }>('/login', null, { method: 'POST', body: JSON.stringify({ username: values.get('username'), password: values.get('password') }) })
      sessionStorage.setItem(TOKEN_KEY, result.token)
      setToken(result.token); setMessage('')
    })
  }

  const applyCredits = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    const change = Math.trunc(Number(creditChange))
    if (!change) { setMessage('Enter how many credits to add (or a minus number to take away).'); return }
    if (!window.confirm(`${change > 0 ? 'Add' : 'Remove'} ${Math.abs(change)} credits ${change > 0 ? 'to' : 'from'} ${detail.school.name}?`)) return
    void guard(async () => {
      const result = await call<{ credits: number }>(`/schools/${detail.school.id}/credits`, token, { method: 'POST', body: JSON.stringify({ change, reason: creditReason }) })
      setMessage(`Done. ${detail.school.name} now has ${result.credits} credits.`)
      await openSchool(detail.school.id); await loadAll()
    })
  }

  const resetPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void guard(async () => {
      await call(`/users/${passwordFor}/password`, token, { method: 'POST', body: JSON.stringify({ newPassword }) })
      setMessage('Password changed. Give the new password to that person and ask them to change it after signing in.')
      setPasswordFor(''); setNewPassword('')
    })
  }

  const deleteSchool = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    if (!window.confirm(`Permanently delete ${detail.school.name} and ALL its accounts, exams, questions and results? This cannot be undone.`)) return
    void guard(async () => {
      await call(`/schools/${detail.school.id}/delete`, token, { method: 'POST', body: JSON.stringify({ confirmSlug }) })
      setMessage(`${detail.school.name} was deleted.`)
      setDetail(null); await loadAll()
    })
  }

  const checkPayment = (reference: string) => void guard(async () => {
    const result = await call<{ message: string }>(`/payments/${encodeURIComponent(reference)}/verify`, token, { method: 'POST', body: '{}' })
    setMessage(result.message); await loadAll()
  })

  const dismissPayment = (reference: string) => {
    if (!window.confirm('Mark this unpaid payment as abandoned?')) return
    void guard(async () => { await call(`/payments/${encodeURIComponent(reference)}/dismiss`, token, { method: 'POST', body: '{}' }); setMessage('Marked as abandoned.'); await loadAll() })
  }

  if (!token) {
    return (
      <div className="creator-shell">
        <form className="creator-card creator-login" onSubmit={login}>
          <img className="creator-logo" src="/logo.svg" alt="" />
          <h1>Creator sign in</h1>
          <p>For the owner of TIMPRIEST EDU only.</p>
          {message && <p className="form-error">{message}</p>}
          <label>Username<input name="username" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </div>
    )
  }

  return (
    <div className="creator-shell">
      <header className="creator-header">
        <div className="creator-title"><img className="creator-logo small" src="/logo.svg" alt="" /><div><h1>Creator tools</h1><p>Manage schools, credits and payments without touching code.</p></div></div>
        <div className="creator-header-actions"><button className="secondary-button" onClick={() => void guard(loadAll)} disabled={busy}>Refresh</button><button className="secondary-button" onClick={signOut}>Sign out</button></div>
      </header>

      {message && <div className="creator-message" role="status">{message}<button className="text-button" onClick={() => setMessage('')}>Close</button></div>}

      {overview && (
        <div className="creator-stats">
          <div className="creator-card"><span>Schools</span><strong>{overview.totals.schools}</strong></div>
          <div className="creator-card"><span>Students</span><strong>{overview.totals.students}</strong></div>
          <div className="creator-card"><span>Credits held by schools</span><strong>{overview.totals.creditsHeld.toLocaleString()}</strong></div>
          <div className="creator-card"><span>Paid so far</span><strong>{money(overview.totals.revenueNaira)}</strong></div>
        </div>
      )}

      <nav className="creator-tabs">
        {(['Schools', 'Payments', 'Activity'] as const).map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}
      </nav>

      {tab === 'Schools' && overview && (
        <>
          <div className="creator-card creator-scroll">
            <table className="creator-table">
              <thead><tr><th>School</th><th>Email</th><th>Credits</th><th>Admins / Teachers / Students</th><th>Exams / Results</th><th>Joined</th><th /></tr></thead>
              <tbody>
                {overview.schools.length === 0 && <tr><td colSpan={7}>No schools yet.</td></tr>}
                {overview.schools.map((school) => (
                  <tr key={school.id}>
                    <td><strong>{school.name}</strong><br /><small>/{school.slug}</small></td>
                    <td>{school.email || '-'}</td>
                    <td><strong>{school.credits}</strong></td>
                    <td>{school.admins} / {school.teachers} / {school.students}</td>
                    <td>{school.exams} / {school.results}</td>
                    <td>{new Date(school.created_at).toLocaleDateString()}</td>
                    <td><button className="primary-button" onClick={() => void guard(() => openSchool(school.id))}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail && (
            <div className="creator-card creator-detail">
              <div className="creator-detail-head"><h2>{detail.school.name}</h2><button className="text-button" onClick={() => setDetail(null)}>Close</button></div>
              <p>Link name: <strong>{detail.school.slug}</strong> · Email: {detail.school.email || 'none'} · Credits now: <strong>{overview.schools.find((school) => school.id === detail.school.id)?.credits ?? 0}</strong></p>

              <h3>Add or remove credits</h3>
              <p className="creator-hint">For example a school that paid by bank transfer, or a payment that went wrong. The reason shows in the school's credit history.</p>
              <form className="creator-inline" onSubmit={applyCredits}>
                <label>Credits (minus to remove)<input type="number" value={creditChange} onChange={(event) => setCreditChange(event.target.value)} placeholder="e.g. 100" required /></label>
                <label>Reason<input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder="e.g. Paid by bank transfer" required /></label>
                <button className="primary-button" type="submit" disabled={busy}>Apply</button>
              </form>

              <h3>Accounts (admins and teachers)</h3>
              {detail.accounts.map((account) => (
                <div className="creator-row" key={account.id}>
                  <span><strong>{account.name}</strong> · {account.role} · {account.username}</span>
                  {passwordFor === account.id
                    ? <form className="creator-inline" onSubmit={resetPassword}><input type="text" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (6+ characters)" minLength={6} required /><button className="primary-button" type="submit" disabled={busy}>Save</button><button className="text-button" type="button" onClick={() => { setPasswordFor(''); setNewPassword('') }}>Cancel</button></form>
                    : <button className="secondary-button" onClick={() => { setPasswordFor(account.id); setNewPassword('') }}>Reset password</button>}
                </div>
              ))}

              <h3>Recent credit history</h3>
              {detail.history.length === 0 ? <p className="creator-hint">No credit history yet.</p> : detail.history.map((entry, index) => <p className="creator-line" key={index}>{entry.change > 0 ? '+' : ''}{entry.change} · {entry.reason} · {when(entry.created_at)}</p>)}

              <h3 className="creator-danger-title">Delete this school</h3>
              <p className="creator-hint">This permanently removes the school, its accounts, exams, questions and results. Payment records are kept. Type the link name <strong>{detail.school.slug}</strong> to confirm.</p>
              <form className="creator-inline" onSubmit={deleteSchool}>
                <input value={confirmSlug} onChange={(event) => setConfirmSlug(event.target.value)} placeholder={detail.school.slug} required />
                <button className="danger-button" type="submit" disabled={busy || confirmSlug !== detail.school.slug}>Delete school</button>
              </form>
            </div>
          )}
        </>
      )}

      {tab === 'Payments' && (
        <div className="creator-card creator-scroll">
          <p className="creator-hint">"abandoned?" means the payment was started over 30 minutes ago and never paid. Use <strong>Check with Paystack</strong> to confirm what really happened; if the school did pay, the credits are added.{overview && !overview.paymentsReady ? ' (Paystack is not set up on the server, so checking is unavailable.)' : ''}</p>
          <table className="creator-table">
            <thead><tr><th>Started</th><th>School</th><th>Credits</th><th>Amount</th><th>Status</th><th>Reference</th><th /></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan={7}>No payments yet.</td></tr>}
              {payments.map((payment) => (
                <tr key={payment.reference}>
                  <td>{when(payment.createdAt)}</td><td>{payment.school}</td><td>{payment.credits}</td><td>{money(payment.amountNaira)}</td>
                  <td><span className={`creator-chip ${payment.status.replace('?', '')}`}>{payment.status}</span></td>
                  <td><small>{payment.reference}</small></td>
                  <td>{payment.status !== 'success' && <><button className="secondary-button" onClick={() => checkPayment(payment.reference)} disabled={busy}>Check with Paystack</button>{(payment.status === 'pending' || payment.status === 'abandoned?') && <button className="text-button" onClick={() => dismissPayment(payment.reference)}>Dismiss</button>}</>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Activity' && (
        <div className="creator-card">
          <p className="creator-hint">Everything you have done on this page, newest first.</p>
          {log.length === 0 ? <p className="creator-hint">Nothing yet.</p> : log.map((entry, index) => <p className="creator-line" key={index}><strong>{when(entry.at)}</strong> · {entry.details}</p>)}
        </div>
      )}
    </div>
  )
}
