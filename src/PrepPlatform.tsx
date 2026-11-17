import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric'
import { API_BASE } from './apiBase'
import QuestionContent from './QuestionContent'
import PasswordInput from './PasswordInput'
import './exam-runner.css'
import './prep-platform.css'

type Exam = 'JAMB' | 'WAEC' | 'NECO'
type User = { id: string; name: string; username: string; phone?: string; paid: boolean; accessUntil: string | null; examAccess: Partial<Record<Exam, string>>; selectedExam?: Exam | null; subjectSelectionEnabled?: boolean; selectedSubjects?: Partial<Record<Exam, string[]>> }
type ExamFees = Record<Exam, number>
type SubjectYear = { year: number | null; questions: number }
type Subject = { subject: string; questions: number; years: SubjectYear[] }
type CatalogItem = { exam: Exam; subjects: Subject[] }
type Question = { id: string; text: string; options: string[]; explanation: string | null; year: number | null }
type ReviewQuestion = Question & { answer: number; selected: number | null }
type Attempt = { id: string; exam: Exam; subject: string; score: number; total: number; createdAt: string }
type Result = Attempt & { review: ReviewQuestion[] }
type Practice = { id: string; exam: Exam; subject: string; startedAt: number; expiresAt: number }

const TOKEN_KEY = 'timpriest-prep-token'
const BIOMETRIC_SERVER = 'exam.timpriestedu.name.ng/prep'
const EXAMS: Exam[] = ['JAMB', 'WAEC', 'NECO']
const QUESTION_COUNTS = [10, 20, 40, 60, 100]

async function request<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/prep${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  })
  const body = response.status === 204 ? undefined : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body?.error || 'The prep platform request could not be completed.')
  return body as T
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'S'
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function returnedPaymentReference() {
  const query = new URLSearchParams(window.location.search)
  return query.get('reference') || query.get('trxref') || sessionStorage.getItem('timpriest-prep-payment-reference')
}

