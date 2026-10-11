import { createPortal } from 'react-dom'
import './slip.css'

// Printable result slips for the Admin. One slip per student per exam day, laid out like a school result slip:
// the school's name at the top left, "Result Slip" in the middle, then the details and a score table.

export type SlipResult = {
  id: string
  student_name: string
  student_id: string
  class_section?: string | null
  subject?: string | null
  exam_title: string
  exam_date?: string | null
  exam_time?: string | null
  score: number
  total: number
  time_spent?: number | null
}

type SlipRow = { subject: string; score: number; total: number; seconds: number | null }
export type Slip = { key: string; name: string; studentId: string; className: string; subjects: string[]; examAt: string; rows: SlipRow[]; totalScore: number; totalMax: number; totalSeconds: number | null }

const pad = (value: number) => String(value).padStart(2, '0')

// "Mar 17, 2026 09:30 AM"
export function formatStamp(date: Date): string {
  const hours = date.getHours()
  return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}, ${date.getFullYear()} ${pad(hours % 12 || 12)}:${pad(date.getMinutes())} ${hours < 12 ? 'AM' : 'PM'}`
}

// "7 mins 21 secs"
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '-'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`)
  if (hours || minutes) parts.push(`${minutes} min${minutes === 1 ? '' : 's'}`)
  parts.push(`${secs} sec${secs === 1 ? '' : 's'}`)
  return parts.join(' ')
}

function examDate(result: SlipResult): Date | null {
  if (!result.exam_date) return null
  const stamp = new Date(`${result.exam_date}T${result.exam_time || '00:00'}:00`)
  return Number.isNaN(stamp.getTime()) ? null : stamp
}

export function groupSlips(results: SlipResult[]): Slip[] {
  const groups = new Map<string, SlipResult[]>()
  for (const result of results) {
    const key = `${result.student_id || result.student_name}|${result.exam_date || result.id}`
    groups.set(key, [...(groups.get(key) || []), result])
  }
  return [...groups.entries()].map(([key, items]) => {
    const rows = items
      .map((item) => ({ subject: item.subject || item.exam_title, score: item.score, total: item.total, seconds: item.time_spent ?? null }))
      .sort((a, b) => a.subject.localeCompare(b.subject))
    const stamps = items.map(examDate).filter((stamp): stamp is Date => stamp !== null).sort((a, b) => a.getTime() - b.getTime())
    const known = rows.filter((row) => row.seconds !== null)
    return {
      key,
      name: items[0].student_name,
      studentId: items[0].student_id,
      className: items[0].class_section || '',
      subjects: rows.map((row) => row.subject),
      examAt: stamps[0] ? formatStamp(stamps[0]) : '-',
      rows,
      totalScore: rows.reduce((sum, row) => sum + row.score, 0),
      totalMax: rows.reduce((sum, row) => sum + row.total, 0),
      totalSeconds: known.length ? known.reduce((sum, row) => sum + (row.seconds || 0), 0) : null
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

// Rendered outside the app (on the page itself) so that only the slips are printed.
export function SlipSheet({ results, schoolName }: { results: SlipResult[]; schoolName: string }) {
  const slips = groupSlips(results)
  const printed = formatStamp(new Date())
  return createPortal(
    <div className="slip-sheet">
      {slips.map((slip) => (
        <section className="slip" key={slip.key}>
          <header className="slip-head">
            <div className="slip-school">{schoolName}</div>
            <h1>Result Slip</h1>
            <div className="slip-printed"><b>Date Printed:</b> {printed}</div>
          </header>
          <hr />
          <h2>Examination Details</h2>
          <table className="slip-details">
            <tbody>
              <tr><th>Name:</th><td>{slip.name}</td></tr>
              {slip.studentId && <tr><th>Student ID:</th><td>{slip.studentId}</td></tr>}
              {slip.className && <tr><th>Class:</th><td>{slip.className}</td></tr>}
              <tr><th>Subject(s):</th><td>{slip.subjects.join(', ')}</td></tr>
              <tr><th>Exam Date:</th><td>{slip.examAt}</td></tr>
            </tbody>
          </table>
          <h2>Candidate Result</h2>
          <table className="slip-result">
            <thead><tr><th>Subject</th><th>Score</th><th>Time Spent</th></tr></thead>
            <tbody>
              {slip.rows.map((row, index) => <tr key={index}><td>{row.subject}</td><td>{row.score}</td><td>{formatDuration(row.seconds)}</td></tr>)}
              <tr className="slip-total"><th>Aggregate</th><td>Total: {slip.totalScore}/{slip.totalMax}</td><td>Total: {formatDuration(slip.totalSeconds)}</td></tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>,
    document.body
  )
}
