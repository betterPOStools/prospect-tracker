import { useState, useMemo } from 'react'
import { useCanvass } from '../../data/store.jsx'
import { hoursChip } from '../../data/helpers.js'
import Button from '../../components/Button.jsx'
import EmptyState from '../../components/EmptyState.jsx'

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

function routeUrl(stops) {
  if (!stops.length) return ''
  const addrs = stops.map(s => s.addr).filter(Boolean)
  if (addrs.length === 1) return mapsUrl(addrs[0])
  const origin = encodeURIComponent(addrs[0])
  const dest   = encodeURIComponent(addrs[addrs.length - 1])
  const wps    = addrs.slice(1, -1).map(a => encodeURIComponent(a)).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wps ? '&waypoints=' + wps : ''}`
}

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
const mapsLink = { fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }
const footer = { fontSize: '12px', color: 'var(--text3)', marginTop: '8px', textAlign: 'right' }

export default function RouteTab() {
  const canvass = useCanvass()

  const today = useMemo(() => new Date().toLocaleDateString(), [])

  const todayStops = useMemo(() =>
    canvass.filter(s =>
      s.date === today &&
      s.status !== 'Converted' &&
      s.status !== 'Not interested'
    ),
  [canvass, today])

  const [order, setOrder] = useState(null)  // null = default order

  const stops = useMemo(() => {
    if (!order) return [...todayStops].sort((a, b) => (b.score || 0) - (a.score || 0))
    return order.map(id => todayStops.find(s => s.id === id)).filter(Boolean)
  }, [todayStops, order])

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

  function resetOrder() { setOrder(null) }

  if (!canvass.length) {
    return <EmptyState>No canvass stops yet — load stops from the Database or add them manually in the Canvass tab.</EmptyState>
  }

  if (!todayStops.length) {
    return <EmptyState>No stops for today's run. Stops added to Today's Canvass will appear here.</EmptyState>
  }

  const url = routeUrl(stops)

  return (
    <div>
      {/* Header controls */}
      <div style={headerBox}>
        <div style={headerFlex}>
          <div>
            <div style={headerTitle}>Today's Route</div>
            <div style={headerSub}>
              {stops.length} stop{stops.length !== 1 ? 's' : ''} · Drag to reorder · Opens in Google Maps
            </div>
          </div>
          <div style={headerActions}>
            <Button size="sm" onClick={resetOrder}>Reset order</Button>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" style={routeLink}>
                Open Full Route ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stop list */}
      <div style={listBox}>
        {stops.map((s, idx) => {
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
                <a href={mapsUrl(s.addr)} target="_blank" rel="noreferrer" style={mapsLink}>Maps ↗</a>
              )}
            </div>
          )
        })}
      </div>

      <div style={footer}>
        {stops.filter(s => s.status !== 'Not visited yet').length} of {stops.length} visited today
      </div>
    </div>
  )
}
