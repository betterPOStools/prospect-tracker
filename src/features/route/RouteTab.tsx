import { useState, useCallback, useMemo } from 'react'
import { useStops } from '../../store/StopsContext'
import { useOffline } from '../../store/OfflineContext'
import { settings } from '../../lib/storage'
import { isNative } from '../../lib/platform'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import RouteStopItem from './RouteStopItem'
import { optimizeRoute, geocodeAddress } from './routeXL'
import type { CanvassStop } from '../../types'

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_WAYPOINTS = 10
const RXL_MAX_FREE = 20

// ── Leg navigation helpers ───────────────────────────────────────────────────

function buildLegUrl(leg: CanvassStop[]): string {
  const waypoints = leg.map((s) =>
    encodeURIComponent(s.address ?? (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : s.name)),
  )
  return `https://www.google.com/maps/dir/${waypoints.join('/')}`
}

function openUrl(url: string) {
  window.open(url, isNative ? '_system' : '_blank')
}

// ── Split ordered stops into legs of MAX_WAYPOINTS ───────────────────────────

function buildLegs(stops: CanvassStop[]): CanvassStop[][] {
  const legs: CanvassStop[][] = []
  for (let i = 0; i < stops.length; i += MAX_WAYPOINTS) {
    legs.push(stops.slice(i, i + MAX_WAYPOINTS))
  }
  return legs
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RouteTab() {
  const stops = useStops()
  const { isOnline } = useOffline()

  // Determine today's stop list
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  const todayStops = useMemo<CanvassStop[]>(() => {
    const byDay = stops.filter((s) => s.day === today)
    if (byDay.length > 0) return byDay
    // Fallback: all queued / not_visited stops
    return stops.filter((s) => s.status === 'queued' || s.status === 'not_visited')
  }, [stops, today])

  // Local ordering state
  const [orderedStops, setOrderedStops] = useState<CanvassStop[]>(() => todayStops)
  const [originalOrder, setOriginalOrder] = useState<CanvassStop[]>(() => todayStops)
  const [isOptimized, setIsOptimized] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)

  // Keep orderedStops in sync when the context stops change (unless user has optimized)
  // We intentionally only do this on first render — the user controls order after that.

  const mapsApp = settings.getMapsApp()

  const stopsMissingCoords = orderedStops.filter((s) => s.lat == null || s.lng == null)
  const hasMissingCoords = stopsMissingCoords.length > 0
  const overFreeLimit = orderedStops.length > RXL_MAX_FREE

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleResetOrder = useCallback(() => {
    setOrderedStops(originalOrder)
    setIsOptimized(false)
    setOptimizeError(null)
  }, [originalOrder])

  const handleCopyAddresses = useCallback(async () => {
    const text = orderedStops
      .map((s) => s.address ?? s.name)
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback: select from a textarea
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }, [orderedStops])

  const handleGeocodeAll = useCallback(async () => {
    setGeocoding(true)
    const updated = [...orderedStops]
    for (let i = 0; i < updated.length; i++) {
      const s = updated[i]
      if (s.lat == null || s.lng == null) {
        if (s.address) {
          const coords = await geocodeAddress(s.address)
          if (coords) {
            updated[i] = { ...s, lat: coords.lat, lng: coords.lng }
          }
        }
      }
    }
    setOrderedStops(updated)
    setGeocoding(false)
  }, [orderedStops])

  const handleOptimize = useCallback(async () => {
    const username = settings.getRxlUser()
    const password = settings.getRxlPass()
    if (!username || !password) {
      setOptimizeError('RouteXL credentials not set. Add them in Settings.')
      return
    }

    // Only include stops with coordinates
    const stopsWithCoords = orderedStops.filter((s) => s.lat != null && s.lng != null)
    if (!stopsWithCoords.length) {
      setOptimizeError('No stops have coordinates. Use "Geocode missing" first.')
      return
    }

    setOptimizing(true)
    setOptimizeError(null)

    try {
      const rxlStops = stopsWithCoords.map((s) => ({
        name: s.name,
        lat: s.lat as number,
        lng: s.lng as number,
      }))

      const result = await optimizeRoute(rxlStops, username, password)

      if (result.error) {
        setOptimizeError(result.error)
        return
      }

      // Re-order orderedStops to match the RouteXL result order.
      // The result route keys are string indices whose values contain the stop name.
      const sortedKeys = Object.keys(result.route).sort((a, b) => {
        const deptA = result.route[a].departure ?? 0
        const deptB = result.route[b].departure ?? 0
        return deptA - deptB
      })

      // Build a map of name → stop for fast lookup
      const nameMap = new Map(stopsWithCoords.map((s) => [s.name, s]))
      const reordered: CanvassStop[] = []
      for (const key of sortedKeys) {
        const rxl = result.route[key]
        const match = nameMap.get(rxl.name)
        if (match) reordered.push(match)
      }

      // Append any stops that didn't have coords (they stay at the end)
      const withoutCoords = orderedStops.filter((s) => s.lat == null || s.lng == null)

      // Save original before first optimization
      if (!isOptimized) {
        setOriginalOrder([...orderedStops])
      }

      setOrderedStops([...reordered, ...withoutCoords])
      setIsOptimized(true)
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : 'Optimization failed.')
    } finally {
      setOptimizing(false)
    }
  }, [orderedStops, isOptimized])

  // ── Manual reorder helpers ────────────────────────────────────────────────

  const moveStop = useCallback((index: number, direction: 'up' | 'down') => {
    setOrderedStops((prev) => {
      const next = [...prev]
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      if (swapIndex < 0 || swapIndex >= next.length) return prev
      ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
      return next
    })
  }, [])

  // ── Empty state ──────────────────────────────────────────────────────────

  if (!orderedStops.length) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <EmptyState
          title="No stops for today"
          description="Assign stops in the Planner or add them from the Database."
        />
      </div>
    )
  }

  // ── Leg rendering ────────────────────────────────────────────────────────

  const legs = buildLegs(orderedStops)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">
          Route — {orderedStops.length} stop{orderedStops.length !== 1 ? 's' : ''} for {today}
        </h2>

        {/* Over-limit warning */}
        {overFreeLimit && (
          <div className="mt-2 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            RouteXL free tier supports max 20 stops. Only the first 20 will be optimized.
          </div>
        )}

        {/* Offline warning */}
        {!isOnline && (
          <div className="mt-2 rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-800">
            You are offline. Optimization is unavailable.
          </div>
        )}

        {/* Optimize error */}
        {optimizeError && (
          <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
            {optimizeError}
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleResetOrder}
          disabled={!isOptimized && orderedStops === originalOrder}
        >
          Reset Order
        </Button>

        <Button variant="secondary" size="sm" onClick={handleCopyAddresses}>
          Copy Addresses
        </Button>

        {hasMissingCoords && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGeocodeAll}
            disabled={geocoding || !isOnline}
          >
            {geocoding ? 'Geocoding…' : `Geocode missing (${stopsMissingCoords.length})`}
          </Button>
        )}

        <Button
          variant="primary"
          size="sm"
          onClick={handleOptimize}
          disabled={optimizing || !isOnline}
        >
          {optimizing ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Optimizing…
            </span>
          ) : (
            'Optimize Route'
          )}
        </Button>
      </div>

      {/* Stop list with leg dividers */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-2">
          {legs.map((leg, legIndex) => (
            <div key={legIndex}>
              {/* Leg header: "Start Leg N in Maps" — shown before each leg except first when it is the only leg */}
              {(legs.length > 1 || legIndex > 0) && (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Leg {legIndex + 1}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openUrl(buildLegUrl(leg))}
                    aria-label={`Start Leg ${legIndex + 1} in Maps`}
                  >
                    Start Leg {legIndex + 1} in Maps
                  </Button>
                </div>
              )}

              {/* Stops in this leg */}
              {leg.map((stop, stopIndexInLeg) => {
                const globalIndex = legIndex * MAX_WAYPOINTS + stopIndexInLeg
                return (
                  <div key={stop.id} className="mb-2">
                    <RouteStopItem
                      stop={stop}
                      index={globalIndex}
                      total={orderedStops.length}
                      mapsApp={mapsApp}
                      isOptimized={isOptimized}
                      onMoveUp={() => moveStop(globalIndex, 'up')}
                      onMoveDown={() => moveStop(globalIndex, 'down')}
                    />
                  </div>
                )
              })}

              {/* "Start Leg N in Maps" button also appears AFTER the leg stops (between legs) */}
              {legIndex < legs.length - 1 && (
                <div className="mt-2 mb-4 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openUrl(buildLegUrl(leg))}
                    aria-label={`Start Leg ${legIndex + 1} in Maps`}
                  >
                    Start Leg {legIndex + 1} in Maps
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
