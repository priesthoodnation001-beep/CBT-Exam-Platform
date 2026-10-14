export type ContentBlock = { type: 'text'; lines: string[] } | { type: 'table'; header: string[]; rows: string[][] }

function cellsFromLine(line: string): string[] {
  const escapedPipe = '\u0000'
  const content = line.trim().replace(/\\\|/g, escapedPipe).replace(/^\|/, '').replace(/\|$/, '')
  return content.split('|').map((cell) => cell.replaceAll(escapedPipe, '|').trim())
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|')
}

function isSeparator(line: string): boolean {
  const cells = cellsFromLine(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

export function parseQuestionContent(content: string): ContentBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ContentBlock[] = []
  let index = 0

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    if (isTableLine(lines[index]) && lines[index + 1] && isTableLine(lines[index + 1]) && isSeparator(lines[index + 1])) {
      const header = cellsFromLine(lines[index])
      const rows: string[][] = []
      index += 2
      while (index < lines.length && isTableLine(lines[index])) {
        rows.push(cellsFromLine(lines[index]))
        index += 1
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    const text: string[] = []
    while (index < lines.length && lines[index].trim() && !(isTableLine(lines[index]) && lines[index + 1] && isTableLine(lines[index + 1]) && isSeparator(lines[index + 1]))) {
      text.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'text', lines: text })
  }

  return blocks
}

export function questionContentToHtml(content: string): string {
  const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character)
  return parseQuestionContent(content).map((block) => {
    if (block.type === 'text') return `<p class="question-content-text">${block.lines.map(escapeHtml).join('<br>')}</p>`
    const headings = block.header.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')
    const rows = block.rows.map((row) => `<tr>${block.header.map((_, cellIndex) => `<td>${escapeHtml(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')
    return `<div class="question-content-table-wrap"><table class="question-content-table"><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table></div>`
  }).join('')
}
