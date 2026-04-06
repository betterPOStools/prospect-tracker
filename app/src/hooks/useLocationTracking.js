import { useState, useEffect, useCallback, useRef } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import { isNative } from '../lib/platform.js'
import { haversine } from '../data/clustering.js'

const STORAGE_KEY = 'vs_location_tracks'
const SETTINGS_KEY = 'vs_mileage_settings'

const DEFAULTS = {
  minDistanceMiles: 0.01,  // ~50ft — skip points closer than this
}

// Lazy-load foreground service only on native
let ForegroundService = null
async function getForegroundService() {
  if (ForegroundService) return ForegroundService
  if (!isNative) return null
  try {
    const mod = await import('@capawesome-team/capacitor-android-foreground-service')
    ForegroundService = mod.ForegroundService
    return ForegroundService
  } catch {
    return null
  }
}

export function loadTracks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

export function saveTracks(tracks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks))
}

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } }
  catch { return DEFAULTS }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Compute total mileage from an array of track points.
 * Each point: { lat, lng, ts }
 */
export function computeMileage(points) {
  if (!points || points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
  }
  return total
}

/**
 * Group tracks by date, compute per-day mileage.
 * Returns [{ date, points, miles }, ...]
 */
export function getMileageByDay(tracks) {
  const byDay = {}
  for (const t of tracks) {
    const day = t.ts.slice(0, 10)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(t)
  }
  return Object.entries(byDay)
    .map(([date, points]) => ({
      date,
      points: points.sort((a, b) => a.ts.localeCompare(b.ts)),
      miles: computeMileage(points.sort((a, b) => a.ts.localeCompare(b.ts))),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// ── Foreground service helpers ─────────────────────────────────────────────────

async function startForegroundService() {
  const svc = await getForegroundService()
  if (!svc) return
  try {
    await svc.startForegroundService({
      id: 9001,
      title: 'Prospect Tracker',
      body: 'Recording mileage...',
      smallIcon: 'ic_stat_directions_car',
      buttons: [{ title: 'Stop', id: 'stop-tracking' }],
    })
  } catch (e) {
    console.warn('Failed to start foreground service:', e)
  }
}

async function stopForegroundService() {
  const svc = await getForegroundService()
  if (!svc) return
  try {
    await svc.stopForegroundService()
  } catch (e) {
    console.warn('Failed to stop foreground service:', e)
  }
}

/**
 * Location tracking hook.
 *
 * On native (Capacitor), uses the Geolocation watcher + foreground service
 * for persistent background GPS tracking.
 * On web, falls back to navigator.geolocation.watchPosition.
 *
 * Returns:
 *   tracking    – boolean, is tracking active
 *   startTracking / stopTracking – controls
 *   todayMiles  – miles driven today
 *   allTracks   – all stored track points
 *   clearTracks – wipe stored tracks
 *   currentPos  – latest { lat, lng } or null
 */
export function useLocationTracking() {
  const [tracking, setTracking] = useState(false)
  const [tracks, setTracks] = useState(loadTracks)
  const [currentPos, setCurrentPos] = useState(null)
  const watchIdRef = useRef(null)
  const lastPointRef = useRef(null)
  const settings = loadSettings()

  // Persist tracks whenever they change
  useEffect(() => { saveTracks(tracks) }, [tracks])

  const addPoint = useCallback((lat, lng) => {
    const last = lastPointRef.current
    if (last) {
      const dist = haversine(last.lat, last.lng, lat, lng)
      if (dist < settings.minDistanceMiles) return
    }
    const point = { lat, lng, ts: new Date().toISOString() }
    lastPointRef.current = point
    setCurrentPos({ lat, lng })
    setTracks(prev => [...prev, point])
  }, [settings.minDistanceMiles])

  const startTracking = useCallback(async () => {
    if (watchIdRef.current !== null) return

    try {
      if (isNative) {
        const perm = await Geolocation.requestPermissions()
        if (perm.location !== 'granted') {
          console.warn('Location permission denied')
          return
        }
      }

      // Start foreground service on native so Android won't kill the app
      if (isNative) await startForegroundService()

      if (isNative) {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
          (position, err) => {
            if (err) { console.warn('Geo error:', err); return }
            if (position) {
              addPoint(position.coords.latitude, position.coords.longitude)
            }
          }
        )
        watchIdRef.current = id
      } else {
        const id = navigator.geolocation.watchPosition(
          (position) => {
            addPoint(position.coords.latitude, position.coords.longitude)
          },
          (err) => console.warn('Geo error:', err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
        watchIdRef.current = id
      }

      setTracking(true)
    } catch (e) {
      console.error('Failed to start tracking:', e)
    }
  }, [addPoint])

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current === null) return

    try {
      if (isNative) {
        await Geolocation.clearWatch({ id: watchIdRef.current })
        await stopForegroundService()
      } else {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    } catch (e) {
      console.warn('Error clearing watch:', e)
    }
    watchIdRef.current = null
    lastPointRef.current = null
    setTracking(false)
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => { if (watchIdRef.current !== null) stopTracking() }
  }, [stopTracking])

  // Today's mileage
  const today = todayKey()
  const todayPoints = tracks.filter(t => t.ts.startsWith(today))
  const todayMiles = computeMileage(todayPoints.sort((a, b) => a.ts.localeCompare(b.ts)))

  const clearTracks = useCallback((date) => {
    if (date) {
      setTracks(prev => prev.filter(t => !t.ts.startsWith(date)))
    } else {
      setTracks([])
      lastPointRef.current = null
    }
  }, [])

  // Allow external replacement (e.g. from Supabase sync)
  const replaceTracks = useCallback((incoming) => {
    setTracks(incoming || [])
  }, [])

  return {
    tracking,
    startTracking,
    stopTracking,
    todayMiles,
    allTracks: tracks,
    currentPos,
    clearTracks,
    replaceTracks,
    getMileageByDay: () => getMileageByDay(tracks),
  }
}
