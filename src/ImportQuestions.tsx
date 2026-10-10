import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { LETTER_OF, readPastedText, readQuestionFile } from './questionImport'
import type { ImportResult, ImportedQuestion } from './questionImport'
import './import.css'

// A pop-up that lets a teacher bring in questions they already have. Three steps, plain words.

type Props = { subject: string; onClose: () => void; onAdd: (questions: ImportedQuestion[]) => void }
type Tab = 'file' | 'paste'

const ICONS = {
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  close: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  warn: 'M12 4l9 16H3L12 4z M12 10v4 M12 17.5v.5'
}

function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
}

const SAMPLE = `1. What is the capital of Nigeria?
A. Lagos
B. Abuja
C. Kano
D. Ibadan
Answer: B

2. Which gas do plants take in?
A. Oxygen
B. Carbon dioxide
C. Nitrogen
D. Helium
Answer: B`

export default function ImportQuestions({ subject, onClose, onAdd }: Props) {
  const [tab, setTab] = useState<Tab>('file')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)
  const resultBox = useRef<HTMLElement | null>(null)

  // when the result appears, bring it into view so the teacher sees it without scrolling
  useEffect(() => { if (result) resultBox.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [result])

  // check pasted text a moment after the teacher stops typing
  useEffect(() => {
    if (tab !== 'paste') return
    if (!pasted.trim()) { setResult(null); return }
    const timer = window.setTimeout(() => setResult(readPastedText(pasted)), 300)
    return () => window.clearTimeout(timer)
  }, [pasted, tab])

  const choose = async (file?: File | null) => {
    if (!file) return
    setBusy(true); setFileName(file.name); setResult(null); setShowAll(false)
    try { setResult(await readQuestionFile(file)) } finally { setBusy(false) }
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); void choose(event.dataTransfer.files?.[0]) }
  const switchTab = (next: Tab) => { setTab(next); setResult(null); setFileName(''); setShowAll(false) }

  const ready = result?.questions.length || 0
  const problems = result?.problems || []

  return (
    <div className="iq-wrap" role="dialog" aria-modal="true" aria-label="Import questions">
      <div className="iq-backdrop" onClick={onClose} />
      <div className="iq-card">
        <header className="iq-head">
          <div className="iq-head-icon"><Icon name="upload" size={22} /></div>
          <div><h2>Import questions</h2><p>Bring in questions you already have. No retyping.</p></div>
          <button className="iq-x" type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
        </header>

        <div className="iq-body">
          <p className="iq-subject">These will be added to <strong>{subject}</strong>. You can check and change every question before you submit.</p>

          <div className="iq-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'file'} className={tab === 'file' ? 'active' : ''} onClick={() => switchTab('file')}>From a file</button>
            <button type="button" role="tab" aria-selected={tab === 'paste'} className={tab === 'paste' ? 'active' : ''} onClick={() => switchTab('paste')}>Paste questions</button>
          </div>

          {tab === 'file' && (
            <>
              <ol className="iq-steps">
                <li>
                  <span className="iq-n">1</span>
                  <div>
                    <strong>Get the template</strong>
                    <p>One question on each row: the question, four options, and the correct answer (A, B, C or D).</p>
                    <div className="iq-links">
                      <a className="iq-btn" href="/question-template.xlsx" download><Icon name="download" size={17} />Download Excel template</a>
                      <a className="iq-link" href="/question-template.csv" download>or the CSV version</a>
                    </div>
                  </div>
                </li>
                <li>
                  <span className="iq-n">2</span>
                  <div><strong>Fill it in</strong><p>Open it in Excel or Google Sheets, type your questions, and save the file.</p></div>
                </li>
                <li>
                  <span className="iq-n">3</span>
                  <div>
                    <strong>Choose your file</strong>
                    <div className={`iq-drop ${dragging ? 'over' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') input.current?.click() }}>
                      <Icon name="upload" size={28} />
                      <strong>{busy ? 'Reading your file...' : fileName ? fileName : 'Click here to choose your file'}</strong>
                      <span>{fileName ? 'Click to choose a different file' : 'or drag it here. Excel (.xlsx), CSV, or Word (.docx)'}</span>
                      <input ref={input} type="file" accept=".xlsx,.csv,.docx,.txt" hidden onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
                    </div>
                  </div>
                </li>
              </ol>
              <details className="iq-more">
                <summary>My questions are in a Word document</summary>
                <p>Upload the .docx file if each question is typed like the example below, with the choices labelled A. B. C. D. and a line saying "Answer: B". If your list is numbered automatically by Word, copy it and use <strong>Paste questions</strong> instead.</p>
                <pre>{SAMPLE}</pre>
              </details>
            </>
          )}

          {tab === 'paste' && (
            <div className="iq-paste">
              <p>Copy your questions from Word, Excel or Google Sheets, then paste them here. We check them as you paste.</p>
              <textarea value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={SAMPLE} rows={10} spellCheck={false} />
              <div className="iq-paste-foot">
                <details className="iq-more">
                  <summary>How should I type them?</summary>
                  <p>Write each question, then its four options starting with A. B. C. D., then a line like <strong>Answer: B</strong>. Numbers are optional. If you copy rows from Excel, use the template columns: Question, Option A, B, C, D, Correct answer.</p>
                </details>
                {pasted && <button type="button" className="iq-link" onClick={() => setPasted('')}>Clear</button>}
              </div>
            </div>
          )}

          {result && (
            <section className="iq-result" aria-live="polite" ref={resultBox}>
              {ready > 0 && <div className="iq-ok"><Icon name="check" size={20} /><strong>{ready} question{ready === 1 ? '' : 's'} ready to add</strong></div>}
              {problems.length > 0 && (
                <div className="iq-warn">
                  <div className="iq-warn-head"><Icon name="warn" size={20} /><strong>{ready === 0 ? 'We could not use this file' : `${problems.length} item${problems.length === 1 ? '' : 's'} need fixing`}</strong></div>
                  <ul>{(showAll ? problems : problems.slice(0, 6)).map((problem, index) => <li key={index}><b>{problem.where}:</b> {problem.message}</li>)}</ul>
                  {problems.length > 6 && <button type="button" className="iq-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${problems.length}`}</button>}
                  {ready > 0 && <p className="iq-skip">These will be skipped. Fix them in your file and import again if you want them included.</p>}
                </div>
              )}
              {ready > 0 && (
                <div className="iq-preview">
                  <p className="iq-hint">A look at the first {Math.min(3, ready)}:</p>
                  {result.questions.slice(0, 3).map((question, index) => (
                    <article key={index}>
                      <strong>{index + 1}. {question.text}</strong>
                      <ul>{question.options.map((option, position) => <li key={position} className={position === question.answer ? 'right' : ''}><b>{LETTER_OF(position)}.</b> {option}{position === question.answer && <em> correct</em>}</li>)}</ul>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        <footer className="iq-foot">
          <button type="button" className="iq-cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="iq-add" disabled={ready === 0} onClick={() => result && onAdd(result.questions)}>{ready > 0 ? `Add ${ready} question${ready === 1 ? '' : 's'} to my draft` : 'Add questions'}</button>
        </footer>
      </div>
    </div>
  )
}
