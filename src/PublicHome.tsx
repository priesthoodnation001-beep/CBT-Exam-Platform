import './journey-home.css'

type Props = { onSignIn: () => void; onRegister: () => void; onSms: () => void; onHome: () => void; journey?: 'home' | 'sms' }

function JourneyIcon({ kind }: { kind: 'exam' | 'school' }) {
  return kind === 'exam' ? (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="9" y="6" width="30" height="36" rx="7" stroke="currentColor" strokeWidth="2.5" />
      <path d="M17 17h14M17 24h4m5 0h5M17 32h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="m18 24 1.5 1.5L22 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="m5 18 19-11 19 11-19 11L5 18Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M13 23v10c6.2 5.4 15.8 5.4 22 0V23M42 19v13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="42" cy="35" r="2" fill="currentColor" />
    </svg>
  )
}

export default function PublicHome({ onSignIn, onRegister, onSms, onHome, journey = 'home' }: Props) {
  return (
    <div className="journey-home">
      <header className="journey-nav">
        <a className="journey-brand" href="/" aria-label="TIMPRIEST EDU home">
          <img src="/logo.svg" alt="" />
          <span>TIMPRIEST <b>EDU</b></span>
        </a>
        <button className="journey-nav-signin" type="button" onClick={onSignIn}>Sign in <span aria-hidden="true">↗</span></button>
      </header>

      {journey === 'sms' ? (
        <main className="journey-main journey-sms-main">
          <section className="journey-sms-message">
            <div className="journey-icon"><JourneyIcon kind="school" /></div>
            <span className="journey-state upcoming">COMING SOON</span>
            <p className="journey-card-label">02 / SCHOOL OPERATIONS</p>
            <h1>School Management<br /><em>System</em></h1>
            <p>We’re preparing a dedicated platform to support the wider work of running a school. It will join the TIMPRIEST EDU family soon.</p>
            <button className="journey-primary" type="button" onClick={onHome}>Back to platform choices <span aria-hidden="true">→</span></button>
          </section>
        </main>
      ) : <main className="journey-main">
        <section className="journey-intro">
          <span className="journey-kicker"><i /> ONE PLATFORM. TWO JOURNEYS.</span>
          <h1>Tools for every<br /><em>part of school life.</em></h1>
          <p>Choose where you want to go. Start with secure computer-based exams, or see what’s coming next for your school.</p>
        </section>

        <section className="journey-options" aria-label="Choose a TIMPRIEST EDU platform">
          <article className="journey-card journey-cbt">
            <div className="journey-card-top">
              <div className="journey-icon"><JourneyIcon kind="exam" /></div>
              <span className="journey-state available"><i /> AVAILABLE NOW</span>
            </div>
            <div className="journey-card-copy">
              <p className="journey-card-label">01 / ASSESSMENTS</p>
              <h2>CBT Examination<br />Platform</h2>
              <p>Schedule exams, manage question sets, and run secure computer-based tests for your school—even over a local network.</p>
            </div>
            <ul className="journey-features">
              <li><span>✓</span> Admin, teacher, and student portals</li>
              <li><span>✓</span> Exam scheduling and result management</li>
              <li><span>✓</span> Works offline on your school network</li>
            </ul>
            <div className="journey-card-actions">
              <button className="journey-primary" type="button" onClick={onSignIn}>Open CBT platform <span aria-hidden="true">→</span></button>
              <button className="journey-secondary" type="button" onClick={onRegister}>Register your school</button>
            </div>
          </article>

          <article className="journey-card journey-sms" aria-labelledby="sms-title">
            <div className="journey-card-top">
              <div className="journey-icon"><JourneyIcon kind="school" /></div>
              <span className="journey-state upcoming">COMING SOON</span>
            </div>
            <div className="journey-card-copy">
              <p className="journey-card-label">02 / SCHOOL OPERATIONS</p>
              <h2 id="sms-title">School Management<br />System</h2>
              <p>A dedicated space for the wider work of running a school. We’re preparing this journey for a future release.</p>
            </div>
            <ul className="journey-features">
              <li><span>◷</span> A home for everyday school operations</li>
              <li><span>◷</span> Designed to sit alongside the CBT platform</li>
              <li><span>◷</span> More details will be shared as it develops</li>
            </ul>
            <button className="journey-coming-note journey-coming-link" type="button" onClick={onSms}><span className="journey-coming-dot" /> Learn about the SMS journey <span aria-hidden="true">→</span></button>
          </article>
        </section>

        <footer className="journey-footer">
          <span>Good technology should make school life simpler.</span>
          <span className="journey-footer-brand">TIMPRIEST EDU <i /> BUILT FOR SCHOOLS</span>
        </footer>
      </main>}
    </div>
  )
}
