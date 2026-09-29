import { useState } from 'react'
import type { FormEvent } from 'react'
import Approvals from './Approvals'
import AdminRegistration from './AdminRegistration'
import AccountsPanel from './AccountsPanel'
import ExamSchedule from './ExamSchedule'
import PublicHome from './PublicHome'
import SubjectQuestionWizard from './SubjectQuestionWizard'
import TimedExamRunner from './TimedExamRunner'
import './App.css'

type Role = 'Admin' | 'Teacher' | 'Student'
type EntryPage = 'home' | 'login' | 'register'
type Tab = 'Overview' | 'Accounts' | 'Schedule' | 'Approvals' | 'Questions' | 'My exams' | 'Results'
type Account = { id: string; role: Role; name: string; username?: string; studentId?: string; classSection?: string }
type Exam = { id: string; title: string; subject: string; date: string; time: string; duration: number; questions: number; status: 'Scheduled' | 'Draft' | 'Published'; subject_duration: number; subject_approved: number }
type Question = { id: string; examId?: string; subject: string; text: string; options: string[]; answer?: number }
type Result = { id: string; exam_title: string; student_name: string; student_id: string; score: number; total: number; submitted_at: string }
type SubjectSetting = { subject: string; duration: number; approved: number; approved_at?: string }
type Data = { users: Account[]; exams: Exam[]; questions: Question[]; results: Result[]; subjects: SubjectSetting[] }
const emptyData: Data = { users: [], exams: [], questions: [], results: [], subjects: [] }

async function api<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://cbt-exam-platform-production.up.railway.app/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
  if (!response.ok) { const error = await response.json().catch(() => ({ error: 'Request failed.' })); throw new Error(error.error || 'Request failed.') }
  return response.status === 204 ? undefined as T : response.json()
}

