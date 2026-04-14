import { useState, useMemo, useCallback } from 'react'
import { useCanvass, useCanvassDispatch, useDatabase } from '../../data/store.jsx'
import { hoursChip, navUrl, getRouteProvider } from '../../data/helpers.js'
import { CANVASS_ACTIVE, REMOVAL_STATUSES } from '../canvass/constants.js'
import { DAYS } from '../../data/weekPlanner.js'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'

// ── Geocoding ────────────────────────────────────────────────────────────────
const _geoCache = new Map()

async function geocodeAddr(addr) {
  if (_geoCache.has(addr)) return _geoCache.get(addr)
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'ValueSystems-ProspectTracker/1.0' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data[0]) return null
    const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    _geoCache.set(addr, coords)
    return coords
  } catch { return null }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── RouteXL helpers ──────────────────────────────────────────────────────────
const RXL_USER_KEY = 'vs_rxl_user'
const RXL_PASS_KEY = 'vs_rxl_pass'
const ROUTE_ORDER_KEY = 'vs_route_order'
// Start/end endpoint persistence — 'gps' | 'home' | 'work' | 'custom' (+ 'none' for end)
const RXL_START_KEY        = 'vs_rxl_start_choice'
const RXL_END_KEY          = 'vs_rxl_end_choice'
const RXL_HOME_ADDR_KEY    = 'vs_rxl_home_addr'
const RXL_HOME_COORDS_KEY  = 'vs_rxl_home_coords'
const RXL_WORK_ADDR_KEY    = 'vs_rxl_work_addr'
const RXL_WORK_COORDS_KEY  = 'vs_rxl_work_coords'
const RXL_CUSTOM_START_KEY = 'vs_rxl_custom_start'
const RXL_CUSTOM_END_KEY   = 'vs_rxl_custom_end'

async function callRouteXL(user, pass, locations, extras = {}) {
  const params = new URLSearchParams()
  params.set('locations', JSON.stringify(locations))
  // `fixedends=1` tells RouteXL to keep locations[0] first and locations[N-1] last.
  // Only set when we have an explicit end waypoint — otherwise RouteXL picks its own close.
  for (const [k, v] of Object.entries(extras)) if (v != null) params.set(k, String(v))
  const res = await fetch('https://api.routexl.com/tour/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(user + ':' + pass),
    },
    body: params.toString(),
  })
  if (res.status === 401) throw new Error('Invalid RouteXL credentials.')
  if (res.status === 403) throw new Error('Too many stops for your RouteXL plan (max 20 free).')
  if (res.status === 429) throw new Error('RouteXL is busy — wait a moment and try again.')
  if (!res.ok) throw new Error('RouteXL error: ' + res.status)
  return res.json()
}

const STATUS_COLOR = {
  'Not visited yet':          'var(--text3)',
  'No answer / closed':       'var(--yellow-text)',
  'Come back later':          'var(--yellow-text)',
  'Decision maker unavailable': 'var(--yellow-text)',
  'Not interested':           'var(--red-text)',
  'Converted':                'var(--green-text)',
}

function mapsUrl(addr) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
}

// Resolve a start/end choice to a URL-ready locator. `null` means "use the
// first stop as origin / last stop as destination" (original behavior).
// `{ label: 'My+Location' }` is the special Google Maps token — we never
// substitute coordinates there, because My Location beats a stale fix.
function readEndpointLocator(choice, isEnd) {
  if (!choice || choice === 'none') return null
  if (choice === 'gps') return { label: 'My+Location' }
  if (choice === 'home' || choice === 'work') {
    const addr = localStorage.getItem(choice === 'home' ? 'vs_rxl_home_addr' : 'vs_rxl_work_addr') || ''
    if (!addr) return null
    let coords = null
    try {
      const raw = localStorage.getItem(choice === 'home' ? 'vs_rxl_home_coords' : 'vs_rxl_work_coords')
      coords = raw ? JSON.parse(raw) : null
    } catch { /* ignore */ }
    return { label: encodeURIComponent(addr), addr, lat: coords?.lat, lng: coords?.lng }
  }
  if (choice === 'custom') {
    const raw = localStorage.getItem(isEnd ? 'vs_rxl_custom_end' : 'vs_rxl_custom_start') || ''
    return raw ? { label: encodeURIComponent(raw), addr: raw } : null
  }
  return null
}

