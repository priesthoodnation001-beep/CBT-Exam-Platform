import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'
import Approvals from './Approvals'
import AdminRegistration from './AdminRegistration'
import AccountsPanel from './AccountsPanel'
import ExamSchedule from './ExamSchedule'
import PublicHome from './PublicHome'
import SubjectQuestionWizard from './SubjectQuestionWizard'
import TimedExamRunner from './TimedExamRunner'
import { API_BASE } from './apiBase'
import './App.css'
import './mobile.css'

type Role = 'Admin' | 'Teacher' | 'Student'
type EntryPage = 'home' | 'login' | 'register'
type Tab = 'Overview' | 'Accounts' | 'Schedule' | 'Approvals' | 'Questions' | 'My exams' | 'Results' | 'Billing' | 'Profile'
type Account = { id: string; role: Role; name: string; username?: string; studentId?: string; classSection?: string; schoolName?: string; schoolSlug?: string }
type Exam = { id: string; title: string; classSection?: string; subject: string; date: string; time: string; duration: number; questions: number; status: 'Scheduled' | 'Draft' | 'Published'; subject_duration: number; subject_approved: number; taken?: number }
type Question = { id: string; examId?: string; subject: string; text: string; options: string[]; answer?: number }
type Result = { id: string; exam_title: string; student_name: string; student_id: string; score: number; total: number; submitted_at: string }
type SubjectSetting = { subject: string; duration: number; approved: number; approved_at?: string }
type Data = { users: Account[]; exams: Exam[]; questions: Question[]; results: Result[]; subjects: SubjectSetting[]; credits?: number; examsOpen?: boolean; aiReady?: boolean; aiRemaining?: number; offline?: boolean }
type School = { name: string; slug: string }

const emptyData: Data = { users: [], exams: [], questions: [], results: [], subjects: [] }
const TOKEN_KEY = 'timpriest-token'

function readToken(): string | null {
  try { return window.localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function saveToken(value: string | null) {
  try {
    if (value) window.localStorage.setItem(TOKEN_KEY, value)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage not available */ }
}

function readSchoolSlug(): string {
  const first = window.location.pathname.split('/').filter(Boolean)[0] || ''
  if (!first || first === 'api' || first === 'assets') return ''
  try { return decodeURIComponent(first).toLowerCase() } catch { return '' }
}

function showSchoolAddress(slug?: string) {
  if (!slug || Capacitor.isNativePlatform()) return
  const target = `/${encodeURIComponent(slug)}`
  if (window.location.pathname !== target) window.history.replaceState(null, '', target)
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

async function api<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new Event('timpriest-expired'))
    const error = await response.json().catch(() => ({ error: 'Request failed.' }))
    throw new Error(error.error || 'Request failed.')
  }
  return response.status === 204 ? undefined as T : response.json()
}