export default function PrepPlatform() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)))
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(() => Boolean(returnedPaymentReference()))
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)
  const [enableBiometric, setEnableBiometric] = useState(false)
  const [biometricBusy, setBiometricBusy] = useState(false)
  const [biometricMessage, setBiometricMessage] = useState('')
  const [page, setPage] = useState<'practice' | 'history'>('practice')
  const [error, setError] = useState('')
  const [availableSubjects, setAvailableSubjects] = useState<Record<Exam, string[]>>({ JAMB: [], WAEC: [], NECO: [] })
  const [subjectsError, setSubjectsError] = useState('')
  const [registrationExam, setRegistrationExam] = useState<Exam>('JAMB')
  const [registrationSubjects, setRegistrationSubjects] = useState<string[]>([])
  const [subjectManageExam, setSubjectManageExam] = useState<Exam>('JAMB')
  const [subjectToAdd, setSubjectToAdd] = useState('')
  const [subjectAdding, setSubjectAdding] = useState(false)
  const [monthlyFeesNaira, setMonthlyFeesNaira] = useState<ExamFees>({ JAMB: 1500, WAEC: 1000, NECO: 1000 })
  const [paymentsReady, setPaymentsReady] = useState(false)
  const [paymentEmail, setPaymentEmail] = useState('')
  const [showRenewalForm, setShowRenewalForm] = useState(false)
  const [selectedPaymentExam, setSelectedPaymentExam] = useState<Exam>('JAMB')
  const [exam, setExam] = useState<Exam>('JAMB')
  const [subject, setSubject] = useState('')
  const [selectedYear, setSelectedYear] = useState('all')
  const [questionCount, setQuestionCount] = useState(10)
  const [durationMinutes, setDurationMinutes] = useState(30)
  const [practice, setPractice] = useState<Practice | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [current, setCurrent] = useState(0)
  const [clock, setClock] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const submissionLock = useRef(false)
  const autoSubmitLock = useRef(false)
  const paymentReturnHandled = useRef(false)

  useEffect(() => {
    let active = true
    request<{ exams: Record<Exam, string[]> }>('/subjects', null)
      .then((result) => { if (active) setAvailableSubjects(result.exams) })
      .catch((failure) => {
        if (active) setSubjectsError(failure instanceof Error ? failure.message : 'Could not load available exam subjects.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true
    void (async () => {
      try {
        const availability = await NativeBiometric.isAvailable()
        if (!active) return
        const canUseFingerprint = availability.strongBiometryIsAvailable
        setBiometricAvailable(canUseFingerprint)
        if (!canUseFingerprint) return
        const saved = await NativeBiometric.isCredentialsSaved({ server: BIOMETRIC_SERVER })
        if (active) setBiometricEnrolled(saved.isSaved)
      } catch {
        if (active) setBiometricMessage('Fingerprint sign-in could not be checked. You can still sign in with your password.')
      }
    })()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!token) return
    let active = true
    request<{ user: User; monthlyFeesNaira: ExamFees; paymentsReady: boolean }>('/me', token).then(async (account) => {
      if (!active) return
      setUser(account.user)
      setSelectedPaymentExam(account.user.selectedExam || 'JAMB')
      setSubjectManageExam(account.user.selectedExam || 'JAMB')
      setMonthlyFeesNaira(account.monthlyFeesNaira)
      setPaymentsReady(account.paymentsReady)
      if (account.user.paid) {
        const [bank, history] = await Promise.all([
          request<{ exams: CatalogItem[] }>('/catalog', token),
          request<{ attempts: Attempt[] }>('/attempts', token),
        ])
        if (!active) return
        setCatalog(bank.exams)
        setAttempts(history.attempts)
      } else {
        setCatalog([])
        setAttempts([])
      }
      setError('')
    }).catch((failure) => {
      if (!active) return
      setError(failure instanceof Error ? failure.message : 'Could not load your prep workspace.')
      if (failure instanceof Error && /session has expired/i.test(failure.message)) {
        sessionStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setLoading(false)
        setUser(null)
        if (Capacitor.isNativePlatform()) {
          void NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER }).then(() => setBiometricEnrolled(false)).catch(() => {
            setBiometricMessage('Your saved fingerprint sign-in could not be removed. Use “Forget fingerprint sign-in” before signing in again.')
          })
        }
      }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token, user?.paid])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!token || !user || paymentReturnHandled.current) return
    const reference = returnedPaymentReference()
    if (!reference) return
    paymentReturnHandled.current = true
    request<{ paid: boolean; status: string; exam: Exam | null; accessUntil?: string | null }>(`/payment/verify/${encodeURIComponent(reference)}`, token, { method: 'POST' })
      .then(async (result) => {
        if (!result.paid) {
          setError('Payment has not been confirmed yet. If you have completed checkout, check again shortly.')
          return
        }
        sessionStorage.removeItem('timpriest-prep-payment-reference')
        const paidExam = result.exam
        const accessUntil = result.accessUntil
        if (paidExam && accessUntil) {
          setUser((currentUser) => currentUser ? { ...currentUser, paid: true, examAccess: { ...currentUser.examAccess, [paidExam]: accessUntil } } : currentUser)
          const bank = await request<{ exams: CatalogItem[] }>('/catalog', token)
          setCatalog(bank.exams)
        }
        setError('')
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
      })
      .catch((failure) => {
        setError(failure instanceof Error ? failure.message : 'Could not confirm your payment yet.')
      })
      .finally(() => setPaymentBusy(false))
  }, [token, user])

  useEffect(() => {
    if (!user?.paid || practice) return
    const expiries = [user.accessUntil, ...Object.values(user.examAccess)].filter((value): value is string => Boolean(value)).map(Date.parse).filter((expiry) => Number.isFinite(expiry) && expiry > Date.now())
    const nextExpiry = expiries.length ? Math.min(...expiries) : Date.now()
    const timer = window.setTimeout(() => {
      if (!token) return
      request<{ user: User }>('/me', token).then(async (account) => {
        setUser(account.user)
        if (account.user.paid) {
          const bank = await request<{ exams: CatalogItem[] }>('/catalog', token)
          setCatalog(bank.exams)
        } else {
          setCatalog([])
          setAttempts([])
        }
      }).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not refresh exam access.'))
    }, Math.min(Math.max(0, nextExpiry - Date.now()), 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [practice, token, user?.accessUntil, user?.examAccess, user?.paid])

  const examEntry = catalog.find((item) => item.exam === exam)
  const subjects = examEntry?.subjects || []
  const examQuestionCount = subjects.reduce((total, item) => total + item.questions, 0)
  const examHasAccess = Boolean(user?.accessUntil && Date.parse(user.accessUntil) > now || user?.examAccess[exam] && Date.parse(user.examAccess[exam]) > now)
  const activeExams = EXAMS.filter((item) => Boolean(user?.accessUntil && Date.parse(user.accessUntil) > now || user?.examAccess[item] && Date.parse(user.examAccess[item]) > now))
  const managedExam = activeExams.includes(subjectManageExam) ? subjectManageExam : activeExams[0] || 'JAMB'
  const subscribedExams = EXAMS.filter((item) => Boolean(user?.accessUntil && Date.parse(user.accessUntil) > now || user?.examAccess[item]))
  const subjectEntry = subjects.find((item) => item.subject === subject)
  const availableCount = selectedYear === 'all'
    ? subjectEntry?.questions || 0
    : subjectEntry?.years.find((item) => item.year === (selectedYear === 'unspecified' ? null : Number(selectedYear)))?.questions || 0
  const availableYears = subjectEntry?.years || []
  const remaining = practice ? Math.max(0, Math.ceil((practice.expiresAt - (clock ?? practice.startedAt)) / 1000)) : 0

  useEffect(() => {
    if (activeExams.length && !activeExams.includes(exam)) {
      setExam(activeExams[0])
      setSubject('')
      setSelectedYear('all')
    }
  }, [activeExams.join('|'), exam]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!practice || result) return
    const timer = window.setInterval(() => setClock(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [practice, result])

  const submitPractice = useCallback(async () => {
    if (!token || !practice || submitting || submissionLock.current) return
    submissionLock.current = true
    setSubmitting(true)
    setError('')
    try {
      const saved = await request<Result>(`/practice/${practice.id}/submit`, token, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      })
      setResult(saved)
      setPractice(null)
      setAttempts((currentAttempts) => [saved, ...currentAttempts].slice(0, 50))
    } catch (failure) {
      submissionLock.current = false
      setError(failure instanceof Error ? failure.message : 'Could not submit this practice. Please retry.')
    } finally {
      setSubmitting(false)
    }
  }, [answers, practice, submitting, token])

  useEffect(() => {
    if (practice && remaining === 0 && !result && !submitting && !autoSubmitLock.current) {
      autoSubmitLock.current = true
      void submitPractice()
    }
  }, [practice, remaining, result, submitting, submitPractice])

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setLoading(true)
    setError('')
    try {
      const path = mode === 'login' ? '/login' : '/register'
      const payload = mode === 'login'
        ? { username: String(values.get('username') || '').trim(), password: String(values.get('password') || '') }
        : {
          name: String(values.get('name') || '').trim(),
          phone: String(values.get('phone') || '').trim(),
          username: String(values.get('username') || '').trim(),
          password: String(values.get('password') || ''),
          exam: registrationExam,
          subjects: registrationSubjects,
          referralCode: new URLSearchParams(window.location.search).get('ref') || '',
        }
      if (mode === 'register' && registrationSubjects.length !== 4) {
        throw new Error('Choose exactly four subjects for your selected exam before creating your account.')
      }
      const session = await request<{ token: string; user: User }>(path, null, { method: 'POST', body: JSON.stringify(payload) })
      sessionStorage.setItem(TOKEN_KEY, session.token)
      setUser(session.user)
      setSelectedPaymentExam(session.user.selectedExam || 'JAMB')
      setSubjectManageExam(session.user.selectedExam || 'JAMB')
      setToken(session.token)
      if (mode === 'login' && Capacitor.isNativePlatform() && (enableBiometric || biometricEnrolled)) {
        try {
          if (enableBiometric && !biometricEnrolled) {
            await NativeBiometric.verifyIdentity({
              reason: 'Enable fingerprint sign-in for TIMPRIEST EDU Prep',
              title: 'Confirm fingerprint',
              subtitle: 'Secure your Prep account',
              allowedBiometryTypes: [BiometryType.FINGERPRINT],
            })
          }
          await NativeBiometric.setCredentials({
            username: payload.username,
            password: session.token,
            server: BIOMETRIC_SERVER,
          })
          setBiometricEnrolled(true)
          setBiometricMessage('Fingerprint sign-in is ready for this account on this device.')
        } catch {
          setBiometricMessage('Your password sign-in succeeded, but fingerprint sign-in could not be enabled.')
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not sign in.')
      setLoading(false)
    } finally {
      setBusy(false)
    }
  }

  async function authenticateWithFingerprint() {
    setBiometricBusy(true)
    setLoading(true)
    setError('')
    setBiometricMessage('')
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Sign in to TIMPRIEST EDU Prep',
        title: 'Fingerprint sign-in',
        subtitle: 'Verify it is you',
        allowedBiometryTypes: [BiometryType.FINGERPRINT],
      })
      const credentials = await NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER })
      const account = await request<{ user: User }>('/me', credentials.password)
      sessionStorage.setItem(TOKEN_KEY, credentials.password)
      setUser(account.user)
      setToken(credentials.password)
    } catch (failure) {
      setLoading(false)
      setError(failure instanceof Error ? failure.message : 'Fingerprint sign-in failed. Please use your password.')
    } finally {
      setBiometricBusy(false)
    }
  }

  async function forgetFingerprintSignIn() {
    setBiometricBusy(true)
    setError('')
    setBiometricMessage('')
    try {
      await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER })
      setBiometricEnrolled(false)
      setEnableBiometric(false)
      setBiometricMessage('Fingerprint sign-in has been removed from this device.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not remove fingerprint sign-in.')
    } finally {
      setBiometricBusy(false)
    }
  }

  async function signOut() {
    if (token) {
      try { await request('/logout', token, { method: 'POST' }) }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not close the server session.') }
    }
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
    setCatalog([])
    setAttempts([])
    setPractice(null)
    setQuestions([])
    setResult(null)
    setPage('practice')
    paymentReturnHandled.current = false
    sessionStorage.removeItem('timpriest-prep-payment-reference')
    setError('')
  }

  async function startPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || paymentBusy || !paymentsReady) return
    setPaymentBusy(true)
    setError('')
    try {
      const checkout = await request<{ authorizationUrl: string; reference: string; exam: Exam }>('/payment/checkout', token, {
        method: 'POST',
        body: JSON.stringify({ email: paymentEmail.trim(), exam: selectedPaymentExam }),
      })
      sessionStorage.setItem('timpriest-prep-payment-reference', checkout.reference)
      window.location.assign(checkout.authorizationUrl)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start your payment.')
      setPaymentBusy(false)
    }
  }

  async function addSelectedSubject() {
    if (!token || !subjectToAdd || subjectAdding) return
    setSubjectAdding(true)
    setError('')
    try {
      const result = await request<{ exam: Exam; subject: string; selectedSubjects: string[] }>('/subjects', token, {
        method: 'POST',
        body: JSON.stringify({ exam: managedExam, subject: subjectToAdd }),
      })
      setUser((currentUser) => currentUser ? {
        ...currentUser,
        selectedSubjects: { ...currentUser.selectedSubjects, [result.exam]: result.selectedSubjects },
      } : currentUser)
      const bank = await request<{ exams: CatalogItem[] }>('/catalog', token)
      setCatalog(bank.exams)
      setSubjectToAdd('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not add that subject.')
    } finally {
      setSubjectAdding(false)
    }
  }

  async function checkPaymentAgain() {
    const reference = sessionStorage.getItem('timpriest-prep-payment-reference')
    if (!token || !reference || paymentBusy) return
    setPaymentBusy(true)
    setError('')
    try {
      const result = await request<{ paid: boolean; status: string; exam: Exam | null; accessUntil?: string | null }>(`/payment/verify/${encodeURIComponent(reference)}`, token, { method: 'POST' })
      if (!result.paid) {
        setError('Payment has not been confirmed yet. Please wait a moment and try again.')
        return
      }
      sessionStorage.removeItem('timpriest-prep-payment-reference')
      const paidExam = result.exam
      const accessUntil = result.accessUntil
      if (paidExam && accessUntil) {
        setUser((currentUser) => currentUser ? { ...currentUser, paid: true, examAccess: { ...currentUser.examAccess, [paidExam]: accessUntil } } : currentUser)
        const bank = await request<{ exams: CatalogItem[] }>('/catalog', token)
        setCatalog(bank.exams)
      }
      setError('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not confirm your payment yet.')
    } finally {
      setPaymentBusy(false)
    }
  }

  async function startPractice() {
    if (!token || !subject || !availableCount) return
    setBusy(true)
    setError('')
    setResult(null)
    setAnswers({})
    submissionLock.current = false
    autoSubmitLock.current = false
    try {
      const started = await request<{ practiceId: string; startedAt: number; expiresAt: number; questions: Question[] }>('/practice', token, {
        method: 'POST',
        body: JSON.stringify({ exam, subject, year: selectedYear === 'all' ? undefined : selectedYear === 'unspecified' ? null : Number(selectedYear), count: Math.min(questionCount, availableCount), durationMinutes }),
      })
      if (!started.questions.length) throw new Error('No questions were returned for this practice.')
      setPractice({ id: started.practiceId, exam, subject, startedAt: started.startedAt, expiresAt: started.expiresAt })
      setQuestions(started.questions)
      setCurrent(0)
      setClock(Date.now())
      setPage('practice')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not start practice.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <main className="prep-loading"><img src="/logo-512.png" alt="" /><span className="prep-spinner" /><p>Opening your prep workspace...</p></main>
  }

  if (!token || !user) {
    return (
      <main className="prep-auth">
        <header className="prep-public-nav">
          <a className="prep-brand" href="/" aria-label="TIMPRIEST EDU home"><img src="/logo-512.png" alt="" /><span>TIMPRIEST <b>EDU</b></span></a>
        </header>
        <section className="prep-auth-layout">
          <div className="prep-auth-copy">
            <span className="prep-kicker"><i /> EXAM PREPARATION</span>
            <h1>Your next practice<br /><em>starts here.</em></h1>
            <p>Pick JAMB, WAEC, or NECO, choose a subject, and get straight into timed questions.</p>
            <div className="prep-exam-pills">{EXAMS.map((item) => <span key={item}>{item}</span>)}</div>
          </div>
          <form className="prep-auth-card" onSubmit={authenticate}>
            <div className="prep-auth-tabs">
              <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setBiometricMessage('') }}>Sign in</button>
              <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setBiometricMessage('') }}>Create account</button>
            </div>
            <span className="prep-card-kicker">TIMPRIEST EDU · PREP</span>
            <h2>{mode === 'login' ? 'Welcome back' : 'Start your preparation'}</h2>
            <p>{mode === 'login' ? 'Sign in to continue practicing.' : 'Create a separate account for your exam preparation.'}</p>
            {mode === 'register' && <label>Full name<input name="name" autoComplete="name" minLength={2} maxLength={100} required /></label>}
            {mode === 'register' && <label>Phone number<input name="phone" type="tel" autoComplete="tel" minLength={7} maxLength={20} placeholder="Include country code if needed" required /></label>}
            {mode === 'register' && <>
              <label>Exam<select value={registrationExam} onChange={(event) => { setRegistrationExam(event.target.value as Exam); setRegistrationSubjects([]) }}>{EXAMS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <fieldset className="prep-registration-subjects">
                <legend>Choose exactly four subjects</legend>
                <span>JAMB is limited to these four. WAEC and NECO users can add other available subjects after payment.</span>
                <div className="prep-registration-subject-list">
                  {availableSubjects[registrationExam].map((item) => {
                    const checked = registrationSubjects.includes(item)
                    return <label className={checked ? 'selected' : ''} key={item}><input type="checkbox" checked={checked} disabled={!checked && registrationSubjects.length >= 4} onChange={() => setRegistrationSubjects((currentSubjects) => checked ? currentSubjects.filter((subjectItem) => subjectItem !== item) : [...currentSubjects, item])} /><span>{item}</span></label>
                  })}
                </div>
                <small>{registrationSubjects.length} of 4 selected</small>
                {subjectsError && <small className="prep-subject-error">{subjectsError}</small>}
                {!subjectsError && availableSubjects[registrationExam].length > 0 && availableSubjects[registrationExam].length < 4 && <small className="prep-subject-error">There are not yet four subjects available for {registrationExam}. Please contact the platform administrator.</small>}
                {!subjectsError && availableSubjects[registrationExam].length === 0 && <small>Loading available subjects...</small>}
              </fieldset>
            </>}
            <label>Username<input name="username" autoComplete="username" minLength={3} maxLength={30} required /></label>
            <label>Password<PasswordInput name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} maxLength={256} required /></label>
            {mode === 'login' && biometricAvailable && !biometricEnrolled && <label className="prep-biometric-opt-in"><input type="checkbox" checked={enableBiometric} onChange={(event) => setEnableBiometric(event.target.checked)} /> Enable fingerprint sign-in on this device</label>}
            {error && <p className="prep-error" role="alert">{error}</p>}
            {biometricMessage && <p className="prep-biometric-message" role="status">{biometricMessage}</p>}
            <button className="prep-button primary" type="submit" disabled={busy || biometricBusy || (mode === 'register' && registrationSubjects.length !== 4)}>{busy ? 'Please wait...' : mode === 'login' ? 'Sign in to prep' : 'Continue to payment'}<span aria-hidden="true">→</span></button>
            {mode === 'login' && biometricEnrolled && <button className="prep-button secondary prep-fingerprint-button" type="button" disabled={busy || biometricBusy} onClick={() => void authenticateWithFingerprint()}>{biometricBusy ? 'Checking fingerprint...' : 'Sign in with fingerprint'}</button>}
            {mode === 'login' && biometricEnrolled && <button className="prep-forget-biometric" type="button" disabled={busy || biometricBusy} onClick={() => void forgetFingerprintSignIn()}>Forget fingerprint sign-in on this device</button>}
            <small className="prep-auth-note">Your preparation account is separate from school portal accounts.</small>
          </form>
        </section>
        <footer className="prep-footer">A dedicated preparation space from TIMPRIEST EDU</footer>
      </main>
    )
  }

  if (!user.paid && !practice && !result) {
    return (
      <main className="prep-app prep-paywall">
        <header className="prep-work-header">
          <a className="prep-brand" href="/prep"><img src="/logo-512.png" alt="" /><span>TIMPRIEST <b>EDU</b></span></a>
          <div className="prep-user-menu"><span className="prep-user-avatar">{initials(user.name)}</span><span>{user.name}</span><button type="button" onClick={() => void signOut()}>Sign out</button></div>
        </header>
        <section className="prep-access-layout">
          <div className="prep-access-copy">
            <span className="prep-kicker"><i /> EXAM-SPECIFIC MONTHLY ACCESS</span>
            <h1>{user.subjectSelectionEnabled && user.selectedExam ? 'Your exam plan is ready.' : 'Choose your exam plan.'}</h1>
            <p>{user.subjectSelectionEnabled && user.selectedExam ? `You chose ${user.selectedExam}. Complete registration by paying for this exam package.` : 'Each monthly payment unlocks only the exam you choose. Pay for another exam separately whenever you need it.'}</p>
            <div className="prep-access-benefits"><span>✓ Timed subject practice</span><span>✓ Score and answer review</span><span>✓ Practice history</span></div>
          </div>
          <form className="prep-access-card" onSubmit={(event) => void startPayment(event)}>
            <span className="prep-card-kicker">{user.subjectSelectionEnabled ? 'YOUR SELECTED EXAM' : 'SELECT AN EXAM'}</span>
            <div className="prep-plan-options">{EXAMS.filter((item) => !user.subjectSelectionEnabled || item === user.selectedExam).map((item) => <button key={item} type="button" className={selectedPaymentExam === item ? 'active' : ''} aria-pressed={selectedPaymentExam === item} onClick={() => setSelectedPaymentExam(item)}><strong>{item}</strong><span>₦{monthlyFeesNaira[item].toLocaleString('en-NG')} / month</span></button>)}</div>
            {user.subjectSelectionEnabled && user.selectedExam && <p className="prep-payment-subjects">Your selected subjects: {(user.selectedSubjects?.[user.selectedExam] || []).join(' · ')}</p>}
            <div className="prep-access-price">₦{monthlyFeesNaira[selectedPaymentExam].toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}<span>{selectedPaymentExam} · one month · manual renewal</span></div>
            <p>Confirmed payment unlocks {selectedPaymentExam} practice only. Pay securely with Paystack.</p>
            <label>Email for your payment receipt<input type="email" autoComplete="email" maxLength={254} value={paymentEmail} onChange={(event) => setPaymentEmail(event.target.value)} placeholder="you@example.com" required /></label>
            {error && <p className="prep-error" role="alert">{error}</p>}
            {!paymentsReady && <p className="prep-payment-unavailable" role="status">Online payments are not available right now. Please contact the platform administrator.</p>}
            <button className="prep-button primary" type="submit" disabled={!paymentsReady || paymentBusy}>{paymentBusy ? 'Checking payment...' : `Pay for ${selectedPaymentExam}`}<span aria-hidden="true">→</span></button>
            {sessionStorage.getItem('timpriest-prep-payment-reference') && <button className="prep-button secondary" type="button" disabled={paymentBusy} onClick={() => void checkPaymentAgain()}>I have already paid · Check payment</button>}
            <small className="prep-auth-note">Payments are securely processed by Paystack. You’ll return here after checkout.</small>
          </form>
        </section>
        <footer className="prep-footer">Each exam plan renews separately every month.</footer>
      </main>
    )
  }

  if (practice && !result) {
    const question = questions[current]
    const totalTime = Math.max(1, practice.expiresAt - practice.startedAt)
    const remainingMs = remaining * 1000
    const level = remainingMs <= Math.min(60_000, totalTime * 0.1) ? 'danger' : remainingMs <= Math.min(300_000, totalTime * 0.25) ? 'warn' : 'ok'
    const answered = questions.filter((item) => answers[item.id] !== undefined).length
    return (
      <main className="prep-app prep-session">
        <div className="ex">
          <header className={`ex-bar ex-${level}`}>
            <div className="ex-title"><strong>{practice.exam} practice</strong><span>{practice.subject}</span></div>
            <div className="ex-times">
              <div><small>Started</small><b>{new Date(practice.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
              <div><small>Ends</small><b>{new Date(practice.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></div>
              <div><small>Time allowed</small><b>{Math.round(totalTime / 60_000)} min</b></div>
            </div>
            <div className="ex-clock" role="timer" aria-live="off"><small>Time left</small><strong>{formatTime(remaining)}</strong></div>
            <div className="ex-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (remainingMs / totalTime) * 100)}%` }} /></div>
          </header>
          {level !== 'ok' && remaining > 0 && <p className={`ex-alert ${level}`}>{level === 'danger' ? 'Less than a minute left. Your practice will be submitted automatically when the time ends.' : 'Time is running out. Check your answers.'}</p>}
          <div className="ex-layout">
          <section className="ex-card">
            <p className="ex-count">Question {current + 1} of {questions.length}</p>
            {question && <>
              <div className="ex-question" role="heading" aria-level={2}><QuestionContent content={question.text} /></div>
              {question.year && <span className="prep-year">Past question · {question.year}</span>}
              <div className="ex-options" role="radiogroup" aria-label="Choose one answer">
                {question.options.map((option, index) => (
                  <button key={index} type="button" role="radio" aria-checked={answers[question.id] === index} className={`ex-option ${answers[question.id] === index ? 'chosen' : ''}`} onClick={() => setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: index }))}>
                    <span className="ex-letter">{String.fromCharCode(65 + index)}</span><span className="ex-option-content">{option}</span>
                  </button>
                ))}
              </div>
            </>}
            {error && <p className="prep-error" role="alert">{error}</p>}
            <div className="ex-nav">
              <button className="ex-btn" type="button" disabled={current === 0 || remaining === 0} onClick={() => setCurrent((index) => index - 1)}>← Previous</button>
              {current < questions.length - 1
                ? <button className="ex-btn primary" type="button" disabled={remaining === 0} onClick={() => setCurrent((index) => index + 1)}>Next →</button>
                : <button className="ex-btn gold" type="button" disabled={submitting || remaining === 0} onClick={() => void submitPractice()}>{submitting ? 'Submitting...' : 'Finish practice'}</button>}
            </div>
          </section>
          <aside className="ex-side">
            <p className="ex-count">{answered} of {questions.length} answered</p>
            <div className="ex-grid">{questions.map((item, index) => <button key={item.id} type="button" className={`${index === current ? 'now' : ''} ${answers[item.id] !== undefined ? 'done' : ''}`} aria-label={`Question ${index + 1}${answers[item.id] !== undefined ? ', answered' : ''}`} onClick={() => setCurrent(index)}>{index + 1}</button>)}</div>
            <button className="ex-btn gold wide" type="button" disabled={submitting || remaining === 0} onClick={() => void submitPractice()}>{submitting ? 'Submitting...' : 'Submit practice'}</button>
            <p className="ex-hint">You can change an answer any time before you submit or the time ends.</p>
          </aside>
          </div>
        </div>
      </main>
    )
  }

  const scorePercent = result ? Math.round((result.score / Math.max(1, result.total)) * 100) : 0
  return (
    <main className="prep-app prep-student-dashboard">
      <header className="prep-work-header">
        <a className="prep-brand" href="/prep"><img src="/logo-512.png" alt="" /><span>TIMPRIEST <b>EDU</b></span></a>
        <nav className="prep-work-nav" aria-label="Prep workspace">
          <button className={page === 'practice' ? 'active' : ''} type="button" onClick={() => { setPage('practice'); setResult(null); setError('') }}>Practice</button>
          <button className={page === 'history' ? 'active' : ''} type="button" onClick={() => { setPage('history'); setResult(null); setError('') }}>My results</button>
        </nav>
        <div className="prep-user-menu"><span className="prep-user-avatar">{initials(user.name)}</span><span>{user.name}</span><button type="button" onClick={() => void signOut()}>Sign out</button></div>
      </header>
      <section className={`prep-dashboard${page === 'practice' && !result ? ' prep-practice-dashboard' : ''}`}>
        <section className="prep-renewal">
          <div className="prep-plans-heading"><span className="prep-card-kicker">EXAM ACCESS PLANS</span><strong>Manage monthly exam access</strong><p>Each payment covers one exam only.</p></div>
          <div className="prep-plan-cards">{subscribedExams.map((item) => {
            const expiry = user.accessUntil && Date.parse(user.accessUntil) > now ? user.accessUntil : user.examAccess[item]
            const active = Boolean(expiry && Date.parse(expiry) > now)
            return <article className={active ? 'active' : ''} key={item}><div><strong>{item}</strong><span>₦{monthlyFeesNaira[item].toLocaleString('en-NG')} / month</span><small>{active && expiry ? `Active until ${new Date(expiry).toLocaleDateString('en-NG', { dateStyle: 'medium' })}` : 'No active access'}</small></div><button className="prep-button secondary" type="button" onClick={() => { setSelectedPaymentExam(item); setShowRenewalForm(true); setError('') }}>{active ? 'Renew' : 'Get access'}</button></article>
          })}</div>
        </section>
        {user.subjectSelectionEnabled && activeExams.length > 0 && <section className="prep-subject-management">
          <div className="prep-plans-heading"><span className="prep-card-kicker">YOUR EXAM SUBJECTS</span><strong>Manage your selected subjects</strong><p>WAEC and NECO users can add any other subject in their question bank at no extra charge.</p></div>
          <label>Exam<select value={managedExam} onChange={(event) => { setSubjectManageExam(event.target.value as Exam); setSubjectToAdd('') }}>{activeExams.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <p className="prep-selected-subjects"><strong>Selected:</strong> {(user.selectedSubjects?.[managedExam] || []).join(' · ') || 'No subjects selected'}</p>
          {managedExam === 'JAMB'
            ? <small className="prep-subject-limit">JAMB accounts are limited to four subjects.</small>
            : <div className="prep-add-subject">
              <select aria-label={`Add a ${managedExam} subject`} value={subjectToAdd} onChange={(event) => setSubjectToAdd(event.target.value)}>
                <option value="">Choose another subject</option>
                {availableSubjects[managedExam].filter((item) => !(user.selectedSubjects?.[managedExam] || []).some((selected) => selected.toLocaleLowerCase() === item.toLocaleLowerCase())).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <button className="prep-button secondary" type="button" disabled={!subjectToAdd || subjectAdding} onClick={() => void addSelectedSubject()}>{subjectAdding ? 'Adding...' : 'Add subject'}</button>
              {!availableSubjects[managedExam].some((item) => !(user.selectedSubjects?.[managedExam] || []).some((selected) => selected.toLocaleLowerCase() === item.toLocaleLowerCase())) && <small>All available subjects are already selected.</small>}
            </div>}
          {error && <p className="prep-error" role="alert">{error}</p>}
        </section>}
        {showRenewalForm && <form className="prep-access-card prep-renewal-form" onSubmit={(event) => void startPayment(event)}>
          <span className="prep-card-kicker">{selectedPaymentExam} · ONE MONTH OF ACCESS</span>
          <div className="prep-access-price">₦{monthlyFeesNaira[selectedPaymentExam].toLocaleString('en-NG')}<span>{selectedPaymentExam} only · monthly manual renewal</span></div>
          <p>Early renewal extends this exam’s current expiry by one month. Other exams require separate payment.</p>
          <label>Email for your payment receipt<input type="email" autoComplete="email" maxLength={254} value={paymentEmail} onChange={(event) => setPaymentEmail(event.target.value)} placeholder="you@example.com" required /></label>
          {error && <p className="prep-error" role="alert">{error}</p>}
          {!paymentsReady && <p className="prep-payment-unavailable" role="status">Online payments are not available right now. Please contact the platform administrator.</p>}
          <div className="prep-renewal-actions"><button className="prep-button primary" type="submit" disabled={!paymentsReady || paymentBusy}>{paymentBusy ? 'Checking payment...' : `Pay ₦${monthlyFeesNaira[selectedPaymentExam].toLocaleString('en-NG')} for ${selectedPaymentExam}`}<span aria-hidden="true">→</span></button><button className="prep-button secondary" type="button" onClick={() => setShowRenewalForm(false)}>Cancel</button></div>
          {sessionStorage.getItem('timpriest-prep-payment-reference') && <button className="prep-button secondary" type="button" disabled={paymentBusy} onClick={() => void checkPaymentAgain()}>I have already paid · Check payment</button>}
        </form>}
        {page === 'history' ? (
          <section className="prep-history">
            <div className="prep-section-heading"><div><span className="prep-card-kicker">YOUR PROGRESS</span><h1>Practice history</h1><p>Review your recent practice results.</p></div></div>
            {attempts.length === 0 ? <div className="prep-empty"><strong>No practice results yet</strong><p>Complete a practice session and your score will appear here.</p><button className="prep-button primary" type="button" onClick={() => setPage('practice')}>Start practicing</button></div> : (
              <div className="prep-history-list">{attempts.map((attempt) => <article key={attempt.id}><div><strong>{attempt.exam} · {attempt.subject}</strong><span>{new Date(attempt.createdAt).toLocaleString()}</span></div><b>{attempt.score}/{attempt.total}<small> ({Math.round((attempt.score / Math.max(1, attempt.total)) * 100)}%)</small></b></article>)}</div>
            )}
          </section>
        ) : result ? (
          <section className="prep-results">
            <div className="prep-result-hero">
              <span className="prep-card-kicker">PRACTICE COMPLETE · {result.exam} · {result.subject}</span>
              <h1>{result.score}<small> / {result.total}</small></h1>
              <p>{scorePercent}% correct. Review the answers and explanations below to guide your next study session.</p>
              <button className="prep-button primary" type="button" onClick={() => { setResult(null); setPage('practice'); setError('') }}>Practice another subject</button>
            </div>
            <div className="prep-review-list">{result.review.map((item, index) => (
              <article key={item.id} className={item.selected === item.answer ? 'correct' : 'incorrect'}>
                <div className="prep-review-heading"><strong>Question {index + 1}</strong><span>{item.selected === item.answer ? 'Correct' : 'Review this answer'}</span></div>
                <div className="prep-review-question"><QuestionContent content={item.text} /></div>
                <p><b>Your answer:</b> {item.selected === null ? 'Not answered' : `${String.fromCharCode(65 + item.selected)}. ${item.options[item.selected]}`}</p>
                <p><b>Correct answer:</b> {String.fromCharCode(65 + item.answer)}. {item.options[item.answer]}</p>
                {item.explanation && <p className="prep-explanation"><b>Explanation:</b> {item.explanation}</p>}
              </article>
            ))}</div>
          </section>
        ) : (
          <>
            <div className="prep-practice-heading">
              <div>
                <span className="prep-kicker"><i /> PRACTICE ROOM</span>
                <h1>Ready for a practice session, {user.name.split(' ')[0]}?</h1>
                <p>Choose an exam and subject. Your next question is just a few steps away.</p>
              </div>
              <div className="prep-practice-summary"><strong>{attempts.length}</strong><span>practice sessions</span></div>
            </div>
            {error && <p className="prep-error" role="alert">{error}</p>}
            <div className="prep-practice-layout">
              <section className="prep-start-card prep-practice-card">
                <div className="prep-section-heading"><div><span className="prep-card-kicker">1 · CHOOSE YOUR EXAM</span><h2>What are you preparing for?</h2></div></div>
                <div className="prep-exam-selector" aria-label="Choose an examination">
                  {activeExams.map((item) => {
                    const count = catalog.find((entry) => entry.exam === item)?.subjects.reduce((total, entry) => total + entry.questions, 0) || 0
                    return <button key={item} type="button" className={exam === item ? 'active' : ''} aria-pressed={exam === item} onClick={() => { setExam(item); setSubject(''); setSelectedYear('all'); setError('') }}><strong>{item}</strong><span>{count.toLocaleString()} {count === 1 ? 'question' : 'questions'}</span></button>
                  })}
                </div>
                <div className="prep-settings-grid">
                  <label>2 · Subject<select value={subject} onChange={(event) => { setSubject(event.target.value); setSelectedYear('all') }} required>
                    <option value="">Select a subject</option>
                    {subjects.map((item) => <option key={item.subject} value={item.subject}>{item.subject} ({item.questions} questions)</option>)}
                  </select></label>
                  <label>3 · Question year<select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} disabled={!subjectEntry}>
                    <option value="all">All available years ({subjectEntry?.questions || 0})</option>
                    {[...availableYears].sort((first, second) => (second.year ?? 0) - (first.year ?? 0)).map((item) => <option key={item.year ?? 'unspecified'} value={item.year === null ? 'unspecified' : String(item.year)}>{item.year ?? 'Year not specified'} ({item.questions})</option>)}
                  </select></label>
                  <label>4 · Questions<select value={Math.min(questionCount, availableCount || questionCount)} onChange={(event) => setQuestionCount(Number(event.target.value))} disabled={!availableCount}>
                    {Array.from(new Set([...QUESTION_COUNTS.filter((count) => count <= availableCount), availableCount].filter((count) => count > 0))).sort((a, b) => a - b).map((count) => <option key={count} value={count}>{count} questions</option>)}
                  </select></label>
                </div>
                <div className="prep-duration">
                  <span>5 · Time limit</span>
                  <div className="prep-duration-options" role="group" aria-label="Choose time limit">
                    {[10, 20, 30, 45, 60].map((minutes) => <button key={minutes} type="button" className={durationMinutes === minutes ? 'active' : ''} aria-pressed={durationMinutes === minutes} onClick={() => setDurationMinutes(minutes)}>{minutes} min</button>)}
                  </div>
                </div>
                {!examHasAccess
                  ? <p className="prep-bank-note">Buy {exam} access for ₦{monthlyFeesNaira[exam].toLocaleString('en-NG')} per month. Each exam is paid separately.</p>
                  : examQuestionCount === 0 && <p className="prep-bank-note">There are no {exam} questions available yet. The platform owner can add a question bank through Creator → Prep Questions.</p>}
                {!examHasAccess
                  ? <button className="prep-button primary prep-start-button" type="button" onClick={() => { setSelectedPaymentExam(exam); setShowRenewalForm(true); setError('') }}>Get {exam} access · ₦{monthlyFeesNaira[exam].toLocaleString('en-NG')}/month<span aria-hidden="true">→</span></button>
                  : <button className="prep-button primary prep-start-button" type="button" disabled={!subject || !availableCount || busy} onClick={() => void startPractice()}>{busy ? 'Preparing questions...' : 'Start practice'}<span aria-hidden="true">→</span></button>}
              </section>
              <aside className="prep-practice-side">
                <section className="prep-recent">
                  <div className="prep-section-heading"><div><span className="prep-card-kicker">YOUR PRACTICE</span><h2>Recent sessions</h2></div><button type="button" onClick={() => setPage('history')}>View all →</button></div>
                  {attempts.length === 0 ? <p className="prep-recent-empty">Your completed practice sessions will appear here.</p> : <div className="prep-history-list">{attempts.slice(0, 4).map((attempt) => <article key={attempt.id}><div><strong>{attempt.exam} · {attempt.subject}</strong><span>{new Date(attempt.createdAt).toLocaleDateString()}</span></div><b>{attempt.score}/{attempt.total}</b></article>)}</div>}
                </section>
                <p className="prep-practice-tip"><span aria-hidden="true">✦</span><span><strong>Make each session count</strong>Review your answers after practice to spot what to work on next.</span></p>
              </aside>
            </div>
          </>
        )}
      </section>
      <footer className="prep-work-footer">TIMPRIEST EDU · Exam Preparation</footer>
    </main>
  )
}
