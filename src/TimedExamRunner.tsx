import { useEffect, useState } from 'react'

type Exam = { id: string; title: string; subject: string; duration: number; subject_duration: number; subject_approved: number }
type Question = { id: string; text: string; options: string[] }

type Props = { exam: Exam; questions: Question[]; selectedAnswers: Record<string, number>; setSelectedAnswers: (answers: Record<string, number>) => void; submitted: boolean; submit: () => void; exit: () => void }

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export default function TimedExamRunner({ exam, questions, selectedAnswers, setSelectedAnswers, submitted, submit, exit }: Props) {
  const limitSeconds = Math.min(30, Math.max(1, Number(exam.subject_duration) || 30)) * 60
  const [remaining, setRemaining] = useState(limitSeconds)

  useEffect(() => {
    if (submitted || remaining <= 0) return
    const timer = window.setInterval(() => setRemaining((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [submitted, remaining])

  useEffect(() => {
    if (!submitted && remaining === 0) submit()
  }, [remaining, submitted, submit])

  return <div className="runner">
    <div className="runner-head"><div><p className="eyebrow">Live examination</p><h2>{exam.title}</h2><p>{exam.subject} · {limitSeconds / 60} minute subject limit</p></div><div className={remaining <= 60 && !submitted ? 'countdown urgent' : 'countdown'}><small>TIME REMAINING</small><strong>{submitted ? 'DONE' : formatTime(remaining)}</strong></div></div>
    {submitted ? <div className="score-card"><span className="score-circle">✓</span><p className="eyebrow">Submission complete</p><h2>Your exam has been submitted.</h2><p>Your answers were saved to the centre database. The Admin will review and publish results.</p><button className="primary-button" onClick={exit}>Return to dashboard</button></div> : <><div className="exam-instructions">Answer each question before the countdown reaches zero. The exam submits automatically when time expires.</div><div className="runner-questions">{questions.map((question, index) => <article className="runner-question" key={question.id}><strong>{index + 1}. {question.text}</strong><div className="answer-options">{question.options.map((option, optionIndex) => <label className={selectedAnswers[question.id] === optionIndex ? 'answer selected' : 'answer'} key={option}><input type="radio" name={question.id} checked={selectedAnswers[question.id] === optionIndex} onChange={() => setSelectedAnswers({ ...selectedAnswers, [question.id]: optionIndex })} />{option}</label>)}</div></article>)}</div><button className="primary-button" onClick={submit}>Submit exam</button></>}
  </div>
}
