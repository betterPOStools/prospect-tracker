import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useStops, useStopsDispatch } from '../../store/StopsContext'
import { useOffline } from '../../store/OfflineContext'
import { db } from '../../lib/supabase'
import { settings } from '../../lib/storage'
import { isNative } from '../../lib/platform'
import Button from '../../components/Button'
import EmptyState from '../../components/EmptyState'
import RouteStopItem from './RouteStopItem'
import { optimizeRoute, geocodeAddress } from './routeXL'
import type { CanvassStop } from '../../types'
import { DAYS } from '../../types'

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_WAYPOINTS = 10
const RXL_MAX_FREE = 20

const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
}

// ── Leg navigation helpers ───────────────────────────────────────────────────

function buildLegUrl(leg: CanvassStop[], useCoords: boolean): string {
  const waypoints = leg.map((s) => {
    if (useCoords && s.lat != null && s.lng != null) {
      return `${s.lat},${s.lng}`
    }
    return encodeURIComponent(s.address ?? (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : s.name))
  })
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

// ── Day helpers ──────────────────────────────────────────────────────────────

function getTodayName(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' })
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RouteTab() {
  const stops = useStops()
  const stopsDispatch = useStopsDispatch()
  const { isOnline } = useOffline()

  // Day selector state — default to "Today"
  const [selectedDay, setSelectedDay] = useState<string>('Today')
  const [useCoords, setUseCoords] = useState(false)

  const today = getTodayName()

  // Resolve the effective day name from the selector
  const effectiveDay = selectedDay === 'Today' ? today : selectedDay

  const filteredStops = useMemo<CanvassStop[]>(() => {
    const byDay = stops.filter((s) => s.day === effectiveDay)
    if (byDay.length > 0) return byDay
    // Fallback: all queued / not_visited stops (only when viewing "Today")
    if (selectedDay === 'Today') {
      return stops.filter((s) => s.status === 'queued' || s.status === 'not_visited')
    }
    return byDay
  }, [stops, effectiveDay, selectedDay])

  // Local ordering state
  const [orderedStops, setOrderedStops] = useState<CanvassStop[]>(() => filteredStops)
  const [originalOrder, setOriginalOrder] = useState<CanvassStop[]>(() => filteredStops)
  const [isOptimized, setIsOptimized] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeProgress, setGeocodeProgress] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Sync orderedStops when filteredStops changes (day selection or context update)
  const filteredIds = filteredStops.map((s) => s.id).join(',')
  const prevFilteredIds = useRef(filteredIds)

  useEffect(() => {
    if (filteredIds !== prevFilteredIds.current) {
      prevFilteredIds.current = filteredIds
      setOrderedStops(filteredStops)
      setOriginalOrder(filteredStops)
      setIsOptimized(false)
      setOptimizeError(null)
    }
  }, [filteredIds, filteredStops])

  function showToast(msg: string) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const mapsApp = settings.getMapsApp()

  const stopsMissingCoords = orderedStops.filter((s) => s.lat == null || s.lng == null)
  const hasMissingCoords = stopsMissingCoords.length > 0

  // Determine if any stops have coordinates (for showing the coords toggle)
  const someStopsHaveCoords = orderedStops.some((s) => s.lat != null && s.lng != null)

  const overFreeLimit = orderedStops.length > RXL_MAX_FREE

  // Progress footer counts — "visited" = canvassed or come_back_later (physically went there)
  const visitedCount = orderedStops.filter(
    (s) => s.status === 'canvassed' || s.status === 'come_back_later',
  ).length
  const totalCount = orderedStops.length
  const progressPct = totalCount > 0 ? (visitedCount / totalCount) * 100 : 0

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleResetOrder = useCallback(() => {
    setOrderedStops(originalOrder)
    setIsOptimized(false)
    setOptimizeError(null)
  }, [originalOrder])

  const handleCopyAddresses = useCallback(async () => {
    const stopsWithAddress = orderedStops.filter((s) => s.address)
    if (!stopsWithAddress.length) {
      showToast('No stops have addresses')
      return
    }
    const text = stopsWithAddress
      .map((s, i) => `${i + 1}. ${s.address}`)
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
    showToast(`Copied ${stopsWithAddress.length} addresses`)
  }, [orderedStops])

  const handleGeocodeAll = useCallback(async () => {
    const toGeocode = orderedStops.filter(
      (s) => s.address && (s.lat == null || s.lng == null),
    )
    if (!toGeocode.length) return

    setGeocoding(true)
    setGeocodeProgress(`Geocoding 1 of ${toGeocode.length}...`)

    const updated = [...orderedStops]
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < toGeocode.length; i++) {
      const stop = toGeocode[i]
      setGeocodeProgress(`Geocoding ${i + 1} of ${toGeocode.length}...`)

      // Nominatim requires 1-second delay between requests
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      const coords = await geocodeAddress(stop.address!)
      if (coords) {
        const updatedStop: CanvassStop = { ...stop, lat: coords.lat, lng: coords.lng }

        // Update local ordered stops array
        const idx = updated.findIndex((s) => s.id === stop.id)
        if (idx !== -1) updated[idx] = updatedStop

        // Persist to Supabase
        const now = new Date().toISOString()
        await db
          .from('canvass_stops')
          .update({ lat: coords.lat, lng: coords.lng, updated_at: now })
          .eq('id', stop.id)

        // Update global context
        stopsDispatch({ type: 'UPDATE', stop: updatedStop })
        succeeded++
      } else {
        failed++
      }
    }

    setOrderedStops(updated)
    setGeocoding(false)
    setGeocodeProgress(null)
    showToast(
      `Geocoded ${succeeded}/${toGeocode.length} stops${failed > 0 ? ` (${failed} failed)` : ''}`,
    )
  }, [orderedStops, stopsDispatch])

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
        {/* Day selector — always visible even when empty */}
        <div className="border-b border-[#1e2535] bg-[#161b27] px-4 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto" data-testid="day-selector">
            <button
              onClick={() => setSelectedDay('Today')}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${
                selectedDay === 'Today'
                  ? 'bg-[#1a2744] text-white'
                  : 'bg-[#161b27] text-slate-400 hover:bg-[#1e2535]'
              }`}
            >
              Today
            </button>
            {DAYS.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${
                  selectedDay === day
                    ? 'bg-[#1a2744] text-white'
                    : 'bg-[#161b27] text-slate-400 hover:bg-[#1e2535]'
                }`}
              >
                {DAY_SHORT[day]}
              </button>
            ))}
          </div>
        </div>
        <EmptyState
          title={selectedDay === 'Today' ? 'No stops for today' : `No stops for ${effectiveDay}`}
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
      {/* Day selector */}
      <div className="border-b border-[#1e2535] bg-[#161b27] px-4 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto" data-testid="day-selector">
          <button
            onClick={() => setSelectedDay('Today')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${
              selectedDay === 'Today'
                ? 'bg-[#1a2744] text-white'
                : 'bg-[#161b27] text-slate-400 hover:bg-[#1e2535]'
            }`}
          >
            Today
          </button>
          {DAYS.map((day) => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${
                selectedDay === day
                  ? 'bg-[#1a2744] text-white'
                  : 'bg-[#161b27] text-slate-400 hover:bg-[#1e2535]'
              }`}
            >
              {DAY_SHORT[day]}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="border-b border-[#1e2535] bg-[#161b27] px-4 py-3">
        <h2 className="text-base font-semibold text-slate-100">
          Route — {orderedStops.length} stop{orderedStops.length !== 1 ? 's' : ''} for {effectiveDay}
        </h2>

        {/* Over-limit warning */}
        {overFreeLimit && (
          <div className="mt-2 rounded-md bg-yellow-950/40 border border-yellow-800/30 px-3 py-2 text-xs text-yellow-400">
            RouteXL free tier supports max 20 stops. Only the first 20 will be optimized.
          </div>
        )}

        {/* Offline warning */}
        {!isOnline && (
          <div className="mt-2 rounded-md bg-orange-950/40 border border-orange-800/30 px-3 py-2 text-xs text-orange-400">
            You are offline. Optimization is unavailable.
          </div>
        )}

        {/* Optimize error */}
        {optimizeError && (
          <div className="mt-2 rounded-md bg-red-950/40 border border-red-800/30 px-3 py-2 text-xs text-red-400">
            {optimizeError}
          </div>
        )}

        {/* Geocode progress */}
        {geocodeProgress && (
          <div className="mt-2 rounded-md bg-blue-950/40 border border-blue-800/30 px-3 py-2 text-xs text-blue-400">
            {geocodeProgress}
          </div>
        )}

        {/* Toast notification */}
        {toastMessage && (
          <div className="mt-2 rounded-md bg-green-950/40 border border-green-800/30 px-3 py-2 text-xs font-medium text-green-400 animate-fade-in">
            {toastMessage}
          </div>
        )}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#1e2535] bg-[#0f1117] px-4 py-2">
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

        <Button
          variant="secondary"
          size="sm"
          onClick={handleGeocodeAll}
          disabled={geocoding || !isOnline || !hasMissingCoords}
        >
          {geocoding ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              {geocodeProgress ?? 'Geocoding…'}
            </span>
          ) : hasMissingCoords ? (
            `Geocode Missing (${stopsMissingCoords.length})`
          ) : (
            'Geocode Missing'
          )}
        </Button>

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

        {/* Coordinate vs address toggle — only shown when some stops have coords */}
        {someStopsHaveCoords && (
          <button
            onClick={() => setUseCoords((prev) => !prev)}
            data-testid="coords-toggle"
            className={`ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 ${
              useCoords
                ? 'bg-[#1a2744] text-blue-400'
                : 'bg-[#161b27] text-slate-400 hover:bg-[#1e2535]'
            }`}
          >
            {useCoords ? 'Coords' : 'Address'}
          </button>
        )}
      </div>

      {/* Stop list with leg dividers */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-2">
          {legs.map((leg, legIndex) => (
            <div key={legIndex}>
              {/* Leg header: "Start Leg N in Maps" — shown before each leg except first when it is the only leg */}
              {(legs.length > 1 || legIndex > 0) && (
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Leg {legIndex + 1}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openUrl(buildLegUrl(leg, useCoords))}
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
                      useCoords={useCoords}
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
                    onClick={() => openUrl(buildLegUrl(leg, useCoords))}
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

      {/* Progress footer */}
      <div
        className="relative border-t border-[#1e2535] bg-[#0f1117] px-4 py-2"
        data-testid="progress-footer"
      >
        {/* Progress bar background */}
        <div
          className="absolute inset-0 bg-green-950/40 transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
        <p className="relative text-xs font-medium text-slate-400 text-center">
          {visitedCount} of {totalCount} visited
        </p>
      </div>
    </div>
  )
}
