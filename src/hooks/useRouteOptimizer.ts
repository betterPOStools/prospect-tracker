// Route leg chunking for Google Maps / Waze URL-based navigation.
// Splits a list of stops into legs of max MAX_WAYPOINTS each so we stay
// within the Google Maps URL constraint (10 waypoints per leg).
//
// Each leg URL:
//   Google: https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=…
//   Waze:   https://waze.com/ul?ll=…&navigate=yes  (origin-only, single stop)

import { useCallback } from 'react'
import { settings } from '../lib/storage'
import type { CanvassStop } from '../types'

const MAX_WAYPOINTS = 10

export interface RouteLeg {
  index: number       // 1-based
  stops: CanvassStop[]
  url: string
}

function encodeStop(stop: CanvassStop): string {
  return encodeURIComponent(stop.address ?? stop.name)
}

function buildGoogleLegUrl(stops: CanvassStop[]): string {
  if (stops.length === 0) return ''
  const origin      = encodeStop(stops[0])
  const destination = encodeStop(stops[stops.length - 1])
  const middle      = stops.slice(1, -1)
  const waypointStr = middle.length > 0
    ? `&waypoints=${middle.map(encodeStop).join('|')}`
    : ''
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointStr}`
}

function buildWazeStopUrl(stop: CanvassStop): string {
  const addr = encodeURIComponent(stop.address ?? stop.name)
  return `https://waze.com/ul?q=${addr}&navigate=yes`
}

export function useRouteOptimizer() {
  const mapsApp = settings.getMapsApp()

  const buildLegs = useCallback(
    (stops: CanvassStop[]): RouteLeg[] => {
      if (stops.length === 0) return []

      if (mapsApp === 'waze') {
        // Waze: one URL per stop (no multi-stop routing via URL)
        return stops.map((stop, i) => ({
          index: i + 1,
          stops: [stop],
          url: buildWazeStopUrl(stop),
        }))
      }

      // Google Maps: chunk into legs of MAX_WAYPOINTS + 2 (origin + destination)
      const chunkSize = MAX_WAYPOINTS + 2
      const legs: RouteLeg[] = []
      for (let i = 0; i < stops.length; i += MAX_WAYPOINTS) {
        const chunk = stops.slice(i, i + chunkSize)
        legs.push({
          index: legs.length + 1,
          stops: chunk,
          url: buildGoogleLegUrl(chunk),
        })
      }
      return legs
    },
    [mapsApp],
  )

  const navigateToStop = useCallback(
    (stop: CanvassStop) => {
      const url = mapsApp === 'waze'
        ? buildWazeStopUrl(stop)
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeStop(stop)}`
      window.open(url, '_blank')
    },
    [mapsApp],
  )

  return { buildLegs, navigateToStop, mapsApp }
}
