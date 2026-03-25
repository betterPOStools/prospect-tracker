import { useState, useMemo, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useDatabase, useCanvass } from '../../data/store.jsx'
import { PRIORITIES, PRIORITY_EMOJI } from '../../data/scoring.js'
import { navUrl } from '../../data/helpers.js'
import Button from '../../components/Button.jsx'
import 'leaflet/dist/leaflet.css'

/* ── Tile URLs ──────────────────────────────────────────────────────── */
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const DARK_TILES  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

/* ── Styles ─────────────────────────────────────────────────────────── */
const controlBar = { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px', fontSize: '12px' }
const checkLabel = { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text2)', cursor: 'pointer', userSelect: 'none' }
const filterSel  = { height: '28px', fontSize: '12px', minWidth: '100px' }
const mapWrap    = { height: 'min(500px, 65vh)', width: '100%', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }
const divider    = { width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }
const popupStyle = { fontSize: '12px', lineHeight: 1.5, minWidth: '180px', maxWidth: '260px' }

/* ── Theme detection ────────────────────────────────────────────────── */
function useCurrentTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light')
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.getAttribute('data-theme') || 'light'))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}

/* ── Resolve CSS vars to hex for Leaflet SVG ────────────────────────── */
function useResolvedColors(theme) {
  return useMemo(() => {
    const s = getComputedStyle(document.documentElement)
    return {
      Fire: s.getPropertyValue('--red-text').trim(),
      Hot:  s.getPropertyValue('--orange-text').trim(),
      Warm: s.getPropertyValue('--yellow-text').trim(),
      Cold: s.getPropertyValue('--blue-text').trim(),
      Dead: s.getPropertyValue('--text3').trim(),
      accent: s.getPropertyValue('--accent').trim(),
      border: s.getPropertyValue('--border2').trim(),
      bg:     s.getPropertyValue('--bg').trim(),
      green:  s.getPropertyValue('--green-text').trim(),
    }
  }, [theme])
}

