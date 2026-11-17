import { useEffect, useRef, useState } from 'react'
import { API_BASE } from './apiBase'
import { parseDocx } from './questionImport'
import './prep-import.css'

type Props = { token: string; onMessage: (message: string) => void }
type BankCount = { exam: string; subject: string; questions: number }
type ImportedQuestion = { exam: string; subject: string; question: string; options: string[]; answer: number; explanation: string; year: number | null }

const TEMPLATE = 'exam,subject,question,optionA,optionB,optionC,optionD,answer,explanation,year\nJAMB,Mathematics,"What is 2 + 2?",3,4,5,6,B,"Add the two numbers.",2024\n'
const MAX_FILE_SIZE = 25_000_000
const MAX_PDF_PAGES = 100

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1 }
      else if (character === '"') quoted = false
      else cell += character
    } else if (character === '"' && cell.length === 0) quoted = true
    else if (character === ',') { row.push(cell); cell = '' }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
    } else cell += character
  }
  if (quoted) throw new Error('The CSV has an unfinished quoted field.')
  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

function prepareQuestions(text: string): ImportedQuestion[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length < 2) throw new Error('Add a header row and at least one question.')
  const normalizeHeader = (header: string) => header.trim().toLowerCase().replace(/[\s_-]/g, '')
  const headers = rows[0].map(normalizeHeader)
  const aliases: Record<string, string[]> = {
    exam: ['exam', 'examination'],
    subject: ['subject', 'topic'],
    question: ['question', 'questiontext', 'q'],
    optiona: ['optiona', 'choicea', 'opta', 'a'],
    optionb: ['optionb', 'choiceb', 'optb', 'b'],
    optionc: ['optionc', 'choicec', 'optc', 'c'],
    optiond: ['optiond', 'choiced', 'optd', 'd'],
    answer: ['answer', 'correctanswer', 'correctoption', 'key', 'ans'],
    explanation: ['explanation', 'solution', 'notes'],
    year: ['year', 'questionyear', 'examyear'],
  }
  const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex((header) => names.includes(header))]))
  const missing = ['exam', 'subject', 'question', 'optiona', 'optionb', 'optionc', 'optiond', 'answer'].filter((field) => columns[field] < 0)
  if (missing.length) throw new Error(`Missing CSV column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`)
  if (rows.length - 1 > 500) throw new Error('Import up to 500 questions at a time.')
  const column = (values: string[], name: string) => values[columns[name]]?.trim() || ''
  return rows.slice(1).map((values) => {
    const answerText = column(values, 'answer')
    const letter = /^(?:option|choice)?\s*\(?([A-D])\)?[.)]?$/i.exec(answerText)?.[1]
    const answer = letter ? letter.toUpperCase().charCodeAt(0) - 65 : /^[1-4]$/.test(answerText) ? Number(answerText) - 1 : ['optiona', 'optionb', 'optionc', 'optiond'].map((name) => column(values, name)).findIndex((option) => option.toLowerCase() === answerText.toLowerCase())
    const rawYear = column(values, 'year')
    const optionValues = ['optiona', 'optionb', 'optionc', 'optiond'].map((name) => column(values, name))
    return {
      exam: column(values, 'exam').toUpperCase(),
      subject: column(values, 'subject'),
      question: column(values, 'question'),
      options: optionValues,
      answer,
      explanation: column(values, 'explanation'),
      year: rawYear ? Number(rawYear) : null,
    }
  })
}

function pdfLines(items: { str: string; transform: number[] }[]) {
  const lines = new Map<number, { x: number; text: string }[]>()
  for (const item of items) {
    const text = item.str.trim()
    if (!text) continue
    const y = Math.round(item.transform[5] / 3) * 3
    const line = lines.get(y) || []
    line.push({ x: item.transform[4], text })
    lines.set(y, line)
  }
  return [...lines.entries()]
    .sort(([first], [second]) => second - first)
    .map(([, line]) => line.sort((first, second) => first.x - second.x).map((item) => item.text).join(' '))
    .join('\n')
}