function App() {
  const [entryPage, setEntryPage] = useState<EntryPage>('home')
  const [session, setSession] = useState<Account | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [data, setData] = useState<Data>(emptyData)
  const [loginRole, setLoginRole] = useState<Role>('Admin')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<Tab>('Overview')
  const [notice, setNotice] = useState('')
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showExamForm, setShowExamForm] = useState(false)
  const [activeExam, setActiveExam] = useState<Exam | null>(null)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const refresh = async (activeToken = token) => { if (!activeToken) return; setData(await api<Data>('/data', activeToken)) }
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3000) }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setLoginError('')
    const values = new FormData(event.currentTarget)
    try {
      const result = await api<{ token: string; user: Account }>('/login', null, { method: 'POST', body: JSON.stringify({ role: loginRole, identifier: String(values.get('identifier')).trim(), password: String(values.get('password') || '') }) })
      setToken(result.token); setSession(result.user); setTab('Overview'); await refresh(result.token)
    } catch (error) { setLoginError(error instanceof Error ? error.message : 'Unable to sign in.') } finally { setLoading(false) }
  }

  function logout() { setToken(null); setSession(null); setActiveExam(null); setSubmitted(false); setData(emptyData) }

  async function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const values = new FormData(event.currentTarget); const role = String(values.get('role')) as Role
    try { await api('/users', token, { method: 'POST', body: JSON.stringify({ role, name: String(values.get('name')).trim(), username: String(values.get('username') || '').trim(), password: String(values.get('password') || ''), studentId: String(values.get('studentId') || '').trim().toUpperCase(), classSection: String(values.get('classSection') || '').trim() }) }); setShowAccountForm(false); await refresh(); showNotice(`${role} account created.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not create account.') }
  }

  async function deleteAccount(account: Account) { if (!window.confirm(`Delete ${account.name}'s ${account.role.toLowerCase()} account?`)) return; try { await api(`/users/${account.id}`, token, { method: 'DELETE' }); await refresh(); showNotice(`${account.name}'s account was deleted.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not delete account.') } }

  async function addExam(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = new FormData(event.currentTarget); try { await api('/exams', token, { method: 'POST', body: JSON.stringify({ title: values.get('title'), subject: values.get('subject'), date: values.get('date'), time: values.get('time'), duration: values.get('duration'), questions: values.get('questions') }) }); setShowExamForm(false); await refresh(); showNotice('Exam schedule published.') } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not schedule exam.') } }

  async function deleteExam(exam: Exam) { if (!window.confirm(`Delete the ${exam.status.toLowerCase()} exam "${exam.title}"?`)) return; try { await api(`/exams/${exam.id}`, token, { method: 'DELETE' }); await refresh(); showNotice(`${exam.title} was deleted.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not delete exam.') } }

  async function approveSubject(subject: string) { try { await api(`/subjects/${encodeURIComponent(subject)}/approve`, token, { method: 'POST' }); await refresh(); showNotice(`${subject} questions approved for students.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not approve subject.') } }

  async function deleteSubject(subject: string) { if (!window.confirm(`Delete all questions for ${subject}? This cannot be undone.`)) return; try { await api(`/subjects/${encodeURIComponent(subject)}`, token, { method: 'DELETE' }); await refresh(); showNotice(`${subject} question set was deleted.`) } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not delete question set.') } }

  async function submitExam(answers: Record<string, number>) { if (!activeExam) return; try { await api('/submissions', token, { method: 'POST', body: JSON.stringify({ examId: activeExam.id, answers }) }); setSubmitted(true); showNotice('Exam submitted successfully.') } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not submit exam.') } }

  function renderLogin() { return <div className="login-page"><div className="login-art"><div className="brand light"><span className="brand-mark">T</span><span>TIMPRIEST EDU</span></div><div className="art-copy"><p className="eyebrow">Offline examination platform</p><h1>Every learner.<br /><em>One fair chance.</em></h1><p>Secure, simple computer-based testing for modern schools and training centres.</p></div><div className="art-footer"><span className="status-dot" /> LAN-ready · SQLite database</div></div><div className="login-panel"><div className="login-box"><button className="back-link" onClick={() => setEntryPage('home')}>← Public homepage</button><p className="eyebrow">Welcome back</p><h2>Sign in to your portal</h2><p className="login-subtitle">Choose your access type to continue.</p><div className="role-tabs">{(['Admin', 'Teacher', 'Student'] as Role[]).map((role) => <button className={loginRole === role ? 'selected' : ''} key={role} onClick={() => { setLoginRole(role); setLoginError('') }}>{role}</button>)}</div><form onSubmit={login}><label>{loginRole === 'Student' ? 'Student ID' : 'Username'}<input name="identifier" placeholder={loginRole === 'Student' ? 'e.g. STUDENT-001' : `Enter ${loginRole.toLowerCase()} username`} autoComplete="username" required /></label>{loginRole !== 'Student' && <label>Password<input name="password" type="password" placeholder="Enter password" autoComplete="current-password" required /></label>}{loginError && <p className="form-error">{loginError}</p>}<button className="primary-button full" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Continue'} <span>→</span></button></form></div><p className="copyright">TIMPRIEST EDU · SQLite LAN CBT Suite</p></div></div> }

  if (!session && entryPage === 'home') return <PublicHome onSignIn={() => setEntryPage('login')} onRegister={() => setEntryPage('register')} />
  if (!session && entryPage === 'register') return <AdminRegistration onBack={() => setEntryPage('home')} onComplete={() => setEntryPage('login')} />
  if (!session) return renderLogin()
  const isAdmin = session.role === 'Admin'; const isTeacher = session.role === 'Teacher'
  const navItems: Tab[] = isAdmin ? ['Overview', 'Accounts', 'Schedule', 'Approvals', 'Results'] : isTeacher ? ['Overview', 'Questions', 'My exams'] : ['Overview', 'My exams']
  const examQuestions = activeExam ? data.questions.filter((question) => question.examId === activeExam.id || (!question.examId && question.subject === activeExam.subject)) : []

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">T</span><span>TIMPRIEST EDU</span></div><div className="centre-switcher"><span className="status-dot" /><span><strong>Northbridge Centre</strong><small>SQLite LAN mode</small></span></div><p className="nav-label">{session.role} portal</p><nav>{navItems.map((item) => <button className={tab === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => setTab(item)}><span className="nav-icon">{item === 'Overview' ? '◈' : item === 'Accounts' ? '♙' : item === 'Schedule' || item === 'My exams' ? '▣' : item === 'Questions' ? '✦' : '▥'}</span>{item}</button>)}</nav><div className="sidebar-bottom">{session.role !== 'Student' && <button className="nav-item" onClick={logout}><span className="nav-icon">↪</span>Sign out</button>}<div className="user-chip"><span className="avatar">{session.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><span><strong>{session.name}</strong><small>{session.role}</small></span></div></div></aside><main className="main-content"><header className="topbar"><div className="breadcrumb">{tab} <span>/</span> {session.role}</div><div className="top-actions"><span className="online-label"><span className="status-dot" /> LAN database connected</span><button className="role-button"><span className="avatar small">{session.name.slice(0, 2).toUpperCase()}</span>{session.role}<span>↪</span></button></div></header><section className={tab === 'Results' ? 'content-wrap results-print-scope' : 'content-wrap'}>{notice && <div className="toast">✓ {notice}</div>}{activeExam ? <TimedExamRunner exam={activeExam} questions={examQuestions} selectedAnswers={selectedAnswers} setSelectedAnswers={setSelectedAnswers} submitted={submitted} submit={() => submitExam(selectedAnswers)} exit={() => { setActiveExam(null); setSubmitted(false); setSelectedAnswers({}) }} /> : <>{<div className="intro"><div><p className="eyebrow">{isAdmin ? 'Administrator console' : isTeacher ? 'Teacher workspace' : 'Student portal'}</p><h1>{isAdmin ? 'Good morning, Amina.' : `Welcome back, ${session.name.split(' ')[0]}.`}</h1><p className="intro-copy">{isAdmin ? 'Manage your people, exams, schedules, and published results.' : isTeacher ? 'Prepare subject questions one step at a time.' : 'Your exam schedule is ready when you are.'}</p></div>{isAdmin && <button className="primary-button" onClick={() => { setTab('Schedule'); setShowExamForm(true) }}>+ Create exam</button>}{isTeacher && <button className="primary-button" onClick={() => setTab('Questions')}>+ Set questions</button>}{!isAdmin && !isTeacher && <button className="primary-button" onClick={() => { setTab('My exams'); setActiveExam(data.exams.find((exam) => exam.status === 'Scheduled') || null) }}>Enter exam →</button>}</div>}{tab === 'Overview' && <Overview session={session} data={data} setTab={setTab} setActiveExam={setActiveExam} />}{tab === 'Accounts' && isAdmin && <AccountsPanel accounts={data.users} token={token} showForm={showAccountForm} setShowForm={setShowAccountForm} addAccount={addAccount} deleteAccount={deleteAccount} refresh={refresh} showNotice={showNotice} />}{tab === 'Schedule' && isAdmin && <ExamSchedule exams={data.exams} showForm={showExamForm} setShowForm={setShowExamForm} addExam={addExam} deleteExam={deleteExam} />}{tab === 'Questions' && isTeacher && <SubjectQuestionWizard questions={data.questions} exams={data.exams} token={token} refresh={refresh} showNotice={showNotice} />}{tab === 'My exams' && <ExamList exams={data.exams} student={session.role === 'Student'} start={(exam) => { setActiveExam(exam); setSelectedAnswers({}); setSubmitted(false) }} />}{tab === 'Approvals' && isAdmin && <Approvals subjects={data.subjects} approve={approveSubject} deleteSubject={deleteSubject} />}{tab === 'Results' && isAdmin && <Results results={data.results} />}</>}</section></main></div>
}

function Overview({ session, data, setTab, setActiveExam }: { session: Account; data: Data; setTab: (tab: Tab) => void; setActiveExam: (exam: Exam) => void }) { const stats = session.role === 'Admin' ? [[String(data.exams.length).padStart(2, '0'), 'Scheduled exams', 'SQLite records'], [String(data.users.filter((item) => item.role === 'Student').length).padStart(2, '0'), 'Students', 'Active accounts'], [String(data.users.filter((item) => item.role === 'Teacher').length).padStart(2, '0'), 'Teachers', 'Active accounts']] : session.role === 'Teacher' ? [[String(data.exams.length).padStart(2, '0'), 'Assessments', 'Centre schedule'], [String(data.questions.length).padStart(2, '0'), 'Questions saved', 'Question bank'], ['01', 'Next session', 'On schedule']] : [['02', 'Upcoming exams', 'Next scheduled'], ['01', 'Exam access', 'Ready to start'], ['--', 'Results', 'Managed by Admin']]; return <><div className="stats-grid">{stats.map(([value, label, note]) => <article className="stat-card" key={label}><span className="stat-value">{value}</span><span className="stat-label">{label}</span><span className="stat-note">{note}</span></article>)}</div><div className="section-heading"><div><p className="eyebrow">At a glance</p><h2>{session.role === 'Admin' ? 'Centre activity' : 'Upcoming sessions'}</h2></div><button className="text-button" onClick={() => setTab(session.role === 'Admin' ? 'Schedule' : 'My exams')}>View details <span>→</span></button></div><div className="dashboard-grid"><section className="panel"><div className="panel-header"><div><h3>Exam schedule</h3><p>Published sessions from the LAN database.</p></div></div>{data.exams.map((exam) => <div className="session" key={exam.id}><div className="date-block"><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong><span>{new Date(`${exam.date}T00:00:00`).toLocaleString('en', { month: 'short' }).toUpperCase()}</span></div><div className="session-info"><div className="session-title">{exam.title} <span className={`tag ${exam.status === 'Scheduled' ? 'live' : 'draft'}`}>{exam.status}</span></div><p>{exam.time} · {exam.duration} minutes · {exam.questions} questions</p><small>{exam.subject} · Northbridge Centre</small></div>{session.role === 'Student' && exam.status === 'Scheduled' && <button className="start-link" onClick={() => setActiveExam(exam)}>Start →</button>}</div>)}</section><section className="panel"><div className="panel-header"><div><h3>Quick actions</h3><p>Common tasks for your portal.</p></div></div><div className="quick-actions">{session.role === 'Admin' && <><button onClick={() => setTab('Accounts')}>♙ <span>Manage accounts<small>Create or delete teachers and students</small></span>→</button><button onClick={() => setTab('Results')}>▥ <span>View exam results<small>Print result sheets as PDF</small></span>→</button></>}{session.role === 'Teacher' && <button onClick={() => setTab('Questions')}>✦ <span>Set subject questions<small>Use Next, Previous, and Submit</small></span>→</button>}{session.role === 'Student' && <button onClick={() => setActiveExam(data.exams.find((exam) => exam.status === 'Scheduled') || data.exams[0])}>▣ <span>Start next exam<small>Results are handled by the Admin</small></span>→</button>}</div></section></div></> }

function ExamList({ exams, student, start }: { exams: Exam[]; student: boolean; start: (exam: Exam) => void }) { return <><div className="section-heading"><div><p className="eyebrow">Examination schedule</p><h2>{student ? 'Your exams' : 'Assigned examinations'}</h2></div></div><div className="exam-cards">{exams.map((exam) => <article className="exam-card" key={exam.id}><div className="exam-card-date"><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong><span>{new Date(`${exam.date}T00:00:00`).toLocaleString('en', { month: 'short' }).toUpperCase()}</span></div><div><h3>{exam.title}</h3><p>{exam.subject} · {exam.time} · {exam.duration} minutes</p><small>{exam.questions} questions · Northbridge Centre</small></div>{student && exam.status === 'Scheduled' && <button className="primary-button small-button" onClick={() => start(exam)}>Start exam</button>}</article>)}</div></> }

function Results({ results }: { results: Result[] }) { return <><div className="section-heading"><div><p className="eyebrow">Administrator reports</p><h2>Exam results</h2></div><button className="primary-button" onClick={() => window.print()}>Print / Save PDF</button></div><div className="table-panel results-table"><div className="table-head"><span>Student</span><span>Exam</span><span>Score</span><span>Submitted</span></div>{results.length ? results.map((result) => <div className="table-row" key={result.id}><strong>{result.student_name}<small>{result.student_id}</small></strong><span>{result.exam_title}</span><span className="score-text">{result.score} / {result.total}</span><span>{new Date(result.submitted_at).toLocaleString()}</span></div>) : <div className="result-empty"><span>▥</span><h3>No submitted results yet</h3><p>Student submissions will appear here for review and printing.</p></div>}</div></> }

export default App











