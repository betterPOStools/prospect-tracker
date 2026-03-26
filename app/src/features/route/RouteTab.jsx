import { useState, useMemo, useCallback } from 'react'
import { useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { hoursChip, navUrl, getRouteProvider } from '../../data/helpers.js'
import { CANVASS_ACTIVE, REMOVAL_STATUSES } from '../canvass/constants.js'
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

async function callRouteXL(user, pass, locations) {
  const body = 'locations=' + encodeURIComponent(JSON.stringify(locations))
  const res = await fetch('https://api.routexl.com/tour/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(user + ':' + pass),
    },
    body,
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

function routeUrl(stops, useCoords) {
  if (!stops.length) return ''
  if (useCoords) {
    const pts = stops.filter(s => s.lat && s.lng).map(s => `${s.lat},${s.lng}`)
    if (pts.length < 2) return routeUrl(stops, false) // fallback to addresses
    return `https://www.google.com/maps/dir/My+Location/${pts.join('/')}`
  }
  const addrs = stops.map(s => s.addr).filter(Boolean)
  if (addrs.length === 1) return `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${encodeURIComponent(addrs[0])}`
  const dest   = encodeURIComponent(addrs[addrs.length - 1])
  const wps    = addrs.slice(0, -1).map(a => encodeURIComponent(a)).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=My+Location&destination=${dest}&waypoints=${wps}`
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
  const { msg, flash } = useFlashMessage()

  const today = useMemo(() => new Date().toLocaleDateString(), [])

  const todayStops = useMemo(() =>
    canvass.filter(s =>
      s.date === today &&
      s.status !== 'Converted' &&
      !REMOVAL_STATUSES.includes(s.status)
    ),
  [canvass, today])

  const [order, setOrder] = useState(null)  // null = default order
  const [useCoords, setUseCoords] = useState(true) // true = lat/lng, false = addresses

  const [activeLeg, setActiveLeg] = useState(0)

  // RouteXL state
  const [showRxlSetup, setShowRxlSetup] = useState(false)
  const [rxlUser, setRxlUser] = useState(() => localStorage.getItem(RXL_USER_KEY) || '')
  const [rxlPass, setRxlPass] = useState(() => localStorage.getItem(RXL_PASS_KEY) || '')
  const [optimizing, setOptimizing] = useState(false)
  const [optStatus, setOptStatus] = useState('')
  const hasRxlCreds = Boolean(rxlUser && rxlPass)

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

  const stops = useMemo(() => {
    if (!order) return [...todayStops].sort((a, b) => (b.score || 0) - (a.score || 0))
    return order.map(id => todayStops.find(s => s.id === id)).filter(Boolean)
  }, [todayStops, order])

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
      return next
    })
  }

  function resetOrder() { setOrder(null); setActiveLeg(0) }

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
      // Step 0: Get current GPS position for route starting point
      setOptStatus('Getting your location…')
      const home = await getGPS()
      if (!home) flash('Could not get location — route won\'t be anchored to your position.', 'err')

      // Step 1: Geocode stops that don't have lat/lng yet
      const geocoded = []  // { stop, lat, lng }
      const skipped = []
      for (let i = 0; i < withAddr.length; i++) {
        const s = withAddr[i]
        if (s.lat && s.lng) {
          geocoded.push({ stop: s, lat: s.lat, lng: s.lng })
          continue
        }
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

      // Inject GPS as starting point so RouteXL optimizes from our position
      if (home) {
        locations.unshift({ address: '__home__', lat: String(home.lat), lng: String(home.lng) })
      }

      const result = await callRouteXL(rxlUser, rxlPass, locations)
      if (!result.route) { flash('RouteXL returned no route.', 'err'); setOptimizing(false); setOptStatus(''); return }

      // Step 3: Map optimized order back to stop IDs, strip __home__ waypoint
      const optimizedIds = Object.keys(result.route)
        .sort((a, b) => Number(a) - Number(b))
        .map(k => result.route[k].name)
        .filter(name => name !== '__home__')

      // Append skipped + no-address stops at end
      const optimizedSet = new Set(optimizedIds)
      const remaining = stops.filter(s => !optimizedSet.has(s.id)).map(s => s.id)
      setOrder([...optimizedIds, ...remaining])
      setActiveLeg(0)

      const last = result.route[String(Object.keys(result.route).length - 1)]
      const distKm = last?.distance ? Math.round(last.distance) : null
      const timeMin = last?.arrival ? Math.round(last.arrival) : null
      const details = [distKm && `${distKm} km`, timeMin && `${timeMin} min`].filter(Boolean).join(', ')
      const skipMsg = skipped.length ? ` (${skipped.length} couldn't geocode — at end)` : ''
      flash(`Route optimized — ${optimizedIds.length} stops${details ? ', ' + details + ' total' : ''}${skipMsg}.`, 'ok')
    } catch (e) {
      flash(e.message || 'RouteXL optimization failed.', 'err')
    }
    setOptimizing(false)
    setOptStatus('')
  }, [stops, hasRxlCreds, rxlUser, rxlPass, canvassDispatch, flash])

  if (!canvass.length) {
    return <EmptyState>No canvass stops yet — load stops from the Database or add them manually in the Canvass tab.</EmptyState>
  }

  if (!todayStops.length) {
    return <EmptyState>No stops for today's run. Stops added to Today's Canvass will appear here.</EmptyState>
  }

  const url = routeUrl(currentLeg, useCoords)
  const hasCoords = currentLeg.some(s => s.lat && s.lng)

  return (
    <div>
      {/* Header controls */}
      <div style={headerBox}>
        <div style={headerFlex}>
          <div>
            <div style={headerTitle}>Today's Route</div>
            <div style={headerSub}>
              {stops.length} stop{stops.length !== 1 ? 's' : ''}
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
        </div>
      )}

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
                  href={routeUrl(legs[legIdx + 1], useCoords)}
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

      {msg && <div style={{ fontSize: '12px', marginTop: '6px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>{msg.text}</div>}

      <div style={footer}>
        {stops.filter(s => s.status !== 'Not visited yet').length} of {stops.length} visited today
      </div>
    </div>
  )
}
