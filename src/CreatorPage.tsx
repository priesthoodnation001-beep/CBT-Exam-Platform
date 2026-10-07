import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE } from './apiBase'
import './creator.css'

// The owner's console, at  /creator  on the website. It needs CREATOR_USERNAME and CREATOR_PASSWORD in the Railway variables.

type School = { id: string; name: string; slug: string; email: string | null; created_at: string; credits: number; admins: number; teachers: number; students: number; exams: number; results: number }
type Overview = { schools: School[]; totals: { schools: number; students: number; creditsHeld: number; paymentsCount: number; revenueNaira: number }; paymentsReady: boolean }
type Payment = { reference: string; school: string; credits: number; amountNaira: number; createdAt: string; paidAt: string | null; status: string }
type Detail = { school: { id: string; name: string; slug: string; email: string | null }; accounts: { id: string; role: string; name: string; username: string | null }[]; history: { change: number; reason: string; created_at: string }[] }
type LogEntry = { at: string; action: string; details: string }
type Tab = 'Schools' | 'Payments' | 'Support' | 'Activity'
type Filter = 'All' | 'Paid' | 'Pending' | 'Abandoned'
type SupportTicket = { id: string; subject: string; category: string; status: string; updatedAt: string; unread: number; school: string; from_name: string; last: string | null }
type SupportThread = { ticket: { id: string; subject: string; category: string; status: string; school: string; from: string }; messages: { id: string; sender: 'admin' | 'creator'; body: string; createdAt: string }[] }
type SupportFilter = 'All' | 'Needs reply' | 'Answered' | 'Resolved'

const TOKEN_KEY = 'timpriest-creator'
const COLORS = ['#1f6137', '#2a5ea8', '#a8325b', '#8a6410', '#6a3fa0', '#0f7b7b']
const REASONS = ['Paid by bank transfer', 'Payment problem fixed', 'Free credits as a gift']

const ICONS = {
  schools: 'M2 9l10-5 10 5-10 5-10-5z M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5',
  payments: 'M3 6h18v12H3z M3 10h18 M7 15h3',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  users: 'M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1 M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M20 20v-1a3 3 0 0 0-2-2.8 M16 5.2a3 3 0 0 1 0 5.6',
  coins: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  cash: 'M3 7h18v10H3z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  refresh: 'M20 11a8 8 0 0 0-14-4 M4 4v4h4 M4 13a8 8 0 0 0 14 4 M20 20v-4h-4',
  logout: 'M9 4H5v16h4 M16 8l4 4-4 4 M20 12H9',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  close: 'M6 6l12 12 M18 6L6 18',
  chat: 'M4 5h16v11H9l-5 4V5z M8 9h8 M8 12.5h5',
  send: 'M4 12l16-8-6 16-3-7-7-1z'
}

function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
}

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
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || '?'
const colorFor = (key: string) => COLORS[[...key].reduce((sum, character) => sum + character.charCodeAt(0), 0) % COLORS.length]
const filterOf = (status: string): Filter => (status === 'success' ? 'Paid' : status === 'pending' ? 'Pending' : 'Abandoned')

