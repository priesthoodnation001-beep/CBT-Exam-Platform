import { useEffect, useState } from 'react'
import './welcome-loading.css'

export default function WelcomeLoading({ name }: { name: string }) {
  const [secondsRemaining, setSecondsRemaining] = useState(5)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsRemaining((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const welcome = name.trim() ? `Welcome, ${name.trim()} to your space` : 'WELCOME TO YOUR SPACE'
  return (
    <main className="welcome-loading" role="status" aria-live="polite">
      <img className="welcome-loading-logo" src="/logo-512.png" alt="" aria-hidden="true" />
      <h1>{welcome}</h1>
      <div className="welcome-loading-widget" role="status" aria-label={`Loading your space, ${secondsRemaining} seconds`}>
        <span className="welcome-loading-track" aria-hidden="true"><span /></span>
        <span className="welcome-loading-label">Getting Your Space Ready:</span>
        <span className="welcome-loading-countdown">{secondsRemaining}s</span>
      </div>
    </main>
  )
}
