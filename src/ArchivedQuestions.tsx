import { useMemo, useState, type FormEvent } from 'react'
import { questionContentToHtml } from './question-content'
import QuestionContent from './QuestionContent'
import { STUDENT_SECTIONS } from './studentSections'

type Question = { id: string; examId?: string; subject: string; text: string; options: string[]; answer?: number; createdAt?: number }
type Exam = { id: string; title: string; subject: string }
type ScheduleDetails = { title: string; subject: string; date: string; time: string; duration: number; classSection: string; selectedQuestionIds: string[] }
type ArchiveGroup = { year: string; months: { key: string; label: string; days: { key: string; label: string; subjects: { subject: string; questions: Question[] }[] }[] }[] }

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character)
}

function dateKey(timestamp?: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return '0000-00-00'
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function tomorrowInputDate() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function ArchivedQuestions({ questions, exams, onSchedule, showNotice }: {
  questions: Question[]
  exams: Exam[]
  onSchedule: (details: ScheduleDetails) => Promise<boolean>
  showNotice: (message: string) => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleDate] = useState(tomorrowInputDate)
  const examTitles = new Map(exams.map((exam) => [exam.id, exam.title]))
  const ordered = useMemo(() => [...questions].sort((left, right) => dateKey(right.createdAt).localeCompare(dateKey(left.createdAt)) || left.subject.localeCompare(right.subject) || left.text.localeCompare(right.text)), [questions])
  const archiveGroups = useMemo(() => {
    const years = new Map<string, Map<string, Map<string, Map<string, Question[]>>>>()
    for (const question of ordered) {
      const key = dateKey(question.createdAt)
      const [year, month, day] = key.split('-')
      if (!years.has(year)) years.set(year, new Map())
      const months = years.get(year)!
      if (!months.has(month)) months.set(month, new Map())
      const days = months.get(month)!
      if (!days.has(day)) days.set(day, new Map())
      const subjects = days.get(day)!
      if (!subjects.has(question.subject)) subjects.set(question.subject, [])
      subjects.get(question.subject)!.push(question)
    }
    return Array.from(years, ([year, months]): ArchiveGroup => ({
      year: year === '0000' ? 'Undated' : year,
      months: Array.from(months, ([month, days]) => ({
        key: month,
        label: month === '00' ? 'Unknown month' : new Date(Number(year), Number(month) - 1, 1).toLocaleString(undefined, { month: 'long' }),
        days: Array.from(days, ([day, subjects]) => ({
          key: day,
          label: day === '00' ? 'Unknown date' : new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
          subjects: Array.from(subjects, ([subject, questions]) => ({ subject, questions }))
        })).sort((left, right) => right.key.localeCompare(left.key))
      })).sort((left, right) => right.key.localeCompare(left.key))
    })).sort((left, right) => right.year.localeCompare(left.year))
  }, [ordered])
  const selectedQuestions = ordered.filter((question) => selectedIds.has(question.id))
  const selectedSubjects = Array.from(new Set(selectedQuestions.map((question) => question.subject)))
  const selectedSubject = selectedSubjects.length === 1 ? selectedSubjects[0] : ''

  function saveAsPdf() {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return

    const content = ordered.map((question, index) => {
      const examTitle = question.examId ? examTitles.get(question.examId) : undefined
      const savedDate = question.createdAt ? new Date(question.createdAt).toLocaleDateString() : 'date unknown'
      const options = question.options.map((option, optionIndex) => {
        const answer = question.answer === optionIndex ? ' <strong>(Correct answer)</strong>' : ''
        return `<li>${questionContentToHtml(option)}${answer}</li>`
      }).join('')
      return `<article><header><span>Question ${index + 1} · Saved ${escapeHtml(savedDate)}</span><span>${escapeHtml(question.subject)}${examTitle ? ` · ${escapeHtml(examTitle)}` : ''}</span></header><div class="question">${questionContentToHtml(question.text)}</div><ol type="A">${options}</ol></article>`
    }).join('')

    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>TIMPRIEST EDU Question Archive</title><style>
      @page{margin:18mm}body{font-family:Arial,sans-serif;color:#17221d;max-width:850px;margin:0 auto;padding:24px}
      h1{color:#173c32;border-bottom:2px solid #d7a443;padding-bottom:12px}p{color:#63746b}
      article{break-inside:avoid;border-bottom:1px solid #dce4dc;padding:14px 0}
      article header{display:flex;justify-content:space-between;gap:16px;color:#63746b;font-size:12px;font-weight:700}
      .question{margin:12px 0}.question-content-text{white-space:normal;margin:6px 0}
      ol{padding-left:24px}li{padding:4px 0;color:#4c5f55}
      .question-content-table-wrap{overflow-x:auto;margin:10px 0}
      .question-content-table{width:100%;border-collapse:collapse;font-size:13px}
      .question-content-table th,.question-content-table td{border:1px solid #b9c7bb;padding:7px 9px;text-align:left}
      @media print{body{padding:0}}
    </style></head><body><h1>TIMPRIEST EDU Question Archive</h1><p>${ordered.length} archived questions · ${new Date().toLocaleDateString()}</p>${content}</body></html>`)
    printWindow.document.close()
    printWindow.focus()
    printWindow.onafterprint = () => printWindow.close()
    printWindow.print()
  }

  function toggleQuestion(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function scheduleSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (scheduling) return
    if (!selectedSubject || selectedQuestions.length === 0) {
      showNotice('Select archived questions from one subject to schedule an exam.')
      return
    }
    const values = new FormData(event.currentTarget)
    setScheduling(true)
    try {
      const created = await onSchedule({
        title: String(values.get('title') || '').trim(),
        subject: selectedSubject,
        date: String(values.get('date') || ''),
        time: String(values.get('time') || ''),
        duration: Number(values.get('duration')),
        classSection: String(values.get('classSection') || '').trim(),
        selectedQuestionIds: selectedQuestions.map((question) => question.id)
      })
      if (created) {
        setSelectedIds(new Set())
        setScheduleOpen(false)
      }
    } finally {
      setScheduling(false)
    }
  }

  return (
    <>
      <div className="section-heading archive-heading">
        <div><p className="eyebrow">Question bank</p><h2>Archived questions</h2></div>
        <button className="primary-button" type="button" onClick={saveAsPdf} disabled={ordered.length === 0}>Save archive as PDF</button>
      </div>
      <p className="archive-note">Questions are organized by the date they were saved. Select questions from one subject to schedule them for a future exam. Export is available as PDF only.</p>
      {selectedIds.size > 0 && (
        <div className="archive-selection">
          <span>{selectedIds.size} question{selectedIds.size === 1 ? '' : 's'} selected{selectedSubject ? ` · ${selectedSubject}` : selectedSubjects.length > 1 ? ' · Select one subject at a time' : ''}</span>
          <button className="primary-button" type="button" disabled={!selectedSubject} onClick={() => setScheduleOpen(true)}>Schedule selected questions</button>
          <button className="text-button" type="button" onClick={() => setSelectedIds(new Set())}>Clear selection</button>
        </div>
      )}
      {scheduleOpen && (
        <form className="form-panel archive-schedule-form" onSubmit={scheduleSelected}>
          <h3>Schedule archived questions</h3>
          <p>{selectedQuestions.length} saved questions will be copied into this {selectedSubject} exam; the archive originals remain available.</p>
          <div className="form-grid">
            <label>Exam title<input name="title" required defaultValue={`${selectedSubject} Exam`} /></label>
            <label>Subject<input value={selectedSubject} readOnly /></label>
            <label>Class taking the exam<select name="classSection" defaultValue=""><option value="">All classes</option>{STUDENT_SECTIONS.map((section) => <option key={section}>{section}</option>)}</select></label>
            <label>Date<input name="date" type="date" min={tomorrowInputDate()} defaultValue={scheduleDate} required /></label>
            <label>Start time<input name="time" type="time" required /></label>
            <label>Duration (minutes)<input name="duration" type="number" min="1" max="1440" defaultValue="90" required /></label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={() => setScheduleOpen(false)}>Cancel</button>
            <button className="primary-button" type="submit" disabled={scheduling}>{scheduling ? 'Scheduling...' : 'Schedule exam'}</button>
          </div>
        </form>
      )}
      {ordered.length === 0
        ? <div className="result-empty"><span>▤</span><h3>No archived questions yet</h3><p>Questions submitted by teachers will appear here.</p></div>
        : <div className="archive-year-list">
          {archiveGroups.map((year) => <section className="archive-year" key={year.year}>
            <h3>{year.year}</h3>
            {year.months.map((month) => <section className="archive-month" key={`${year.year}-${month.key}`}>
              <h4>{month.label}</h4>
              {month.days.map((day) => <section className="archive-day" key={`${year.year}-${month.key}-${day.key}`}>
                <h5>{day.label}</h5>
                {day.subjects.map(({ subject, questions: subjectQuestions }) => <section className="archive-subject" key={`${day.key}-${subject}`}>
                  <div className="archive-subject-heading"><strong>{subject}</strong><span>{subjectQuestions.length} question{subjectQuestions.length === 1 ? '' : 's'}</span></div>
                  <div className="archive-question-list">
                    {subjectQuestions.map((question) => {
                      const examTitle = question.examId ? examTitles.get(question.examId) : undefined
                      return (
                        <article className="archive-question-card" key={question.id}>
                          <label className="archive-question-select"><input type="checkbox" checked={selectedIds.has(question.id)} onChange={() => toggleQuestion(question.id)} aria-label={`Select question from ${subject}`} /><span>Select for scheduling</span></label>
                          <div className="archive-question-meta"><strong>Saved {question.createdAt ? new Date(question.createdAt).toLocaleDateString() : 'date unknown'}</strong><span>{examTitle ? `Previously scheduled: ${examTitle}` : 'Question bank'}</span></div>
                          <div className="archive-question-text"><QuestionContent content={question.text} /></div>
                          <ol type="A">{question.options.map((option, optionIndex) => (
                            <li key={`${question.id}-${optionIndex}`} className={question.answer === optionIndex ? 'archive-correct-answer' : ''}>
                              <QuestionContent content={option} />
                              {question.answer === optionIndex && <strong>Correct answer</strong>}
                            </li>
                          ))}</ol>
                        </article>
                      )
                    })}
                  </div>
                </section>)}
              </section>)}
            </section>)}
          </section>)}
        </div>}
    </>
  )
}
