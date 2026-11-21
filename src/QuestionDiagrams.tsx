import { useState } from 'react'
import { API_BASE } from './apiBase'

// Pictures (diagrams) on school exam questions: a teacher can add up to 4 per question, and students see them with the question.
const MAX_PICTURES = 4

export const diagramUrl = (name: string) => `${API_BASE}/api/diagrams/${name}`

// Shrinks big photos before upload (long side 1400 px) so pictures stay small and quick to load during an exam.
async function prepareImage(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPG, WEBP or GIF picture.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the picture.')
  const keepsPng = file.type !== 'image/jpeg'
  if (!keepsPng) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height) }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, keepsPng ? 'image/png' : 'image/jpeg', 0.88))
  if (!blob) throw new Error('Could not prepare the picture.')
  if (blob.size > 4_000_000) throw new Error('This picture is too large. Please use a smaller one.')
  return blob
}

const pictureStyle = { display: 'block', maxWidth: '100%', maxHeight: 360, height: 'auto', background: '#fff', border: '1px solid rgba(128,128,128,0.35)', borderRadius: 8, padding: 4, boxSizing: 'border-box' as const }

// Read-only: shows a question's pictures (students, preview and review screens).
export function DiagramGallery({ images }: { images?: string[] }) {
  if (!images || images.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: 10, margin: '10px 0' }}>
      {images.map((name) => <img key={name} src={diagramUrl(name)} alt="Diagram for this question" loading="lazy" style={pictureStyle} />)}
    </div>
  )
}

type PickerProps = { token: string | null; images: string[]; onChange: (images: string[]) => void; showNotice: (message: string) => void }

// For teachers: add pictures to the question being written or corrected, and remove ones that are not needed.
export function DiagramPicker({ token, images, onChange, showNotice }: PickerProps) {
  const [busy, setBusy] = useState(false)

  async function addFiles(files: FileList | null) {
    const chosen = Array.from(files || [])
    if (!chosen.length) return
    const room = MAX_PICTURES - images.length
    if (room <= 0) { showNotice(`A question can have up to ${MAX_PICTURES} pictures.`); return }
    setBusy(true)
    const added: string[] = []
    try {
      for (const file of chosen.slice(0, room)) {
        const blob = await prepareImage(file)
        const response = await fetch(`${API_BASE}/api/diagrams`, { method: 'POST', headers: { 'Content-Type': blob.type, Authorization: `Bearer ${token}` }, body: blob })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not save the picture.')
        added.push(String(body.image))
      }
      if (chosen.length > room) showNotice(`Only ${MAX_PICTURES} pictures fit on one question, so the extra ones were skipped.`)
    } catch (failure) {
      showNotice(failure instanceof Error ? failure.message : 'Could not save the picture.')
    } finally {
      if (added.length) onChange([...images, ...added])
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8, margin: '8px 0' }}>
      <strong>Diagrams (optional)</strong>
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {images.map((name) => (
            <div key={name} style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
              <img src={diagramUrl(name)} alt="Diagram for this question" style={{ ...pictureStyle, maxWidth: 170, maxHeight: 130 }} />
              <button className="secondary-button small-button" type="button" disabled={busy} onClick={() => onChange(images.filter((item) => item !== name))}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <label className="secondary-button small-button" style={{ cursor: 'pointer', width: 'fit-content' }}>
        {busy ? 'Saving picture...' : images.length ? 'Add another diagram' : 'Add diagram'}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden disabled={busy || images.length >= MAX_PICTURES} onChange={(event) => { const files = event.target.files; void addFiles(files).finally(() => { event.target.value = '' }) }} />
      </label>
      <small>Pick a picture from your computer. You can add up to {MAX_PICTURES} per question. Students see them under the question.</small>
    </div>
  )
}
