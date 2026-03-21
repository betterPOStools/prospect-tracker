import { useState, useCallback, useRef } from 'react'

export function useFlashMessage() {
  const [msg, setMsg] = useState(null) // { text, type: 'ok' | 'err' }
  const timer = useRef(null)

  const flash = useCallback((text, type = 'ok', duration = 4500) => {
    if (timer.current) clearTimeout(timer.current)
    setMsg({ text, type })
    timer.current = setTimeout(() => setMsg(null), duration)
  }, [])

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setMsg(null)
  }, [])

  return { msg, flash, clear }
}
