import { useEffect, useState } from 'react'
import ImportQuestions from './ImportQuestions'
import type { ImportedQuestion } from './questionImport'
import './import.css'
import QuestionPrintButton from './QuestionPrintButton'
import { API_BASE } from './apiBase'

type Exam = { id: string; subject: string }
type Question = { id: string; subject: string; text: string; options: string[]; answer?: number }
type DraftQuestion = { subject: string; text: string; options: string[]; answer: number; examId?: string }
type SavedDraft = { id: string; subject: string; duration: number; questions: { text: string; options: string[]; answer: number }[]; updatedAt: string }
type Props = { questions: Question[]; exams: Exam[]; token: string | null; refresh: () => Promise<void>; showNotice: (message: string) => void; aiReady?: boolean; aiRemaining?: number }

const emptyForm = { text: '', options: ['', '', '', ''], answer: 0 }

async function saveQuestion(token: string | null, question: DraftQuestion) {
  const response = await fetch(`${API_BASE}/api/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(question) })
  if (!response.ok) { const error = await response.json().catch(() => ({ error: 'Could not save question.' })); throw new Error(error.error) }
}

export default function SubjectQuestionWizard({ questions, exams, token, refresh, showNotice, aiReady, aiRemaining }: Props) {
  const [subject, setSubject] = useState('')
  const [duration, setDuration] = useState(30)
  const [draft, setDraft] = useState<DraftQuestion[]>([])
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(emptyForm)
  const [aiTopic, setAiTopic] = useState('')
  const [aiLevel, setAiLevel] = useState('')
  const [aiCount, setAiCount] = useState(5)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiLeft, setAiLeft] = useState<number | null>(null)
  const remaining = aiLeft ?? aiRemaining ?? 0
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([])
  const [savingDraft, setSavingDraft] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const loadDrafts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/drafts`, { headers: authHeaders, cache: 'no-store' })
      if (response.ok) setSavedDrafts((await response.json()).drafts)
    } catch { /* drafts show up again next time */ }
  }
  useEffect(() => { void loadDrafts() }, []) // eslint-disable-line react-hooks/exhaustive-deps
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

  // Save the work so far (even unfinished questions) and carry on another day. Nothing is sent to the Admin yet.
  const saveForLater = async () => {
    if (!subjectName) { showNotice('Enter the subject name first.'); return }
    const saved = draft.map((item) => ({ text: item.text, options: item.options, answer: item.answer }))
    const onScreen = { text: form.text, options: form.options, answer: form.answer }
    const hasCurrent = Boolean(form.text.trim() || form.options.some((option) => option.trim()))
    const list = hasCurrent ? (draft.length > step ? saved.map((item, index) => index === step ? onScreen : item) : [...saved, onScreen]) : saved
    if (!list.length) { showNotice('Write at least one question before saving.'); return }
    setSavingDraft(true)
    try {
      const response = await fetch(`${API_BASE}/api/drafts`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ subject: subjectName, duration, questions: list }) })
      const body = await response.json().catch(() => ({ error: 'Could not save the draft.' }))
      if (!response.ok) { showNotice(body.error || 'Could not save the draft.'); return }
      await loadDrafts()
      showNotice(`Draft saved with ${list.length} question${list.length === 1 ? '' : 's'}. You can carry on later.`)
    } catch { showNotice('Could not save the draft. Check your connection and try again.') } finally { setSavingDraft(false) }
  }

  const continueDraft = (saved: SavedDraft) => {
    if ((draft.length > 0 || form.text.trim()) && !window.confirm('Replace what is on screen with this saved draft? Save your current work first if you want to keep it.')) return
    const items: DraftQuestion[] = saved.questions.map((item) => ({ subject: saved.subject, text: item.text, options: item.options, answer: item.answer, examId: examFor(saved.subject) }))
    const last = items.length - 1
    setSubject(saved.subject); setDuration(saved.duration); setDraft(items); setStep(last)
    setForm({ text: items[last].text, options: items[last].options, answer: items[last].answer })
    showNotice(`Draft "${saved.subject}" opened with ${items.length} question${items.length === 1 ? '' : 's'}. Use Previous to go back through them.`)
  }

  const deleteDraft = async (saved: SavedDraft) => {
    if (!window.confirm(`Delete the saved draft for ${saved.subject}? This cannot be undone.`)) return
    try { await fetch(`${API_BASE}/api/drafts/${saved.id}`, { method: 'DELETE', headers: authHeaders }); await loadDrafts(); showNotice('Draft deleted.') } catch { showNotice('Could not delete the draft.') }
  }

  // Questions brought in from a file or pasted text join the draft, ready for the teacher to check before submitting.
  const addImported = (items: ImportedQuestion[]) => {
    let base = draft
    if (form.text.trim()) {
      const current = makeQuestion(); if (!current) { setImportOpen(false); return }
      base = draft.length > step ? draft.map((item, index) => index === step ? current : item) : [...draft, current]
    }
    const added: DraftQuestion[] = items.map((item) => ({ subject: subjectName, text: item.text, options: item.options, answer: item.answer, examId: examFor(subjectName) }))
    const merged = [...base, ...added]
    const first = merged[base.length]
    setDraft(merged); setStep(base.length); setForm({ text: first.text, options: first.options, answer: first.answer })
    setImportOpen(false)
    showNotice(`${added.length} question${added.length === 1 ? '' : 's'} imported. Use Next to check them, then Submit.`)
  }

  const generateWithAi = async () => {
    if (!subjectName || !aiTopic.trim()) { showNotice('Enter the subject name and a topic for the AI first.'); return }
    // keep whatever the teacher is currently typing
    let base = draft
    if (form.text.trim()) {
      const current = makeQuestion(); if (!current) return
      base = draft.length > step ? draft.map((item, index) => index === step ? current : item) : [...draft, current]
    }
    setAiBusy(true)
    try {
      const response = await fetch(`${API_BASE}/api/ai/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ subject: subjectName, topic: aiTopic.trim(), level: aiLevel.trim(), count: aiCount }) })
      const body = await response.json().catch(() => ({ error: 'Could not generate questions.' }))
      if (!response.ok) { showNotice(body.error || 'Could not generate questions.'); return }
      const generated: DraftQuestion[] = body.questions.map((item: { text: string; options: string[]; answer: number }) => ({ subject: subjectName, text: item.text, options: item.options, answer: item.answer, examId: examFor(subjectName) }))
      const merged = [...base, ...generated]
      const first = merged[base.length]
      setDraft(merged); setStep(base.length); setForm({ text: first.text, options: first.options, answer: first.answer })
      if (typeof body.remaining === 'number') setAiLeft(body.remaining)
      showNotice(`${generated.length} AI questions added. Use Next to read and check each one before you submit.`)
    } catch { showNotice('Could not reach the AI helper. Check your connection.') } finally { setAiBusy(false) }
  }

  const submitSubject = async () => {
    const current = makeQuestion(); if (!current) return
    if (duration < 1 || duration > 30) { showNotice('Subject time must be between 1 and 30 minutes.'); return }
    const merged = draft.length > step ? draft.map((item, index) => index === step ? current : item) : [...draft, current]
    const unfinished = merged.findIndex((item) => !item.text.trim() || item.options.some((option) => !option.trim()))
    if (unfinished !== -1) { setDraft(merged); setStep(unfinished); setForm({ text: merged[unfinished].text, options: merged[unfinished].options, answer: merged[unfinished].answer }); showNotice(`Question ${unfinished + 1} is not finished. Complete it before you submit.`); return }
    const finalDraft = merged.map((item) => ({ ...item, subject: subjectName, examId: examFor(subjectName) }))
    try {
      const setting = await fetch(`${API_BASE}/api/subjects`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ subject: subjectName, duration }) })
      if (!setting.ok) { const error = await setting.json().catch(() => ({ error: 'Could not save subject time.' })); throw new Error(error.error) }
      for (const question of finalDraft) await saveQuestion(token, question)
      const finished = savedDrafts.find((item) => item.subject.toLowerCase() === subjectName.toLowerCase())
      if (finished) await fetch(`${API_BASE}/api/drafts/${finished.id}`, { method: 'DELETE', headers: authHeaders }).catch(() => undefined)
      setDraft([]); setStep(0); setSubject(''); setDuration(30); setForm(emptyForm); await refresh(); await loadDrafts(); showNotice(`${subjectName} submitted for Admin approval.`)
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
          {savedDrafts.length > 0 && (
            <div className="draft-box">
              <strong>Saved drafts</strong>
              <p>Unfinished work you saved earlier. Nothing here has been sent to the Admin yet.</p>
              {savedDrafts.map((saved) => (
                <div className="draft-row" key={saved.id}>
                  <span><b>{saved.subject}</b> · {saved.questions.length} question{saved.questions.length === 1 ? '' : 's'} · saved {new Date(saved.updatedAt).toLocaleString()}</span>
                  <button className="secondary-button" type="button" onClick={() => continueDraft(saved)}>Continue</button>
                  <button className="text-button" type="button" onClick={() => void deleteDraft(saved)}>Delete</button>
                </div>
              ))}
            </div>
          )}
          <div className="wizard-progress"><span>Question {step + 1}</span><span>{draft.length} saved in this set</span></div>
          <label>Subject name
            <input list="known-subjects" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Enter subject name" />
          </label>
          <datalist id="known-subjects">{knownSubjects.map((item) => <option key={item} value={item} />)}</datalist>
          <label>Time for this subject (maximum 30 minutes)<input type="number" min="1" max="30" value={duration} onChange={(event) => setDuration(Math.min(30, Math.max(1, Number(event.target.value))))} /></label>
          <div className="import-box">
            <div><strong>Already have your questions?</strong><p>Bring them in from Excel, Word or by pasting. No retyping.</p></div>
            <button className="primary-button" type="button" onClick={() => { if (!subjectName) { showNotice('Type the subject name first, then import your questions.'); return } setImportOpen(true) }}>Import questions</button>
          </div>
          {aiReady && (
            <div className="ai-box">
              <strong>✦ Write questions with AI</strong>
              <p>Enter the subject name above, then a topic. The AI writes draft questions for you to check and edit. Always read every question and its answer before you submit. {remaining} AI requests left today.</p>
              <label>Topic<input value={aiTopic} onChange={(event) => setAiTopic(event.target.value)} placeholder="e.g. Fractions and decimals" /></label>
              <div className="ai-row">
                <label>Class level<input value={aiLevel} onChange={(event) => setAiLevel(event.target.value)} placeholder="e.g. JSS 2" /></label>
                <label>How many (1 to 10)<input type="number" min="1" max="10" value={aiCount} onChange={(event) => setAiCount(Math.min(10, Math.max(1, Number(event.target.value) || 1)))} /></label>
              </div>
              <button className="secondary-button" type="button" onClick={() => void generateWithAi()} disabled={aiBusy || remaining <= 0}>{aiBusy ? 'Writing questions...' : remaining <= 0 ? 'No AI requests left today' : 'Generate with AI'}</button>
            </div>
          )}
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
            <button className="secondary-button" type="button" onClick={() => void saveForLater()} disabled={savingDraft}>{savingDraft ? 'Saving...' : 'Save draft'}</button>
            <button className="primary-button" type="button" onClick={submitSubject}>Submit subject</button>
          </div>
        </div>
        <div className="panel wizard-help">
          <p className="eyebrow">How it works</p>
          <h3>Build one subject at a time.</h3>
          <p>Type the subject name and set a time from 1 to 30 minutes. Next saves the current question, Previous lets you revise it, Save draft keeps your work so you can finish another day, and Submit sends the complete subject to the Admin for approval.</p>
          <div className="wizard-count">{questions.filter((question) => question.subject.toLowerCase() === subjectName.toLowerCase()).length}<small>approved or pending questions in this subject</small></div>
        </div>
      </div>
      {importOpen && <ImportQuestions subject={subjectName} onClose={() => setImportOpen(false)} onAdd={addImported} />}
    </>
  )
}
