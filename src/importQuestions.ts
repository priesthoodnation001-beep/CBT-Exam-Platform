// Reads questions a teacher already has (Excel, CSV, Word, or pasted text) and turns them into
// multiple-choice questions: a question, four options, and the correct one. Nothing here needs a library.

export type ImportedQuestion = { text: string; options: string[]; answer: number }
export type ImportProblem = { where: string; message: string }
export type ImportResult = { questions: ImportedQuestion[]; problems: ImportProblem[]; format: string }

export const MAX_IMPORT = 500
const MAX_TEXT = 2000
const MAX_OPTION = 300
const LETTERS = ['A', 'B', 'C', 'D']

const empty = (format: string, message: string): ImportResult => ({ questions: [], problems: [{ where: 'File', message }], format })

// ---------- checking one question ----------

type Raw = { where: string; text: string; options: string[]; answer: number; answerText?: string }

function finish(items: Raw[], format: string): ImportResult {
  const questions: ImportedQuestion[] = []
  const problems: ImportProblem[] = []
  for (const item of items) {
    if (questions.length >= MAX_IMPORT) { problems.push({ where: 'File', message: `Only the first ${MAX_IMPORT} questions were read. Import the rest in a second file.` }); break }
    const text = item.text.replace(/\s+/g, ' ').trim()
    const options = item.options.map((option) => option.replace(/\s+/g, ' ').trim())
    if (!text) { problems.push({ where: item.where, message: 'The question is empty.' }); continue }
    if (options.length !== 4 || options.some((option) => !option)) { problems.push({ where: item.where, message: 'It needs four options: A, B, C and D.' }); continue }
    if (new Set(options.map((option) => option.toLowerCase())).size !== 4) { problems.push({ where: item.where, message: 'Two options are the same. Each option must be different.' }); continue }
    if (!(item.answer >= 0 && item.answer <= 3)) { problems.push({ where: item.where, message: 'The correct answer is missing. Write A, B, C or D.' }); continue }
    if (text.length > MAX_TEXT || options.some((option) => option.length > MAX_OPTION)) { problems.push({ where: item.where, message: 'The question or an option is too long.' }); continue }
    questions.push({ text, options, answer: item.answer })
  }
  if (!questions.length && !problems.length) problems.push({ where: 'File', message: 'No questions were found.' })
  return { questions, problems, format }
}

// the correct answer can be written as A/B/C/D, "Option B", 1 to 4, or the text of the answer itself
function answerIndex(value: string, options: string[]): number {
  const v = value.trim()
  if (!v) return -1
  const letter = /^\(?\s*(?:option|choice|ans(?:wer)?)?\s*([a-d])\s*\)?[.)]?$/i.exec(v)
  if (letter) return letter[1].toUpperCase().charCodeAt(0) - 65
  if (/^[1-4]$/.test(v)) return Number(v) - 1
  return options.findIndex((option) => option.trim().toLowerCase() === v.toLowerCase())
}

// ---------- tables (Excel, CSV, pasted from Excel) ----------

export function parseDelimited(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || ''
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of firstLine) { if (ch === '"') quoted = !quoted; else if (!quoted && ch in counts) counts[ch] += 1 }
  const delimiter = counts['\t'] >= counts[','] && counts['\t'] >= counts[';'] && counts['\t'] > 0 ? '\t' : counts[';'] > counts[','] ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 1 } else quoted = false } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

export function fromTable(table: string[][], format: string): ImportResult {
  const rows = table.map((cells, index) => ({ cells: cells.map((cell) => String(cell ?? '').trim()), no: index + 1 })).filter((row) => row.cells.some(Boolean))
  if (!rows.length) return empty(format, 'The file is empty.')
  let cols = { q: 0, a: [1, 2, 3, 4], c: 5 }
  let start = 0
  const heading = rows[0].cells.map((cell) => cell.toLowerCase())
  if (heading.some((cell) => /question/.test(cell))) {
    start = 1
    const q = heading.findIndex((cell) => /question|^q$/.test(cell))
    const a = ['a', 'b', 'c', 'd'].map((letter) => heading.findIndex((cell) => new RegExp(`^(?:option|choice|opt)?\\s*\\(?${letter}\\)?[.:]?$`).test(cell)))
    const c = heading.findIndex((cell) => /correct|answer|^ans$|^key$/.test(cell))
    if (q < 0 || a.some((index) => index < 0) || c < 0) return empty(format, 'The column headings were not recognised. Please use the template: Question, Option A, Option B, Option C, Option D, Correct answer.')
    cols = { q, a, c }
  } else if (rows[0].cells.length < 6) return empty(format, 'The columns were not recognised. Please use the template: Question, Option A, Option B, Option C, Option D, Correct answer.')
  const items: Raw[] = []
  let examples = 0
  for (const row of rows.slice(start)) {
    const text = row.cells[cols.q] || ''
    if (/^\(example\)/i.test(text)) { examples += 1; continue } // the sample rows in the template
    const options = cols.a.map((index) => row.cells[index] || '')
    items.push({ where: `Row ${row.no}`, text, options, answer: answerIndex(row.cells[cols.c] || '', options) })
  }
  if (!items.length && examples) return empty(format, 'Only the three example rows were found. Replace them with your own questions, then upload the file again.')
  return finish(items, format)
}