function routeUrl(stops, useCoords, start, end) {
  const hasStops = stops.length > 0
  if (!hasStops && !end) return ''

  const originSegment = start
    ? (useCoords && start.lat && start.lng ? `${start.lat},${start.lng}` : (start.label || 'My+Location'))
    : 'My+Location'

  if (useCoords) {
    const pts = stops.filter(s => s.lat && s.lng).map(s => `${s.lat},${s.lng}`)
    const tail = end ? (end.lat && end.lng ? `${end.lat},${end.lng}` : (end.label || '')) : ''
    const all = tail ? [...pts, tail] : pts
    if (all.length < 1) return routeUrl(stops, false, start, end)
    return `https://www.google.com/maps/dir/${originSegment}/${all.join('/')}`
  }

  const addrs = stops.map(s => s.addr).filter(Boolean).map(encodeURIComponent)
  const endLabel = end ? end.label : null
  if (endLabel) {
    if (addrs.length === 0) return `https://www.google.com/maps/dir/?api=1&origin=${originSegment}&destination=${endLabel}`
    return `https://www.google.com/maps/dir/?api=1&origin=${originSegment}&destination=${endLabel}&waypoints=${addrs.join('|')}`
  }
  if (addrs.length === 0) return ''
  if (addrs.length === 1) return `https://www.google.com/maps/dir/?api=1&origin=${originSegment}&destination=${addrs[0]}`
  const dest = addrs[addrs.length - 1]
  const wps = addrs.slice(0, -1).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${originSegment}&destination=${dest}&waypoints=${wps}`
}

// Google Maps web directions limit
const LEG_SIZE = 9

// Extracted style constants — avoids re-creating objects on every render
const headerBox = { background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: '12px' }
const headerFlex = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }
const headerTitle = { fontSize: '13px', fontWeight: 500, color: 'var(--text)' }
const headerSub = { fontSize: '12px', color: 'var(--text2)' }
const headerActions = { marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }
const routeLink = { display: 'inline-flex', alignItems: 'center', padding: '0 10px', height: '30px', fontSize: '12px', fontWeight: 500, background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius)', textDecoration: 'none' }
const listBox = { border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }
const stopRow = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '0.5px solid var(--border)', fontSize: '13px', background: 'var(--bg)' }
const posBadge = { width: '22px', height: '22px', borderRadius: '50%', background: 'var(--bg3)', color: 'var(--text2)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
const stopName = { fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const stopAddr = { fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const statusBox = { textAlign: 'right', flexShrink: 0 }
const arrowCol = { display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }
const navLinkStyle = { fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }
const footer = { fontSize: '12px', color: 'var(--text3)', marginTop: '8px', textAlign: 'right' }

export default function RouteTab() {
  const canvass = useCanvass()
  const canvassDispatch = useCanvassDispatch()
  const db = useDatabase()
  const { msg, flash } = useFlashMessage()

  const today = useMemo(() => new Date().toLocaleDateString(), [])
  const todayDayName = useMemo(() => DAYS[new Date().getDay() - 1] || null, [])

  const todayStops = useMemo(() =>
    canvass.filter(s =>
      s.date === today &&
      s.status !== 'Converted' &&
      !REMOVAL_STATUSES.includes(s.status)
    ),
  [canvass, today])

  // Map canvass stop → planned day (via linked DB record's `da` field)
  const recordDayMap = useMemo(() => {
    const m = {}
    db.dbRecords.forEach(r => { if (r.da) m[r.id] = r.da })
    return m
  }, [db.dbRecords])

  const getDayForStop = useCallback(s => {
    if (s.fromDb && recordDayMap[s.fromDb]) return recordDayMap[s.fromDb]
    return null // unassigned
  }, [recordDayMap])

  // Rehydrate from localStorage — but only if the saved order is from today.
  // A stale yesterday-order would silently reshape today's stop list into a
  // sequence that references IDs we no longer have. Mismatched IDs filter out
  // in the `stops` memo, but the user perception is "my route is missing stops."
  const [order, setOrder] = useState(() => {
    try {
      const raw = localStorage.getItem(ROUTE_ORDER_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      const sameDay = parsed?.date === new Date().toLocaleDateString()
      return sameDay && Array.isArray(parsed.ids) ? parsed.ids : null
    } catch { return null }
  })
  const [useCoords, setUseCoords] = useState(true) // true = lat/lng, false = addresses

  const [activeLeg, setActiveLeg] = useState(0)

  // RouteXL state
  const [showRxlSetup, setShowRxlSetup] = useState(false)
  const [rxlUser, setRxlUser] = useState(() => localStorage.getItem(RXL_USER_KEY) || '')
  const [rxlPass, setRxlPass] = useState(() => localStorage.getItem(RXL_PASS_KEY) || '')
  const [optimizing, setOptimizing] = useState(false)
  const [optStatus, setOptStatus] = useState('')
  const hasRxlCreds = Boolean(rxlUser && rxlPass)

  // Start/end endpoint selection — persisted between runs.
  const [startChoice, setStartChoice] = useState(() => localStorage.getItem(RXL_START_KEY) || 'gps')
  const [endChoice,   setEndChoice]   = useState(() => localStorage.getItem(RXL_END_KEY)   || 'none')
  const [homeAddr, setHomeAddr] = useState(() => localStorage.getItem(RXL_HOME_ADDR_KEY) || '')
  const [workAddr, setWorkAddr] = useState(() => localStorage.getItem(RXL_WORK_ADDR_KEY) || '')
  const [customStart, setCustomStart] = useState(() => localStorage.getItem(RXL_CUSTOM_START_KEY) || '')
  const [customEnd,   setCustomEnd]   = useState(() => localStorage.getItem(RXL_CUSTOM_END_KEY)   || '')

  function persistChoice(key, value) { try { localStorage.setItem(key, value) } catch { /* ignore */ } }
  function updateStartChoice(v) { setStartChoice(v); persistChoice(RXL_START_KEY, v) }
  function updateEndChoice(v)   { setEndChoice(v);   persistChoice(RXL_END_KEY, v) }

  // Resolve a pick to coords. Returns { lat, lng, label } or null. Geocodes on
  // demand and caches for home/work so subsequent runs don't re-hit Nominatim.
  async function resolveEndpoint(choice, { isEnd = false } = {}) {
    if (choice === 'none') return null
    if (choice === 'gps') {
      const home = await getGPS()
      return home ? { lat: home.lat, lng: home.lng, label: 'Current GPS' } : null
    }
    if (choice === 'home' || choice === 'work') {
      const addrKey   = choice === 'home' ? RXL_HOME_ADDR_KEY   : RXL_WORK_ADDR_KEY
      const coordsKey = choice === 'home' ? RXL_HOME_COORDS_KEY : RXL_WORK_COORDS_KEY
      const addr = localStorage.getItem(addrKey)
      if (!addr) throw new Error(`No ${choice} address saved — set it in RouteXL setup.`)
      const cached = localStorage.getItem(coordsKey)
      if (cached) {
        try { const p = JSON.parse(cached); if (p?.lat && p?.lng) return { lat: p.lat, lng: p.lng, label: choice } } catch { /* fall through */ }
      }
      const g = await geocodeAddr(addr)
      if (!g) throw new Error(`Could not geocode ${choice} address.`)
      try { localStorage.setItem(coordsKey, JSON.stringify(g)) } catch { /* ignore */ }
      return { lat: g.lat, lng: g.lng, label: choice }
    }
    if (choice === 'custom') {
      const raw = (isEnd ? customEnd : customStart).trim()
      if (!raw) throw new Error(`Enter a custom ${isEnd ? 'end' : 'start'} address.`)
      const g = await geocodeAddr(raw)
      if (!g) throw new Error(`Could not geocode custom ${isEnd ? 'end' : 'start'} address.`)
      return { lat: g.lat, lng: g.lng, label: 'custom' }
    }
    return null
  }

  function saveHomeWork() {
    persistChoice(RXL_HOME_ADDR_KEY, homeAddr)
    persistChoice(RXL_WORK_ADDR_KEY, workAddr)
    // Clear cached coords so next run re-geocodes the (possibly new) address.
    try { localStorage.removeItem(RXL_HOME_COORDS_KEY); localStorage.removeItem(RXL_WORK_COORDS_KEY) } catch { /* ignore */ }
    flash('Home/work saved.', 'ok')
  }

  function saveRxlCreds() {
    localStorage.setItem(RXL_USER_KEY, rxlUser)
    localStorage.setItem(RXL_PASS_KEY, rxlPass)
    flash('RouteXL credentials saved.', 'ok')
    setShowRxlSetup(false)
  }

  function clearRxlCreds() {
    localStorage.removeItem(RXL_USER_KEY)
    localStorage.removeItem(RXL_PASS_KEY)
    setRxlUser('')
    setRxlPass('')
    flash('RouteXL credentials removed.', 'ok')
  }

  // Separate today's-day stops from other-day stops
  const { todayDayStops, otherDayStops } = useMemo(() => {
    const todayDay = []
    const other = []
    todayStops.forEach(s => {
      const day = getDayForStop(s)
      if (!day || day === todayDayName) todayDay.push(s)
      else other.push(s)
    })
    return { todayDayStops: todayDay, otherDayStops: other }
  }, [todayStops, getDayForStop, todayDayName])

  const stops = useMemo(() => {
    if (!order) return [...todayDayStops].sort((a, b) => (b.score || 0) - (a.score || 0))
    return order.map(id => todayDayStops.find(s => s.id === id)).filter(Boolean)
  }, [todayDayStops, order])

  // Group other-day stops by their assigned day for display
  const otherDayGroups = useMemo(() => {
    const groups = []
    for (const day of DAYS) {
      if (day === todayDayName) continue
      const dayStops = otherDayStops.filter(s => getDayForStop(s) === day)
      if (dayStops.length) groups.push({ day, stops: dayStops })
    }
    return groups
  }, [otherDayStops, getDayForStop, todayDayName])

  const legs = useMemo(() => {
    const result = []
    for (let i = 0; i < stops.length; i += LEG_SIZE) result.push(stops.slice(i, i + LEG_SIZE))
    return result
  }, [stops])

  const safeActiveLeg = Math.min(activeLeg, Math.max(0, legs.length - 1))
  const currentLeg = legs[safeActiveLeg] || []

  // Init order from todayStops when it changes and we have no order
  function ensureOrder() {
    if (!order) setOrder(stops.map(s => s.id))
  }

  function moveUp(idx) {
    ensureOrder()
    setOrder(prev => {
      const o = prev || stops.map(s => s.id)
      const next = [...o]
      if (idx === 0) return next
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      localStorage.setItem(ROUTE_ORDER_KEY, JSON.stringify({ date: today, ids: next }))
      return next
    })
  }

  function moveDown(idx) {
    ensureOrder()
    setOrder(prev => {
      const o = prev || stops.map(s => s.id)
      const next = [...o]
      if (idx === next.length - 1) return next
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      localStorage.setItem(ROUTE_ORDER_KEY, JSON.stringify({ date: today, ids: next }))
      return next
    })
  }

  function resetOrder() {
    setOrder(null)
    setActiveLeg(0)
    localStorage.removeItem(ROUTE_ORDER_KEY)
  }

  function copyAddresses() {
    const addrs = stops.map((s, i) => `${i + 1}. ${s.name} — ${s.addr || 'no address'}`).join('\n')
    navigator.clipboard.writeText(addrs).then(
      () => flash('Addresses copied — paste into RouteXL.com', 'ok'),
      () => flash('Copy failed.', 'err')
    )
  }

  function getGPS() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
      )
    })
  }

  const optimizeRoute = useCallback(async () => {
    const withAddr = stops.filter(s => s.addr)
    if (withAddr.length < 2) { flash('Need at least 2 stops with addresses.', 'err'); return }
    if (!hasRxlCreds) { setShowRxlSetup(true); return }

    setOptimizing(true)
    try {
      // Step 0: Resolve user-picked start / end endpoints (see state block above).
      // Both can be null — null start means RouteXL picks its own open-start; null
      // end means open-return (equivalent to pre-endpoint behavior).
      setOptStatus('Resolving start / end…')
      const start = await resolveEndpoint(startChoice, { isEnd: false })
      const end   = await resolveEndpoint(endChoice,   { isEnd: true })
      if (startChoice === 'gps' && !start) flash("Couldn't get GPS — route won't be anchored to your position.", 'err')

      // Step 1: Geocode stops that don't have lat/lng yet
      const geocoded = []  // { stop, lat, lng }
      const skipped = []
      for (let i = 0; i < withAddr.length; i++) {
        const s = withAddr[i]
        if (s.lat && s.lng) {
          geocoded.push({ stop: s, lat: s.lat, lng: s.lng })
          continue
        }
        // Try DB record coords first (instant, from Outscraper/Google Places)
        const dbRec = s.fromDb ? db.dbRecords.find(r => r.id === s.fromDb) : null
        if (dbRec?.lt && dbRec?.lg) {
          canvassDispatch({ type: 'UPDATE', stop: { ...s, lat: dbRec.lt, lng: dbRec.lg } })
          geocoded.push({ stop: s, lat: dbRec.lt, lng: dbRec.lg })
          continue
        }
        // Fallback: Nominatim geocoding
        setOptStatus(`Geocoding ${i + 1}/${withAddr.length}: ${s.name}`)
        const coords = await geocodeAddr(s.addr)
        if (!coords) { skipped.push(s); continue }
        // Persist lat/lng on the stop
        canvassDispatch({ type: 'UPDATE', stop: { ...s, lat: coords.lat, lng: coords.lng } })
        geocoded.push({ stop: s, lat: coords.lat, lng: coords.lng })
        if (i < withAddr.length - 1) await sleep(1100) // Nominatim: 1 req/sec
      }

      if (geocoded.length < 2) {
        flash(`Need at least 2 geocoded stops. ${skipped.length} failed — try editing their addresses.`, 'err')
        setOptimizing(false); setOptStatus(''); return
      }

      // Step 2: Send to RouteXL — use stop ID as address field so we can match back
      setOptStatus(`Optimizing ${geocoded.length} stops…`)
      const locations = geocoded.map(g => ({
        address: g.stop.id,
        lat: String(g.lat),
        lng: String(g.lng),
      }))

      // Inject start and end waypoints. `fixedends=1` tells RouteXL to keep
      // locations[0] as start and locations[N-1] as end; without it, RouteXL
      // reorders them along with the rest.
      if (start) {
        locations.unshift({ address: '__start__', lat: String(start.lat), lng: String(start.lng) })
      }
      if (end) {
        locations.push({ address: '__end__', lat: String(end.lat), lng: String(end.lng) })
      }
      const extras = {}
      if (start && end) extras.fixedends = 1   // lock both
      else if (end)     extras.fixedends = 1   // RouteXL still honors end when start is model-chosen? conservatively lock both ends

      const result = await callRouteXL(rxlUser, rxlPass, locations, extras)
      if (!result.route) { flash('RouteXL returned no route.', 'err'); setOptimizing(false); setOptStatus(''); return }

      // Step 3: Map optimized order back to stop IDs, strip synthetic waypoints
      const optimizedIds = Object.keys(result.route)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => result.route[k].name)
        .filter(name => name !== '__home__' && name !== '__start__' && name !== '__end__')

      // Append skipped + no-address stops at end
      const optimizedSet = new Set(optimizedIds)
      const remaining = stops.filter(s => !optimizedSet.has(s.id)).map(s => s.id)
      const finalOrder = [...optimizedIds, ...remaining]
      setOrder(finalOrder)
      localStorage.setItem(ROUTE_ORDER_KEY, JSON.stringify({ date: today, ids: finalOrder }))
      setActiveLeg(0)

      const last = result.route[String(Object.keys(result.route).length - 1)]
      const distKm = last?.distance ? Math.round(last.distance) : null
      const timeMin = last?.arrival ? Math.round(last.arrival) : null
      const details = [distKm && `${distKm} km`, timeMin && `${timeMin} min`].filter(Boolean).join(', ')
      const skipMsg = skipped.length ? ` (${skipped.length} couldn't geocode — at end)` : ''
      flash(`Route optimized — ${optimizedIds.length} stops${details ? ', ' + details + ' total' : ''}${skipMsg}.`, 'ok')
    } catch (e) {
      flash(e.message || 'RouteXL optimization failed.', 'err')
      if (/credentials|401|unauthori[sz]ed/i.test(e.message || '')) setShowRxlSetup(true)
    }
    setOptimizing(false)
    setOptStatus('')
  }, [stops, hasRxlCreds, rxlUser, rxlPass, canvassDispatch, db.dbRecords, flash, startChoice, endChoice, customStart, customEnd])

  if (!canvass.length) {
    return <EmptyState>No canvass stops yet — load stops from the Database or add them manually in the Canvass tab.</EmptyState>
  }

  if (!todayStops.length) {
    return <EmptyState>No stops for today's run. Stops added to Today's Canvass will appear here.</EmptyState>
  }

  const totalInCanvass = todayStops.length
  const optimizableCount = stops.length
  const otherCount = otherDayStops.length

  // BUSINESS RULE: start applies only to leg 0 (subsequent legs begin from
  // where you ended the previous one, so "My Location" is correct). End
  // applies only to the final leg — otherwise the locked end would appear as
  // a stop on every intermediate leg.
  const isFirstLeg = safeActiveLeg === 0
  const isLastLeg  = safeActiveLeg === legs.length - 1
  const startLoc = isFirstLeg ? readEndpointLocator(startChoice, false) : null
  const endLoc   = isLastLeg  ? readEndpointLocator(endChoice,   true)  : null
  const url = routeUrl(currentLeg, useCoords, startLoc, endLoc)
  const hasCoords = currentLeg.some(s => s.lat && s.lng)

  return (
    <div>
      {/* Header controls */}
      <div style={headerBox}>
        <div style={headerFlex}>
          <div>
            <div style={headerTitle}>{todayDayName ? `${todayDayName}'s Route` : "Today's Route"}</div>
            <div style={headerSub}>
              {stops.length} stop{stops.length !== 1 ? 's' : ''}
              {otherCount > 0 && ` · ${otherCount} other-day stops below`}
              {legs.length > 1 && ` · Leg ${safeActiveLeg + 1} of ${legs.length} (${currentLeg.length} stops)`}
              {' · Reorder with arrows · Navigate with Maps or Waze'}
            </div>
          </div>
          <div style={headerActions}>
            <Button size="sm" onClick={resetOrder}>Reset order</Button>
            <Button size="sm" onClick={copyAddresses}>Copy Addresses</Button>
            <Button size="sm" variant="primary" onClick={optimizeRoute} disabled={optimizing}>
              {optimizing ? 'Optimizing…' : 'Optimize Route'}
            </Button>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" style={routeLink}>
                {legs.length > 1 ? `Leg ${safeActiveLeg + 1} in Maps ↗` : 'Google Maps Route ↗'}
              </a>
            )}
          </div>
        </div>
        {optStatus && (
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '8px' }}>{optStatus}</div>
        )}
      </div>

      {/* RouteXL credentials */}
      {showRxlSetup && (
        <div style={{ background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '6px' }}>
            RouteXL API Setup
            <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text2)' }}> — optimizes stop order for shortest route</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>
            Sign up at <a href="https://www.routexl.com/register" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>routexl.com/register</a>, then enter your username and password.
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" value={rxlUser} placeholder="Username" style={{ width: '140px', fontSize: '12px' }}
              onChange={e => setRxlUser(e.target.value)} />
            <input type="password" value={rxlPass} placeholder="Password" style={{ width: '140px', fontSize: '12px' }}
              onChange={e => setRxlPass(e.target.value)} />
            <Button size="sm" variant="primary" onClick={saveRxlCreds} disabled={!rxlUser || !rxlPass}>Save</Button>
            {hasRxlCreds && <Button size="sm" variant="danger" onClick={clearRxlCreds}>Remove</Button>}
            <Button size="sm" onClick={() => setShowRxlSetup(false)}>Cancel</Button>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text)', margin: '12px 0 4px' }}>Home / Work addresses</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px' }}>
            Used by the Start / End pickers above the stop list. Geocoded once and cached.
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" value={homeAddr} placeholder="Home address" style={{ width: '220px', fontSize: '12px' }}
              onChange={e => setHomeAddr(e.target.value)} />
            <input type="text" value={workAddr} placeholder="Work address" style={{ width: '220px', fontSize: '12px' }}
              onChange={e => setWorkAddr(e.target.value)} />
            <Button size="sm" onClick={saveHomeWork}>Save addresses</Button>
          </div>
        </div>
      )}

      {/* Start / End endpoint pickers */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px', fontSize: '12px', color: 'var(--text2)' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          Start:
          <select value={startChoice} onChange={e => updateStartChoice(e.target.value)}
            style={{ fontSize: '12px', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
            <option value="gps">Current GPS</option>
            <option value="home" disabled={!homeAddr}>Home{!homeAddr ? ' (set in setup)' : ''}</option>
            <option value="work" disabled={!workAddr}>Work{!workAddr ? ' (set in setup)' : ''}</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        {startChoice === 'custom' && (
          <input type="text" value={customStart} placeholder="Start address"
            onChange={e => { setCustomStart(e.target.value); persistChoice(RXL_CUSTOM_START_KEY, e.target.value) }}
            style={{ width: '200px', fontSize: '12px', padding: '2px 6px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          End:
          <select value={endChoice} onChange={e => updateEndChoice(e.target.value)}
            style={{ fontSize: '12px', padding: '2px 4px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
            <option value="none">None (open-ended)</option>
            <option value="gps">Current GPS</option>
            <option value="home" disabled={!homeAddr}>Home{!homeAddr ? ' (set in setup)' : ''}</option>
            <option value="work" disabled={!workAddr}>Work{!workAddr ? ' (set in setup)' : ''}</option>
            <option value="custom">Custom…</option>
          </select>
        </label>
        {endChoice === 'custom' && (
          <input type="text" value={customEnd} placeholder="End address"
            onChange={e => { setCustomEnd(e.target.value); persistChoice(RXL_CUSTOM_END_KEY, e.target.value) }}
            style={{ width: '200px', fontSize: '12px', padding: '2px 6px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
        )}
      </div>

      {/* Settings row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '8px', alignItems: 'center' }}>
        <button onClick={() => setUseCoords(!useCoords)}
          style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--text3)', cursor: 'pointer', padding: 0 }}>
          Route links: {useCoords ? 'Coordinates' : 'Addresses'}{useCoords && !hasCoords ? ' (needs optimization first)' : ''}
        </button>
        <button onClick={() => setShowRxlSetup(!showRxlSetup)}
          style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--text3)', cursor: 'pointer', padding: 0 }}>
          {hasRxlCreds ? 'RouteXL connected' : 'Set up RouteXL'} ⚙
        </button>
      </div>

      {/* Stop list */}
      <div style={listBox}>
        {legs.map((leg, legIdx) => (
          <div key={legIdx}>
            {leg.map((s, posInLeg) => {
              const idx = legIdx * LEG_SIZE + posInLeg
              const chip = hoursChip(s.openTime, s.closeTime)
              return (
                <div key={s.id} style={stopRow}>
                  <div style={posBadge}>{idx + 1}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={stopName}>{s.name}</div>
                    <div style={stopAddr}>{s.addr}</div>
                    {chip && (
                      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '10px', marginTop: '2px', display: 'inline-block',
                        background: chip.isOpen ? 'var(--green-bg)' : 'var(--bg3)',
                        color: chip.isOpen ? 'var(--green-text)' : 'var(--text3)' }}>
                        {chip.label}
                      </span>
                    )}
                  </div>

                  <div style={statusBox}>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: STATUS_COLOR[s.status] || 'var(--text3)' }}>
                      {s.status}
                    </div>
                    {s.priority && (
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{s.priority} {s.score || ''}</div>
                    )}
                  </div>

                  <div style={arrowCol}>
                    <button onClick={() => moveUp(idx)} disabled={idx === 0}
                      style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                        color: idx === 0 ? 'var(--text3)' : 'var(--text2)', fontSize: '12px', padding: '0 4px', lineHeight: 1 }}>▲</button>
                    <button onClick={() => moveDown(idx)} disabled={idx === stops.length - 1}
                      style={{ background: 'none', border: 'none', cursor: idx === stops.length - 1 ? 'default' : 'pointer',
                        color: idx === stops.length - 1 ? 'var(--text3)' : 'var(--text2)', fontSize: '12px', padding: '0 4px', lineHeight: 1 }}>▼</button>
                  </div>

                  {s.addr && (
                    <a href={navUrl(s.addr)} target="_blank" rel="noreferrer" style={navLinkStyle}>Navigate ↗</a>
                  )}
                </div>
              )
            })}

            {/* Leg breakpoint */}
            {legIdx < legs.length - 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg2)', borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
                <span style={{ fontSize: '11px', color: 'var(--text2)', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  Leg {legIdx + 1} end · {leg.length} stops
                </span>
                <a
                  href={routeUrl(legs[legIdx + 1], useCoords, null, (legIdx + 1) === legs.length - 1 ? readEndpointLocator(endChoice, true) : null)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ ...routeLink, fontSize: '11px', height: '26px', padding: '0 9px', flexShrink: 0 }}
                  onClick={() => setActiveLeg(legIdx + 1)}
                >
                  Start Leg {legIdx + 2} in Maps ↗
                </a>
                <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Other-day stops (not optimized) */}
      {otherDayGroups.map(({ day, stops: dayStops }) => (
        <div key={day} style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {day} · {dayStops.length} stop{dayStops.length !== 1 ? 's' : ''} · not optimized
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border2)' }} />
          </div>
          <div style={{ ...listBox, opacity: 0.6 }}>
            {dayStops.map((s, i) => {
              const chip = hoursChip(s.openTime, s.closeTime)
              return (
                <div key={s.id} style={stopRow}>
                  <div style={posBadge}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={stopName}>{s.name}</div>
                    <div style={stopAddr}>{s.addr}</div>
                    {chip && (
                      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '10px', marginTop: '2px', display: 'inline-block',
                        background: chip.isOpen ? 'var(--green-bg)' : 'var(--bg3)',
                        color: chip.isOpen ? 'var(--green-text)' : 'var(--text3)' }}>
                        {chip.label}
                      </span>
                    )}
                  </div>
                  <div style={statusBox}>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: STATUS_COLOR[s.status] || 'var(--text3)' }}>
                      {s.status}
                    </div>
                  </div>
                  {s.addr && (
                    <a href={navUrl(s.addr)} target="_blank" rel="noreferrer" style={navLinkStyle}>Navigate ↗</a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {msg && <div style={{ fontSize: '12px', marginTop: '6px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>{msg.text}</div>}

      <div style={footer}>
        {stops.filter(s => s.status !== 'Not visited yet').length} of {stops.length} visited today
      </div>
    </div>
  )
}