export default function CreatorPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [tab, setTab] = useState<Tab>('Schools')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [supportFilter, setSupportFilter] = useState<SupportFilter>('All')
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [replyText, setReplyText] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
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
    const [summary, paymentList, activity, support] = await Promise.all([
      call<Overview>('/overview', token),
      call<{ payments: Payment[] }>('/payments', token),
      call<{ log: LogEntry[] }>('/log', token),
      call<{ tickets: SupportTicket[] }>('/support', token)
    ])
    setOverview(summary); setPayments(paymentList.payments); setLog(activity.log); setTickets(support.tickets)
  }

  const openSchool = async (id: string) => {
    const result = await call<Detail>(`/schools/${id}`, token)
    setDetail(result); setCreditChange(''); setCreditReason(''); setPasswordFor(''); setNewPassword(''); setConfirmSlug('')
  }

  useEffect(() => { if (token) void guard(loadAll) }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // new messages from schools appear by themselves, and the browser tab shows how many are waiting
  const waiting = tickets.reduce((sum, ticket) => sum + Number(ticket.unread || 0), 0)
  useEffect(() => {
    if (!token) return
    const interval = window.setInterval(() => { call<{ tickets: SupportTicket[] }>('/support', token).then((result) => setTickets(result.tickets)).catch(() => undefined) }, 30000)
    return () => window.clearInterval(interval)
  }, [token])
  useEffect(() => {
    document.title = waiting > 0 ? `(${waiting}) Creator console` : 'Creator console'
    return () => { document.title = 'TIMPRIEST EDU' }
  }, [waiting])

  // messages fade away by themselves
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 7000)
    return () => window.clearTimeout(timer)
  }, [message])

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
    if (!change) { setMessage('Enter how many credits to add, or a minus number to take some away.'); return }
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

  const openTicket = (id: string) => void guard(async () => {
    setThread(await call<SupportThread>(`/support/${id}`, token)); setReplyText('')
    setTickets((await call<{ tickets: SupportTicket[] }>('/support', token)).tickets)
  })

  const sendReply = (event: FormEvent<HTMLFormElement>, resolve: boolean) => {
    event.preventDefault()
    if (!thread) return
    void guard(async () => {
      await call(`/support/${thread.ticket.id}/reply`, token, { method: 'POST', body: JSON.stringify({ body: replyText, resolve }) })
      setReplyText(''); setMessage(resolve ? 'Reply sent and marked as resolved.' : 'Reply sent.')
      setThread(await call<SupportThread>(`/support/${thread.ticket.id}`, token))
      setTickets((await call<{ tickets: SupportTicket[] }>('/support', token)).tickets)
    })
  }

  const setTicketStatus = (status: string) => {
    if (!thread) return
    void guard(async () => {
      await call(`/support/${thread.ticket.id}/status`, token, { method: 'POST', body: JSON.stringify({ status }) })
      setThread(await call<SupportThread>(`/support/${thread.ticket.id}`, token))
      setTickets((await call<{ tickets: SupportTicket[] }>('/support', token)).tickets)
    })
  }

  const shownTickets = tickets.filter((ticket) => supportFilter === 'All' || (supportFilter === 'Needs reply' ? ticket.status === 'open' : supportFilter === 'Answered' ? ticket.status === 'answered' : ticket.status === 'resolved'))

  const shownSchools = useMemo(() => {
    const words = query.trim().toLowerCase()
    return (overview?.schools || []).filter((school) => !words || `${school.name} ${school.slug} ${school.email || ''}`.toLowerCase().includes(words))
  }, [overview, query])

  const shownPayments = useMemo(() => payments.filter((payment) => filter === 'All' || filterOf(payment.status) === filter), [payments, filter])
  const pendingCount = payments.filter((payment) => payment.status !== 'success' && payment.status !== 'abandoned').length

  if (!token) {
    return (
      <div className="cx-login">
        <form className="cx-login-card" onSubmit={login}>
          <img src="/logo.svg" alt="" />
          <h1>Creator console</h1>
          <p>For the owner of TIMPRIEST EDU only.</p>
          {message && <div className="cx-error">{message}</div>}
          <label>Username<input className="cx-input" name="username" autoComplete="username" required /></label>
          <label>Password<input className="cx-input" name="password" type="password" autoComplete="current-password" required /></label>
          <button className="cx-btn primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </div>
    )
  }

  const titles: Record<Tab, [string, string]> = {
    Schools: ['Schools', 'Everyone using TIMPRIEST EDU, and their credits.'],
    Payments: ['Payments', 'Check what was paid, and sort out payments that did not finish.'],
    Support: ['Support', 'Messages from school admins. Reply here and they see it on their dashboard.'],
    Activity: ['Activity', 'A record of everything you have done in this console.']
  }
  const currentCredits = detail ? (overview?.schools.find((school) => school.id === detail.school.id)?.credits ?? 0) : 0

  return (
    <div className="cx">
      <aside className="cx-side">
        <div className="cx-brand"><img src="/logo.svg" alt="" /><div><strong>TIMPRIEST EDU</strong><span>Creator console</span></div></div>
        <nav className="cx-nav">
          <button className={tab === 'Schools' ? 'active' : ''} onClick={() => setTab('Schools')}><Icon name="schools" />Schools</button>
          <button className={tab === 'Payments' ? 'active' : ''} onClick={() => setTab('Payments')}><Icon name="payments" />Payments{pendingCount > 0 ? ` (${pendingCount})` : ''}</button>
          <button className={tab === 'Support' ? 'active' : ''} onClick={() => setTab('Support')}><Icon name="chat" />Support{waiting > 0 && <span className="cx-badge">{waiting}</span>}</button>
          <button className={tab === 'Activity' ? 'active' : ''} onClick={() => setTab('Activity')}><Icon name="activity" />Activity</button>
        </nav>
        <div className="cx-side-foot"><button onClick={signOut}><Icon name="logout" />Sign out</button></div>
      </aside>

      <main className="cx-main">
        <header className="cx-top">
          <div><h1>{titles[tab][0]}</h1><p>{titles[tab][1]}</p></div>
          <button className="cx-btn" onClick={() => void guard(loadAll)} disabled={busy}><Icon name="refresh" size={17} />{busy ? 'Working...' : 'Refresh'}</button>
        </header>

        {tab === 'Schools' && overview && (
          <>
            <section className="cx-kpis">
              <div className="cx-kpi"><div className="cx-kpi-icon green"><Icon name="schools" size={24} /></div><div><strong>{overview.totals.schools}</strong><span>Schools</span></div></div>
              <div className="cx-kpi"><div className="cx-kpi-icon blue"><Icon name="users" size={24} /></div><div><strong>{overview.totals.students.toLocaleString()}</strong><span>Students</span></div></div>
              <div className="cx-kpi"><div className="cx-kpi-icon gold"><Icon name="coins" size={24} /></div><div><strong>{overview.totals.creditsHeld.toLocaleString()}</strong><span>Credits held by schools</span></div></div>
              <div className="cx-kpi"><div className="cx-kpi-icon rose"><Icon name="cash" size={24} /></div><div><strong>{money(overview.totals.revenueNaira)}</strong><span>Paid so far</span></div></div>
            </section>

            <div className="cx-toolbar">
              <div className="cx-search"><Icon name="search" size={18} /><input className="cx-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by school name, link or email" /></div>
              <span className="cx-count">{shownSchools.length} of {overview.schools.length} schools</span>
            </div>

            {shownSchools.length === 0 ? <div className="cx-empty">{overview.schools.length === 0 ? 'No schools have registered yet.' : 'No school matches your search.'}</div> : (
              <div className="cx-grid">
                {shownSchools.map((school) => (
                  <article className="cx-school" key={school.id}>
                    <div className="cx-school-head">
                      <div className="cx-avatar" style={{ background: colorFor(school.id) }}>{initials(school.name)}</div>
                      <div className="cx-school-name"><strong>{school.name}</strong><span>/{school.slug}</span></div>
                      <div className={`cx-credits ${school.credits === 0 ? 'none' : school.credits <= 5 ? 'low' : ''}`}><strong>{school.credits}</strong><span>credits</span></div>
                    </div>
                    <div className="cx-stats">
                      <div><strong>{school.teachers}</strong><span>Teachers</span></div>
                      <div><strong>{school.students}</strong><span>Students</span></div>
                      <div><strong>{school.exams}</strong><span>Exams</span></div>
                      <div><strong>{school.results}</strong><span>Results</span></div>
                    </div>
                    <div className="cx-school-foot"><small>Joined {new Date(school.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</small><button className="cx-btn primary small" onClick={() => void guard(() => openSchool(school.id))}>Manage</button></div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'Payments' && (
          <>
            <div className="cx-note">"Abandoned" means the payment was started and never finished. If a school says it paid, press <strong>Check with Paystack</strong>: if Paystack confirms it, the credits are added for you.{overview && !overview.paymentsReady ? ' Paystack is not set up on the server, so checking is unavailable.' : ''}</div>
            <div className="cx-pills">{(['All', 'Paid', 'Pending', 'Abandoned'] as Filter[]).map((name) => <button key={name} className={filter === name ? 'active' : ''} onClick={() => setFilter(name)}>{name}</button>)}</div>
            {shownPayments.length === 0 ? <div className="cx-empty">No payments to show.</div> : (
              <div className="cx-list">
                {shownPayments.map((payment) => {
                  const kind = filterOf(payment.status)
                  return (
                    <article className="cx-pay" key={payment.reference}>
                      <div><strong>{payment.school}</strong><small>{payment.reference}</small></div>
                      <div><strong>{money(payment.amountNaira)}</strong><small>{payment.credits} credits · {when(payment.createdAt)}</small></div>
                      <span className={`cx-chip ${kind.toLowerCase()}`}>{kind}</span>
                      <div className="cx-pay-actions">
                        {payment.status !== 'success' && <button className="cx-btn small" onClick={() => checkPayment(payment.reference)} disabled={busy}>Check with Paystack</button>}
                        {(payment.status === 'pending' || payment.status === 'abandoned?') && <button className="cx-btn ghost small" onClick={() => dismissPayment(payment.reference)}>Dismiss</button>}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}

        {tab === 'Support' && (
          <>
            <div className="cx-pills">{(['All', 'Needs reply', 'Answered', 'Resolved'] as SupportFilter[]).map((name) => <button key={name} className={supportFilter === name ? 'active' : ''} onClick={() => setSupportFilter(name)}>{name}</button>)}</div>
            {shownTickets.length === 0 ? <div className="cx-empty">{tickets.length === 0 ? 'No messages yet. When a school admin writes to you, it will appear here.' : 'No messages in this group.'}</div> : (
              <div className="cx-list">
                {shownTickets.map((ticket) => (
                  <button className={`cx-ticket ${ticket.unread ? 'unread' : ''}`} key={ticket.id} onClick={() => openTicket(ticket.id)}>
                    <div className="cx-ticket-top"><strong>{ticket.school}</strong>{ticket.unread > 0 && <span className="cx-badge inline">New</span>}<small>{when(ticket.updatedAt)}</small></div>
                    <div className="cx-ticket-subject">{ticket.subject}<span className="cx-chip role">{ticket.category}</span></div>
                    <span className="cx-ticket-snippet">{ticket.last}</span>
                    <span className={`cx-chip ${ticket.status === 'resolved' ? 'paid' : ticket.status === 'answered' ? 'role' : 'pending'}`}>{ticket.status === 'open' ? 'Needs reply' : ticket.status === 'answered' ? 'Answered' : 'Resolved'}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'Activity' && (
          <div className="cx-card">
            {log.length === 0 ? <p style={{ margin: 0, color: '#667a6d' }}>Nothing yet. Credits you add, passwords you reset and schools you delete will be listed here.</p> : (
              <ul className="cx-timeline">{log.map((entry, index) => <li key={index}><strong>{entry.details}</strong><small>{when(entry.at)}</small></li>)}</ul>
            )}
          </div>
        )}
      </main>

      {detail && (
        <div className="cx-drawer-wrap">
          <div className="cx-backdrop" onClick={() => setDetail(null)} />
          <aside className="cx-drawer" role="dialog" aria-label={`Manage ${detail.school.name}`}>
            <div className="cx-drawer-head">
              <div className="cx-avatar" style={{ background: colorFor(detail.school.id) }}>{initials(detail.school.name)}</div>
              <div><h2>{detail.school.name}</h2><p>/{detail.school.slug} · {detail.school.email || 'no email'}</p></div>
              <button className="cx-btn ghost" onClick={() => setDetail(null)} aria-label="Close"><Icon name="close" size={20} /></button>
            </div>

            <section className="cx-section">
              <div className="cx-balance"><div><span>Credits now</span><strong>{currentCredits}</strong></div><em>Used one at a time<br />as students submit exams</em></div>
              <h3>Add or remove credits</h3>
              <p>For a bank transfer, a payment problem, or a gift. Your reason shows in the school's credit history.</p>
              <form className="cx-form" onSubmit={applyCredits}>
                <div className="cx-chips">{[10, 50, 100, 500].map((amount) => <button type="button" key={amount} onClick={() => setCreditChange(String(amount))}>+{amount}</button>)}</div>
                <div className="cx-form-row">
                  <label className="cx-field">Credits<input className="cx-input" type="number" value={creditChange} onChange={(event) => setCreditChange(event.target.value)} placeholder="e.g. 100" required /></label>
                  <label className="cx-field">Reason<input className="cx-input" value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder="Why are you changing the credits?" required /></label>
                </div>
                <div className="cx-chips">{REASONS.map((reason) => <button type="button" key={reason} onClick={() => setCreditReason(reason)}>{reason}</button>)}</div>
                <button className="cx-btn gold" type="submit" disabled={busy}>Apply credits</button>
                <small style={{ color: '#667a6d' }}>Use a minus number, like -20, to take credits away.</small>
              </form>
            </section>

            <section className="cx-section">
              <h3>Admins and teachers</h3>
              <p>Forgotten password? Set a new one here and give it to that person.</p>
              {detail.accounts.length === 0 && <p>No accounts yet.</p>}
              {detail.accounts.map((account) => (
                <div className="cx-person" key={account.id}>
                  <div className="cx-avatar" style={{ background: colorFor(account.id) }}>{initials(account.name)}</div>
                  <div className="cx-person-info"><strong>{account.name}</strong><small>{account.username}</small></div>
                  <span className="cx-chip role">{account.role}</span>
                  {passwordFor === account.id
                    ? <form className="cx-inline" onSubmit={resetPassword}><input className="cx-input" type="text" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (6+ characters)" minLength={6} required /><button className="cx-btn primary small" type="submit" disabled={busy}>Save</button><button className="cx-btn ghost small" type="button" onClick={() => { setPasswordFor(''); setNewPassword('') }}>Cancel</button></form>
                    : <button className="cx-btn small" onClick={() => { setPasswordFor(account.id); setNewPassword('') }}>Reset password</button>}
                </div>
              ))}
            </section>

            <section className="cx-section">
              <h3>Recent credit history</h3>
              <p>The latest changes to this school's credits.</p>
              {detail.history.length === 0 ? <p>No credit history yet.</p> : (
                <div className="cx-history">{detail.history.map((entry, index) => <div key={index}><span>{entry.reason}<small>{when(entry.created_at)}</small></span><b className={entry.change > 0 ? 'plus' : 'minus'}>{entry.change > 0 ? '+' : ''}{entry.change}</b></div>)}</div>
              )}
            </section>

            <details className="cx-danger">
              <summary>Danger zone: delete this school</summary>
              <div className="cx-danger-body">
                <span>This permanently removes the school with all its accounts, exams, questions and results. Payment records are kept. To confirm, type the link name <strong>{detail.school.slug}</strong>.</span>
                <form className="cx-inline" onSubmit={deleteSchool}>
                  <input className="cx-input" value={confirmSlug} onChange={(event) => setConfirmSlug(event.target.value)} placeholder={detail.school.slug} required />
                  <button className="cx-btn danger" type="submit" disabled={busy || confirmSlug !== detail.school.slug}>Delete school</button>
                </form>
              </div>
            </details>
          </aside>
        </div>
      )}

      {thread && (
        <div className="cx-drawer-wrap">
          <div className="cx-backdrop" onClick={() => setThread(null)} />
          <aside className="cx-drawer" role="dialog" aria-label={thread.ticket.subject}>
            <div className="cx-drawer-head">
              <div className="cx-avatar" style={{ background: colorFor(thread.ticket.school) }}>{initials(thread.ticket.school)}</div>
              <div><h2>{thread.ticket.subject}</h2><p>{thread.ticket.school} · from {thread.ticket.from} · {thread.ticket.category}</p></div>
              <button className="cx-btn ghost" onClick={() => setThread(null)} aria-label="Close"><Icon name="close" size={20} /></button>
            </div>
            <div className="cx-msgs">
              {thread.messages.map((item) => (
                <div key={item.id} className={`cx-bubble ${item.sender}`}>
                  <span>{item.sender === 'admin' ? thread.ticket.from : 'You (creator)'}</span>
                  <p>{item.body}</p>
                  <small>{when(item.createdAt)}</small>
                </div>
              ))}
            </div>
            <form className="cx-replybox" onSubmit={(event) => sendReply(event, false)}>
              <textarea className="cx-input" rows={4} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Write your reply to the school admin" maxLength={2000} required />
              <div className="cx-reply-actions">
                {thread.ticket.status === 'resolved' ? <button type="button" className="cx-btn small" onClick={() => setTicketStatus('open')} disabled={busy}>Reopen</button> : <button type="button" className="cx-btn small" onClick={() => setTicketStatus('resolved')} disabled={busy}>Mark resolved</button>}
                <button className="cx-btn small" type="button" disabled={busy || !replyText.trim()} onClick={(event) => sendReply(event as unknown as FormEvent<HTMLFormElement>, true)}>Send and resolve</button>
                <button className="cx-btn primary small" type="submit" disabled={busy}><Icon name="send" size={16} />Send reply</button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {message && <div className="cx-toast" role="status"><span>{message}</span><button onClick={() => setMessage('')}>OK</button></div>}
    </div>
  )
}