// ---------- plain text (pasted from Word, or a .txt file) ----------

export function fromText(input: string, format = 'Text'): ImportResult {
  const lines: string[] = []
  for (const original of input.replace(/\r/g, '').split('\n')) {
    const line = original.trim()
    // options written side by side: "A. 3   B. 4   C. 5   D. 6"
    if (/(^|\s)\(?A[.)]\s.+\s\(?B[.)]\s.+\s\(?C[.)]\s.+\s\(?D[.)]\s/.test(line)) lines.push(...line.split(/\s+(?=\(?[B-D][.)]\s)/).map((part) => part.trim())); else lines.push(line)
  }
  const optionRe = /^\(?([A-Da-d])[.):\-]\s*(\S.*)$/
  const questionRe = /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):\-]\s*(\S.*)$/i
  const answerRe = /^(?:the\s+)?(?:correct\s+answer|correct|answer|ans|key)\s*(?:is)?\s*[:=\-]?\s*\(?([A-Da-d])\)?(?:[.)\s].*)?$/i
  type Current = { number: number; text: string; options: string[]; answer: number; last: number }
  const items: Raw[] = []
  let current: Current | null = null
  let count = 0
  const close = () => {
    if (!current) return
    const marker = current.options.findIndex((option) => /(\s*\*\s*|\s*\((?:correct|answer)\)\s*|\s*✓\s*)$/i.test(option))
    const options = current.options.map((option) => option.replace(/(\s*\*\s*|\s*\((?:correct|answer)\)\s*|\s*✓\s*)$/i, '').trim())
    items.push({ where: `Question ${current.number}`, text: current.text, options, answer: current.answer >= 0 ? current.answer : marker })
    current = null
  }
  const start = (text: string, number?: number) => { count += 1; current = { number: number ?? count, text, options: ['', '', '', ''], answer: -1, last: -1 } }
  const complete = (c: Current) => c.answer >= 0 || c.options.every(Boolean)
  for (const line of lines) {
    if (!line) continue
    const answer = answerRe.exec(line)
    if (answer && current) { (current as Current).answer = answer[1].toUpperCase().charCodeAt(0) - 65; close(); continue }
    const option = optionRe.exec(line)
    if (option && current) {
      const c = current as Current
      const index = option[1].toUpperCase().charCodeAt(0) - 65
      if (c.options[index]) { close(); start(line) ; continue } // the same letter again: a new question without a number
      c.options[index] = option[2]; c.last = index; continue
    }
    const numbered = questionRe.exec(line)
    if (numbered) { close(); start(numbered[2], Number(numbered[1])); continue }
    if (!current) { start(line); continue }
    const c = current as Current
    if (c.last >= 0) { if (complete(c) && c.options.every(Boolean) && c.answer >= 0) { close(); start(line) } else if (c.options.every(Boolean)) { close(); start(line) } else c.options[c.last] += ` ${line}` }
    else c.text += ` ${line}`
  }
  close()
  if (!items.length || items.every((item) => item.options.every((option) => !option))) {
    return empty(format, 'No questions were found. Write each question with its options as A. B. C. D. and a line such as "Answer: B".')
  }
  return finish(items, format)
}

// ---------- reading files ----------

function decodeText(buffer: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer) } catch { return new TextDecoder('windows-1252').decode(buffer) }
}

type ZipEntry = { method: number; csize: number; local: number }

function listZip(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('NOT_ZIP')
  const total = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const entries = new Map<string, ZipEntry>()
  for (let n = 0; n < total; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).replace(/\\/g, '/').replace(/^\//, '')
    entries.set(name, { method: view.getUint16(offset + 10, true), csize: view.getUint32(offset + 20, true), local: view.getUint32(offset + 42, true) })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true)
  const raw = bytes.subarray(start, start + entry.csize)
  if (entry.method === 0) return new TextDecoder().decode(raw)
  if (entry.method !== 8) throw new Error('UNSUPPORTED_ZIP')
  if (typeof DecompressionStream === 'undefined') throw new Error('NO_DECOMPRESS')
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new TextDecoder().decode(await new Response(stream).arrayBuffer())
}

