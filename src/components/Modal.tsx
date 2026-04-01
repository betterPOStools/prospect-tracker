import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" className={`animate-slide-up w-full rounded-t-xl bg-[#161b27] border border-[#1e2535] shadow-2xl shadow-black/50 sm:rounded-xl ${SIZE[size]} max-h-[90vh] flex flex-col`}>
        {title && (
          <div className="flex items-center justify-between border-b border-[#1e2535] px-4 py-3">
            <h2 className="font-semibold text-slate-100">{title}</h2>
            <button
              className="rounded-lg p-1 text-slate-500 hover:bg-[#1e2535] hover:text-slate-300"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
