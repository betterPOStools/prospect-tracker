interface HoursChipProps {
  workingHours?: Record<string, string>
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function parseTime(raw: string): number | null {
  const cleaned = raw.trim().toUpperCase()
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (!match) return null

  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  const period = match[3]

  if (hours < 1 || hours > 12) return null
  if (minutes < 0 || minutes > 59) return null

  if (period === 'AM' && hours === 12) hours = 0
  if (period === 'PM' && hours !== 12) hours += 12

  return hours * 60 + minutes
}

function parseRange(range: string): { open: number; close: number } | null {
  const parts = range.split('-')
  if (parts.length !== 2) return null

  const open = parseTime(parts[0])
  const close = parseTime(parts[1])
  if (open === null || close === null) return null

  return { open, close }
}

export default function HoursChip({ workingHours }: HoursChipProps) {
  if (!workingHours) return null

  const now = new Date()
  const dayName = DAYS[now.getDay()]
  const todayHours = workingHours[dayName]
  if (!todayHours) return null

  const range = parseRange(todayHours)
  if (!range) return null

  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const isOpen = currentMinutes >= range.open && currentMinutes < range.close

  if (isOpen) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-400 border border-green-500/30">
        Open {todayHours}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400 border border-slate-500/20">
      Closed
    </span>
  )
}
