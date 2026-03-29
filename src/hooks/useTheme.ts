import { useState, useEffect, useCallback } from 'react'
import { settings } from '../lib/storage'

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => settings.getTheme())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const setTheme = useCallback((next: 'light' | 'dark') => {
    settings.setTheme(next)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }, [theme, setTheme])

  return { theme, setTheme, toggle }
}
