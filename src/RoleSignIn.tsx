import { useState } from 'react'
import type { FormEvent } from 'react'
import './signin.css'

export type SignInRole = 'Admin' | 'Teacher' | 'Student'

type Biometric = { available: boolean; saved: boolean; enable: boolean; setEnable: (value: boolean) => void; loading: boolean; onSignIn: () => void }

const ICONS = {
  Student: 'M2 9l10-5 10 5-10 5-10-5z M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5',
  Teacher: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5z M4 19a2 2 0 0 1 2-2h12 M9 7h6 M9 11h4',
  Admin: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z M9 12l2.2 2.2L15.5 10',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  finger: 'M12 11v4 M8 15v-4a4 4 0 0 1 8 0 M5 15v-4a7 7 0 0 1 14 0v3 M9 20c0-2 .5-3 .5-5 M14.5 20c.5-1.5.5-3 .5-5'
}

function Icon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
}

const COPY: Record<SignInRole, { eyebrow: string; headline: string; lead: string; points: string[]; title: string; sub: string; button: string }> = {
  Student: {
    eyebrow: 'Student portal',
    headline: 'Ready for your exam?',
    lead: 'Sign in with your Student ID and the exam your teacher scheduled will be waiting for you.',
    points: ['Keep this window open until you finish', 'Answer every question, then submit', 'Logging out also submits your exam'],
    title: 'Student sign-in',
    sub: 'Type your Student ID to continue. You do not need a password.',
    button: 'Start'
  },
  Teacher: {
    eyebrow: 'Teacher workspace',
    headline: 'Build better exams, faster.',
    lead: 'Write your subject questions, save them as drafts, and send them to the Admin when they are ready.',
    points: ['Save a draft and finish another day', 'Let the AI helper suggest questions to check', 'Send finished subjects for approval'],
    title: 'Teacher sign-in',
    sub: 'Use the username and password your school admin gave you.',
    button: 'Sign in'
  },
  Admin: {
    eyebrow: 'Administrator console',
    headline: 'Run every exam with confidence.',
    lead: 'Manage your people, schedule exams for each class, approve questions and publish results.',
    points: ['Create teacher and student accounts', 'Schedule exams for each class', 'Approve questions and read results', 'Buy credits and keep everything in sync'],
    title: 'Admin sign-in',
    sub: 'Sign in with your administrator username and password.',
    button: 'Sign in'
  }
}

const DETAIL: Record<SignInRole, string> = {
  Student: 'Take your exam',
  Teacher: 'Set questions',
  Admin: 'Manage the school'
}

function Art({ role, schoolName }: { role: SignInRole; schoolName?: string }) {
  const copy = COPY[role]
  return (
    <div className="si-art">
      <div className="si-brand"><img src="/logo.svg" alt="" /><span>TIMPRIEST EDU</span></div>
      <div className="si-art-body">
        <div className="si-art-icon"><Icon name={role} size={34} /></div>
        <p className="si-eyebrow">{schoolName ? `${schoolName} · ${copy.eyebrow}` : copy.eyebrow}</p>
        <h1>{copy.headline}</h1>
        <p className="si-lead">{copy.lead}</p>
        <ul className="si-points">{copy.points.map((point) => <li key={point}><Icon name="check" size={18} />{point}</li>)}</ul>
      </div>
      <div className="si-art-foot">Secure · Separate data for every school</div>
      <span className="si-orb one" /><span className="si-orb two" />
    </div>
  )
}

