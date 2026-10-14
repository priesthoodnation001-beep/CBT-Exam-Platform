import type { ReactNode } from 'react'
import { parseQuestionContent } from './question-content'

type ContentBlock = ReturnType<typeof parseQuestionContent>[number]

function renderBlock(block: ContentBlock, index: number): ReactNode {
  if (block.type === 'text') {
    return <p className="question-content-text" key={index}>{block.lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{line}</span>)}</p>
  }
  return (
    <div className="question-content-table-wrap" key={index}>
      <table className="question-content-table">
        <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{cell || '\u00a0'}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.header.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] || '\u00a0'}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export default function QuestionContent({ content }: { content: string }) {
  return <div className="question-content">{parseQuestionContent(content).map(renderBlock)}</div>
}