function App() {
  const [schoolSlug] = useState(readSchoolSlug)
  const [school, setSchool] = useState<School | null>(null)
  const [schoolError, setSchoolError] = useState('')
  const [entryPage, setEntryPage] = useState<EntryPage>(schoolSlug ? 'login' : 'home')
  const [session, setSession] = useState<Account | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(() => Boolean(readToken()))
  const [data, setData] = useState<Data>(emptyData)
  const [loginRole, setLoginRole] = useState<Role>('Admin')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<Tab>(() => new URLSearchParams(window.location.search).has('reference') ? 'Billing' : 'Overview')
  const [notice, setNotice] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showExamForm, setShowExamForm] = useState(false)
  const [activeExam, setActiveExam] = useState<Exam | null>(null)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricSaved, setBiometricSaved] = useState(false)
  const [enableBiometric, setEnableBiometric] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  const biometricServer = `timpriest-edu-${loginRole.toLowerCase()}`

  useEffect(() => {
    if (!schoolSlug) return
    api<School>(`/schools/${encodeURIComponent(schoolSlug)}`, null)
      .then(setSchool)
      .catch(() => setSchoolError('This school link was not found. Check the address and try again.'))
  }, [schoolSlug])

  useEffect(() => {
    const stored = readToken()
    if (!stored) return
    let active = true
    void (async () => {
      try {
        const result = await api<{ user: Account }>('/me', stored)
        const loaded = await api<Data>('/data', stored)
        if (!active) return
        setToken(stored); setSession(result.user); setData(loaded)
        showSchoolAddress(result.user.schoolSlug)
      } catch { saveToken(null) } finally { if (active) setRestoring(false) }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const expire = () => { saveToken(null); setToken(null); setSession(null); setData(emptyData); setActiveExam(null) }
    window.addEventListener('timpriest-expired', expire)
    return () => window.removeEventListener('timpriest-expired', expire)
  }, [])

  useEffect(() => {
    if (!session?.schoolSlug || Capacitor.isNativePlatform()) return
    const target = `/${session.schoolSlug}`
    if (window.location.pathname !== target) window.history.replaceState(null, '', target)
  }, [session])

  useEffect(() => {
    let active = true
    async function checkBiometric() {
      if (!Capacitor.isNativePlatform()) { setBiometricAvailable(false); setBiometricSaved(false); return }
      try {
        const availability = await NativeBiometric.isAvailable({ useFallback: false })
        const saved = await NativeBiometric.isCredentialsSaved({ server: biometricServer })
        if (active) { setBiometricAvailable(availability.isAvailable); setBiometricSaved(availability.isAvailable && saved.isSaved) }
      } catch { if (active) { setBiometricAvailable(false); setBiometricSaved(false) } }
    }
    void checkBiometric()
    return () => { active = false }
  }, [biometricServer])

  const refresh = async (activeToken = token) => { if (!activeToken) return; setData(await api<Data>('/data', activeToken)) }
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3000) }
  const beginExam = (exam: Exam) => {
    if (data.examsOpen === false) { showNotice('Exams are unavailable because this school has run out of credits. Please tell your school admin.'); return }
    setActiveExam(exam)
  }

  function startSession(result: { token: string; user: Account }) {
    saveToken(result.token)
    setToken(result.token); setSession(result.user); setTab('Overview'); setMenuOpen(false)
    showSchoolAddress(result.user.schoolSlug)
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setLoginError('')
    const values = new FormData(event.currentTarget)
    try {
      const identifier = String(values.get('identifier')).trim()
      const password = String(values.get('password') || '')
      const result = await api<{ token: string; user: Account }>('/login', null, { method: 'POST', body: JSON.stringify({ role: loginRole, identifier, password, schoolSlug }) })
      if (enableBiometric && biometricAvailable) {
        try {
          await NativeBiometric.verifyIdentity({ title: 'Enable fingerprint sign-in', reason: 'Confirm your identity to enable fingerprint sign-in.' })
          await NativeBiometric.setCredentials({ username: identifier, password: password || 'student-id-login', server: biometricServer })
          setBiometricSaved(true)
        } catch { showNotice('Sign-in succeeded, but fingerprint setup was cancelled or failed.') }
      }
      startSession(result)
      await refresh(result.token)
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'Unable to sign in.') } finally { setLoading(false) }
  }

  async function loginWithBiometric() {
    setBiometricLoading(true); setLoginError('')
    try {
      await NativeBiometric.verifyIdentity({ title: 'Sign in to TIMPRIEST EDU', reason: 'Verify your fingerprint to continue.' })
      const credentials = await NativeBiometric.getCredentials({ server: biometricServer })
      const result = await api<{ token: string; user: Account }>('/login', null, { method: 'POST', body: JSON.stringify({ role: loginRole, identifier: credentials.username, password: credentials.password, schoolSlug }) })
      startSession(result)
      await refresh(result.token)
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'Fingerprint sign-in failed. Use your regular sign-in details.') } finally { setBiometricLoading(false) }
  }

  function logout() {
    const slug = session?.schoolSlug
    const goToSchool = () => { if (slug && !Capacitor.isNativePlatform()) window.location.assign(`/${slug}`) }
    if (token) void api('/logout', token, { method: 'POST' }).catch(() => undefined).finally(goToSchool)
    else goToSchool()
    saveToken(null)
    setToken(null); setSession(null); setActiveExam(null); setSubmitted(false); setData(emptyData); setMenuOpen(false); setEntryPage('login')
    if (!Capacitor.isNativePlatform() && session?.schoolSlug) window.location.assign(`/${session.schoolSlug}`)
  }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const role = String(values.get('role')) as Role
    try { await api('/users', token, { method: 'POST', body: JSON.stringify({ role, name: String(values.get('name')).trim(), username: String(values.get('username') || '').trim(), password: String(values.get('password') || ''), studentId: String(values.get('studentId') || '').trim().toUpperCase(), classSection: String(values.get('classSection') || '').trim() }) }); setShowAccountForm(false); await refresh(); showNotice(`${role} account created.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not create account.') }
  }

  async function deleteAccount(account: Account) { if (!window.confirm(`Delete ${account.name}'s ${account.role.toLowerCase()} account?`)) return; try { await api(`/users/${account.id}`, token, { method: 'DELETE' }); await refresh(); showNotice(`${account.name}'s account was deleted.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not delete account.') } }

  async function addExam(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = new FormData(event.currentTarget); try { await api('/exams', token, { method: 'POST', body: JSON.stringify({ title: values.get('title'), subject: values.get('subject'), date: values.get('date'), time: values.get('time'), duration: values.get('duration'), questions: values.get('questions'), classSection: values.get('classSection') || '' }) }); setShowExamForm(false); await refresh(); showNotice('Exam schedule published.') } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not schedule exam.') } }

  async function deleteExam(exam: Exam) { if (!window.confirm(`Delete the ${exam.status.toLowerCase()} exam "${exam.title}"?`)) return; try { await api(`/exams/${exam.id}`, token, { method: 'DELETE' }); await refresh(); showNotice(`${exam.title} was deleted.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not delete exam.') } }

  async function approveSubject(subject: string) { try { await api(`/subjects/${encodeURIComponent(subject)}/approve`, token, { method: 'POST' }); await refresh(); showNotice(`${subject} questions approved for students.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not approve subject.') } }

  async function deleteSubject(subject: string) { if (!window.confirm(`Delete all questions for ${subject}? This cannot be undone.`)) return; try { await api(`/subjects/${encodeURIComponent(subject)}`, token, { method: 'DELETE' }); await refresh(); showNotice(`${subject} question set was deleted.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not delete question set.') } }

  async function submitExam(answers: Record<string, number>) {
    if (!activeExam) return
    try {
      await api('/submissions', token, { method: 'POST', body: JSON.stringify({ examId: activeExam.id, answers }) })
      setSubmitted(true); showNotice('Exam submitted successfully.')
      if (session?.role === 'Student') window.setTimeout(() => logout(), 4000)
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not submit exam.') }
  }

  function confirmSubmit() {
    if (window.confirm('Submit your exam now? You cannot take it again after you submit.')) void submitExam(selectedAnswers)
  }

  function renderLogin() {
    return (
      <div className="login-page">
        <div className="login-art">
          <div className="brand light"><span className="brand-mark">T</span><span>TIMPRIEST EDU</span></div>
          <div className="art-copy">
            <p className="eyebrow">Examination platform</p>
            <h1>Every learner.<br /><em>One fair chance.</em></h1>
            <p>Secure, simple computer-based testing for modern schools and training centres.</p>
          </div>
          <div className="art-footer"><span className="status-dot" /> Secure · Separate data for every school</div>
        </div>
        <div className="login-panel">
          <div className="login-box">
            <p className="eyebrow">{school ? school.name : 'Welcome back'}</p>
            <h2>Sign in to your portal</h2>
            {schoolError ? <p className="form-error">{schoolError}</p> : <>
              <p className="login-subtitle">Choose your access type to continue.</p>
              <div className="role-tabs">
                {(['Admin', 'Teacher', 'Student'] as Role[]).map((role) => <button type="button" className={loginRole === role ? 'selected' : ''} key={role} onClick={() => { setLoginRole(role); setLoginError('') }}>{role}</button>)}
              </div>
              <form onSubmit={login}>
                <label>{loginRole === 'Student' ? 'Student ID' : 'Username'}<input name="identifier" placeholder={loginRole === 'Student' ? 'e.g. STUDENT-001' : `Enter ${loginRole.toLowerCase()} username`} autoComplete="username" required /></label>
                {loginRole !== 'Student' && <label>Password<input name="password" type="password" placeholder="Enter password" autoComplete="current-password" required /></label>}
                {loginRole === 'Student' && !schoolSlug && <p className="login-hint">Students: open your school's own sign-in link to continue.</p>}
                {biometricAvailable && !biometricSaved && <label className="biometric-opt-in"><input type="checkbox" checked={enableBiometric} onChange={(event) => setEnableBiometric(event.target.checked)} />Enable fingerprint sign-in on this device</label>}
                {loginError && <p className="form-error">{loginError}</p>}
                <button className="primary-button full" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Continue'} <span>→</span></button>
              </form>
              {biometricAvailable && biometricSaved && <button className="biometric-button" type="button" onClick={loginWithBiometric} disabled={biometricLoading}><span aria-hidden="true">◉</span>{biometricLoading ? 'Waiting for fingerprint...' : 'Sign in with fingerprint'}</button>}
            </>}
          </div>
          <p className="copyright">TIMPRIEST EDU · CBT Suite</p>
        </div>
      </div>
    )
  }

  if (restoring) return <div className="login-page"><div className="login-panel"><div className="login-box"><p className="login-subtitle">Loading...</p></div></div></div>
  if (!session && entryPage === 'home') return <PublicHome onSignIn={() => setEntryPage('login')} onRegister={() => setEntryPage('register')} />
  if (!session && entryPage === 'register') return <AdminRegistration onBack={() => setEntryPage('home')} onComplete={(slug) => { if (Capacitor.isNativePlatform()) setEntryPage('login'); else window.location.assign(`/${slug}`) }} />
  if (!session) return renderLogin()

  const isAdmin = session.role === 'Admin'
  const isTeacher = session.role === 'Teacher'
  const isStudent = session.role === 'Student'
  const centre = session.schoolName || 'Your school'
  const firstName = session.name.split(' ')[0]
  const navItems: Tab[] = isAdmin ? ['Overview', 'Accounts', 'Schedule', 'Approvals', 'Results', 'Billing', 'Profile'] : isTeacher ? ['Overview', 'Questions', 'My exams', 'Profile'] : ['Overview', 'My exams']
  const examQuestions = activeExam ? data.questions.filter((question) => question.examId === activeExam.id || (!question.examId && question.subject === activeExam.subject)) : []
  const navIcon = (item: Tab) => item === 'Overview' ? '◈' : item === 'Accounts' ? '♙' : item === 'Schedule' || item === 'My exams' ? '▣' : item === 'Questions' ? '✦' : item === 'Profile' ? '☺' : item === 'Billing' ? '₦' : '▥'

  return (
    <div className={menuOpen ? 'app-shell menu-open' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">T</span><span>TIMPRIEST EDU</span></div>
        <div className="centre-switcher"><span className="status-dot" /><span><strong>{centre}</strong><small>{session.role} portal</small></span></div>
        <p className="nav-label">{session.role} portal</p>
        <nav>
          {navItems.map((item) => <button className={tab === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => { setTab(item); setMenuOpen(false) }}><span className="nav-icon">{navIcon(item)}</span>{item}</button>)}
        </nav>
        <div className="sidebar-bottom">
          {!isStudent && <button className="nav-item" onClick={logout}><span className="nav-icon">↪</span>Sign out</button>}
          <div className="user-chip"><span className="avatar">{session.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><span><strong>{session.name}</strong><small>{session.role}</small></span></div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="menu-button" type="button" aria-label="Open or close the menu" onClick={() => setMenuOpen((open) => !open)}>☰</button>
          <div className="breadcrumb">{tab} <span>/</span> {session.role}</div>
          <div className="top-actions"><span className="online-label"><span className="status-dot" /> Connected</span></div>
        </header>
        <section className={tab === 'Results' ? 'content-wrap results-print-scope' : 'content-wrap'}>
          {notice && <div className="toast">✓ {notice}</div>}
          {activeExam
            ? <TimedExamRunner exam={activeExam} questions={examQuestions} selectedAnswers={selectedAnswers} setSelectedAnswers={setSelectedAnswers} submitted={submitted} submit={confirmSubmit} exit={() => { setActiveExam(null); setSubmitted(false); setSelectedAnswers({}) }} />
            : <>
              <div className="intro">
                <div>
                  <p className="eyebrow">{isAdmin ? 'Administrator console' : isTeacher ? 'Teacher workspace' : 'Student portal'}</p>
                  <h1>{isAdmin ? `${greeting()}, ${firstName}.` : `Welcome back, ${firstName}.`}</h1>
                  <p className="intro-copy">{isAdmin ? 'Manage your people, exams, schedules, and published results.' : isTeacher ? 'Prepare subject questions one step at a time.' : 'Your exam schedule is ready when you are.'}</p>
                </div>
                {isAdmin && <button className="primary-button" onClick={() => { setTab('Schedule'); setShowExamForm(true) }}>+ Create exam</button>}
                {isTeacher && <button className="primary-button" onClick={() => setTab('Questions')}>+ Set questions</button>}
                {isStudent && <button className="primary-button" onClick={() => { const next = data.exams.find((exam) => exam.status === 'Scheduled' && !exam.taken); setTab('My exams'); if (next) beginExam(next); else showNotice('No exam is available to start right now.') }}>Enter exam →</button>}
              </div>
              {tab === 'Overview' && <Overview session={session} data={data} centre={centre} setTab={setTab} setActiveExam={beginExam} />}
              {tab === 'Accounts' && isAdmin && <AccountsPanel accounts={data.users} token={token} showForm={showAccountForm} setShowForm={setShowAccountForm} addAccount={addAccount} deleteAccount={deleteAccount} refresh={refresh} showNotice={showNotice} />}
              {tab === 'Schedule' && isAdmin && <ExamSchedule exams={data.exams} classes={Array.from(new Set(data.users.filter((account) => account.role === 'Student' && account.classSection).map((account) => account.classSection as string)))} showForm={showExamForm} setShowForm={setShowExamForm} addExam={addExam} deleteExam={deleteExam} />}
              {tab === 'Questions' && isTeacher && <SubjectQuestionWizard questions={data.questions} exams={data.exams} token={token} refresh={refresh} showNotice={showNotice} aiReady={data.aiReady} aiRemaining={data.aiRemaining} />}
              {tab === 'My exams' && <ExamList exams={data.exams} student={isStudent} centre={centre} start={(exam) => { beginExam(exam); setSelectedAnswers({}); setSubmitted(false) }} />}
              {tab === 'Approvals' && isAdmin && <Approvals subjects={data.subjects} approve={approveSubject} deleteSubject={deleteSubject} />}
              {tab === 'Results' && isAdmin && <Results results={data.results} />}
              {tab === 'Billing' && isAdmin && (data.offline ? <OfflineBilling token={token} showNotice={showNotice} refresh={refresh} /> : <Billing token={token} showNotice={showNotice} refresh={refresh} />)}
              {tab === 'Profile' && !isStudent && <Profile session={session} token={token} showNotice={showNotice} />}
            </>}
        </section>
      </main>
      <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />
    </div>
  )
}

function Profile({ session, token, showNotice }: { session: Account; token: string | null; showNotice: (message: string) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const currentPassword = String(values.get('currentPassword') || '')
    const newPassword = String(values.get('newPassword') || '')
    if (newPassword !== String(values.get('confirmPassword') || '')) { setError('The new passwords do not match.'); return }
    setBusy(true); setError('')
    try {
      await api('/change-password', token, { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })
      form.reset()
      showNotice('Password changed.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not change the password.') } finally { setBusy(false) }
  }

  return (
    <>
      <div className="section-heading"><div><p className="eyebrow">Your account</p><h2>Profile</h2></div></div>
      <div className="profile-panel">
        <div className="profile-details">
          <strong>{session.name}</strong>
          <span>{session.role} · {session.username}</span>
          <span>{session.schoolName}</span>
        </div>
        <h3>Change password</h3>
        <p>Use at least 6 characters.</p>
        <form className="profile-form" onSubmit={submit}>
          <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label>New password<input name="newPassword" type="password" minLength={6} autoComplete="new-password" required /></label>
          <label>Confirm new password<input name="confirmPassword" type="password" minLength={6} autoComplete="new-password" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
        </form>
      </div>
    </>
  )
}

type BillingInfo = { credits: number; pricePerCredit: number; minCredits: number; maxCredits: number; paymentsReady: boolean; hasEmail: boolean; ledger: { change: number; reason: string; created_at: string }[] }

function Billing({ token, showNotice, refresh }: { token: string | null; showNotice: (message: string) => void; refresh: () => Promise<void> | void }) {
  const [info, setInfo] = useState<BillingInfo | null>(null)
  const [credits, setCredits] = useState(100)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try { setInfo(await api<BillingInfo>('/billing', token)) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load billing.') }
  }

  useEffect(() => {
    void (async () => {
      const reference = new URLSearchParams(window.location.search).get('reference')
      if (reference) {
        try {
          const result = await api<{ status: string }>(`/billing/verify/${encodeURIComponent(reference)}`, token)
          showNotice(result.status === 'success' ? 'Payment received. Your credits have been added.' : 'Payment not confirmed yet. Tap Refresh in a moment.')
        } catch { showNotice('Could not confirm the payment yet. Tap Refresh in a moment.') }
        window.history.replaceState(null, '', window.location.pathname)
        await refresh()
      }
      await load()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function buy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const result = await api<{ authorizationUrl: string }>('/billing/checkout', token, { method: 'POST', body: JSON.stringify({ credits, ...(email ? { email } : {}) }) })
      if (Capacitor.isNativePlatform()) { window.open(result.authorizationUrl, '_blank'); setBusy(false) } else window.location.href = result.authorizationUrl
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not start the payment.'); setBusy(false) }
  }

  async function reload() { await refresh(); await load(); showNotice('Balance updated.') }

  if (!info) return <p>{error || 'Loading billing...'}</p>
  const total = credits * info.pricePerCredit
  return (
    <>
      <div className="section-heading"><div><p className="eyebrow">Your school</p><h2>Billing</h2></div><button className="text-button" onClick={() => void reload()}>Refresh</button></div>
      <div className="profile-panel">
        <div className="profile-details">
          <strong>{info.credits} credits left</strong>
          <span>One credit is used each time a student submits an exam.</span>
          <span>₦{info.pricePerCredit.toLocaleString()} per credit</span>
        </div>
        <h3>Buy credits</h3>
        <p>Buy {info.minCredits} to {info.maxCredits.toLocaleString()} credits. Payment is handled securely by Paystack.</p>
        <form className="profile-form" onSubmit={buy}>
          <label>Number of credits<input type="number" min={info.minCredits} max={info.maxCredits} value={credits} onChange={(event) => setCredits(Number(event.target.value))} required /></label>
          {!info.hasEmail && <label>School email (for receipts)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}
          <p><strong>Total: ₦{total.toLocaleString()}</strong></p>
          {!info.paymentsReady && <p className="form-error">Payments are not switched on yet.</p>}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy || !info.paymentsReady}>{busy ? 'Opening Paystack...' : 'Pay with Paystack'}</button>
        </form>
        {info.ledger.length > 0 && <>
          <h3>Credit history</h3>
          {info.ledger.map((entry, index) => <p key={index}>{entry.change > 0 ? '+' : ''}{entry.change} · {entry.reason} · {new Date(entry.created_at).toLocaleDateString()}</p>)}
        </>}
      </div>
    </>
  )
}

type OfflineInfo = { credits: number; pricePerCredit: number; minCredits: number; maxCredits: number; linked: boolean; onlineSlug: string; lastSync: string; pending: { reference: string; credits: number }[]; ledger: { change: number; reason: string; created_at: string }[] }

function OfflineBilling({ token, showNotice, refresh }: { token: string | null; showNotice: (message: string) => void; refresh: () => Promise<void> | void }) {
  const [info, setInfo] = useState<OfflineInfo | null>(null)
  const [credits, setCredits] = useState(100)
  const [slug, setSlug] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try { setInfo(await api<OfflineInfo>('/offline/status', token)) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load billing.') }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 20000) // pick up credits that arrive in the background
    return () => window.clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function post<T>(path: string, body: object): Promise<T> {
    return api<T>(path, token, { method: 'POST', body: JSON.stringify(body) })
  }

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Something went wrong.'); await load() } finally { setBusy(false) }
  }

  const link = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void run(async () => { await post('/offline/link', { slug, username, password }); setPassword(''); await load(); showNotice('Online account linked.') }) }
  const buy = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void run(async () => { const result = await post<{ authorizationUrl: string }>('/offline/checkout', { credits }); window.open(result.authorizationUrl, '_blank'); await load(); showNotice('Finish the payment in your browser, then come back and tap "I have paid".') }) }
  const redeem = () => void run(async () => { const result = await post<{ added: number; waiting: number }>('/offline/redeem', {}); await refresh(); await load(); showNotice(result.added > 0 ? `${result.added} credits added.` : result.waiting > 0 ? 'Payment not confirmed yet. Wait a moment and try again.' : 'No payments are waiting.') })
  const claim = () => void run(async () => { const result = await post<{ added: number }>('/offline/claim', {}); await refresh(); await load(); showNotice(result.added > 0 ? `${result.added} credits added from the website.` : 'No new credits on the website.') })
  const syncNow = () => void run(async () => { const result = await post<{ sent: number; received: number; conflicts: number; creditsAdded?: number }>('/offline/sync', {}); await refresh(); await load(); showNotice(`Sync finished. Sent ${result.sent}, received ${result.received}.${result.creditsAdded ? ` ${result.creditsAdded} credits added.` : ''}${result.conflicts ? ` ${result.conflicts} duplicate account(s) were skipped.` : ''}`) })
  const unlink = () => void run(async () => { await post('/offline/unlink', {}); await load() })

  if (!info) return <p>{error || 'Loading billing...'}</p>
  const total = credits * info.pricePerCredit
  return (
    <>
      <div className="section-heading"><div><p className="eyebrow">This school computer</p><h2>Billing</h2></div></div>
      <div className="profile-panel">
        <div className="profile-details">
          <strong>{info.credits} credits left</strong>
          <span>One credit is used each time a student submits an exam. Exams stop at 0 credits.</span>
          <span>₦{info.pricePerCredit.toLocaleString()} per credit</span>
        </div>
        {error && <p className="form-error">{error}</p>}
        {!info.linked ? (
          <>
            <h3>Link your online account</h3>
            <p>Buying credits needs internet once. Sign in with the school admin account you registered on the online website. Exams keep working offline.</p>
            <form className="profile-form" onSubmit={link}>
              <label>Online school link name<input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="e.g. northbridge-school" required /></label>
              <label>Online admin username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" required /></label>
              <label>Online admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" required /></label>
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Linking...' : 'Link online account'}</button>
            </form>
          </>
        ) : (
          <>
            <h3>Sync with the website</h3>
            <p>Linked to <strong>{info.onlineSlug}</strong>. Syncing brings accounts, questions, exams and approvals from the website to this computer, and sends yours back, including exam results. It needs internet while it runs. {info.lastSync ? `Last synced ${new Date(info.lastSync).toLocaleString()}.` : 'Not synced yet.'}</p>
            <button className="primary-button" type="button" onClick={syncNow} disabled={busy}>{busy ? 'Please wait...' : 'Sync now'}</button>
            <h3>Credits bought on the website</h3>
            <p>Credits you buy on the website are added to this computer automatically, about every 5 minutes while it has internet. You can also check right now.</p>
            <button className="primary-button" type="button" onClick={claim} disabled={busy}>{busy ? 'Please wait...' : 'Check for new credits'}</button>
            <h3>Buy credits</h3>
            <p> This computer must be connected to the internet while you pay. Buy {info.minCredits} to {info.maxCredits.toLocaleString()} credits.</p>
            <form className="profile-form" onSubmit={buy}>
              <label>Number of credits<input type="number" min={info.minCredits} max={info.maxCredits} value={credits} onChange={(event) => setCredits(Number(event.target.value))} required /></label>
              <p><strong>Total: ₦{total.toLocaleString()}</strong></p>
              <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Pay with Paystack'}</button>
            </form>
            {info.pending.length > 0 && (
              <>
                <p>{info.pending.length} payment{info.pending.length > 1 ? 's are' : ' is'} waiting to be added ({info.pending.reduce((sum, item) => sum + item.credits, 0)} credits).</p>
                <button className="primary-button" type="button" onClick={redeem} disabled={busy}>I have paid, add my credits</button>
              </>
            )}
            <p><button className="text-button" type="button" onClick={unlink} disabled={busy}>Unlink online account</button></p>
          </>
        )}
        {info.ledger.length > 0 && <>
          <h3>Credit history</h3>
          {info.ledger.map((entry, index) => <p key={index}>{entry.change > 0 ? '+' : ''}{entry.change} · {entry.reason} · {new Date(entry.created_at).toLocaleDateString()}</p>)}
        </>}
      </div>
    </>
  )
}

function Overview({ session, data, centre, setTab, setActiveExam }: { session: Account; data: Data; centre: string; setTab: (tab: Tab) => void; setActiveExam: (exam: Exam) => void }) {
  const pad = (count: number) => String(count).padStart(2, '0')
  const open = data.exams.filter((exam) => exam.status === 'Scheduled' && !exam.taken)
  const stats = session.role === 'Admin'
    ? [[pad(data.exams.length), 'Scheduled exams', 'Your school'], [pad(data.users.filter((item) => item.role === 'Student').length), 'Students', 'Active accounts'], [pad(data.users.filter((item) => item.role === 'Teacher').length), 'Teachers', 'Active accounts']]
    : session.role === 'Teacher'
      ? [[pad(data.exams.length), 'Assessments', 'School schedule'], [pad(data.questions.length), 'Questions saved', 'Question bank'], [pad(data.subjects.length), 'Subjects', 'Your school']]
      : [[pad(open.length), 'Upcoming exams', 'Ready to take'], [pad(data.exams.filter((exam) => exam.taken).length), 'Submitted', 'Completed exams'], ['--', 'Results', 'Managed by Admin']]
  return (
    <>
      <div className="stats-grid">{stats.map(([value, label, note]) => <article className="stat-card" key={label}><span className="stat-value">{value}</span><span className="stat-label">{label}</span><span className="stat-note">{note}</span></article>)}</div>
      <div className="section-heading"><div><p className="eyebrow">At a glance</p><h2>{session.role === 'Admin' ? 'School activity' : 'Upcoming sessions'}</h2></div><button className="text-button" onClick={() => setTab(session.role === 'Admin' ? 'Schedule' : 'My exams')}>View details <span>→</span></button></div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><h3>Exam schedule</h3><p>Published sessions for your school.</p></div></div>
          {data.exams.map((exam) => <div className="session" key={exam.id}>
            <div className="date-block"><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong><span>{new Date(`${exam.date}T00:00:00`).toLocaleString('en', { month: 'short' }).toUpperCase()}</span></div>
            <div className="session-info"><div className="session-title">{exam.title} <span className={`tag ${exam.status === 'Scheduled' ? 'live' : 'draft'}`}>{exam.taken && session.role === 'Student' ? 'Submitted' : exam.status}</span></div><p>{exam.time} · {exam.duration} minutes · {exam.questions} questions</p><small>{exam.subject} · {centre}</small></div>
            {session.role === 'Student' && exam.status === 'Scheduled' && !exam.taken && <button className="start-link" onClick={() => setActiveExam(exam)}>Start →</button>}
          </div>)}
        </section>
        <section className="panel">
          <div className="panel-header"><div><h3>Quick actions</h3><p>Common tasks for your portal.</p></div></div>
          <div className="quick-actions">
            {session.role === 'Admin' && <><button onClick={() => setTab('Accounts')}>♙ <span>Manage accounts<small>Create or delete teachers and students</small></span>→</button><button onClick={() => setTab('Results')}>▥ <span>View exam results<small>Print result sheets as PDF</small></span>→</button></>}
            {session.role === 'Teacher' && <button onClick={() => setTab('Questions')}>✦ <span>Set subject questions<small>Use Next, Previous, and Submit</small></span>→</button>}
            {session.role === 'Student' && <button onClick={() => { if (open[0]) setActiveExam(open[0]) }}>▣ <span>Start next exam<small>Results are handled by the Admin</small></span>→</button>}
          </div>
        </section>
      </div>
    </>
  )
}

function ExamList({ exams, student, centre, start }: { exams: Exam[]; student: boolean; centre: string; start: (exam: Exam) => void }) {
  return (
    <>
      <div className="section-heading"><div><p className="eyebrow">Examination schedule</p><h2>{student ? 'Your exams' : 'Assigned examinations'}</h2></div></div>
      <div className="exam-cards">
        {exams.map((exam) => <article className="exam-card" key={exam.id}>
          <div className="exam-card-date"><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong><span>{new Date(`${exam.date}T00:00:00`).toLocaleString('en', { month: 'short' }).toUpperCase()}</span></div>
          <div><h3>{exam.title}</h3><p>{exam.subject} · {exam.time} · {exam.duration} minutes</p><small>{exam.questions} questions · {centre}</small></div>
          {student && exam.taken ? <span className="tag draft">Submitted</span> : student && exam.status === 'Scheduled' && <button className="primary-button small-button" onClick={() => start(exam)}>Start exam</button>}
        </article>)}
      </div>
    </>
  )
}

function Results({ results }: { results: Result[] }) {
  return (
    <>
      <div className="section-heading"><div><p className="eyebrow">Administrator reports</p><h2>Exam results</h2></div><button className="primary-button" onClick={() => window.print()}>Print / Save PDF</button></div>
      <div className="table-panel results-table">
        <div className="table-head"><span>Student</span><span>Exam</span><span>Score</span><span>Submitted</span></div>
        {results.length
          ? results.map((result) => <div className="table-row" key={result.id}><strong>{result.student_name}<small>{result.student_id}</small></strong><span>{result.exam_title}</span><span className="score-text">{result.score} / {result.total}</span><span>{new Date(result.submitted_at).toLocaleString()}</span></div>)
          : <div className="result-empty"><span>▥</span><h3>No submitted results yet</h3><p>Student submissions will appear here for review and printing.</p></div>}
      </div>
    </>
  )
}

export default App
