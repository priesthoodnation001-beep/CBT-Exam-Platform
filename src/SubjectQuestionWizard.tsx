import { useState } from 'react'
import QuestionPrintButton from './QuestionPrintButton'
import { API_BASE } from './apiBase'

type Exam = { id: string; subject: string }
type Question = { id: string; subject: string; text: string; options: string[]; answer?: number }
type DraftQuestion = { subject: string; text: string; options: string[]; answer: number; examId?: string }
type Props = { questions: Question[]; exams: Exam[]; token: string | null; refresh: () => Promise<void>; showNotice: (message: string) => void }

const emptyForm = { text: '', options: ['', '', '', ''], answer: 0 }

async function saveQuestion(token: string | null, question: DraftQuestion) {
  const response = await fetch(`${API_BASE}/api/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(question) })
  if (!response.ok) { const error = await response.json().catch(() => ({ error: 'Could not save question.' })); throw new Error(error.error) }
}

export default function SubjectQuestionWizard({ questions, exams, token, refresh, showNotice }: Props) {
  const [subject, setSubject] = useState('')
  const [duration, setDuration] = useState(30)
  const [draft, setDraft] = useState<DraftQuestion[]>([])
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const subjectName = subject.trim()
  const knownSubjects = Array.from(new Set([...exams.map((exam) => exam.subject), ...questions.map((question) => question.subject)]))
  const examFor = (name: string) => exams.find((exam) => exam.subject.toLowerCase() === name.toLowerCase())?.id
  const updateOption = (index: number, value: string) => setForm({ ...form, options: form.options.map((option, optionIndex) => optionIndex === index ? value : option) })

  const makeQuestion = (): DraftQuestion | null => {
    if (!subjectName || !form.text.trim() || form.options.some((option) => !option.trim())) { showNotice('Enter the subject name, the question, and all four options first.'); return null }
    return { subject: subjectName, text: form.text.trim(), options: form.options.map((option) => option.trim()), answer: form.answer, examId: examFor(subjectName) }
  }
  const saveDraft = () => { const question = makeQuestion(); if (!question) return false; setDraft(draft.length > step ? draft.map((item, index) => index === step ? question : item) : [...draft, question]); return true }
  const nextStep = () => { if (!saveDraft()) return; const nextIndex = step + 1; setStep(nextIndex); const item = draft[nextIndex]; setForm(item ? { text: item.text, options: item.options, answer: item.answer } : emptyForm) }
  const previousStep = () => { if (step === 0) return; const previous = draft[step - 1]; setStep(step - 1); setForm({ text: previous.text, options: previous.options, answer: previous.answer }) }

  const submitSubject = async () => {
    const current = makeQuestion(); if (!current) return
    if (duration < 1 || duration > 30) { showNotice('Subject time must be between 1 and 30 minutes.'); return }
    const merged = draft.length > step ? draft.map((item, index) => index === step ? current : item) : [...draft, current]
    const finalDraft = merged.map((item) => ({ ...item, subject: subjectName, examId: examFor(subjectName) }))
    try {
      const setting = await fetch(`${API_BASE}/api/subjects`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ subject: subjectName, duration }) })
      if (!setting.ok) { const error = await setting.json().catch(() => ({ error: 'Could not save subject time.' })); throw new Error(error.error) }
      for (const question of finalDraft) await saveQuestion(token, question)
      setDraft([]); setStep(0); setSubject(''); setDuration(30); setForm(emptyForm); await refresh(); showNotice(`${subjectName} submitted for Admin approval.`)
    } catch (error) { showNotice(error instanceof Error ? error.message : 'Could not submit questions.') }
  }

  return (
    <>
      <div className="section-heading">
        <div><p className="eyebrow">Teacher workspace</p><h2>Set questions by subject</h2></div>
        <QuestionPrintButton questions={questions} />
      </div>
      <div className="wizard-layout">
        <div className="form-panel question-wizard">
          <div className="wizard-progress"><span>Question {step + 1}</span><span>{draft.length} saved in this set</span></div>
          <label>Subject name
            <input list="known-subjects" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Enter subject name" />
          </label>
          <datalist id="known-subjects">{knownSubjects.map((item) => <option key={item} value={item} />)}</datalist>
          <label>Time for this subject (maximum 30 minutes)<input type="number" min="1" max="30" value={duration} onChange={(event) => setDuration(Math.min(30, Math.max(1, Number(event.target.value))))} /></label>
          <label>Question text<textarea value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder="Write the question here..." /></label>
          <div className="option-grid">
            {form.options.map((option, index) => <label key={index}>Option {String.fromCharCode(65 + index)}<input value={option} onChange={(event) => updateOption(index, event.target.value)} /></label>)}
          </div>
          <label>Correct answer
            <select value={form.answer} onChange={(event) => setForm({ ...form, answer: Number(event.target.value) })}>
              {form.options.map((_, index) => <option value={index} key={index}>Option {String.fromCharCode(65 + index)}</option>)}
            </select>
          </label>
          <div className="wizard-actions">
            <button className="secondary-button" type="button" onClick={previousStep} disabled={step === 0}>← Previous</button>
            <button className="secondary-button" type="button" onClick={nextStep}>Next →</button>
            <button className="primary-button" type="button" onClick={submitSubject}>Submit subject</button>
          </div>
        </div>
        <div className="panel wizard-help">
          <p className="eyebrow">How it works</p>
          <h3>Build one subject at a time.</h3>
          <p>Type the subject name and set a time from 1 to 30 minutes. Next saves the current question, Previous lets you revise it, and Submit sends the complete subject to the Admin for approval.</p>
          <div className="wizard-count">{questions.filter((question) => question.subject.toLowerCase() === subjectName.toLowerCase()).length}<small>approved or pending questions in this subject</small></div>
        </div>
      </div>
    </>
  )
}