// The page a school link opens: choose how to sign in.
export function RoleChooser({ schoolName, schoolError, onChoose }: { schoolName?: string; schoolError: string; onChoose: (role: SignInRole) => void }) {
  return (
    <div className="si si-chooser">
      <div className="si-brand center"><img src="/logo.svg" alt="" /><span>TIMPRIEST EDU</span></div>
      <div className="si-chooser-box">
        <p className="si-eyebrow dark">{schoolName || 'Welcome'}</p>
        <h2>How would you like to sign in?</h2>
        {schoolError ? <p className="si-error">{schoolError}</p> : <p className="si-sub">Choose the page that fits you.</p>}
        <div className="si-cards">
          {(['Student', 'Teacher', 'Admin'] as SignInRole[]).map((role) => (
            <button key={role} type="button" className={`si-card ${role.toLowerCase()}`} onClick={() => onChoose(role)} disabled={Boolean(schoolError)}>
              <span className="si-card-icon"><Icon name={role} size={28} /></span>
              <strong>{role}</strong>
              <small>{DETAIL[role]}</small>
              <span className="si-card-go">Sign in <Icon name="arrow" size={16} /></span>
            </button>
          ))}
        </div>
      </div>
      <p className="si-copy">TIMPRIEST EDU · CBT Suite</p>
    </div>
  )
}

type SignInProps = {
  role: SignInRole
  schoolName?: string
  needSchool: boolean
  schoolError: string
  loading: boolean
  error: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSwitchRole: (role: SignInRole) => void
  onSchoolLink: (slug: string) => void
  biometric?: Biometric
}

// One page per role, each with its own look.
export function RoleSignIn({ role, schoolName, needSchool, schoolError, loading, error, onSubmit, onSwitchRole, onSchoolLink, biometric }: SignInProps) {
  const copy = COPY[role]
  const [link, setLink] = useState('')
  const others = (['Student', 'Teacher', 'Admin'] as SignInRole[]).filter((item) => item !== role)

  return (
    <div className={`si si-split si-${role.toLowerCase()}`}>
      <Art role={role} schoolName={schoolName} />
      <div className="si-panel">
        <div className="si-box">
          <p className="si-eyebrow dark">{schoolName || 'Welcome back'}</p>
          <h2>{copy.title}</h2>
          {schoolError ? <p className="si-error">{schoolError}</p> : needSchool ? (
            <form onSubmit={(event) => { event.preventDefault(); onSchoolLink(link) }}>
              <p className="si-sub">Students sign in through their own school. Type the link name your school gave you.</p>
              <label>School link name<input value={link} onChange={(event) => setLink(event.target.value)} placeholder="e.g. his-grace-ikirun-osun-ltd" required /></label>
              <button className="si-button" type="submit">Continue <Icon name="arrow" size={18} /></button>
            </form>
          ) : (
            <>
              <p className="si-sub">{copy.sub}</p>
              <form onSubmit={onSubmit}>
                <label>{role === 'Student' ? 'Student ID' : 'Username'}<input name="identifier" placeholder={role === 'Student' ? 'e.g. STUDENT-001' : `Your ${role.toLowerCase()} username`} autoComplete="username" autoFocus required /></label>
                {role !== 'Student' && <label>Password<input name="password" type="password" placeholder="Your password" autoComplete="current-password" required /></label>}
                {biometric?.available && !biometric.saved && <label className="si-check"><input type="checkbox" checked={biometric.enable} onChange={(event) => biometric.setEnable(event.target.checked)} />Enable fingerprint sign-in on this device</label>}
                {error && <p className="si-error">{error}</p>}
                <button className="si-button" type="submit" disabled={loading}>{loading ? 'Signing in...' : copy.button} <Icon name="arrow" size={18} /></button>
              </form>
              {biometric?.available && biometric.saved && <button className="si-ghost" type="button" onClick={biometric.onSignIn} disabled={biometric.loading}><Icon name="finger" size={18} />{biometric.loading ? 'Waiting for fingerprint...' : 'Sign in with fingerprint'}</button>}
            </>
          )}
          <div className="si-switch">
            <span>Not {role === 'Admin' ? 'an admin' : `a ${role.toLowerCase()}`}?</span>
            {others.map((other) => <button key={other} type="button" onClick={() => onSwitchRole(other)}>{other} sign-in</button>)}
          </div>
        </div>
        <p className="si-copy">TIMPRIEST EDU · CBT Suite</p>
      </div>
    </div>
  )
}
