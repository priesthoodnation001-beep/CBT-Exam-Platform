import { useEffect, useState } from 'react'
import { API_BASE } from './apiBase'
import './prep-manager.css'

type Props = { token: string; exam: string; subject: string; onClose: () => void; onChanged: () => void; onMessage: (message: string) => void }
type YearCount = { year: number | null; questions: number }
type ManagedQuestion = { id: string; question: string; options: string[]; answer: number; explanation: string | null; year: number | null; image: string | null }
type Draft = { question: string; options: string[]; answer: number; explanation: string; year: string }

async function request<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/creator${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not process the question bank request.')
  return body as T
}

const yearKey = (year: number | null) => (year === null ? 'none' : String(year))
const yearLabel = (year: number | null) => (year === null ? 'No year' : String(year))
const diagramUrl = (name: string) => `${API_BASE}/api/prep/diagrams/${name}`

// Shrinks big photos before upload (long side 1400 px) so pictures stay small and quick for students.
async function prepareImage(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPG, WEBP or GIF picture.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the picture.')
  const keepsPng = file.type !== 'image/jpeg'
  if (!keepsPng) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height) }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, keepsPng ? 'image/png' : 'image/jpeg', 0.88))
  if (!blob) throw new Error('Could not prepare the picture.')
  if (blob.size > 4_000_000) throw new Error('This picture is too large. Please use a smaller one.')
  return blob
}

const plural = (count: number) => `${count.toLocaleString()} question${count === 1 ? '' : 's'}`

