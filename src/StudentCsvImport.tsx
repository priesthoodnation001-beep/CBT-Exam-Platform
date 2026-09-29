import { useState } from 'react'

type Row = { name: string; studentId: string; classSection: string; error?: string }
type Props = { token: string | null; refresh: () => Promise<void>; showNotice: (message: string) => void }

function parseCsvLine(line: string) {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) { cells.push(cell.trim()); cell = '' }
    else cell += character
  }
  cells.push(cell.trim())
  return cells
}

function parseCsv(text: string): Row[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return []
  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase().replace(/[ _-]/g, ''))
  const nameIndex = headers.indexOf('name') >= 0 ? headers.indexOf('name') : headers.indexOf('fullname')
  const idIndex = headers.indexOf('studentid') >= 0 ? headers.indexOf('studentid') : headers.indexOf('id')
  const classIndex = headers.indexOf('classsection') >= 0 ? headers.indexOf('classsection') : headers.indexOf('class')
  if (nameIndex < 0 || idIndex < 0 || classIndex < 0) return [{ name: '', studentId: '', classSection: '', error: 'CSV must contain name, studentId, and classSection columns.' }]
  const rows: Row[] = []
  const seen = new Set<string>()
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line)
    const name = cells[nameIndex]?.trim() || ''
    const studentId = (cells[idIndex]?.trim() || '').toUpperCase()
    const classSection = cells[classIndex]?.trim() || ''
    let error = ''
    if (!name || !studentId || !classSection) error = 'Name, Student ID, and class section are required.'
    else if (seen.has(studentId)) error = 'Duplicate Student ID in this file.'
    seen.add(studentId)
    rows.push({ name, studentId, classSection, error: error || undefined })
  }
  return rows
}

export default function StudentCsvImport({ token, refresh, showNotice }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const validRows = rows.filter((row) => !row.error)

  const downloadTemplate = () => {
    const blob = new Blob(['name,studentId,classSection\nExample Student,STUDENT-001,SSS 1\n'], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob); link.download = 'timpriest-student-registration.csv'; link.click(); URL.revokeObjectURL(link.href)
  }

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setRows(parseCsv(await file.text()))
    event.target.value = ''
  }

  const importStudents = async () => {
    setBusy(true); let created = 0; let rejected = 0
    for (const row of validRows) {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ role: 'Student', name: row.name, studentId: row.studentId, classSection: row.classSection }) })
      if (response.ok) created += 1
      else rejected += 1
    }
    setBusy(false); setRows([]); await refresh(); showNotice(`${created} student${created === 1 ? '' : 's'} imported${rejected ? `, ${rejected} rejected as duplicates` : ''}.`)
  }

  return <section className="csv-import-panel"><div className="csv-import-heading"><div><p className="eyebrow">Bulk registration</p><h3>Import students from CSV</h3><p>Use the columns <strong>name</strong>, <strong>studentId</strong>, and <strong>classSection</strong>.</p></div><button className="secondary-button" type="button" onClick={downloadTemplate}>Download template</button></div><label className="csv-file-button">Choose CSV file<input type="file" accept=".csv,text/csv" onChange={chooseFile} /></label>{rows.length > 0 && <><div className="csv-summary"><span>{validRows.length} ready to import</span><span>{rows.filter((row) => row.error).length} need attention</span></div><div className="csv-preview">{rows.map((row, index) => <div className="csv-row" key={`${row.studentId}-${index}`}><span>{row.name || 'Unnamed student'}</span><strong>{row.studentId || 'No ID'}</strong><span>{row.classSection || 'No class'}</span><small className={row.error ? 'csv-error' : 'csv-ok'}>{row.error || 'Ready'}</small></div>)}</div><button className="primary-button" type="button" disabled={!validRows.length || busy} onClick={importStudents}>{busy ? 'Importing...' : `Import ${validRows.length} students`}</button></>}</section>
}
