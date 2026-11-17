import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import './password-input.css'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { toggleClassName?: string }

export default function PasswordInput({ className = '', toggleClassName = '', ...props }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <span className="password-input-wrap">
      <input {...props} className={className} type={visible ? 'text' : 'password'} />
      <button
        className={`password-toggle${toggleClassName ? ` ${toggleClassName}` : ''}`}
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a14.8 14.8 0 0 1-3.1 3.8M6.2 6.2C4.1 7.6 3 12 3 12s3.5 7 9 7a10 10 0 0 0 3-.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" /><circle cx="12" cy="12" r="2.5" /></svg>
        )}
      </button>
    </span>
  )
}
