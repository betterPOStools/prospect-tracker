import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

type FlashType = 'success' | 'error' | 'info'

interface FlashMessage {
  id: string
  text: string
  type: FlashType
}

interface FlashContextValue {
  flash: (message: string, type?: FlashType) => void
}

// ── Context ─────────────────────────────────────────────────────────────────

const FlashContext = createContext<FlashContextValue | null>(null)

// ── Style map ───────────────────────────────────────────────────────────────

const TYPE_CLASSES: Record<FlashType, string> = {
  success:
    'border-green-200 bg-green-50 text-green-800',
  error:
    'border-red-200 bg-red-50 text-red-800',
  info:
    'border-blue-200 bg-blue-50 text-blue-800',
}

const ICON: Record<FlashType, string> = {
  success: '\u2713',
  error: '\u2717',
  info: '\u24D8',
}

// ── Auto-dismiss duration (ms) ──────────────────────────────────────────────

const DISMISS_MS = 3000

// ── Provider ────────────────────────────────────────────────────────────────

export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<FlashMessage[]>([])
  const counterRef = useRef(0)

  const flash = useCallback((text: string, type: FlashType = 'success') => {
    const id = `flash-${++counterRef.current}`
    setMessages((prev) => [...prev, { id, text, type }])

    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id))
    }, DISMISS_MS)
  }, [])

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return (
    <FlashContext.Provider value={{ flash }}>
      {children}

      {/* Toast overlay — fixed at top center, above everything */}
      {messages.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex flex-col items-center gap-2 px-4 pt-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              role="status"
              className={`pointer-events-auto animate-fade-in flex max-w-sm items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg ${TYPE_CLASSES[msg.type]}`}
            >
              <span className="shrink-0 text-base leading-none">{ICON[msg.type]}</span>
              <span className="flex-1">{msg.text}</span>
              <button
                type="button"
                className="ml-2 shrink-0 text-current opacity-50 hover:opacity-100"
                onClick={() => dismiss(msg.id)}
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </FlashContext.Provider>
  )
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useFlash(): FlashContextValue {
  const ctx = useContext(FlashContext)
  if (!ctx) {
    throw new Error('useFlash must be used within a FlashProvider')
  }
  return ctx
}