// Opens one exam subject (for example JAMB Economics) and shows its questions split by year.
export default function PrepQuestionManager({ token, exam, subject, onClose, onChanged, onMessage }: Props) {
  const [years, setYears] = useState<YearCount[] | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [questions, setQuestions] = useState<ManagedQuestion[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const scope = `exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`

  useEffect(() => {
    let active = true
    request<{ years: YearCount[] }>(`/prep/questions/years?${scope}`, token)
      .then((result) => { if (active) setYears(result.years) })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load the years.') })
    return () => { active = false }
  }, [scope, token])

  async function loadYears() {
    const result = await request<{ years: YearCount[] }>(`/prep/questions/years?${scope}`, token)
    setYears(result.years)
    return result.years
  }

  async function loadQuestions(key: string) {
    setLoadingList(true)
    try {
      const result = await request<{ questions: ManagedQuestion[] }>(`/prep/questions/list?${scope}&year=${key}`, token)
      setQuestions(result.questions)
    } finally {
      setLoadingList(false)
    }
  }

  // After any edit or delete: refresh the year counts, tell the parent, and reload the open year if it still exists.
  async function refresh(keepOpen: string | null) {
    const latest = await loadYears()
    onChanged()
    if (latest.length === 0) { onClose(); return }
    if (keepOpen && latest.some((item) => yearKey(item.year) === keepOpen)) {
      await loadQuestions(keepOpen)
    } else {
      setOpenKey(null)
      setQuestions([])
    }
  }

  function toggleYear(key: string) {
    setError('')
    setEditingId(null)
    setDraft(null)
    if (openKey === key) { setOpenKey(null); setQuestions([]); return }
    setOpenKey(key)
    setQuestions([])
    loadQuestions(key).catch((failure) => setError(failure instanceof Error ? failure.message : 'Could not load the questions.'))
  }

  function startEdit(item: ManagedQuestion) {
    setError('')
    setEditingId(item.id)
    setDraft({ question: item.question, options: [0, 1, 2, 3].map((index) => item.options[index] ?? ''), answer: item.answer, explanation: item.explanation ?? '', year: item.year === null ? '' : String(item.year) })
  }

  async function saveEdit(item: ManagedQuestion) {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      await request<unknown>(`/prep/questions/${item.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ question: draft.question, options: draft.options, answer: draft.answer, explanation: draft.explanation, year: draft.year.trim() ? Number(draft.year) : null }),
      })
      setEditingId(null)
      setDraft(null)
      onMessage('Question saved.')
      await refresh(openKey)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the question.')
    } finally {
      setBusy(false)
    }
  }

  async function uploadDiagram(item: ManagedQuestion, file?: File) {
    if (!file) return
    setUploadingId(item.id)
    setError('')
    try {
      const blob = await prepareImage(file)
      const response = await fetch(`${API_BASE}/api/creator/prep/questions/${item.id}/diagram`, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type, Authorization: `Bearer ${token}` },
        body: blob,
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Could not save the picture.')
      setQuestions((current) => current.map((q) => (q.id === item.id ? { ...q, image: String(body.image) } : q)))
      onMessage('Diagram saved.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the picture.')
    } finally {
      setUploadingId(null)
    }
  }

  async function removeDiagram(item: ManagedQuestion) {
    if (!window.confirm('Remove the diagram from this question?')) return
    setUploadingId(item.id)
    setError('')
    try {
      await request<unknown>(`/prep/questions/${item.id}/diagram`, token, { method: 'DELETE' })
      setQuestions((current) => current.map((q) => (q.id === item.id ? { ...q, image: null } : q)))
      onMessage('Diagram removed.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not remove the picture.')
    } finally {
      setUploadingId(null)
    }
  }

  async function deleteQuestion(item: ManagedQuestion) {
    if (!window.confirm('Delete this question?\n\n' + item.question.slice(0, 160))) return
    setBusy(true)
    setError('')
    try {
      await request<unknown>(`/prep/questions/${item.id}`, token, { method: 'DELETE' })
      onMessage('Question deleted.')
      await refresh(openKey)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete the question.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteYear(item: YearCount) {
    if (!window.confirm(`Delete the whole ${yearLabel(item.year)} set of ${exam} ${subject}?\n\nThis removes all ${plural(item.questions)} from this year only. Other years are not touched.`)) return
    setBusy(true)
    setError('')
    try {
      await request<unknown>('/prep/questions/year', token, { method: 'DELETE', body: JSON.stringify({ exam, subject, year: item.year }) })
      onMessage(`${exam} ${subject} ${yearLabel(item.year)} deleted with ${plural(item.questions)}.`)
      await refresh(openKey === yearKey(item.year) ? null : openKey)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not delete the year.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pqm">
      <div className="pqm-head">
        <h3>{exam} {subject}: questions by year</h3>
        <button className="cx-btn" type="button" onClick={onClose}>Close</button>
      </div>
      {error && <p className="pqm-error" role="alert">{error}</p>}
      {years === null && !error && <p className="pqm-note">Loading years...</p>}
      {years !== null && years.length === 0 && <p className="pqm-note">No questions left in this subject.</p>}
      {years?.map((item) => {
        const key = yearKey(item.year)
        const isOpen = openKey === key
        return (
          <section className="pqm-year" key={key}>
            <div className="pqm-year-bar">
              <button type="button" className="pqm-year-toggle" aria-expanded={isOpen} onClick={() => toggleYear(key)}>
                <span>{isOpen ? '▾' : '▸'}</span><strong>{yearLabel(item.year)}</strong><small>{plural(item.questions)}</small>
              </button>
              <button className="cx-btn pqi-delete-button" type="button" disabled={busy} onClick={() => void deleteYear(item)}>Delete year</button>
            </div>
            {isOpen && (
              <div className="pqm-list">
                {loadingList && <p className="pqm-note">Loading questions...</p>}
                {questions.map((q, index) => (
                  <article className="pqm-question" key={q.id}>
                    {editingId === q.id && draft ? (
                      <div className="pqm-form">
                        <label>Question<textarea rows={3} value={draft.question} onChange={(event) => setDraft({ ...draft, question: event.target.value })} /></label>
                        {draft.options.map((option, optionIndex) => (
                          <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}<input value={option} onChange={(event) => setDraft({ ...draft, options: draft.options.map((value, position) => (position === optionIndex ? event.target.value : value)) })} /></label>
                        ))}
                        <label>Correct answer
                          <select value={draft.answer} onChange={(event) => setDraft({ ...draft, answer: Number(event.target.value) })}>
                            {[0, 1, 2, 3].map((value) => <option key={value} value={value}>{String.fromCharCode(65 + value)}</option>)}
                          </select>
                        </label>
                        <label>Explanation (optional)<textarea rows={2} value={draft.explanation} onChange={(event) => setDraft({ ...draft, explanation: event.target.value })} /></label>
                        <label>Year<input type="number" min="1950" max={new Date().getFullYear() + 1} value={draft.year} onChange={(event) => setDraft({ ...draft, year: event.target.value })} placeholder="e.g. 2015" /></label>
                        <div className="pqm-actions">
                          <button className="cx-btn" type="button" disabled={busy} onClick={() => void saveEdit(q)}>{busy ? 'Saving...' : 'Save'}</button>
                          <button className="cx-btn" type="button" disabled={busy} onClick={() => { setEditingId(null); setDraft(null) }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="pqm-text"><b>{index + 1}.</b> {q.question}</p>
                        {q.image && <img className="pqm-diagram" src={diagramUrl(q.image)} alt="Diagram for this question" loading="lazy" />}
                        <ol className="pqm-options" type="A">
                          {q.options.map((option, optionIndex) => <li key={optionIndex} className={optionIndex === q.answer ? 'pqm-correct' : ''}>{option}</li>)}
                        </ol>
                        {q.explanation && <p className="pqm-explain">{q.explanation}</p>}
                        <div className="pqm-actions">
                          <button className="cx-btn" type="button" disabled={busy || uploadingId !== null} onClick={() => startEdit(q)}>Edit</button>
                          <label className="cx-btn pqm-file">{uploadingId === q.id ? 'Saving...' : q.image ? 'Change diagram' : 'Add diagram'}
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={busy || uploadingId !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void uploadDiagram(q, file) }} />
                          </label>
                          {q.image && <button className="cx-btn" type="button" disabled={busy || uploadingId !== null} onClick={() => void removeDiagram(q)}>Remove diagram</button>}
                          <button className="cx-btn pqi-delete-button" type="button" disabled={busy} onClick={() => void deleteQuestion(q)}>Delete</button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