function parsePdfQuestions(text: string, exam: string, subject: string, defaultYear: number | null) {
  const answerSection = text.match(/^\s*(?:answer\s*key|answers(?:\s+key)?)\s*:?\s*(.*)$/im)
  const answerText = answerSection?.[1] ? `${answerSection[1]}\n${text.slice((answerSection.index || 0) + answerSection[0].length)}` : ''
  const questionText = answerSection ? text.slice(0, answerSection.index) : text
  const answerKey = new Map<number, number>()
  for (const match of answerText.matchAll(/(?:^|\s)(\d{1,3})\s*[-.):]?\s*([A-D])\b/gim)) {
    answerKey.set(Number(match[1]), match[2].toUpperCase().charCodeAt(0) - 65)
  }
  const starts = [...questionText.matchAll(/^\s*(?:(?:question|q)\s*)?(\d{1,3})[.):\-]\s+/gim)]
  const questions: ImportedQuestion[] = []
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]
    const end = starts[index + 1]?.index ?? questionText.length
    const number = Number(start[1])
    const block = questionText.slice(start.index, end).replace(/^\s*(?:(?:question|q)\s*)?\d{1,3}[.):\-]\s+/i, '').trim()
    const options = [...block.matchAll(/(?:^|\s)(?:\(([A-D])\)|([A-D])[.)]|([A-D])\s*[-:])\s+/gim)]
    if (options.length < 4) continue
    const firstOption = options[0].index || 0
    const question = block.slice(0, firstOption).trim()
    const optionValues = options.slice(0, 4).map((option, optionIndex) => {
      const optionStart = (option.index || 0) + option[0].length
      let optionEnd = options[optionIndex + 1]?.index ?? block.length
      if (optionIndex === 3) {
        const trailingDetail = block.slice(optionStart).search(/\b(?:correct\s+)?answer\s*:|\bexplanation\s*:/i)
        if (trailingDetail >= 0) optionEnd = optionStart + trailingDetail
      }
      return block.slice(optionStart, optionEnd).replace(/\s*(?:\*|✓|✔|\[(?:correct|answer)\]|\((?:correct|answer)\))\s*$/i, '').trim()
    })
    if (!question || optionValues.some((option) => !option)) continue
    const markedAnswer = options.slice(0, 4).findIndex((_option, optionIndex) => {
      const optionStart = (options[optionIndex].index || 0) + options[optionIndex][0].length
      const optionEnd = options[optionIndex + 1]?.index ?? block.length
      return /(?:\*|✓|✔|\[(?:correct|answer)\]|\((?:correct|answer)\))\s*$/i.test(block.slice(optionStart, optionEnd))
    })
    const answerText = block.match(/(?:correct\s+)?answer\s*:\s*([^\r\n]+)/i)?.[1]?.trim() || ''
    const answerLetter = /^(?:option|choice)?\s*\(?([A-D])\)?[.)]?$/i.exec(answerText)?.[1]
    const answerNumber = /^[1-4]$/.test(answerText) ? Number(answerText) - 1 : -1
    const answerOption = optionValues.findIndex((option) => option.toLowerCase() === answerText.toLowerCase())
    questions.push({
      exam,
      subject,
      question,
      options: optionValues,
      answer: answerLetter
        ? answerLetter.toUpperCase().charCodeAt(0) - 65
        : answerNumber >= 0
          ? answerNumber
          : answerOption >= 0
            ? answerOption
            : markedAnswer >= 0
              ? markedAnswer
              : answerKey.get(number) ?? -1,
      explanation: block.match(/explanation\s*:\s*([\s\S]*)$/i)?.[1]?.trim() || '',
      year: defaultYear,
    })
  }
  if (!questions.length) {
    throw new Error('No complete multiple-choice questions were recognized. Use numbered questions with A–D options and mark the correct option, add “Answer: B”, or include an answer key.')
  }
  return questions
}

