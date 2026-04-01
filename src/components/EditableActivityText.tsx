import { useState, useRef, useEffect } from 'react'

interface EditableActivityTextProps {
  text: string
  onSave: (newText: string) => void
  className?: string
}

export default function EditableActivityText({ text, onSave, className = '' }: EditableActivityTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [editing])

  function startEdit() {
    setDraft(text)
    setEditing(true)
  }

  function save() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== text) {
      onSave(trimmed)
    }
    setEditing(false)
  }

  function cancel() {
    setDraft(text)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        rows={2}
        className="w-full rounded border border-[#1e2535] bg-[#0f1117] px-1.5 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      className={`cursor-pointer rounded px-0.5 hover:bg-[#1e2535] group-hover/note:underline ${className}`}
      title="Click to edit"
    >
      {text}
    </span>
  )
}
