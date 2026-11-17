import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import PasswordInput from './PasswordInput'
import { API_BASE } from './apiBase'
import './prep-ambassador.css'

type Exam = 'JAMB' | 'WAEC' | 'NECO'
type Dashboard = {
  ambassador: { id: string; name: string; username: string; referralCode: string; commissionsNaira: Record<Exam, number> }
  referralCount: number
  unpaidCommissionNaira: number
  paidCommissionNaira: number
  pendingWithdrawalNaira: number
  withdrawalAvailableNaira: number
  canRequestWithdrawal: boolean
  referrals: { id: string; name: string; phone: string; createdAt: string; subscribedExams: string; earnedNaira: number }[]
  commissions: { paymentReference: string; exam: Exam; amountNaira: number; paidAt: string; referralName: string; withdrawalStatus: 'unpaid' | 'pending' | 'approved' }[]
  withdrawals: { id: string; amountNaira: number; status: 'pending' | 'approved' | 'rejected'; requestedAt: string; processedAt: string | null; commissionMonths: string }[]
}

const TOKEN_KEY = 'timpriest-prep-ambassador-token'
const money = (amount: number) => `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (value: string) => new Date(value).toLocaleDateString('en-NG', { dateStyle: 'medium' })

async function request<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/prep/ambassador${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  })
  const body = response.status === 204 ? undefined : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error || 'The ambassador request could not be completed.')
  return body as T
}

export default function PrepAmbassador() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [busy, setBusy] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [withdrawalBusy, setWithdrawalBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    setBusy(true)
    request<Dashboard>('/dashboard', token)
      .then((result) => { if (active) setDashboard(result) })
      .catch((cause: unknown) => {
        if (!active) return
        const message = cause instanceof Error ? cause.message : 'Could not load your ambassador dashboard.'
        setError(message)
        if (message.includes('session has expired')) {
          sessionStorage.removeItem(TOKEN_KEY)
          setToken(null)
        }
      })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [token])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const session = await request<{ token: string }>('/login', null, {
        method: 'POST',
        body: JSON.stringify({ username: String(form.get('username') || '').trim(), password: String(form.get('password') || '') }),
      })
      sessionStorage.setItem(TOKEN_KEY, session.token)
      setDashboard(null)
      setToken(session.token)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    let message = ''
    if (token) {
      try {
        await request('/logout', token, { method: 'POST' })
      } catch (cause) {
        message = cause instanceof Error ? cause.message : 'Could not close the ambassador session.'
      }
    }
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setDashboard(null)
    setError(message)
    setCopied(false)
  }

  async function copyReferralLink() {
    if (!dashboard) return
    const link = `${window.location.origin}/prep?ref=${encodeURIComponent(dashboard.ambassador.referralCode)}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setError('')
    } catch {
      setError('Could not copy automatically. Select and copy the referral link shown below.')
    }
  }

  async function requestWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dashboard?.canRequestWithdrawal || withdrawalBusy) return
    const form = event.currentTarget
    const formData = new FormData(form)
    setWithdrawalBusy(true)
    setError('')
    setNotice('')
    try {
      const { withdrawal } = await request<{ withdrawal: { amountNaira: number } }>('/withdrawals', token, {
        method: 'POST',
        body: JSON.stringify({
          bankName: String(formData.get('bankName') || '').trim(),
          accountName: String(formData.get('accountName') || '').trim(),
          accountNumber: String(formData.get('accountNumber') || '').trim(),
        }),
      })
      const updatedDashboard = await request<Dashboard>('/dashboard', token)
      setDashboard(updatedDashboard)
      form.reset()
      setNotice(`Withdrawal request for ${money(withdrawal.amountNaira)} sent to the Creator for approval.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the withdrawal request.')
    } finally {
      setWithdrawalBusy(false)
    }
  }

  if (token && !dashboard) {
    return <main className="prep-ambassador"><header className="pa-header"><a className="pa-brand" href="/prep"><img src="/logo-512.png" alt="" /><span>TIMPRIEST <b>EDU</b></span></a><button className="pa-text-button" type="button" onClick={signOut}>Sign out</button></header>{error ? <p className="pa-error pa-notice" role="alert">{error}</p> : <p className="pa-loading" role="status">Loading your ambassador dashboard...</p>}</main>
  }

  if (!token) {
    return (
      <main className="prep-ambassador">
        <header className="pa-header"><a className="pa-brand" href="/prep"><img src="/logo-512.png" alt="" /><span>TIMPRIEST <b>EDU</b></span></a><a href="/prep">Prep platform <span aria-hidden="true">→</span></a></header>
        <section className="pa-auth-wrap">
          <div className="pa-intro"><span className="pa-kicker">PREP AMBASSADOR PROGRAM</span><h1>Grow your community.<br /><em>Earn with every referral.</em></h1><p>Share your personal Prep link and track registrations, paid exam plans, and your commissions in one place.</p></div>
          <form className="pa-login" onSubmit={signIn}>
            <span className="pa-kicker">AMBASSADOR ACCESS</span><h2>Sign in</h2><p>Use the account details provided by the platform Creator.</p>
            <label>Username<input name="username" autoComplete="username" minLength={3} maxLength={30} required /></label>
            <label>Password<PasswordInput name="password" autoComplete="current-password" minLength={8} maxLength={256} required /></label>
            {error && <p className="pa-error" role="alert">{error}</p>}
            <button type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Open ambassador dashboard'}<span aria-hidden="true">→</span></button>
          </form>
        </section>
        <footer className="pa-footer">A dedicated preparation space from TIMPRIEST EDU</footer>
      </main>
    )
  }

  if (!dashboard) return <main className="prep-ambassador"><header className="pa-header"><a className="pa-brand" href="/prep"><img src="/logo-512.png" alt="" /><span>TIMPRIEST <b>EDU</b></span></a><button className="pa-text-button" type="button" onClick={signOut}>Sign out</button></header><p className="pa-loading" role="status">Loading your ambassador dashboard...</p></main>

  const referralLink = `${window.location.origin}/prep?ref=${encodeURIComponent(dashboard.ambassador.referralCode)}`
  return (
    <main className="prep-ambassador">
      <header className="pa-header"><a className="pa-brand" href="/prep"><img src="/logo-512.png" alt="" /><span>TIMPRIEST <b>EDU</b></span></a><div className="pa-account"><span>{dashboard.ambassador.name}</span><button type="button" onClick={signOut}>Sign out</button></div></header>
      {error && <p className="pa-error pa-notice" role="alert">{error}</p>}
      {busy ? <p className="pa-loading" role="status">Loading your ambassador dashboard...</p> : (
        <div className="pa-dashboard">
          <section className="pa-welcome"><div><span className="pa-kicker">AMBASSADOR DASHBOARD</span><h1>Welcome, {dashboard.ambassador.name}</h1><p>Here is your Prep referral activity and commission summary.</p></div><div className="pa-kpis"><article><strong>{dashboard.referralCount}</strong><span>people referred</span></article><article><strong>{money(dashboard.unpaidCommissionNaira)}</strong><span>unpaid commission</span></article><article><strong>{money(dashboard.paidCommissionNaira)}</strong><span>paid commission</span></article></div></section>
          {notice && <p className="pa-success" role="status">{notice}</p>}
          <section className="pa-share-card">
            <div><span className="pa-kicker">YOUR PERSONAL REFERRAL LINK</span><h2>Share Prep with your community</h2><p>New Prep accounts created from this link will appear in your referrals.</p></div>
            <div className="pa-link-row"><input aria-label="Your Prep referral link" readOnly value={referralLink} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyReferralLink()}>{copied ? 'Copied' : 'Copy link'}</button></div>
          </section>
          <section className="pa-rates">
            <div><span className="pa-kicker">YOUR COMMISSION RATES</span><h2>Earned for each successful payment, including renewals</h2><p>Cash and manual payments recorded by the Creator also count.</p></div>
            <div className="pa-rate-list">{(['JAMB', 'WAEC', 'NECO'] as Exam[]).map((exam) => <article key={exam}><span>{exam}</span><strong>{money(dashboard.ambassador.commissionsNaira[exam])}</strong></article>)}</div>
          </section>
          <form className="pa-withdraw" onSubmit={(event) => void requestWithdrawal(event)}>
            <div><span className="pa-kicker">COMMISSION PAYOUT</span><h2>Withdraw your unpaid commission</h2><p>Request the full available balance. The Creator will review it; approved payouts move into your paid commission total.</p></div>
            <div className="pa-withdraw-details">
              <label>Bank name<input name="bankName" autoComplete="organization" maxLength={100} required disabled={!dashboard.canRequestWithdrawal || withdrawalBusy} /></label>
              <label>Account name<input name="accountName" autoComplete="name" maxLength={100} required disabled={!dashboard.canRequestWithdrawal || withdrawalBusy} /></label>
              <label>Account number<input name="accountNumber" inputMode="numeric" autoComplete="off" maxLength={20} pattern="[0-9]{6,20}" title="Enter 6 to 20 digits." required disabled={!dashboard.canRequestWithdrawal || withdrawalBusy} /></label>
            </div>
            <div className="pa-withdraw-action">
              <strong>{money(dashboard.withdrawalAvailableNaira)} <span>available to request</span></strong>
              <button type="submit" disabled={!dashboard.canRequestWithdrawal || withdrawalBusy}>{withdrawalBusy ? 'Sending request...' : 'Request withdrawal'}</button>
              {dashboard.pendingWithdrawalNaira > 0 && <small>{money(dashboard.pendingWithdrawalNaira)} is awaiting Creator approval.</small>}
              {!dashboard.canRequestWithdrawal && dashboard.pendingWithdrawalNaira === 0 && <small>No unpaid commission is currently available to withdraw.</small>}
            </div>
          </form>
          <section className="pa-referrals">
            <div className="pa-section-heading"><div><span className="pa-kicker">YOUR COMMUNITY</span><h2>Referred users</h2><p>Names and phone numbers for accounts registered with your link.</p></div><span className="pa-count">{dashboard.referrals.length} total</span></div>
            {dashboard.referrals.length === 0 ? <div className="pa-empty"><strong>No referrals yet</strong><p>Share your link to see new Prep registrations here.</p></div> : (
              <div className="pa-table-wrap"><table><thead><tr><th>Name</th><th>Phone number</th><th>Subscribed exams</th><th>Commission earned</th><th>Joined</th></tr></thead><tbody>
                {dashboard.referrals.map((referral) => <tr key={referral.id}><td><strong>{referral.name}</strong></td><td>{referral.phone ? <a href={`tel:${encodeURIComponent(referral.phone)}`}>{referral.phone}</a> : '—'}</td><td>{referral.subscribedExams || 'Not subscribed'}</td><td>{money(referral.earnedNaira)}</td><td>{date(referral.createdAt)}</td></tr>)}
              </tbody></table></div>
            )}
          </section>
          <section className="pa-commissions">
            <div className="pa-section-heading"><div><span className="pa-kicker">PAYMENT ACTIVITY</span><h2>Recent commissions</h2><p>Each successful payment adds one commission at the current exam rate.</p></div></div>
            {dashboard.commissions.length === 0 ? <div className="pa-empty"><strong>No commissions recorded yet</strong><p>Commissions appear after a referred user completes an exam payment.</p></div> : (
              <div className="pa-commission-list">{dashboard.commissions.map((commission) => <article key={commission.paymentReference}><div><strong>{commission.referralName} · {commission.exam}</strong><span>{date(commission.paidAt)}</span></div><strong>{money(commission.amountNaira)}</strong><span className={`pa-commission-status ${commission.withdrawalStatus}`}>{commission.withdrawalStatus === 'approved' ? 'Paid' : commission.withdrawalStatus === 'pending' ? 'Awaiting approval' : 'Unpaid'}</span></article>)}</div>
            )}
          </section>
          <section className="pa-commissions">
            <div className="pa-section-heading"><div><span className="pa-kicker">WITHDRAWAL HISTORY</span><h2>Your withdrawal requests</h2><p>Track pending requests and payouts approved by the Creator.</p></div></div>
            {dashboard.withdrawals.length === 0 ? <div className="pa-empty"><strong>No withdrawal requests yet</strong><p>When you request a withdrawal, its status will appear here.</p></div> : (
              <div className="pa-commission-list">{dashboard.withdrawals.map((withdrawal) => <article key={withdrawal.id}><div><strong>{money(withdrawal.amountNaira)} · {withdrawal.commissionMonths.replaceAll(',', ', ') || 'Commission balance'}</strong><span>Requested {date(withdrawal.requestedAt)}{withdrawal.processedAt ? ` · Updated ${date(withdrawal.processedAt)}` : ''}</span></div><span className={`pa-withdrawal-status ${withdrawal.status}`}>{withdrawal.status === 'approved' ? 'Paid' : withdrawal.status === 'pending' ? 'Pending Creator approval' : 'Rejected'}</span></article>)}</div>
            )}
          </section>
          <footer className="pa-footer">Questions about your referral account? Contact the Prep platform Creator.</footer>
        </div>
      )}
    </main>
  )
}