const unescapeXml = (value: string) => value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
  .replace(/_x([0-9a-f]{4})_/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
  .replace(/&amp;/g, '&')

const textOf = (xml: string) => [...xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('')

export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer)
  const entries = listZip(bytes)
  const read = async (name: string) => { const entry = entries.get(name); return entry ? readEntry(bytes, entry) : '' }

  const strings: string[] = []
  for (const match of (await read('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) strings.push(textOf(match[1]))

  // the first sheet in the workbook is the Questions sheet
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const firstSheet = /<sheet\b[^>]*?r:id="([^"]+)"/.exec(await read('xl/workbook.xml'))
  if (firstSheet) {
    const rels = await read('xl/_rels/workbook.xml.rels')
    for (const rel of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (new RegExp(`Id="${firstSheet[1]}"`).test(rel[0])) {
        const target = /Target="([^"]+)"/.exec(rel[0])?.[1]
        if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
      }
    }
  }
  const sheet = await read(sheetPath)
  if (!sheet) throw new Error('NO_SHEET')

  const table: string[][] = []
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] || table.length + 1)
    const cells: string[] = []
    for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cell[1])?.[1] || ''
      let column = 0
      for (const ch of ref) column = column * 26 + (ch.charCodeAt(0) - 64)
      const type = /\bt="([^"]+)"/.exec(cell[1])?.[1] || 'n'
      const inner = cell[2] || ''
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? ''
      let value = ''
      if (type === 's') value = strings[Number(raw)] ?? ''
      else if (type === 'inlineStr') value = textOf(inner)
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
      else value = unescapeXml(raw)
      cells[Math.max(0, column - 1)] = value
    }
    while (table.length < rowNumber - 1) table.push([])
    table[rowNumber - 1] = Array.from(cells, (value) => value ?? '')
  }
  return table
}

export async function parseDocx(buffer: ArrayBuffer): Promise<{ text: string; table: string[][] }> {
  const bytes = new Uint8Array(buffer)
  const entries = listZip(bytes)
  const entry = entries.get('word/document.xml')
  if (!entry) throw new Error('NO_DOC')
  const xml = await readEntry(bytes, entry)
  const paragraph = (inner: string) => [...inner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g)].map((m) => (m[1] !== undefined ? unescapeXml(m[1]) : ' ')).join('')
  const table: string[][] = []
  for (const tr of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) table.push([...tr[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((tc) => [...tc[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paragraph(p[0])).join(' ').trim()))
  const lines = [...xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, '').matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((p) => paragraph(p[0]))
  return { text: lines.join('\n'), table }
}

const NOT_SUPPORTED = 'This kind of file cannot be read. Save it as Excel (.xlsx), CSV or Word (.docx), or paste the questions instead.'

export async function readQuestionFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase()
  try {
    const buffer = await file.arrayBuffer()
    if (/\.xlsx?m?$/.test(name) && !name.endsWith('.xls')) return fromTable(await parseXlsx(buffer), 'Excel file')
    if (name.endsWith('.csv')) { const text = decodeText(buffer); const table = parseDelimited(text); return table[0] && table[0].length >= 5 ? fromTable(table, 'CSV file') : fromText(text, 'CSV file') }
    if (name.endsWith('.txt')) return fromText(decodeText(buffer), 'Text file')
    if (name.endsWith('.docx')) {
      const doc = await parseDocx(buffer)
      if (doc.table.some((row) => row.length >= 5)) return fromTable(doc.table, 'Word file')
      return fromText(doc.text, 'Word file')
    }
    return empty('File', NOT_SUPPORTED)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    if (code === 'NO_DECOMPRESS') return empty('File', 'This browser cannot open that file. Save the file as CSV, or paste the questions instead.')
    return empty('File', name.endsWith('.xls') || name.endsWith('.doc') ? NOT_SUPPORTED : 'That file could not be read. Make sure it is not damaged or password protected. You can also paste the questions instead.')
  }
}

// text pasted from Excel (tab separated), from a CSV, or from Word
export function readPastedText(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return { questions: [], problems: [], format: 'Pasted text' }
  if (lines.filter((line) => line.split('\t').length >= 5).length >= Math.max(1, Math.floor(lines.length / 2))) return fromTable(parseDelimited(text), 'Pasted from Excel')
  if (/question/i.test(lines[0]) && /,|;/.test(lines[0]) && lines[0].split(/[,;]/).length >= 5) return fromTable(parseDelimited(text), 'Pasted table')
  return fromText(text, 'Pasted from Word')
}

export const LETTER_OF = (index: number) => LETTERS[index] || '?'
