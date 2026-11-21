import { useEffect, useRef, useState } from 'react'

export default function useMinimumWelcomeDuration(active: boolean) {
  const [visible, setVisible] = useState(active)
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (active) {
      if (startedAt.current === null) startedAt.current = Date.now()
      setVisible(true)
      return
    }

    if (startedAt.current === null) {
      setVisible(false)
      return
    }

    const remaining = Math.max(0, 2_000 - (Date.now() - startedAt.current))
    const timer = window.setTimeout(() => {
      startedAt.current = null
      setVisible(false)
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [active])

  return visible
}
