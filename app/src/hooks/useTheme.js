import { useState, useEffect } from 'react'

// Apply saved theme immediately before React renders (avoids flash)
const saved = localStorage.getItem('vs_theme')
if (saved) document.documentElement.setAttribute('data-theme', saved)

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('vs_theme') || 'light'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('vs_theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggleTheme }
}
