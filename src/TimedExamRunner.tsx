import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import QuestionContent from './QuestionContent'
import './exam-runner.css'

// The screen a student writes the exam on. It shows when the exam started, when it ends, and the time left.
// When the time runs out, the exam is submitted automatically with the answers chosen so far.

type RunnerQuestion = { id: string; text: string; options: string[] }
type RunnerExam = { title: string; subject: string; duration: number; subject_duration?: number }

type Props = {
  exam: RunnerExam
  questions: RunnerQuestion[]
  selectedAnswers: Record<string, number>
  setSelectedAnswers: Dispatch<SetStateAction<Record<string, number>>>
  submitted: boolean
  submit: () => void
  exit: () => void
  startedAt: number
  onTimeUp: () => Promise<boolean>
}

const LETTERS = ['A', 'B', 'C', 'D']

// "09:32 AM"
export function clockTime(ms: number): string {
  const date = new Date(ms)
  const hours = date.getHours()
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

// "32:10", or "1:05:00" for long exams
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function TimedExamRunner({ exam, questions, selectedAnswers, setSelectedAnswers, submitted, submit, exit, startedAt, onTimeUp }: Props) {
  // the time allowed: the time set for this subject, or the exam's own length if none was set
  const minutes = exam.subject_duration && exam.subject_duration > 0 ? exam.subject_duration : exam.duration
  const [started] = useState(() => startedAt || Date.now())
  const endsAt = started + minutes * 60000
  const [now, setNow] = useState(() => Date.now())
  const [current, setCurrent] = useState(0)
  const [timeUp, setTimeUp] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const latest = useRef(onTimeUp)
  latest.current = onTimeUp

  // the clock follows the real time, so closing the lid or switching windows does not give extra minutes
  useEffect(() => {
    if (submitted) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [submitted])

  const remaining = Math.max(0, endsAt - now)
  useEffect(() => { if (!submitted && remaining <= 0) setTimeUp(true) }, [remaining, submitted])

  // time is up: submit by itself, and keep trying every few seconds if the connection is down
  useEffect(() => {
    if (!timeUp || submitted) return
    let stopped = false
    const run = async () => {
      while (!stopped) {
        let sent = false
        try { sent = await latest.current() } catch { sent = false }
        if (sent || stopped) return
        setWaiting(true)
        await new Promise((resolve) => window.setTimeout(resolve, 5000))
      }
    }
    void run()
    return () => { stopped = true }
  }, [timeUp, submitted])

  // a warning if the student tries to close or refresh the page during the exam
  useEffect(() => {
    if (submitted) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [submitted])

  if (submitted) {
    return (
      <div className="ex ex-done">
        <div className="ex-done-card">
          <div className="ex-done-icon">✓</div>
          <h2>Your exam has been submitted</h2>
          <p>{timeUp ? 'Your time was up, so it was submitted automatically.' : 'Well done. Your answers have been sent to your teacher.'}</p>
          <p className="ex-done-note">You will be signed out in a few seconds.</p>
          <button className="ex-btn primary" type="button" onClick={exit}>Finish</button>
        </div>
      </div>
    )
  }

  const total = minutes * 60000
  const level = remaining <= Math.min(60000, total * 0.1) ? 'danger' : remaining <= Math.min(300000, total * 0.25) ? 'warn' : 'ok'
  const answered = questions.filter((question) => selectedAnswers[question.id] !== undefined).length
  const question = questions[current]

  return (
    <div className="ex">
      <header className={`ex-bar ex-${level}`}>
        <div className="ex-title"><strong>{exam.title}</strong><span>{exam.subject}</span></div>
        <div className="ex-times">
          <div><small>Started</small><b>{clockTime(started)}</b></div>
          <div><small>Ends</small><b>{clockTime(endsAt)}</b></div>
          <div><small>Time allowed</small><b>{minutes} min</b></div>
        </div>
        <div className="ex-clock" role="timer" aria-live="off"><small>Time left</small><strong>{countdown(remaining)}</strong></div>
        <div className="ex-progress" aria-hidden="true"><span style={{ width: `${Math.min(100, (remaining / total) * 100)}%` }} /></div>
      </header>

      {level !== 'ok' && !timeUp && <p className={`ex-alert ${level}`}>{level === 'danger' ? 'Less than a minute left. Your exam will be submitted automatically when the time ends.' : 'Time is running out. Check your answers.'}</p>}

      {!question ? (
        <div className="ex-card"><p>There are no questions for this exam yet.</p><button className="ex-btn" type="button" onClick={exit}>Go back</button></div>
      ) : (
        <div className="ex-layout">
          <section className="ex-card">
            <p className="ex-count">Question {current + 1} of {questions.length}</p>
            <div className="ex-question" role="heading" aria-level={2}><QuestionContent content={question.text} /></div>
            <div className="ex-options" role="radiogroup" aria-label="Choose one answer">
              {question.options.map((option, index) => (
                <button key={index} type="button" role="radio" aria-checked={selectedAnswers[question.id] === index} disabled={timeUp} className={`ex-option ${selectedAnswers[question.id] === index ? 'chosen' : ''}`} onClick={() => setSelectedAnswers((chosen) => ({ ...chosen, [question.id]: index }))}>
                  <span className="ex-letter">{LETTERS[index]}</span><span className="ex-option-content">{option}</span>
                </button>
              ))}
            </div>
            <div className="ex-nav">
              <button type="button" className="ex-btn" disabled={current === 0 || timeUp} onClick={() => setCurrent(current - 1)}>← Previous</button>
              {current < questions.length - 1
                ? <button type="button" className="ex-btn primary" disabled={timeUp} onClick={() => setCurrent(current + 1)}>Next →</button>
                : <button type="button" className="ex-btn gold" disabled={timeUp} onClick={submit}>Submit exam</button>}
            </div>
          </section>

          <aside className="ex-side">
            <p className="ex-count">{answered} of {questions.length} answered</p>
            <div className="ex-grid">
              {questions.map((item, index) => <button key={item.id} type="button" disabled={timeUp} className={`${index === current ? 'now' : ''} ${selectedAnswers[item.id] !== undefined ? 'done' : ''}`} onClick={() => setCurrent(index)} aria-label={`Question ${index + 1}${selectedAnswers[item.id] !== undefined ? ', answered' : ''}`}>{index + 1}</button>)}
            </div>
            <button type="button" className="ex-btn gold wide" disabled={timeUp} onClick={submit}>Submit exam</button>
            <p className="ex-hint">You can change an answer any time before the time ends or you submit.</p>
          </aside>
        </div>
      )}

      {timeUp && (
        <div className="ex-over" role="alertdialog" aria-live="assertive">
          <div className="ex-over-card">
            <div className="ex-spin" aria-hidden="true" />
            <h2>Time is up</h2>
            <p>{waiting ? 'We could not reach the school server yet. Please wait. Your answers are saved here and will be sent as soon as it is back. Do not close this window.' : 'Submitting your exam now...'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
