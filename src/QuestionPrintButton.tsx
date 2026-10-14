import { questionContentToHtml } from './question-content'

type Question = { subject: string; text: string; options: string[]; answer?: number }
type Props = { questions: Question[] }

export default function QuestionPrintButton({ questions }: Props) {
  const printQuestions = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) return
    const body = questions.map((question, index) => `<article><h3>${index + 1}.</h3><div class="printed-question">${questionContentToHtml(question.text)}</div><ol type="A">${question.options.map((option) => `<li>${questionContentToHtml(option)}</li>`).join('')}</ol></article>`).join('')
    printWindow.document.write(`<html><head><title>TIMPRIEST EDU Question Paper</title><style>body{font-family:Arial,sans-serif;color:#17221d;padding:36px;max-width:800px;margin:auto}h1{font-family:Georgia,serif;color:#173c32;border-bottom:2px solid #e5a43e;padding-bottom:12px}p{color:#63746b}article{border-bottom:1px solid #dce4dc;padding:15px 0}h3{font-size:15px}li{padding:4px;color:#4c5f55}.question-content-text{white-space:normal}.question-content-table-wrap{overflow-x:auto;margin:10px 0}.question-content-table{width:100%;border-collapse:collapse;font-size:13px}.question-content-table th,.question-content-table td{border:1px solid #b9c7bb;padding:7px 9px;text-align:left}</style></head><body><h1>TIMPRIEST EDU Question Paper</h1><p>${questions.length} questions · Print date: ${new Date().toLocaleDateString()}</p>${body}</body></html>`)
    printWindow.document.close(); printWindow.focus(); printWindow.print(); printWindow.close()
  }

  return <button className="secondary-button" type="button" onClick={printQuestions}>Print questions</button>
}