function parseDocxQuestions(table: string[][], text: string, exam: string, subject: string, defaultYear: number | null): ImportedQuestion[] {
  const rows = table.map((row) => row.map((cell) => cell.trim())).filter((row) => row.some(Boolean))
  const headers = rows[0]?.map((header) => header.toLowerCase().replace(/[\s_()-]/g, '')) || []
  const findColumn = (pattern: RegExp) => headers.findIndex((header) => pattern.test(header))
  const examColumn = findColumn(/^(?:exam|examination)$/)
  const subjectColumn = findColumn(/^(?:subject|topic)$/)
  const questionColumn = findColumn(/^(?:question|questiontext|q)$/)
  const optionColumns = ['a', 'b', 'c', 'd'].map((letter) => findColumn(new RegExp(`^(?:(?:option|choice|opt)${letter}|${letter})$`)))
  const answerColumn = findColumn(/^(?:answer|correctanswer|key|correctoption)$/)
  if (questionColumn >= 0 && optionColumns.every((column) => column >= 0) && answerColumn >= 0) {
    if (rows.length < 2) throw new Error('Add a header row and at least one question to the Word table.')
    if (rows.length - 1 > 500) throw new Error('Import up to 500 questions at a time.')
    const explanationColumn = findColumn(/^explanation$/)
    const yearColumn = findColumn(/^year$/)
    return rows.slice(1).map((row) => {
      const options = optionColumns.map((column) => row[column] || '')
      const answerText = row[answerColumn] || ''
      const letterAnswer = /^[A-D]$/i.test(answerText) ? answerText.toUpperCase().charCodeAt(0) - 65 : /^[1-4]$/.test(answerText) ? Number(answerText) - 1 : -1
      const textAnswer = options.findIndex((option) => option.toLowerCase() === answerText.toLowerCase())
      const rawYear = yearColumn >= 0 ? Number(row[yearColumn]) : NaN
      return {
        exam: (examColumn >= 0 ? row[examColumn] || exam : exam).trim().toUpperCase(),
        subject: (subjectColumn >= 0 ? row[subjectColumn] || subject : subject).trim(),
        question: row[questionColumn] || '',
        options,
        answer: letterAnswer >= 0 ? letterAnswer : textAnswer,
        explanation: explanationColumn >= 0 ? row[explanationColumn] || '' : '',
        year: Number.isInteger(rawYear) && rawYear > 0 ? rawYear : defaultYear,
      }
    }).filter((question) => question.question || question.options.some(Boolean))
  }
  return parsePdfQuestions(text, exam, subject, defaultYear)
}

async function request<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/creator${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Could not process the question bank request.')
  return body as T
}

