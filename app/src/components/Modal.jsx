import { useEffect, useRef } from 'react'
import styles from './Modal.module.css'

export default function Modal({ title, onClose, children, maxWidth }) {
  const boxRef        = useRef(null)
  const onCloseRef    = useRef(onClose)
  const mouseDownOnOverlay = useRef(false)

  // Keep ref current without re-running effects
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // Auto-focus first element on mount only
  useEffect(() => {
    const el = boxRef.current?.querySelector('button, input, select, textarea, a[href], [tabindex]')
    el?.focus()
  }, [])

  // Keydown listener — stable, uses ref for onClose
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onCloseRef.current?.(); return }
      // Basic focus trap
      if (e.key === 'Tab' && boxRef.current) {
        const focusable = [...boxRef.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
          .filter(el => !el.disabled && el.tabIndex !== -1)
        if (!focusable.length) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true"
      aria-label={title || 'Dialog'}
      onMouseDown={e => { mouseDownOnOverlay.current = e.target === e.currentTarget }}
      onClick={e => { if (mouseDownOnOverlay.current && e.target === e.currentTarget) onCloseRef.current?.() }}>
      <div ref={boxRef} className={styles.box} style={maxWidth ? { maxWidth } : undefined}>
        {title && <div className={styles.title}>{title}</div>}
        {children}
      </div>
    </div>
  )
}
