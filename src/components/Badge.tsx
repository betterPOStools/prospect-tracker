import type { Priority } from '../types'
import { PRIORITY_COLOR, PRIORITY_EMOJI } from '../types'

interface PriorityBadgeProps {
  priority: Priority
  score?: number
}

export function PriorityBadge({ priority, score }: PriorityBadgeProps) {
  const color = PRIORITY_COLOR[priority]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors duration-150"
      style={{ background: color + '22', color }}
    >
      {PRIORITY_EMOJI[priority]} {priority}
      {score !== undefined && <span className="opacity-70">{score}</span>}
    </span>
  )
}

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

const VARIANT_CLASSES: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  success: 'bg-green-500/15 text-green-400 border border-green-500/30',
  warning: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/30',
  info: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150 ${VARIANT_CLASSES[variant]}`}>
      {children}
    </span>
  )
}
