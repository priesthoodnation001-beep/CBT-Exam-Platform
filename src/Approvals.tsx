import { useState } from 'react'
import type { FormEvent } from 'react'

type Question = { id: string; subject: string; text: string; options: string[]; answer?: number }
type SubjectSetting = { subject: string; duration: number; approved: number; approved_at?: string; status: 'pending' | 'approved' | 'rejected'; rejection_reason?: string; review_comment?: string }

type ReviewAction = 'approve' | 'return'
type ApprovalsProps = { subjects: SubjectSetting[]; questions: Question[]; approve: (subject: string, comment: string) => Promise<boolean>; reject: (subject: string, comment: string) => Promise<boolean>; rename: (subject: string, name: string) => Promise<boolean> }

export default function Approvals({ subjects, questions, approve, reject, rename }: ApprovalsProps) {
  const [reviewing, setReviewing] = useState<{ subject: string; action: ReviewAction } | null>(null)
  const [comment, setComment] = useState('')
  const [editingSubject, setEditingSubject] = useState<string | null>(null)
  const [subjectName, setSubjectName] = useState('')

  const startReview = (subject: string, action: ReviewAction) => {
    setReviewing({ subject, action })
    setComment('')
  }

  const submitComment = async (event: FormEvent<HTMLFormElement>, subject: string) => {
    event.preventDefault()
    if (!reviewing) return
    const feedback = comment.trim()
    if (reviewing.action === 'return' && !feedback) return
    const saved = reviewing.action === 'approve' ? await approve(subject, feedback) : await reject(subject, feedback)
    if (saved) {
      setReviewing(null)
      setComment('')
    }
  }

  const submitName = async (event: FormEvent<HTMLFormElement>, subject: string) => {
    event.preventDefault()
    const name = subjectName.trim()
    if (!name || name === subject) return
    if (await rename(subject, name)) {
      setEditingSubject(null)
      setSubjectName('')
    }
  }

  return <>
    <div className="section-heading"><div><p className="eyebrow">Quality control</p><h2>Approve subject questions</h2></div></div>
    <div className="approval-list">
      {subjects.length === 0 && <div className="result-empty"><span>✦</span><h3>No subject question sets yet</h3><p>Teacher question sets will appear here after they submit a subject.</p></div>}
      {subjects.map((item) => {
        const subjectQuestions = questions.filter((question) => question.subject === item.subject)
        return <article className="approval-card" key={item.subject}>
          <div className="approval-card-main">
            <div className="approval-card-summary">
              <span className="role-pill teacher">{item.duration} minute limit</span>
              <h3>{item.subject}</h3>
              <button className="text-button" type="button" onClick={() => { setEditingSubject(item.subject); setSubjectName(item.subject) }}>Edit subject name</button>
              <p>{item.status === 'approved'
                ? `Approved${item.approved_at ? ` on ${new Date(item.approved_at).toLocaleDateString()}` : ''}. Students can access this subject.`
                : item.status === 'rejected'
                  ? `Returned for corrections${item.rejection_reason ? `: ${item.rejection_reason}` : '.'}`
                  : 'Pending approval. Students cannot access this subject yet.'}</p>
              {item.review_comment && <p className="approval-review-comment"><strong>Admin comment:</strong> {item.review_comment}</p>}
            </div>
            <details className="approval-preview">
              <summary>Preview {subjectQuestions.length} question{subjectQuestions.length === 1 ? '' : 's'}</summary>
              {subjectQuestions.length
                ? <div className="approval-preview-list">
                  {subjectQuestions.map((question, index) => (
                    <section className="approval-preview-question" key={question.id}>
                      <strong>Question {index + 1}</strong>
                      <p>{question.text}</p>
                      <ol type="A">{question.options.map((option, optionIndex) => <li className={question.answer === optionIndex ? 'approval-correct-option' : ''} key={optionIndex}>
                        {option}{question.answer === optionIndex ? ' · Correct answer' : ''}
                      </li>)}</ol>
                    </section>
                  ))}
                </div>
                : <p className="approval-no-questions">No questions were found in this subject set.</p>}
            </details>
          </div>
          {editingSubject === item.subject && (
            <form className="approval-feedback-form" onSubmit={(event) => void submitName(event, item.subject)}>
              <label htmlFor={`approval-subject-name-${encodeURIComponent(item.subject)}`}>Correct subject name</label>
              <input id={`approval-subject-name-${encodeURIComponent(item.subject)}`} value={subjectName} onChange={(event) => setSubjectName(event.target.value)} maxLength={100} required />
              <div><small>This updates the subject name for its questions and scheduled exams.</small><span><button className="text-button" type="button" onClick={() => { setEditingSubject(null); setSubjectName('') }}>Cancel</button><button className="primary-button small-button" type="submit" disabled={!subjectName.trim() || subjectName.trim() === item.subject}>Save subject name</button></span></div>
            </form>
          )}
          <div className="approval-actions">
            <button className="primary-button small-button" onClick={() => startReview(item.subject, 'approve')}>{item.status === 'approved' ? 'Update approval comment' : 'Approve with comment'}</button>
            <button className="secondary-button small-button" onClick={() => startReview(item.subject, 'return')}>Return with comment</button>
          </div>
          {reviewing?.subject === item.subject && (
            <form className="approval-feedback-form" onSubmit={(event) => submitComment(event, item.subject)}>
              <label htmlFor={`approval-comment-${encodeURIComponent(item.subject)}`}>{reviewing.action === 'approve' ? 'Approval comment for the teacher (optional)' : 'Correction comment for the teacher'}</label>
              <textarea id={`approval-comment-${encodeURIComponent(item.subject)}`} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} required={reviewing.action === 'return'} placeholder={reviewing.action === 'approve' ? 'Add an optional note for the teacher...' : 'Explain what needs to be corrected...'} />
              <div><small>{comment.length}/500 · The teacher will receive an in-app notification.</small><span><button className="text-button" type="button" onClick={() => setReviewing(null)}>Cancel</button><button className={reviewing.action === 'approve' ? 'primary-button small-button' : 'secondary-button small-button'} type="submit" disabled={reviewing.action === 'return' && !comment.trim()}>{reviewing.action === 'approve' ? 'Approve and send comment' : 'Send comment and return'}</button></span></div>
            </form>
          )}
        </article>
      })}
    </div>
  </>
}
