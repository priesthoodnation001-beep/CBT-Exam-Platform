import { useState } from 'react'
import type { FormEvent } from 'react'
import { STUDENT_SECTIONS } from './studentSections'

type Exam = { id: string; title: string; classSection?: string; subject: string; date: string; time: string; duration: number; questions: number; status: 'Scheduled' | 'Draft' | 'Published'; subject_duration: number; subject_approved: number; shuffle?: number; studentIds?: string[] }
type PickableStudent = { id: string; name: string; studentId: string; classSection: string }
type Props = { exams: Exam[]; students?: PickableStudent[]; classes?: string[]; showForm: boolean; setShowForm: (value: boolean) => void; addExam: (event: FormEvent<HTMLFormElement>) => void; deleteExam: (exam: Exam) => void }

// Lets the admin pick one or more registered students by name or student ID. Picked students are the only ones who can take the exam.
function StudentPicker({ students }: { students: PickableStudent[] }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const needle = query.trim().toLowerCase()
  const shown = students.filter((student) => !needle || `${student.name} ${student.studentId} ${student.classSection}`.toLowerCase().includes(needle))
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  return (
    <div className="student-picker" style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
      <strong>Only for specific students (optional)</strong>
      <small>Tick one or more students to make this exam for them alone. Nobody else will see it. If you pick students, the class above is ignored.</small>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or student ID" />
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(128,128,128,0.35)', borderRadius: 8, padding: 6 }}>
        {students.length === 0 && <p style={{ margin: 6, opacity: 0.7 }}>No registered students yet.</p>}
        {students.length > 0 && shown.length === 0 && <p style={{ margin: 6, opacity: 0.7 }}>No student matches your search.</p>}
        {shown.map((student) => (
          <label key={student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row', padding: '5px 4px' }}>
            <input type="checkbox" name="studentIds" value={student.id} checked={picked.includes(student.id)} onChange={() => toggle(student.id)} style={{ width: 'auto', margin: 0 }} />
            <span>{student.name} · {student.studentId || 'no student ID'}{student.classSection ? ` · ${student.classSection}` : ''}</span>
          </label>
        ))}
      </div>
      <small>{picked.length ? `${picked.length} student${picked.length === 1 ? '' : 's'} picked` : 'No student picked: the exam follows the class setting.'}{picked.length > 0 && <> <button type="button" onClick={() => setPicked([])} style={{ marginLeft: 8 }}>Clear</button></>}</small>
    </div>
  )
}

export default function ExamSchedule({ exams, students = [], classes = [], showForm, setShowForm, addExam, deleteExam }: Props) {
  const availableClasses = Array.from(new Set([...STUDENT_SECTIONS, ...classes]))
  return (
    <>
      <div className="section-heading">
        <div><p className="eyebrow">Exam management</p><h2>Schedule and publish exams</h2></div>
        <button className="primary-button" onClick={() => setShowForm(!showForm)}>+ Schedule exam</button>
      </div>
      {showForm && (
        <form className="form-panel" onSubmit={addExam}>
          <h3>New exam schedule</h3>
          <div className="form-grid">
            <label>Exam title<input name="title" required placeholder="e.g. English Language 1" /></label>
            <label>Subject<input name="subject" required placeholder="e.g. English" /></label>
            <fieldset style={{ gridColumn: '1 / -1', display: 'grid', gap: 6, border: '1px solid rgba(128,128,128,0.35)', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
              <legend>Classes taking the exam</legend>
              <small>Tick one or more classes, for example Science and Arts together. Tick nothing to open the exam to all classes.</small>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
                {availableClasses.map((className) => (
                  <label key={className} style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: 'row' }}>
                    <input type="checkbox" name="classSection" value={className} style={{ width: 'auto', margin: 0 }} /> {className}
                  </label>
                ))}
              </div>
            </fieldset>
            <label>Date<input name="date" type="date" required /></label>
            <label>Start time<input name="time" type="time" required /></label>
            <label>Duration (minutes)<input name="duration" type="number" min="1" defaultValue="90" required /></label>
            <label>Number of questions<input name="questions" type="number" min="1" defaultValue="30" required /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row' }}><input name="shuffle" type="checkbox" style={{ width: 'auto', margin: 0 }} /> Shuffle questions and options for each student</label>
            <StudentPicker students={students} />
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="primary-button" type="submit">Publish schedule</button>
          </div>
        </form>
      )}
      <div className="exam-cards">
        {exams.map((exam) => (
          <article className="exam-card" key={exam.id}>
            <div className="exam-card-date"><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong><span>{new Date(`${exam.date}T00:00:00`).toLocaleString('en', { month: 'short' }).toUpperCase()}</span></div>
            <div><h3>{exam.title}</h3><p>{exam.subject} · {exam.studentIds?.length ? 'Selected students' : exam.classSection || 'All classes'} · {exam.time} · {exam.duration} minutes</p><small>{exam.questions} questions{exam.shuffle ? ' · shuffled' : ''}{exam.studentIds?.length ? ` · for ${exam.studentIds.length} student${exam.studentIds.length === 1 ? '' : 's'}` : ''}</small></div>
            <span className={`tag ${exam.status === 'Draft' ? 'draft' : 'live'}`}>{exam.status}</span>
            <button className="delete-button" onClick={() => deleteExam(exam)}>Delete</button>
          </article>
        ))}
      </div>
    </>
  )
}
