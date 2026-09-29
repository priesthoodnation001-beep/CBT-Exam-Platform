type Question = { subject: string; text: string; options: string[]; answer?: number }

type Props = { questions: Question[] }

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character)
}

export default function QuestionPrintButton({ questions }: Props) {
  const printQuestions = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    const body = questions.map((question, index) => `<article><h3>${index + 1}. ${escapeHtml(question.text)}</h3><ol type="A">${question.options.map((option) => `<li>${escapeHtml(option)}</li>`).join('')}</ol></article>`).join('')
    printWindow.document.write(`<html><head><title>TIMPRIEST EDU Question Paper</title><style>body{font-family:Arial,sans-serif;color:#17221d;padding:36px;max-width:800px;margin:auto}h1{font-family:Georgia,serif;color:#173c32;border-bottom:2px solid #e5a43e;padding-bottom:12px}p{color:#63746b}article{border-bottom:1px solid #dce4dc;padding:15px 0}h3{font-size:15px}li{padding:4px;color:#4c5f55}</style></head><body><h1>TIMPRIEST EDU Question Paper</h1><p>${questions.length} questions · Print date: ${new Date().toLocaleDateString()}</p>${body}</body></html>`)
    printWindow.document.close(); printWindow.focus(); printWindow.print(); printWindow.close()
  }

  return <button className="secondary-button" type="button" onClick={printQuestions}>Print questions</button>
}
