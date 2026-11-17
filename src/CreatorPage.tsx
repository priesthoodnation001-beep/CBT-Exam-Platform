import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE } from './apiBase'
import { schoolRolePath } from './schoolLinks'
import WelcomeLoading from './WelcomeLoading'
import useMinimumWelcomeDuration from './useMinimumWelcomeDuration'
import PrepQuestionImport from './PrepQuestionImport'
import PasswordInput from './PasswordInput'
import './creator.css'

// The owner's console, at  /creator  on the website. It needs CREATOR_USERNAME and CREATOR_PASSWORD in the Railway variables.

type School = { id: string; name: string; slug: string; email: string | null; created_at: string; credits: number; admins: number; teachers: number; students: number; exams: number; results: number }
type Overview = { schools: School[]; totals: { schools: number; students: number; creditsHeld: number; paymentsCount: number; revenueNaira: number }; creditPriceNaira: number; prepMonthlyFeesNaira: Record<'JAMB' | 'WAEC' | 'NECO', number>; paymentsReady: boolean }
type Payment = { reference: string; school: string; credits: number; amountNaira: number; target?: string; createdAt: string; paidAt: string | null; status: string }
type Detail = { school: { id: string; name: string; slug: string; email: string | null }; accounts: { id: string; role: string; name: string; username: string | null }[]; history: { change: number; reason: string; created_at: string }[] }
type LogEntry = { at: string; action: string; details: string }
type Tab = 'Schools' | 'Payments' | 'Support' | 'Activity' | 'Prep Questions' | 'Prep Access' | 'Prep Ambassadors'
type PrepExam = 'JAMB' | 'WAEC' | 'NECO'
type PrepUser = { id: string; name: string; username: string; accessUntil: string | null; examAccess: Partial<Record<PrepExam, string>> }
type PrepAmbassador = { id: string; name: string; username: string; referralCode: string; createdAt: string; referrals: number; unpaidNaira: number; paidNaira: number; pendingWithdrawalNaira: number; commissionsNaira: Record<PrepExam, number> }
type PrepAmbassadorWithdrawal = { id: string; ambassadorId: string; ambassadorName: string; ambassadorUsername: string; amountNaira: number; status: 'pending' | 'approved' | 'rejected'; requestedAt: string; processedAt: string | null; commissionMonths: string; bankName: string | null; accountName: string | null; accountNumber: string | null }
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
  send: 'M4 12l16-8-6 16-3-7-7-1z',
  plus: 'M12 5v14 M5 12h14',
  copy: 'M9 9h10v11H9z M5 15V4h10',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  questions: 'M4 5h16v14H4z M8 9h8 M8 12h8 M8 15h5'
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
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ schoolName: '', slug: '', adminName: '', username: '', password: '', email: '', starter: '10' })
  const [suggested, setSuggested] = useState('')
  const [created, setCreated] = useState<{ name: string; slug: string; adminName: string; username: string; password: string; credits: number } | null>(null)
  const [linkDraft, setLinkDraft] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(Boolean(token))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [editingPayment, setEditingPayment] = useState<string | null>(null)
  const [editedCredits, setEditedCredits] = useState('')
  const [paymentCreditReason, setPaymentCreditReason] = useState('')
  const [creditPriceEditorOpen, setCreditPriceEditorOpen] = useState(false)
  const [creditPriceDraft, setCreditPriceDraft] = useState('')
  const [creditPriceReason, setCreditPriceReason] = useState('')
  const [prepMonthlyFeeEditorOpen, setPrepMonthlyFeeEditorOpen] = useState(false)
  const [prepMonthlyFeeDraft, setPrepMonthlyFeeDraft] = useState<Record<'JAMB' | 'WAEC' | 'NECO', string>>({ JAMB: '', WAEC: '', NECO: '' })
  const [prepMonthlyFeeReason, setPrepMonthlyFeeReason] = useState('')
  const [prepUserQuery, setPrepUserQuery] = useState('')
  const [prepUsers, setPrepUsers] = useState<PrepUser[]>([])
  const [prepUsersLoaded, setPrepUsersLoaded] = useState(false)
  const [selectedPrepUserId, setSelectedPrepUserId] = useState('')
  const [selectedPrepExam, setSelectedPrepExam] = useState<PrepExam>('JAMB')
  const [prepPaymentMethod, setPrepPaymentMethod] = useState<'cash' | 'bank_transfer' | 'other'>('cash')
  const [prepPaymentReference, setPrepPaymentReference] = useState('')
  const [prepPaymentNote, setPrepPaymentNote] = useState('')
  const [ambassadors, setAmbassadors] = useState<PrepAmbassador[]>([])
  const [ambassadorWithdrawals, setAmbassadorWithdrawals] = useState<PrepAmbassadorWithdrawal[]>([])
  const pendingWithdrawalIds = useRef<Set<string> | null>(null)
  const [ambassadorName, setAmbassadorName] = useState('')
  const [ambassadorUsername, setAmbassadorUsername] = useState('')
  const [ambassadorPassword, setAmbassadorPassword] = useState('')
  const [ambassadorReferralCode, setAmbassadorReferralCode] = useState('')
  const [ambassadorRates, setAmbassadorRates] = useState<Record<PrepExam, string>>({ JAMB: '0', WAEC: '0', NECO: '0' })
  const [editingAmbassadorId, setEditingAmbassadorId] = useState('')
  const [editingAmbassadorRates, setEditingAmbassadorRates] = useState<Record<PrepExam, string>>({ JAMB: '', WAEC: '', NECO: '' })
  const [editingAmbassadorReferralCodeId, setEditingAmbassadorReferralCodeId] = useState('')
  const [editingAmbassadorReferralCode, setEditingAmbassadorReferralCode] = useState('')
  const [creditChange, setCreditChange] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [passwordFor, setPasswordFor] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmSlug, setConfirmSlug] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const showWelcome = useMinimumWelcomeDuration(Boolean(token && !overview && busy))

  const signOut = () => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); setOverview(null); setDetail(null); setMobileNavOpen(false) }

  // runs an action, shows any error, and returns to sign-in if the session ran out
  const guard = async (action: () => Promise<void>) => {
    setBusy(true)
    try { await action() } catch (error) {
      if ((error as { status?: number }).status === 401) signOut()
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally { setBusy(false) }
  }

  const loadAll = async () => {
    const [summary, paymentList, activity, support, withdrawals] = await Promise.all([
      call<Overview>('/overview', token),
      call<{ payments: Payment[] }>('/payments', token),
      call<{ log: LogEntry[] }>('/log', token),
      call<{ tickets: SupportTicket[] }>('/support', token),
      call<{ withdrawals: PrepAmbassadorWithdrawal[] }>('/prep/ambassador-withdrawals', token)
    ])
    setOverview(summary); setPayments(paymentList.payments); setLog(activity.log); setTickets(support.tickets)
    setAmbassadorWithdrawals(withdrawals.withdrawals)
  }

  const openSchool = async (id: string) => {
    const result = await call<Detail>(`/schools/${id}`, token)
    setDetail(result); setCreditChange(''); setCreditReason(''); setPasswordFor(''); setNewPassword(''); setConfirmSlug(''); setLinkDraft(result.school.slug)
  }

  useEffect(() => { if (token) void guard(loadAll) }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token || tab !== 'Prep Access') return
    void guard(async () => {
      const result = await call<{ users: PrepUser[] }>('/prep/users', token)
      setPrepUsers(result.users)
      setPrepUsersLoaded(true)
    })
  }, [tab, token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token || tab !== 'Prep Ambassadors') return
    void guard(async () => {
      const [result, withdrawals] = await Promise.all([
        call<{ ambassadors: PrepAmbassador[] }>('/prep/ambassadors', token),
        call<{ withdrawals: PrepAmbassadorWithdrawal[] }>('/prep/ambassador-withdrawals', token),
      ])
      setAmbassadors(result.ambassadors)
      setAmbassadorWithdrawals(withdrawals.withdrawals)
    })
  }, [tab, token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!token) return
    let active = true
    const refreshWithdrawals = async () => {
      try {
        const [result, ambassadorList] = await Promise.all([
          call<{ withdrawals: PrepAmbassadorWithdrawal[] }>('/prep/ambassador-withdrawals', token),
          tab === 'Prep Ambassadors' ? call<{ ambassadors: PrepAmbassador[] }>('/prep/ambassadors', token) : Promise.resolve(null),
        ])
        if (!active) return
        const pending = new Set(result.withdrawals.filter((withdrawal) => withdrawal.status === 'pending').map((withdrawal) => withdrawal.id))
        if (pendingWithdrawalIds.current && [...pending].some((id) => !pendingWithdrawalIds.current?.has(id))) {
          setMessage('A new Prep ambassador withdrawal request needs your review in Prep Ambassadors.')
        }
        pendingWithdrawalIds.current = pending
        setAmbassadorWithdrawals(result.withdrawals)
        if (ambassadorList) setAmbassadors(ambassadorList.ambassadors)
      } catch (error) {
        if (!active) return
        if ((error as { status?: number }).status === 401) signOut()
        else setMessage(error instanceof Error ? `Could not refresh ambassador withdrawal notifications: ${error.message}` : 'Could not refresh ambassador withdrawal notifications.')
      }
    }
    void refreshWithdrawals()
    const interval = window.setInterval(() => void refreshWithdrawals(), 15000)
    return () => { active = false; window.clearInterval(interval) }
  }, [tab, token]) // eslint-disable-line react-hooks/exhaustive-deps

  // new messages from schools appear by themselves, and the browser tab shows how many are waiting
  const waiting = tickets.reduce((sum, ticket) => sum + Number(ticket.unread || 0), 0)
  const pendingAmbassadorWithdrawalCount = ambassadorWithdrawals.filter((withdrawal) => withdrawal.status === 'pending').length
  useEffect(() => {
    if (!token) return
    const interval = window.setInterval(() => { call<{ tickets: SupportTicket[] }>('/support', token).then((result) => setTickets(result.tickets)).catch(() => undefined) }, 30000)
    return () => window.clearInterval(interval)
  }, [token])
  useEffect(() => {
    const notifications = waiting + pendingAmbassadorWithdrawalCount
    document.title = notifications > 0 ? `(${notifications}) Creator console` : 'Creator console'
    return () => { document.title = 'TIMPRIEST EDU' }
  }, [pendingAmbassadorWithdrawalCount, waiting])

  // messages fade away by themselves
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 7000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.body.style.overflow = previousOverflow
    }
  }, [mobileNavOpen])

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

  const changePaymentCredits = (event: FormEvent<HTMLFormElement>, payment: Payment) => {
    event.preventDefault()
    if (!window.confirm(`Change ${payment.school}'s purchase from ${payment.credits} to ${editedCredits} credits? The amount paid will not change.`)) return
    void guard(async () => {
      const result = await call<{ credits: number; balance?: number; unchanged?: boolean }>(`/payments/${encodeURIComponent(payment.reference)}/credits`, token, {
        method: 'POST',
        body: JSON.stringify({ credits: Number(editedCredits), reason: paymentCreditReason })
      })
      setMessage(result.unchanged
        ? 'The purchase already has that credit amount.'
        : `Purchase updated to ${result.credits} credits${result.balance === undefined ? '' : `; school balance is now ${result.balance}`}.`)
      setEditingPayment(null); setEditedCredits(''); setPaymentCreditReason('')
      await loadAll()
    })
  }

  const changeCreditPrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextPrice = Number(creditPriceDraft)
    if (!window.confirm(`Set the price of one credit to ₦${nextPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for future purchases by all schools? Payments already started will keep their original amount.`)) return
    void guard(async () => {
      const result = await call<{ creditPriceNaira: number }>('/credit-price', token, {
        method: 'POST',
        body: JSON.stringify({ pricePerCredit: creditPriceDraft, reason: creditPriceReason })
      })
      setMessage(`Credit price updated to ${money(result.creditPriceNaira)} per credit.`)
      setCreditPriceEditorOpen(false); setCreditPriceDraft(''); setCreditPriceReason('')
      await loadAll()
    })
  }

  const changePrepMonthlyFee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextFees = Object.fromEntries(Object.entries(prepMonthlyFeeDraft).map(([exam, fee]) => [exam, Number(fee)]))
    if (!window.confirm(`Set monthly Prep prices to JAMB ${money(nextFees.JAMB)}, WAEC ${money(nextFees.WAEC)}, and NECO ${money(nextFees.NECO)}? This applies to upcoming renewals; payments already started keep their amount.`)) return
    void guard(async () => {
      const result = await call<{ prepMonthlyFeesNaira: Record<'JAMB' | 'WAEC' | 'NECO', number> }>('/prep-monthly-fees', token, {
        method: 'POST',
        body: JSON.stringify({ monthlyFeesNaira: prepMonthlyFeeDraft, reason: prepMonthlyFeeReason })
      })
      setMessage(`Monthly Prep prices updated: JAMB ${money(result.prepMonthlyFeesNaira.JAMB)}, WAEC ${money(result.prepMonthlyFeesNaira.WAEC)}, NECO ${money(result.prepMonthlyFeesNaira.NECO)}.`)
      setPrepMonthlyFeeEditorOpen(false); setPrepMonthlyFeeDraft({ JAMB: '', WAEC: '', NECO: '' }); setPrepMonthlyFeeReason('')
      await loadAll()
    })
  }

  const loadPrepUsers = () => {
    void guard(async () => {
      const result = await call<{ users: PrepUser[] }>('/prep/users', token)
      setPrepUsers(result.users)
      setPrepUsersLoaded(true)
    })
  }

  const deletePrepUser = (user: PrepUser) => {
    if (!window.confirm(`Permanently delete the Prep account for ${user.name} (@${user.username})? This also deletes their access, payment, and practice records and cannot be undone.`)) return
    void guard(async () => {
      await call<{ deleted: boolean }>(`/prep/users/${encodeURIComponent(user.id)}`, token, { method: 'DELETE' })
      setPrepUsers((current) => current.filter((item) => item.id !== user.id))
      if (selectedPrepUserId === user.id) setSelectedPrepUserId('')
      setMessage(`Prep account ${user.name} was deleted.`)
    })
  }

  const activatePrepUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const user = prepUsers.find((item) => item.id === selectedPrepUserId)
    if (!user) { setMessage('Search for and select a Prep account first.'); return }
    const examName = selectedPrepExam
    if (!window.confirm(`Record ${prepPaymentMethod === 'bank_transfer' ? 'a bank transfer' : prepPaymentMethod === 'cash' ? 'a cash payment' : 'a manual payment'} and grant ${user.name} one month of ${examName} Prep access at ${money(overview?.prepMonthlyFeesNaira[examName] || 0)}?`)) return
    void guard(async () => {
      const result = await call<{ paymentReference: string; user: PrepUser }>('/prep/access/manual', token, {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          exam: examName,
          method: prepPaymentMethod,
          paymentReference: prepPaymentReference.trim(),
          note: prepPaymentNote.trim(),
        })
      })
      setPrepUsers((current) => current.map((item) => item.id === result.user.id ? result.user : item))
      setSelectedPrepUserId(result.user.id)
      setMessage(`One month of ${examName} access activated for ${result.user.name}. Manual payment ${result.paymentReference} recorded.`)
      setPrepPaymentReference('')
      setPrepPaymentNote('')
    })
  }

  const createPrepAmbassador = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void guard(async () => {
      const result = await call<{ ambassador: PrepAmbassador }>('/prep/ambassadors', token, {
        method: 'POST',
        body: JSON.stringify({
          name: ambassadorName.trim(),
          username: ambassadorUsername.trim(),
          password: ambassadorPassword,
          referralCode: ambassadorReferralCode.trim(),
          commissionsNaira: ambassadorRates,
        }),
      })
      setAmbassadors((current) => [result.ambassador, ...current])
      setMessage(`Ambassador ${result.ambassador.name} created. Their referral link is ready to share.`)
      setAmbassadorName('')
      setAmbassadorUsername('')
      setAmbassadorPassword('')
      setAmbassadorReferralCode('')
      setAmbassadorRates({ JAMB: '0', WAEC: '0', NECO: '0' })
    })
  }

  const updatePrepAmbassadorReferralCode = (event: FormEvent<HTMLFormElement>, ambassador: PrepAmbassador) => {
    event.preventDefault()
    void guard(async () => {
      const result = await call<{ referralCode: string }>(`/prep/ambassadors/${encodeURIComponent(ambassador.id)}/referral-code`, token, {
        method: 'POST',
        body: JSON.stringify({ referralCode: editingAmbassadorReferralCode.trim() }),
      })
      setAmbassadors((current) => current.map((item) => item.id === ambassador.id ? { ...item, referralCode: result.referralCode } : item))
      setEditingAmbassadorReferralCodeId('')
      setEditingAmbassadorReferralCode('')
      setMessage(`Referral link updated for ${ambassador.name}. Their previous referral link will continue to work.`)
    })
  }

  const updatePrepAmbassadorRates = (event: FormEvent<HTMLFormElement>, ambassador: PrepAmbassador) => {
    event.preventDefault()
    void guard(async () => {
      const result = await call<{ commissionsNaira: Record<PrepExam, number> }>(`/prep/ambassadors/${encodeURIComponent(ambassador.id)}/commission`, token, {
        method: 'POST',
        body: JSON.stringify({ commissionsNaira: editingAmbassadorRates }),
      })
      setAmbassadors((current) => current.map((item) => item.id === ambassador.id ? { ...item, commissionsNaira: result.commissionsNaira } : item))
      setEditingAmbassadorId('')
      setMessage(`Referral commissions updated for ${ambassador.name}. New rates apply to future successful payments.`)
    })
  }

  const processPrepAmbassadorWithdrawal = (withdrawal: PrepAmbassadorWithdrawal, action: 'approve' | 'reject') => {
    const prompt = action === 'approve'
      ? `Confirm the ₦${withdrawal.amountNaira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} payout to ${withdrawal.ambassadorName} has been sent? Approval records this amount as paid commission.`
      : `Reject ${withdrawal.ambassadorName}'s withdrawal request? Its commissions will become available to request again.`
    if (!window.confirm(prompt)) return
    void guard(async () => {
      await call(`/prep/ambassador-withdrawals/${encodeURIComponent(withdrawal.id)}/${action}`, token, { method: 'POST', body: '{}' })
      const [withdrawalList, ambassadorList] = await Promise.all([
        call<{ withdrawals: PrepAmbassadorWithdrawal[] }>('/prep/ambassador-withdrawals', token),
        call<{ ambassadors: PrepAmbassador[] }>('/prep/ambassadors', token),
      ])
      setAmbassadorWithdrawals(withdrawalList.withdrawals)
      setAmbassadors(ambassadorList.ambassadors)
      setMessage(action === 'approve'
        ? `Payout of ${money(withdrawal.amountNaira)} to ${withdrawal.ambassadorName} was approved and recorded as paid.`
        : `Withdrawal request from ${withdrawal.ambassadorName} was rejected; the commission balance is available again.`)
      await loadAll()
    })
  }

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

  const origin = ['localhost', '127.0.0.1'].includes(window.location.hostname) ? window.location.origin : 'https://exam.timpriestedu.name.ng'
  const linkOf = (slug: string, role: 'admin' | 'teacher' | 'student') => `${origin}${schoolRolePath(slug, role)}`

  const copyText = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); setMessage(done) } catch { setMessage('Could not copy automatically. Select the text and copy it by hand.') }
  }

  const openAdd = () => { setForm({ schoolName: '', slug: '', adminName: '', username: '', password: '', email: '', starter: '10' }); setSuggested(''); setCreated(null); setAddOpen(true) }

  // shows the short link the school name will get, before the school is created
  useEffect(() => {
    if (!addOpen || form.slug || form.schoolName.trim().length < 2) { setSuggested(''); return }
    const timer = window.setTimeout(() => {
      call<{ slug: string }>(`/slug?name=${encodeURIComponent(form.schoolName)}`, token).then((result) => setSuggested(result.slug)).catch(() => setSuggested(''))
    }, 350)
    return () => window.clearTimeout(timer)
  }, [addOpen, form.schoolName, form.slug, token])

  const makePassword = () => {
    const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const bytes = crypto.getRandomValues(new Uint8Array(10))
    setForm((current) => ({ ...current, password: Array.from(bytes, (byte) => letters[byte % letters.length]).join('') }))
  }

  const submitNewSchool = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void guard(async () => {
      const result = await call<{ school: { name: string; slug: string }; credits: number }>('/schools', token, { method: 'POST', body: JSON.stringify({ schoolName: form.schoolName, slug: form.slug.trim(), adminName: form.adminName, username: form.username, password: form.password, email: form.email, starterCredits: form.starter }) })
      setCreated({ name: result.school.name, slug: result.school.slug, adminName: form.adminName, username: form.username, password: form.password, credits: result.credits })
      await loadAll()
    })
  }

  const detailsText = (info: { name: string; slug: string; username: string; password: string }) =>
    `${info.name} on TIMPRIEST EDU\n\nAdmin sign-in: ${linkOf(info.slug, 'admin')}\nUsername: ${info.username}\nPassword: ${info.password}\n\nStudents sign in at: ${linkOf(info.slug, 'student')}\nTeachers sign in at: ${linkOf(info.slug, 'teacher')}\n\nPlease change your password after you sign in.`

  const saveLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!detail) return
    void guard(async () => {
      const result = await call<{ slug: string }>(`/schools/${detail.school.id}/slug`, token, { method: 'POST', body: JSON.stringify({ slug: linkDraft }) })
      setMessage(`The admin link is now ${linkOf(result.slug, 'admin')}. The old link still works.`)
      await openSchool(detail.school.id); await loadAll()
    })
  }

  const shownSchools = useMemo(() => {
    const words = query.trim().toLowerCase()
    return (overview?.schools || []).filter((school) => !words || `${school.name} ${school.slug} ${school.email || ''}`.toLowerCase().includes(words))
  }, [overview, query])

  const shownPayments = useMemo(() => payments.filter((payment) => filter === 'All' || filterOf(payment.status) === filter), [payments, filter])
  const pendingCount = payments.filter((payment) => payment.status !== 'success' && payment.status !== 'abandoned').length

  if (token && !overview) {
    if (showWelcome) return <WelcomeLoading name="CORNELIUS" />
    return <div className="cx-empty"><strong>Could not open Creator workspace.</strong><p>{message || 'The Creator workspace could not be loaded.'}</p><button className="cx-btn primary" onClick={() => void guard(loadAll)}>Try again</button></div>
  }

  if (!token) {
    return (
      <div className="cx-login">
        <aside className="cx-login-story">
          <div className="cx-login-brand">
            <img src="/logo.svg" alt="" />
            <div><strong>TIMPRIEST EDU</strong><span>Platform management</span></div>
          </div>
          <div className="cx-login-story-copy">
            <span className="cx-login-kicker"><span /> CREATOR ACCOUNT</span>
            <h2>Every school.<br /><em>One clear view.</em></h2>
            <p>Manage your education platform from one focused workspace.</p>
            <ul>
              <li>Keep track of registered schools</li>
              <li>Review payments and account activity</li>
              <li>Reply to school support requests</li>
            </ul>
          </div>
          <div className="cx-login-story-foot"><span className="cx-login-foot-mark">T</span><span>TOOLS FOR BETTER LEARNING</span></div>
        </aside>
        <main className="cx-login-panel">
        <form className="cx-login-card" onSubmit={login}>
          <div className="cx-login-card-head">
            <span className="cx-login-avatar"><img src="/logo.svg" alt="" /></span>
            <span className="cx-login-card-kicker">TIMPRIEST EDU · CREATOR</span>
            <h1>Welcome back</h1>
            <p>Sign in to continue to your platform workspace.</p>
          </div>
          {message && <div className="cx-error" role="alert">{message}</div>}
          <label className="cx-login-label">Username<input className="cx-input" name="username" autoComplete="username" placeholder="Enter your username" required /></label>
          <label className="cx-login-label">Password<PasswordInput className="cx-input" name="password" autoComplete="current-password" placeholder="Enter your password" required /></label>
          <button className="cx-btn primary" type="submit" disabled={busy}><span>{busy ? 'Signing in...' : 'Sign in to Creator'}</span>{!busy && <span aria-hidden="true">→</span>}</button>
          <div className="cx-login-card-foot"><span className="cx-login-foot-dot" />Private access for the platform owner</div>
        </form>
        <p className="cx-login-copyright">© TIMPRIEST EDU · Creator workspace</p>
        </main>
      </div>
    )
  }

  const titles: Record<Tab, [string, string]> = {
    Schools: ['Schools', 'Everyone using TIMPRIEST EDU, and their credits.'],
    Payments: ['Payments', 'Check what was paid, and sort out payments that did not finish.'],
    Support: ['Support', 'Messages from school admins. Reply here and they see it on their dashboard.'],
    Activity: ['Activity', 'A record of everything you have done in this console.'],
    'Prep Questions': ['Prep Questions', 'Manage the JAMB, WAEC, and NECO student practice question bank.'],
    'Prep Access': ['Prep Access', 'Record manual payments and activate Prep access for JAMB, WAEC, or NECO.'],
    'Prep Ambassadors': ['Prep Ambassadors', 'Create ambassador accounts, referral links, and individual exam commissions.']
  }
  const currentCredits = detail ? (overview?.schools.find((school) => school.id === detail.school.id)?.credits ?? 0) : 0
  const filteredPrepUsers = prepUsers.filter((user) => {
    const query = prepUserQuery.trim().toLocaleLowerCase()
    return !query || user.name.toLocaleLowerCase().includes(query) || user.username.toLocaleLowerCase().includes(query)
  })

  return (
    <div className={`cx ${mobileNavOpen ? 'cx-mobile-nav-open' : ''}`}>
      <aside className="cx-side" id="creator-navigation" aria-label="Creator workspace navigation">
        <div className="cx-brand"><img src="/logo.svg" alt="" /><div><strong>TIMPRIEST EDU</strong><span>Creator console</span></div></div>
        <span className="cx-nav-label">WORKSPACE</span>
        <nav className="cx-nav" aria-label="Creator workspace">
          <button className={tab === 'Schools' ? 'active' : ''} aria-current={tab === 'Schools' ? 'page' : undefined} onClick={() => { setTab('Schools'); setMobileNavOpen(false) }}><Icon name="schools" /><span>Schools</span><small>{overview?.totals.schools ?? '—'}</small></button>
          <button className={tab === 'Payments' ? 'active' : ''} aria-current={tab === 'Payments' ? 'page' : undefined} onClick={() => { setTab('Payments'); setMobileNavOpen(false) }}><Icon name="payments" /><span>Payments</span>{pendingCount > 0 && <small className="cx-nav-count">{pendingCount}</small>}</button>
          <button className={tab === 'Support' ? 'active' : ''} aria-current={tab === 'Support' ? 'page' : undefined} onClick={() => { setTab('Support'); setMobileNavOpen(false) }}><Icon name="chat" /><span>Support</span>{waiting > 0 && <small className="cx-nav-count">{waiting}</small>}</button>
          <button className={tab === 'Activity' ? 'active' : ''} aria-current={tab === 'Activity' ? 'page' : undefined} onClick={() => { setTab('Activity'); setMobileNavOpen(false) }}><Icon name="activity" /><span>Activity</span></button>
          <button className={tab === 'Prep Questions' ? 'active' : ''} aria-current={tab === 'Prep Questions' ? 'page' : undefined} onClick={() => { setTab('Prep Questions'); setMobileNavOpen(false) }}><Icon name="questions" /><span>Prep Questions</span></button>
          <button className={tab === 'Prep Access' ? 'active' : ''} aria-current={tab === 'Prep Access' ? 'page' : undefined} onClick={() => { setTab('Prep Access'); setMobileNavOpen(false) }}><Icon name="cash" /><span>Prep Access</span></button>
          <button className={tab === 'Prep Ambassadors' ? 'active' : ''} aria-current={tab === 'Prep Ambassadors' ? 'page' : undefined} onClick={() => { setTab('Prep Ambassadors'); setMobileNavOpen(false) }}><Icon name="users" /><span>Prep Ambassadors</span>{pendingAmbassadorWithdrawalCount > 0 && <small className="cx-nav-count">{pendingAmbassadorWithdrawalCount}</small>}</button>
        </nav>
        <div className="cx-side-foot">
          <div className="cx-owner-status"><span /><div><strong>Owner access</strong><small>Creator account</small></div></div>
          <button onClick={signOut}><Icon name="logout" />Sign out</button>
        </div>
      </aside>
      {mobileNavOpen && <button className="cx-mobile-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMobileNavOpen(false)} />}

      <main className="cx-main">
        <header className="cx-top">
          <button className="cx-mobile-menu" type="button" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-controls="creator-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(!mobileNavOpen)}><Icon name="menu" size={20} /></button>
          <div className="cx-top-heading"><span>PLATFORM WORKSPACE</span><h1>{titles[tab][0]}</h1><p>{titles[tab][1]}</p></div>
          <div className="cx-top-actions"><span className="cx-owner-pill"><span />Owner workspace</span><button className="cx-btn" onClick={() => void guard(loadAll)} disabled={busy}><Icon name="refresh" size={17} />{busy ? 'Working...' : 'Refresh'}</button></div>
        </header>

        {tab === 'Schools' && overview && (
          <>
            <section className="cx-welcome">
              <div><span className="cx-welcome-kicker">PLATFORM OVERVIEW</span><h2>All your schools,<br />in one place.</h2><p>Keep an eye on platform growth, credits, and school activity from here.</p></div>
              <button className="cx-btn gold" onClick={openAdd}><Icon name="plus" size={17} />Add a school</button>
              <span className="cx-welcome-orbit" aria-hidden="true" />
            </section>

            <section className="cx-kpis">
              <div className="cx-kpi"><div className="cx-kpi-icon green"><Icon name="schools" size={24} /></div><div><strong>{overview.totals.schools}</strong><span>Schools</span></div></div>
              <div className="cx-kpi"><div className="cx-kpi-icon blue"><Icon name="users" size={24} /></div><div><strong>{overview.totals.students.toLocaleString()}</strong><span>Students</span></div></div>
              <div className="cx-kpi"><div className="cx-kpi-icon gold"><Icon name="coins" size={24} /></div><div><strong>{overview.totals.creditsHeld.toLocaleString()}</strong><span>Credits held by schools</span></div></div>
              <div className="cx-kpi"><div className="cx-kpi-icon rose"><Icon name="cash" size={24} /></div><div><strong>{money(overview.totals.revenueNaira)}</strong><span>Paid so far</span></div></div>
            </section>

            <div className="cx-directory-head"><div><h2>School directory</h2><p>Find a school to view its details and manage its account.</p></div><span className="cx-count">{shownSchools.length} <span>of {overview.schools.length} schools</span></span></div>
            <div className="cx-toolbar">
              <div className="cx-search"><Icon name="search" size={18} /><input className="cx-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by school name, link or email" /></div>
              {query && <button className="cx-btn cx-clear-search" onClick={() => setQuery('')}>Clear search</button>}
            </div>

            {shownSchools.length === 0 ? <div className="cx-empty"><span className="cx-empty-icon"><Icon name={overview.schools.length === 0 ? 'schools' : 'search'} size={23} /></span><strong>{overview.schools.length === 0 ? 'Your school directory is ready' : 'No schools match your search'}</strong><p>{overview.schools.length === 0 ? 'Add your first school to get started managing accounts, exams, and credits.' : 'Try a different school name, link, or email.'}</p>{overview.schools.length === 0 && <button className="cx-btn gold" onClick={openAdd}><Icon name="plus" size={17} />Add your first school</button>}</div> : (
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
                    <div className="cx-school-foot"><small>Joined {new Date(school.created_at).toLocaleDateString([], { dateStyle: 'medium' })}</small><div className="cx-foot-actions"><button className="cx-btn ghost small" onClick={() => void copyText(linkOf(school.slug, 'admin'), 'Admin link copied.')} title={linkOf(school.slug, 'admin')}><Icon name="copy" size={15} />Copy admin link</button><button className="cx-btn primary small" onClick={() => void guard(() => openSchool(school.id))}>Manage</button></div></div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'Payments' && (
          <>
            {overview && <section className="cx-credit-price">
              <div className="cx-credit-price-summary">
                <span>Monthly Prep prices by exam</span>
                <strong>JAMB {money(overview.prepMonthlyFeesNaira.JAMB)} · WAEC {money(overview.prepMonthlyFeesNaira.WAEC)} · NECO {money(overview.prepMonthlyFeesNaira.NECO)}</strong>
                <small>Each monthly payment unlocks only the selected exam. Existing subscribers keep their current access until it expires.</small>
              </div>
              {prepMonthlyFeeEditorOpen
                ? <form className="cx-credit-price-form" onSubmit={changePrepMonthlyFee}>
                  {(['JAMB', 'WAEC', 'NECO'] as const).map((exam) => <label className="cx-field" key={exam}>{exam} monthly fee (₦)<input className="cx-input" type="number" min="1" step="0.01" value={prepMonthlyFeeDraft[exam]} onChange={(event) => setPrepMonthlyFeeDraft((current) => ({ ...current, [exam]: event.target.value }))} required /></label>)}
                  <label className="cx-field">Reason<input className="cx-input" value={prepMonthlyFeeReason} onChange={(event) => setPrepMonthlyFeeReason(event.target.value)} minLength={3} maxLength={150} placeholder="Reason for this change" required /></label>
                  <div className="cx-credit-price-actions"><button className="cx-btn primary small" type="submit" disabled={busy}>Save exam prices</button><button className="cx-btn ghost small" type="button" disabled={busy} onClick={() => { setPrepMonthlyFeeEditorOpen(false); setPrepMonthlyFeeDraft({ JAMB: '', WAEC: '', NECO: '' }); setPrepMonthlyFeeReason('') }}>Cancel</button></div>
                </form>
                : <button className="cx-btn primary small" disabled={busy} onClick={() => { setPrepMonthlyFeeDraft({ JAMB: overview.prepMonthlyFeesNaira.JAMB.toFixed(2), WAEC: overview.prepMonthlyFeesNaira.WAEC.toFixed(2), NECO: overview.prepMonthlyFeesNaira.NECO.toFixed(2) }); setPrepMonthlyFeeReason(''); setPrepMonthlyFeeEditorOpen(true) }}>Change exam prices</button>}
            </section>}
            {overview && <section className="cx-credit-price">
              <div className="cx-credit-price-summary">
                <span>Price per credit</span>
                <strong>{money(overview.creditPriceNaira)}</strong>
                <small>Applies to new purchases by every school. Payments already started keep their original amount.</small>
              </div>
              {creditPriceEditorOpen
                ? <form className="cx-credit-price-form" onSubmit={changeCreditPrice}>
                  <label className="cx-field">New price per credit (₦)<input className="cx-input" type="number" min="0.01" step="0.01" value={creditPriceDraft} onChange={(event) => setCreditPriceDraft(event.target.value)} required /></label>
                  <label className="cx-field">Reason<input className="cx-input" value={creditPriceReason} onChange={(event) => setCreditPriceReason(event.target.value)} minLength={3} maxLength={150} placeholder="Reason for this change" required /></label>
                  <div className="cx-credit-price-actions"><button className="cx-btn primary small" type="submit" disabled={busy}>Save price</button><button className="cx-btn ghost small" type="button" disabled={busy} onClick={() => { setCreditPriceEditorOpen(false); setCreditPriceDraft(''); setCreditPriceReason('') }}>Cancel</button></div>
                </form>
                : <button className="cx-btn primary small" disabled={busy} onClick={() => { setCreditPriceDraft(overview.creditPriceNaira.toFixed(2)); setCreditPriceReason(''); setCreditPriceEditorOpen(true) }}>Change price</button>}
            </section>}
            <div className="cx-note">You can change the credits issued for a purchase; the amount paid stays the same. If the purchase is already completed, a credit adjustment is recorded. Credits already used cannot be removed. "Abandoned" means the payment was started and never finished. If a school says it paid, press <strong>Check with Paystack</strong>: if Paystack confirms it, the credits are added for you.{overview && !overview.paymentsReady ? ' Paystack is not set up on the server, so checking is unavailable.' : ''}</div>
            <div className="cx-pills" aria-label="Filter payments">{(['All', 'Paid', 'Pending', 'Abandoned'] as Filter[]).map((name) => <button key={name} className={filter === name ? 'active' : ''} aria-pressed={filter === name} onClick={() => setFilter(name)}>{name}</button>)}</div>
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
                        {payment.amountNaira > 0 && !(payment.status === 'success' && payment.target === 'offline') && (
                          editingPayment === payment.reference
                            ? <form className="cx-payment-credit-edit" onSubmit={(event) => changePaymentCredits(event, payment)}>
                              <label className="cx-field">Credits to issue<input className="cx-input" type="number" min="1" max="5000" step="1" value={editedCredits} onChange={(event) => setEditedCredits(event.target.value)} required /></label>
                              <label className="cx-field">Reason<input className="cx-input" value={paymentCreditReason} onChange={(event) => setPaymentCreditReason(event.target.value)} minLength={3} maxLength={150} placeholder="Reason for this change" required /></label>
                              <div className="cx-payment-edit-actions"><button className="cx-btn primary small" type="submit" disabled={busy}>Save amount</button><button className="cx-btn ghost small" type="button" disabled={busy} onClick={() => { setEditingPayment(null); setEditedCredits(''); setPaymentCreditReason('') }}>Cancel</button></div>
                            </form>
                            : <button className="cx-btn ghost small" onClick={() => { setEditingPayment(payment.reference); setEditedCredits(String(payment.credits)); setPaymentCreditReason('') }} disabled={busy}>Change credits</button>
                        )}
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
            <div className="cx-pills" aria-label="Filter support messages">{(['All', 'Needs reply', 'Answered', 'Resolved'] as SupportFilter[]).map((name) => <button key={name} className={supportFilter === name ? 'active' : ''} aria-pressed={supportFilter === name} onClick={() => setSupportFilter(name)}>{name}</button>)}</div>
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
            {log.length === 0 ? <p style={{ margin: 0, color: '#667a6d' }}>Nothing yet. Credits, password resets, manual Prep activations, and school changes will be listed here.</p> : (
              <ul className="cx-timeline">{log.map((entry, index) => <li key={index}><strong>{entry.details}</strong><small>{when(entry.at)}</small></li>)}</ul>
            )}
          </div>
        )}
        {tab === 'Prep Questions' && <PrepQuestionImport token={token} onMessage={setMessage} />}
        {tab === 'Prep Access' && (
          <div className="cx-prep-access">
            <section className="cx-card">
              <div className="section-heading">
                <div><h2>Registered Prep users</h2><p>Select a user to record a manual or cash payment.</p></div>
                <button className="cx-btn" type="button" onClick={loadPrepUsers} disabled={busy}>Refresh list</button>
              </div>
              <input className="cx-input" value={prepUserQuery} onChange={(event) => { setPrepUserQuery(event.target.value); setSelectedPrepUserId('') }} maxLength={100} placeholder="Filter by name or username" aria-label="Filter registered Prep users" />
              {prepUsersLoaded && filteredPrepUsers.length === 0 && <p>{prepUsers.length === 0 ? 'No Prep users have registered yet.' : 'No registered users match your filter.'}</p>}
              {!prepUsersLoaded && busy && <p>Loading registered Prep users...</p>}
              {filteredPrepUsers.length > 0 && <div className="cx-prep-user-list" aria-label="Registered Prep users">
                {filteredPrepUsers.map((user) => <article className={`cx-prep-user-row${selectedPrepUserId === user.id ? ' selected' : ''}`} key={user.id}>
                  <button type="button" className="cx-prep-user" aria-pressed={selectedPrepUserId === user.id} onClick={() => setSelectedPrepUserId(user.id)}>
                    <span><strong>{user.name}</strong><small>@{user.username}</small></span>
                    <span className="cx-prep-user-services"><strong>Services</strong><span className="cx-prep-user-access">{(['JAMB', 'WAEC', 'NECO'] as PrepExam[]).map((exam) => {
                      const expires = user.examAccess[exam] || user.accessUntil
                      const subscribed = Boolean(expires)
                      const active = Boolean(expires && Date.parse(expires) > Date.now())
                      const status = active ? 'active' : subscribed ? 'expired' : 'not-subscribed'
                      const detail = active && expires ? `Active until ${new Date(expires).toLocaleDateString()}` : subscribed ? 'Expired' : 'Not subscribed'
                      return <small key={exam} className={status}>{exam}: {detail}</small>
                    })}</span></span>
                  </button>
                  <button className="cx-btn danger small cx-prep-user-delete" type="button" onClick={() => deletePrepUser(user)} disabled={busy} aria-label={`Delete ${user.name}'s Prep account`}>Delete</button>
                </article>)}
              </div>}
            </section>
            {selectedPrepUserId && <form className="cx-card cx-prep-activation" onSubmit={activatePrepUser}>
              <h2>Record payment and activate access</h2>
              <p>Activation grants one calendar month for the selected exam. Renewing early adds a month to the current expiry.</p>
              <label className="cx-field">Prep exam
                <select className="cx-input" value={selectedPrepExam} onChange={(event) => setSelectedPrepExam(event.target.value as PrepExam)}>
                  {(['JAMB', 'WAEC', 'NECO'] as PrepExam[]).map((exam) => <option key={exam} value={exam}>{exam} · {money(overview?.prepMonthlyFeesNaira[exam] || 0)} / month</option>)}
                </select>
              </label>
              <label className="cx-field">Payment received by
                <select className="cx-input" value={prepPaymentMethod} onChange={(event) => setPrepPaymentMethod(event.target.value as typeof prepPaymentMethod)}>
                  <option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other manual payment</option>
                </select>
              </label>
              <label className="cx-field">Receipt or transfer reference (optional)<input className="cx-input" value={prepPaymentReference} onChange={(event) => setPrepPaymentReference(event.target.value)} maxLength={100} placeholder="Receipt number or transfer reference" /></label>
              <label className="cx-field">Payment note<input className="cx-input" value={prepPaymentNote} onChange={(event) => setPrepPaymentNote(event.target.value)} minLength={3} maxLength={200} required placeholder="Record who received it or other payment details" /></label>
              <button className="cx-btn primary" type="submit" disabled={busy || prepPaymentNote.trim().length < 3}>Record payment and activate one month</button>
              <small>Recorded in Creator Activity and Prep payment history as a manual payment; no Paystack charge is made.</small>
            </form>}
          </div>
        )}
        {tab === 'Prep Ambassadors' && (
          <div className="cx-prep-ambassadors">
            <section className="cx-card cx-prep-withdrawals">
              <div className="section-heading">
                <div><h2>Ambassador withdrawal requests</h2><p>Approving confirms the payout was sent and moves the requested balance into paid commission.</p></div>
                {pendingAmbassadorWithdrawalCount > 0 && <span className="cx-chip pending">{pendingAmbassadorWithdrawalCount} awaiting review</span>}
              </div>
              {ambassadorWithdrawals.length === 0 ? <p className="cx-prep-withdrawals-empty">No withdrawal requests have been submitted.</p> : (
                <div className="cx-prep-withdrawal-list">{ambassadorWithdrawals.map((withdrawal) => (
                  <article className="cx-prep-withdrawal-row" key={withdrawal.id}>
                    <div className="cx-prep-withdrawal-info">
                      <strong>{withdrawal.ambassadorName} <small>@{withdrawal.ambassadorUsername}</small></strong>
                      <span>{money(withdrawal.amountNaira)} · Commission months: {withdrawal.commissionMonths || '—'}</span>
                      <div className="cx-prep-withdrawal-payout"><small>Payout account: {withdrawal.bankName || 'Not provided'}</small><small>Account name: {withdrawal.accountName || '—'}</small><small>Account number: {withdrawal.accountNumber || '—'}</small></div>
                      <small>Requested {when(withdrawal.requestedAt)}{withdrawal.processedAt ? ` · Processed ${when(withdrawal.processedAt)}` : ''}</small>
                    </div>
                    <span className={`cx-chip ${withdrawal.status === 'approved' ? 'paid' : withdrawal.status === 'pending' ? 'pending' : 'abandoned'}`}>
                      {withdrawal.status === 'approved' ? 'Paid' : withdrawal.status === 'pending' ? 'Pending' : 'Rejected'}
                    </span>
                    {withdrawal.status === 'pending' && <div className="cx-prep-withdrawal-actions">
                      <button className="cx-btn primary small" type="button" disabled={busy} onClick={() => processPrepAmbassadorWithdrawal(withdrawal, 'approve')}>Approve payout</button>
                      <button className="cx-btn danger small" type="button" disabled={busy} onClick={() => processPrepAmbassadorWithdrawal(withdrawal, 'reject')}>Reject</button>
                    </div>}
                  </article>
                ))}</div>
              )}
            </section>
            <form className="cx-card cx-prep-ambassador-create" onSubmit={createPrepAmbassador}>
              <div className="section-heading">
                <div><h2>Create a Prep ambassador</h2><p>Each ambassador gets a sign-in and a unique Prep referral link.</p></div>
              </div>
              <div className="cx-prep-ambassador-fields">
                <label className="cx-field">Full name<input className="cx-input" value={ambassadorName} onChange={(event) => setAmbassadorName(event.target.value)} minLength={2} maxLength={100} required /></label>
                <label className="cx-field">Username<input className="cx-input" value={ambassadorUsername} onChange={(event) => setAmbassadorUsername(event.target.value)} minLength={3} maxLength={30} pattern="[a-zA-Z0-9._-]{3,30}" required /></label>
                <label className="cx-field">Temporary password<input className="cx-input" type="password" value={ambassadorPassword} onChange={(event) => setAmbassadorPassword(event.target.value)} minLength={8} maxLength={256} autoComplete="new-password" required /></label>
                <label className="cx-field">Custom referral code<input className="cx-input" value={ambassadorReferralCode} onChange={(event) => setAmbassadorReferralCode(event.target.value.toUpperCase())} minLength={3} maxLength={30} pattern="[a-zA-Z0-9_-]{3,30}" placeholder="e.g. ADA-PREP-2026" required /><small>Letters, numbers, hyphens, and underscores; used in the ambassador’s referral link.</small></label>
              </div>
              <strong className="cx-prep-ambassador-rate-title">Commission per successful payment (including renewals)</strong>
              <div className="cx-prep-ambassador-rates">
                {(['JAMB', 'WAEC', 'NECO'] as PrepExam[]).map((exam) => <label className="cx-field" key={exam}>{exam} commission (₦)<input className="cx-input" type="number" min="0" max="10000000" step="0.01" value={ambassadorRates[exam]} onChange={(event) => setAmbassadorRates((current) => ({ ...current, [exam]: event.target.value }))} required /></label>)}
              </div>
              <button className="cx-btn primary" type="submit" disabled={busy}>Create ambassador account</button>
            </form>
            <div className="cx-prep-ambassador-list">
              {ambassadors.length === 0 ? <div className="cx-card cx-empty">No Prep ambassadors yet. Create an account above to get started.</div> : ambassadors.map((ambassador) => (
                <article className="cx-card cx-prep-ambassador-card" key={ambassador.id}>
                  <div className="cx-prep-ambassador-heading">
                    <div><h2>{ambassador.name}</h2><span>@{ambassador.username}</span></div>
                    <div className="cx-prep-ambassador-stats"><strong>{ambassador.referrals}</strong><span>referrals</span><strong>{money(ambassador.unpaidNaira)}</strong><span>unpaid</span><strong>{money(ambassador.paidNaira)}</strong><span>paid</span></div>
                  </div>
                  <div className="cx-prep-ambassador-link"><span>Creator-set referral link</span><a href={`/prep?ref=${encodeURIComponent(ambassador.referralCode)}`} target="_blank" rel="noreferrer">{window.location.origin}/prep?ref={ambassador.referralCode}</a><small>Ambassador sign-in: {window.location.origin}/prep/ambassador</small></div>
                  {editingAmbassadorReferralCodeId === ambassador.id ? (
                    <form className="cx-prep-ambassador-code-form" onSubmit={(event) => updatePrepAmbassadorReferralCode(event, ambassador)}>
                      <label className="cx-field">Custom referral code<input className="cx-input" value={editingAmbassadorReferralCode} onChange={(event) => setEditingAmbassadorReferralCode(event.target.value.toUpperCase())} minLength={3} maxLength={30} pattern="[a-zA-Z0-9_-]{3,30}" required /><small>Existing links will remain valid and continue attributing referrals to this ambassador.</small></label>
                      <div className="cx-prep-ambassador-actions"><button className="cx-btn primary small" type="submit" disabled={busy}>Save referral link</button><button className="cx-btn small" type="button" onClick={() => setEditingAmbassadorReferralCodeId('')}>Cancel</button></div>
                    </form>
                  ) : <button className="cx-btn small" type="button" disabled={busy} onClick={() => { setEditingAmbassadorReferralCodeId(ambassador.id); setEditingAmbassadorReferralCode(ambassador.referralCode) }}>Edit referral link</button>}
                  {editingAmbassadorId === ambassador.id ? (
                    <form className="cx-prep-ambassador-rates" onSubmit={(event) => updatePrepAmbassadorRates(event, ambassador)}>
                      {(['JAMB', 'WAEC', 'NECO'] as PrepExam[]).map((exam) => <label className="cx-field" key={exam}>{exam} commission (₦)<input className="cx-input" type="number" min="0" max="10000000" step="0.01" value={editingAmbassadorRates[exam]} onChange={(event) => setEditingAmbassadorRates((current) => ({ ...current, [exam]: event.target.value }))} required /></label>)}
                      <div className="cx-prep-ambassador-actions"><button className="cx-btn primary small" type="submit" disabled={busy}>Save rates</button><button className="cx-btn small" type="button" onClick={() => setEditingAmbassadorId('')}>Cancel</button></div>
                    </form>
                  ) : (
                    <div className="cx-prep-ambassador-rate-summary">
                      {(['JAMB', 'WAEC', 'NECO'] as PrepExam[]).map((exam) => <span key={exam}><strong>{exam}</strong>{money(ambassador.commissionsNaira[exam])} / payment</span>)}
                      <button className="cx-btn small" type="button" onClick={() => { setEditingAmbassadorId(ambassador.id); setEditingAmbassadorRates({ JAMB: String(ambassador.commissionsNaira.JAMB), WAEC: String(ambassador.commissionsNaira.WAEC), NECO: String(ambassador.commissionsNaira.NECO) }) }}>Edit rates</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </main>

      {detail && (
        <div className="cx-drawer-wrap">
          <div className="cx-backdrop" onClick={() => setDetail(null)} />
          <aside className="cx-drawer" role="dialog" aria-label={`Manage ${detail.school.name}`}>
            <div className="cx-drawer-head">
              <div className="cx-avatar" style={{ background: colorFor(detail.school.id) }}>{initials(detail.school.name)}</div>
              <div><h2>{detail.school.name}</h2><p>School ID: {detail.school.slug} · {detail.school.email || 'no email'}</p></div>
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
              <h3>School link</h3>
              <p>Share the matching sign-in link with each school role.</p>
              {(['admin', 'teacher', 'student'] as const).map((role) => (
                <div className="cx-linkbox" key={role}><code>{linkOf(detail.school.slug, role)}</code><button className="cx-btn small" type="button" onClick={() => void copyText(linkOf(detail.school.slug, role), `${role[0].toUpperCase()}${role.slice(1)} link copied.`)}><Icon name="copy" size={15} />Copy {role}</button></div>
              ))}
              <form className="cx-inline" onSubmit={saveLink}>
                <input className="cx-input" value={linkDraft} onChange={(event) => setLinkDraft(event.target.value.toLowerCase())} placeholder="new link name, e.g. hisgrace" minLength={3} maxLength={30} required />
                <button className="cx-btn primary small" type="submit" disabled={busy || linkDraft === detail.school.slug}>Change link</button>
              </form>
              <small style={{ color: '#667a6d' }}>Small letters, numbers and dashes only. The old link keeps working, so nothing already shared breaks.</small>
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
                    ? <form className="cx-inline" onSubmit={resetPassword}><PasswordInput className="cx-input" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (6+ characters)" minLength={6} required /><button className="cx-btn primary small" type="submit" disabled={busy}>Save</button><button className="cx-btn ghost small" type="button" onClick={() => { setPasswordFor(''); setNewPassword('') }}>Cancel</button></form>
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

      {addOpen && (
        <div className="cx-drawer-wrap">
          <div className="cx-backdrop" onClick={() => setAddOpen(false)} />
          <aside className="cx-drawer" role="dialog" aria-label="Add a school">
            <div className="cx-drawer-head">
              <div className="cx-avatar" style={{ background: '#c99a2e' }}><Icon name="plus" size={20} /></div>
              <div><h2>Add a school</h2><p>Creates the school and its admin account in one go.</p></div>
              <button className="cx-btn ghost" onClick={() => setAddOpen(false)} aria-label="Close"><Icon name="close" size={20} /></button>
            </div>
            {created ? (
              <section className="cx-section">
                <div className="cx-balance"><div><span>School created</span><strong style={{ fontSize: '1.5rem' }}>{created.name}</strong></div><em>{created.credits} free<br />credits</em></div>
                <h3>Give these details to the school admin</h3>
                <pre className="cx-details">{detailsText(created)}</pre>
                <div className="cx-reply-actions">
                  <button className="cx-btn gold" type="button" onClick={() => void copyText(detailsText(created), 'Details copied. Paste them into WhatsApp or a message.')}><Icon name="copy" size={16} />Copy details</button>
                  <button className="cx-btn" type="button" onClick={openAdd}>Add another school</button>
                </div>
                <small style={{ color: '#667a6d' }}>The password is shown only now. After you close this panel, you can only set a new one for the admin.</small>
              </section>
            ) : (
              <form className="cx-section cx-form" onSubmit={submitNewSchool}>
                <label className="cx-field">School name<input className="cx-input" value={form.schoolName} onChange={(event) => setForm({ ...form, schoolName: event.target.value })} placeholder="e.g. His Grace Ikirun Osun Ltd" required /></label>
                <label className="cx-field">Link name (optional)<input className="cx-input" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase() })} placeholder={suggested || 'made from the school name'} maxLength={30} />
                  <span className="cx-school-link-preview">School sign-in links:
                    {(['admin', 'teacher', 'student'] as const).map((role) => <span key={role}><strong>{role[0].toUpperCase() + role.slice(1)}:</strong> {linkOf(form.slug || suggested || '...', role)}</span>)}
                  </span>
                </label>
                <div className="cx-two">
                  <label className="cx-field">Admin's full name<input className="cx-input" value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })} placeholder="e.g. Mr Adebayo" required /></label>
                  <label className="cx-field">Admin username<input className="cx-input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="e.g. adebayo" autoComplete="off" required /></label>
                </div>
                <label className="cx-field">Admin password<div className="cx-inline"><input className="cx-input" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 6 characters" minLength={6} autoComplete="off" required /><button className="cx-btn small" type="button" onClick={makePassword}>Generate</button></div></label>
                <div className="cx-two">
                  <label className="cx-field">School email (optional)<input className="cx-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="for payment receipts" /></label>
                  <label className="cx-field">Free starter credits<input className="cx-input" type="number" min={0} max={1000} value={form.starter} onChange={(event) => setForm({ ...form, starter: event.target.value })} /></label>
                </div>
                <button className="cx-btn gold" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create school'}</button>
              </form>
            )}
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