/* ── Inject Leaflet theme overrides ─────────────────────────────────── */
function useLeafletTheme() {
  useEffect(() => {
    const id = 'leaflet-theme-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      .leaflet-popup-content-wrapper { background: var(--bg) !important; color: var(--text) !important; border-radius: var(--radius) !important; box-shadow: 0 2px 8px rgba(0,0,0,.15) !important; font-family: var(--font) !important; }
      .leaflet-popup-tip { background: var(--bg) !important; }
      .leaflet-popup-content { margin: 10px 12px !important; }
      .leaflet-popup-content a { color: var(--accent) !important; }
      .leaflet-control-zoom a { background: var(--bg) !important; color: var(--text) !important; border-color: var(--border) !important; }
      .leaflet-control-attribution { background: var(--bg2) !important; color: var(--text3) !important; font-size: 10px !important; }
      .leaflet-control-attribution a { color: var(--text3) !important; }
    `
    document.head.appendChild(style)
  }, [])
}

/* ── FitBounds helper ───────────────────────────────────────────────── */
function FitBounds({ bounds, trigger }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 })
  }, [map, bounds, trigger])
  return null
}

/* ── Numbered route icon ────────────────────────────────────────────── */
function numberedIcon(n, colors) {
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${colors.accent};color:${colors.bg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid ${colors.bg};box-shadow:0 1px 3px rgba(0,0,0,.3);">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

/* ── Popups ──────────────────────────────────────────────────────────── */
function RecordPopup({ r, colors }) {
  return (
    <div style={popupStyle}>
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{r.n}</div>
      {r.a && <div>{r.a}</div>}
      {r.ph && <div>Phone: <a href={'tel:' + r.ph}>{r.ph}</a></div>}
      <div style={{ marginTop: '4px' }}>
        <span style={{ fontWeight: 500, color: colors[r.pr] }}>{PRIORITY_EMOJI[r.pr]} {r.pr}</span>
        <span style={{ marginLeft: '8px' }}>Score: {r.sc}</span>
      </div>
      <div>Status: {r.st || 'unworked'}</div>
      {r.ar && <div>Area: {r.ar}</div>}
      {r.web && <div><a href={r.web} target="_blank" rel="noreferrer">Website ↗</a></div>}
      <div style={{ marginTop: '4px' }}>
        <a href={navUrl(r.a)} target="_blank" rel="noreferrer" style={{ fontSize: '11px', fontWeight: 500 }}>Navigate ↗</a>
      </div>
    </div>
  )
}

function ClusterPopup({ c }) {
  return (
    <div style={popupStyle}>
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>{c.nm}</div>
      <div>{c.cnt} records · {c.hot} hot</div>
      <div>ZIP: {c.zi}</div>
    </div>
  )
}

function StopPopup({ s, idx }) {
  return (
    <div style={popupStyle}>
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>#{idx + 1} — {s.name}</div>
      {s.addr && <div>{s.addr}</div>}
      {s.phone && <div>Phone: <a href={'tel:' + s.phone}>{s.phone}</a></div>}
      <div>Status: {s.status}</div>
      {s.addr && (
        <div style={{ marginTop: '4px' }}>
          <a href={navUrl(s.addr)} target="_blank" rel="noreferrer" style={{ fontSize: '11px', fontWeight: 500 }}>Navigate ↗</a>
        </div>
      )}
    </div>
  )
}

/* ── Main panel ─────────────────────────────────────────────────────── */
export default function MapPanel() {
  const db    = useDatabase()
  const stops = useCanvass()
  const theme = useCurrentTheme()
  const colors = useResolvedColors(theme)
  useLeafletTheme()

  const [showRecords,  setShowRecords]  = useState(true)
  const [showClusters, setShowClusters] = useState(false)
  const [showRoute,    setShowRoute]    = useState(true)
  const [filterPri,    setFilterPri]    = useState('all')
  const [filterSt,     setFilterSt]     = useState('all')
  const [filterArea,   setFilterArea]   = useState('all')
  const [fitKey,       setFitKey]       = useState(0)

  const areas = useMemo(() => [...new Set(db.dbRecords.map(r => r.ar).filter(Boolean))].sort(), [db.dbRecords])

  const geoRecords = useMemo(() =>
    db.dbRecords.filter(r =>
      r.lt && r.lg &&
      (filterPri  === 'all' || r.pr === filterPri) &&
      (filterSt   === 'all' || (r.st || 'unworked') === filterSt) &&
      (filterArea === 'all' || r.ar === filterArea)
    ), [db.dbRecords, filterPri, filterSt, filterArea])

  const geoClusters = useMemo(() => db.dbClusters.filter(c => c.lt && c.lg), [db.dbClusters])

  const todayStr = new Date().toLocaleDateString()
  const todayStops = useMemo(() => stops.filter(s => s.date === todayStr && s.lat && s.lng), [stops, todayStr])

  const bounds = useMemo(() => {
    const pts = []
    if (showRecords)  geoRecords.forEach(r => pts.push([r.lt, r.lg]))
    if (showClusters) geoClusters.forEach(c => pts.push([c.lt, c.lg]))
    if (showRoute)    todayStops.forEach(s => pts.push([s.lat, s.lng]))
    if (!pts.length) return null
    if (pts.length === 1) return [pts[0], [pts[0][0] + 0.01, pts[0][1] + 0.01]]
    const lats = pts.map(p => p[0]), lngs = pts.map(p => p[1])
    return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
  }, [geoRecords, geoClusters, todayStops, showRecords, showClusters, showRoute])

  if (!db.dbRecords.length) {
    return <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text2)', fontSize: '13px' }}>No records yet — import Outscraper data to see the map.</div>
  }
  if (!geoRecords.length && !todayStops.length) {
    return <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text2)', fontSize: '13px' }}>No records with coordinates found for current filters.</div>
  }

  return (
    <div>
      {/* Controls */}
      <div style={controlBar}>
        <label style={checkLabel}>
          <input type="checkbox" checked={showRecords} onChange={e => setShowRecords(e.target.checked)} />
          Records ({geoRecords.length})
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={showClusters} onChange={e => setShowClusters(e.target.checked)} />
          Zones ({geoClusters.length})
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={showRoute} onChange={e => setShowRoute(e.target.checked)} />
          Route ({todayStops.length})
        </label>
        <div style={divider} />
        <select value={filterPri} onChange={e => setFilterPri(e.target.value)} style={filterSel}>
          <option value="all">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_EMOJI[p]} {p}</option>)}
        </select>
        <select value={filterSt} onChange={e => setFilterSt(e.target.value)} style={filterSel}>
          <option value="all">All statuses</option>
          <option value="unworked">Unworked</option>
          <option value="in_canvass">In canvass</option>
          <option value="canvassed">Canvassed</option>
          <option value="converted">Converted</option>
        </select>
        <select value={filterArea} onChange={e => setFilterArea(e.target.value)} style={filterSel}>
          <option value="all">All areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <Button size="sm" onClick={() => setFitKey(k => k + 1)}>Fit view</Button>
      </div>

      {/* Map */}
      <div style={mapWrap}>
        <MapContainer
          bounds={bounds}
          style={{ width: '100%', height: '100%' }}
          preferCanvas={true}
        >
          <TileLayer key={theme} url={theme === 'dark' ? DARK_TILES : LIGHT_TILES} attribution={ATTRIBUTION} />
          <FitBounds bounds={bounds} trigger={fitKey} />

          {/* Layer 1: Database Records */}
          {showRecords && geoRecords.map(r => (
            <CircleMarker
              key={r.id}
              center={[r.lt, r.lg]}
              radius={Math.max(4, Math.min(10, (r.sc || 50) / 12))}
              fillColor={colors[r.pr] || colors.Dead}
              color={colors[r.pr] || colors.Dead}
              fillOpacity={0.7}
              weight={1}
              opacity={0.9}
            >
              <Popup><RecordPopup r={r} colors={colors} /></Popup>
            </CircleMarker>
          ))}

          {/* Layer 2: Cluster Centers */}
          {showClusters && geoClusters.map(c => (
            <CircleMarker
              key={c.id}
              center={[c.lt, c.lg]}
              radius={Math.max(14, Math.min(28, c.cnt / 2))}
              fillColor={colors.accent}
              color={colors.border}
              fillOpacity={0.2}
              weight={2}
            >
              <Popup><ClusterPopup c={c} /></Popup>
            </CircleMarker>
          ))}

          {/* Layer 3: Today's Route */}
          {showRoute && todayStops.length > 0 && (
            <>
              <Polyline
                positions={todayStops.map(s => [s.lat, s.lng])}
                color={colors.green}
                weight={3}
                opacity={0.5}
                dashArray="8,6"
              />
              {todayStops.map((s, idx) => (
                <Marker key={s.id} position={[s.lat, s.lng]} icon={numberedIcon(idx + 1, colors)}>
                  <Popup><StopPopup s={s} idx={idx} /></Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>
      </div>
    </div>
  )
}
