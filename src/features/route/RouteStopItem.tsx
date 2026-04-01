import type { CanvassStop, MapsApp, StopStatus } from '../../types'
import { Badge } from '../../components/Badge'
import Button from '../../components/Button'
import { isNative } from '../../lib/platform'

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<StopStatus, string> = {
  queued: 'Queued',
  not_visited: 'Not visited',
  come_back_later: 'Come back',
  dm_unavailable: 'DM unavail.',
  canvassed: 'Canvassed',
  converted: 'Converted',
  dropped: 'Dropped',
}

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

const STATUS_BADGE_VARIANT: Record<StopStatus, BadgeVariant> = {
  queued: 'default',
  not_visited: 'info',
  come_back_later: 'warning',
  dm_unavailable: 'warning',
  canvassed: 'success',
  converted: 'success',
  dropped: 'danger',
}

// ── Navigation helpers ───────────────────────────────────────────────────────

function buildSingleStopUrl(stop: CanvassStop, mapsApp: MapsApp, useCoords: boolean): string {
  const hasCoords = stop.lat != null && stop.lng != null

  if (mapsApp === 'waze') {
    if (hasCoords && useCoords) {
      return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`
    }
    if (hasCoords) {
      return `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`
    }
    return `https://waze.com/ul?q=${encodeURIComponent(stop.address ?? stop.name)}&navigate=yes`
  }

  // Coordinate mode — use lat/lng directly (Google Maps or Apple Maps URL format)
  if (useCoords && hasCoords) {
    return `https://maps.google.com/?q=${stop.lat},${stop.lng}`
  }

  // Address mode (default)
  return `https://maps.google.com/?q=${encodeURIComponent(stop.address ?? `${stop.lat},${stop.lng}`)}`
}

function openUrl(url: string) {
  window.open(url, isNative ? '_system' : '_blank')
}

// ── Props ────────────────────────────────────────────────────────────────────

interface RouteStopItemProps {
  stop: CanvassStop
  index: number           // 0-based index in the ordered list
  total: number           // total stops in list
  mapsApp: MapsApp
  isOptimized: boolean    // hide up/down arrows when route is optimized
  useCoords: boolean      // use lat/lng instead of address in map URLs
  onMoveUp: () => void
  onMoveDown: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RouteStopItem({
  stop,
  index,
  total,
  mapsApp,
  isOptimized,
  useCoords,
  onMoveUp,
  onMoveDown,
}: RouteStopItemProps) {
  const number = index + 1

  function handleNavigate() {
    const url = buildSingleStopUrl(stop, mapsApp, useCoords)
    openUrl(url)
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#1e2535] bg-[#161b27] p-3">
      {/* Number */}
      <div className="flex flex-col items-center pt-0.5">
        <span data-testid="stop-number" className="text-sm font-bold text-slate-300 tabular-nums w-6 text-center">
          {number}
        </span>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-100">{stop.name}</p>
        {stop.address && (
          <p className="mt-0.5 truncate text-xs text-slate-500">{stop.address}</p>
        )}
        <div className="mt-1">
          <Badge variant={STATUS_BADGE_VARIANT[stop.status]}>
            {STATUS_LABEL[stop.status]}
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-1">
        {/* Manual reorder arrows — only when not optimized */}
        {!isOptimized && (
          <div className="flex flex-col gap-0.5">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="Move stop up"
              className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-[#1e2535] hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label="Move stop down"
              className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-[#1e2535] hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ▼
            </button>
          </div>
        )}

        {/* Navigate button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleNavigate}
          aria-label={`Navigate to ${stop.name}`}
        >
          Nav
        </Button>
      </div>
    </div>
  )
}