export default function PrepQuestionImport({ token, onMessage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [questions, setQuestions] = useState<ImportedQuestion[]>([])
  const [pdfPreview, setPdfPreview] = useState(false)
  const [pdfExam, setPdfExam] = useState('JAMB')
  const [pdfSubject, setPdfSubject] = useState('')
  const [pdfYear, setPdfYear] = useState('')
  const [processingStatus, setProcessingStatus] = useState('')
  const [counts, setCounts] = useState<BankCount[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingSubject, setDeletingSubject] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  async function loadCounts() {
    const result = await request<{ questions: BankCount[] }>('/prep/questions', token)
    setCounts(result.questions)
  }

  useEffect(() => {
    let active = true
    request<{ questions: BankCount[] }>('/prep/questions', token)
      .then((result) => { if (active) setCounts(result.questions) })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load question-bank totals.') })
    return () => { active = false }
  }, [token])

  async function deleteSubject(item: BankCount) {
    if (!window.confirm(`Delete the entire ${item.exam} ${item.subject} subject bank?\n\nThis will remove all ${item.questions.toLocaleString()} questions in this subject from future practice. Any practice already in progress can still be submitted.`)) return
    const key = `${item.exam}\u0000${item.subject}`
    setDeletingSubject(key)
    setDeleteError('')
    try {
      const result = await request<{ questions: number }>('/prep/questions/subject', token, {
        method: 'DELETE',
        body: JSON.stringify({ exam: item.exam, subject: item.subject }),
      })
      setCounts((current) => current.filter((count) => count.exam !== item.exam || count.subject !== item.subject))
      onMessage(`${item.exam} ${item.subject} subject deleted with ${result.questions} question${result.questions === 1 ? '' : 's'}.`)
    } catch (failure) {
      setDeleteError(failure instanceof Error ? failure.message : 'Could not delete the subject.')
    } finally {
      setDeletingSubject(null)
    }
  }

  async function chooseFile(file?: File) {
    if (!file) return
    setFileName(file.name)
    setQuestions([])
    setPdfPreview(false)
    setError('')
    setProcessingStatus('')
    const defaultYear = pdfYear.trim() ? Number(pdfYear) : null
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension !== 'csv' && extension !== 'pdf' && extension !== 'docx') {
      setError('Choose a CSV, PDF, or Word document (.docx).')
      return
    }
    const maxSize = extension === 'csv' ? 600_000 : MAX_FILE_SIZE
    if (file.size > maxSize) {
      setError(extension !== 'csv'
        ? 'Keep each PDF or Word document under 25 MB.'
        : 'Keep each CSV import under 600 KB. Large banks can be split into multiple files.')
      return
    }
    if (extension !== 'csv' && !pdfSubject.trim()) {
      setError('Choose the exam subject before selecting a PDF or Word document.')
      return
    }
    setBusy(true)
    try {
      if (extension === 'csv') {
        const parsed = prepareQuestions(await file.text())
        setQuestions(parsed)
        setPdfPreview(true)
        setProcessingStatus(`${parsed.length} questions loaded. Review their details and years before importing.`)
      } else if (extension === 'docx') {
        const document = await parseDocx(await file.arrayBuffer())
        const parsed = parseDocxQuestions(document.table, document.text, pdfExam, pdfSubject.trim(), defaultYear)
        if (parsed.length > 500) throw new Error('Import up to 500 questions at a time. Split this document into smaller files.')
        setQuestions(parsed)
        setPdfPreview(true)
        setProcessingStatus(`${parsed.length} questions extracted. Check every field and answer before importing.`)
      } else {
        await extractPdf(file)
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not read the selected file.')
    } finally {
      setBusy(false)
      setProcessingStatus('')
    }
  }

  async function extractPdf(file: File) {
    setProcessingStatus('Reading PDF pages...')
    const [pdfjs, pdfWorker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    let ocrWorker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>> | undefined
    try {
      const document = await loadingTask.promise
      if (document.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${document.numPages} pages. Upload a PDF with ${MAX_PDF_PAGES} pages or fewer.`)
      const pages: string[] = []
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber)
        const content = await page.getTextContent()
        let text = pdfLines(content.items as { str: string; transform: number[] }[])
        if (text.replace(/\s/g, '').length < 20) {
          if (!ocrWorker) {
            setProcessingStatus('Preparing English OCR for scanned pages...')
            const { createWorker } = await import('tesseract.js')
            ocrWorker = await createWorker('eng', 1, {
              logger: (progress) => {
                if (progress.status === 'recognizing text') setProcessingStatus(`Reading scanned pages... ${Math.round(progress.progress * 100)}%`)
              },
            })
          }
          setProcessingStatus(`Reading scanned page ${pageNumber} of ${document.numPages}...`)
          const viewport = page.getViewport({ scale: 1.8 })
          const canvas = window.document.createElement('canvas')
          try {
            canvas.width = Math.ceil(viewport.width)
            canvas.height = Math.ceil(viewport.height)
            const context = canvas.getContext('2d')
            if (!context) throw new Error('Could not prepare a page image for OCR.')
            await page.render({ canvas, canvasContext: context, viewport }).promise
            const recognized = await ocrWorker.recognize(canvas)
            text = recognized.data.text
          } finally {
            canvas.width = 0
            canvas.height = 0
          }
        }
        pages.push(text)
        setProcessingStatus(`Read page ${pageNumber} of ${document.numPages}...`)
      }
      const parsed = parsePdfQuestions(pages.join('\n'), pdfExam, pdfSubject.trim(), pdfYear.trim() ? Number(pdfYear) : null)
      if (parsed.length > 500) throw new Error('Import up to 500 questions at a time. Split this PDF into smaller files.')
      setQuestions(parsed)
      setPdfPreview(true)
      setProcessingStatus(`${parsed.length} questions extracted. Check every field and answer before importing.`)
    } finally {
      if (ocrWorker) await ocrWorker.terminate()
      await loadingTask.destroy()
    }
  }

  function updatePdfQuestion(index: number, update: Partial<ImportedQuestion>) {
    setQuestions((current) => current.map((question, itemIndex) => itemIndex === index ? { ...question, ...update } : question))
  }

  function updatePdfOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, itemIndex) => {
      if (itemIndex !== questionIndex) return question
      return { ...question, options: question.options.map((option, index) => index === optionIndex ? value : option) }
    }))
  }

  function updateQuestionYear(index: number, value: string) {
    updatePdfQuestion(index, { year: value.trim() ? Number(value) : null })
  }

  const questionGroups = [...questions.reduce((groups, question) => {
    const key = `${question.exam}\u0000${question.subject}`
    groups.set(key, (groups.get(key) || 0) + 1)
    return groups
  }, new Map<string, number>()).entries()]

  async function importQuestions() {
    const body = JSON.stringify({ questions })
    if (new Blob([body]).size > 900_000) {
      setError('This import is too large to upload at once. Split the question bank into smaller files.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await request<{ inserted: number; skipped: number }>('/prep/questions/import', token, {
        method: 'POST',
        body,
      })
      setQuestions([])
      setFileName('')
      setPdfPreview(false)
      if (inputRef.current) inputRef.current.value = ''
      await loadCounts()
      onMessage(`${result.inserted} question${result.inserted === 1 ? '' : 's'} imported${result.skipped ? `; ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not import the question bank.')
    } finally {
      setBusy(false)
    }
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'timpriest-prep-question-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pqi-page">
      <section className="pqi-card">
        <div className="pqi-intro">
          <span className="pqi-kicker">JAMB · WAEC · NECO</span>
          <h2>Import the practice question bank</h2>
          <p>Upload an approved CSV question bank or extract and review questions from a PDF or Word document. Students will see questions for the exam and subject they choose; answer keys stay hidden until they submit a practice.</p>
        </div>
        <div className="pqi-guide">
          <strong>Required columns</strong>
          <code>exam, subject, question, optionA, optionB, optionC, optionD, answer</code>
          <span>Use JAMB, WAEC, or NECO for the exam and A–D (or 1–4) for the answer. Add a year column to let students practice questions from a specific year. Explanation is optional. Quote fields containing commas or line breaks.</span>
          <button className="cx-btn" type="button" onClick={downloadTemplate}>Download CSV template</button>
        </div>
        <div className="pqi-pdf-settings">
          <strong>PDF and Word import settings</strong>
          <span>Choose default exam and subject for PDF and unstructured Word documents. Structured Word tables can provide exam and subject per row. Review and adjust each question’s exam and subject before importing to keep subject banks separate.</span>
          <div>
            <label>Exam<select value={pdfExam} onChange={(event) => setPdfExam(event.target.value)}><option>JAMB</option><option>WAEC</option><option>NECO</option></select></label>
            <label>Subject<input value={pdfSubject} onChange={(event) => setPdfSubject(event.target.value)} maxLength={100} placeholder="e.g. Mathematics" /></label>
            <label>Default question year (optional)<input type="number" min="1950" max={new Date().getFullYear() + 1} value={pdfYear} onChange={(event) => setPdfYear(event.target.value)} placeholder="e.g. 2024" /></label>
          </div>
          <small>PDF text is extracted directly; scanned pages use English OCR in your browser. The default year applies to PDF and unstructured Word imports; a Word table may supply a separate year per question. CSV/Word tables can also provide a separate year per question.</small>
        </div>
        <label className="pqi-file">
          <span>Choose a question bank CSV, PDF, or Word document</span>
          <input ref={inputRef} type="file" accept=".csv,text/csv,.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0])} />
          {fileName && <small>{fileName}</small>}
        </label>
        {processingStatus && <p className="pqi-processing" role="status">{processingStatus}</p>}
        {questions.length > 0 && pdfPreview && !error && (
          <div className="pqi-pdf-preview">
            <div className="pqi-preview-heading"><strong>{questions.length.toLocaleString()} questions loaded for review</strong><span>Verify each question’s exam and subject, text, all four options, and correct answer before importing.</span><div className="pqi-group-list">{questionGroups.map(([group, count]) => { const [groupExam, groupSubject] = group.split('\u0000'); return <span key={group}>{groupExam || 'Exam needed'} · {groupSubject || 'Subject needed'} <b>{count}</b></span> })}</div></div>
            {questions.map((question, index) => (
              <article className={`pqi-question-edit${question.answer < 0 ? ' pqi-needs-answer' : ''}`} key={`${index}-${question.question.slice(0, 30)}`}>
                <div className="pqi-question-edit-heading"><strong>Question {index + 1}</strong>{question.answer < 0 && <span className="pqi-review-flag">Answer needed</span>}<div className="pqi-question-location">
                  <label>Exam<select value={question.exam} onChange={(event) => updatePdfQuestion(index, { exam: event.target.value })} required><option value="">Choose exam</option><option>JAMB</option><option>WAEC</option><option>NECO</option></select></label>
                  <label>Subject<input value={question.subject} onChange={(event) => updatePdfQuestion(index, { subject: event.target.value })} maxLength={100} placeholder="e.g. Mathematics" required /></label>
                </div><label>Correct answer<select value={question.answer} onChange={(event) => updatePdfQuestion(index, { answer: Number(event.target.value) })} required><option value={-1}>Choose answer</option>{question.options.map((_option, optionIndex) => <option key={optionIndex} value={optionIndex}>{String.fromCharCode(65 + optionIndex)}</option>)}</select></label></div>
                <label>Question text<textarea value={question.question} maxLength={5000} rows={3} onChange={(event) => updatePdfQuestion(index, { question: event.target.value })} required /></label>
                <div className="pqi-option-edit-grid">{question.options.map((option, optionIndex) => <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}<input value={option} maxLength={1000} onChange={(event) => updatePdfOption(index, optionIndex, event.target.value)} required /></label>)}</div>
                <label>Question year (optional)<input type="number" min="1950" max={new Date().getFullYear() + 1} value={question.year ?? ''} onChange={(event) => updateQuestionYear(index, event.target.value)} placeholder="e.g. 2024" /></label>
                <label>Explanation (optional)<textarea value={question.explanation} maxLength={5000} rows={2} onChange={(event) => updatePdfQuestion(index, { explanation: event.target.value })} /></label>
              </article>
            ))}
          </div>
        )}
        {questions.length > 0 && !error && (
          <div className="pqi-ready" role="status">
            <div><strong>{questions.length.toLocaleString()} questions ready</strong><span>Import creates separate question groups for each exam and subject: {questionGroups.map(([group]) => { const [groupExam, groupSubject] = group.split('\u0000'); return `${groupExam || 'Exam needed'} · ${groupSubject || 'Subject needed'}` }).join('; ')}.</span></div>
            <button className="cx-btn gold" type="button" disabled={busy || questions.some((question) => !['JAMB', 'WAEC', 'NECO'].includes(question.exam) || !question.subject.trim() || question.answer < 0 || !question.question.trim() || question.options.some((option) => !option.trim()))} onClick={() => void importQuestions()}>{busy ? 'Importing...' : 'Import questions'}</button>
          </div>
        )}
        {error && <p className="pqi-error" role="alert">{error}</p>}
      </section>
      <section className="pqi-card">
        <div className="pqi-intro"><h2>Current question bank</h2><p>Questions currently available to prep-platform students. Delete an entire exam subject bank when it is no longer needed.</p></div>
        {counts.length === 0
          ? <p className="pqi-empty">No questions have been imported yet.</p>
          : <div className="pqi-table-wrap"><table className="pqi-table"><thead><tr><th>Exam</th><th>Subject</th><th>Questions</th><th>Action</th></tr></thead><tbody>
            {counts.map((item) => {
              const key = `${item.exam}\u0000${item.subject}`
              return <tr key={key}><td>{item.exam}</td><td>{item.subject}</td><td>{item.questions.toLocaleString()}</td><td><button className="cx-btn pqi-delete-button" type="button" disabled={deletingSubject === key} onClick={() => void deleteSubject(item)}>{deletingSubject === key ? 'Deleting subject...' : 'Delete subject'}</button></td></tr>
            })}
          </tbody></table></div>}
        {deleteError && <p className="pqi-error" role="alert">{deleteError}</p>}
      </section>
    </div>
  )
}
