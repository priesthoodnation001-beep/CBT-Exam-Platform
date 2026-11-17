import { useState } from 'react'
import { DEFAULT_SCHOOL_COLOR, SCHOOL_COLOR_PRESETS, schoolColorText } from './schoolColor'
import './school-appearance.css'

type Props = {
  color: string
  onSave: (color: string) => Promise<void>
}

export default function SchoolAppearance({ color, onSave }: Props) {
  const [selectedColor, setSelectedColor] = useState(color || DEFAULT_SCHOOL_COLOR)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave(selectedColor)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the school color.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="section-heading">
        <div><p className="eyebrow">Personalize your portal</p><h2>School appearance</h2></div>
      </div>
      <section className="school-appearance-panel" aria-labelledby="school-color-title">
        <div>
          <h3 id="school-color-title">Choose your school color</h3>
          <p>This color will be used across your school’s Admin, Teacher, and Student dashboards.</p>
        </div>
        <div className="school-color-presets" aria-label="Color presets">
          {SCHOOL_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              className={`school-color-swatch${selectedColor.toLowerCase() === preset.value ? ' selected' : ''}`}
              type="button"
              style={{ backgroundColor: preset.value }}
              aria-label={preset.name}
              aria-pressed={selectedColor.toLowerCase() === preset.value}
              title={preset.name}
              onClick={() => setSelectedColor(preset.value)}
            />
          ))}
        </div>
        <label className="school-color-custom">
          <span>Or choose a custom color</span>
          <input type="color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)} />
          <code>{selectedColor.toUpperCase()}</code>
        </label>
        <div className="school-color-preview" style={{ backgroundColor: selectedColor, color: schoolColorText(selectedColor) }}>
          <strong>Dashboard preview</strong>
          <span>{selectedColor.toUpperCase()}</span>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="button" disabled={busy || selectedColor.toLowerCase() === color.toLowerCase()} onClick={() => void save()}>
          {busy ? 'Saving...' : 'Save school color'}
        </button>
      </section>
    </>
  )
}
