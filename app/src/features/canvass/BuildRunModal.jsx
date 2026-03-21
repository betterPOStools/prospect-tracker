import { useState, useMemo } from 'react'
import { useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { FOLLOWUP_STATUSES } from './constants.js'
import { PRIORITY_COLOR, PRIORITY_EMOJI } from '../../data/scoring.js'
import Modal from '../../components/Modal.jsx'
import Button from '../../components/Button.jsx'

function routeUrl(stops) {
  const addrs = stops.map(s => s.addr).filter(Boolean)
  if (!addrs.length) return ''
  if (addrs.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrs[0])}`
  const origin = encodeURIComponent(addrs[0])
  const dest   = encodeURIComponent(addrs[addrs.length - 1])
  const wps    = addrs.slice(1, -1).map(a => encodeURIComponent(a)).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${wps ? '&waypoints=' + wps : ''}`
}

export default function BuildRunModal({ triggerStop, onClose }) {
  const canvass  = useCanvass()
  const dispatch = useCanvassDispatch()

  const todayStr = new Date().toLocaleDateString()

  const followUps = useMemo(() =>
    canvass
      .filter(s => s.date !== todayStr && FOLLOWUP_STATUSES.includes(s.status))
      .sort((a, b) => {
        const ORDER = { Fire: 4, Hot: 3, Warm: 2, Cold: 1, Dead: 0 }
        const priA = ORDER[a.priority] ?? 0
        const priB = ORDER[b.priority] ?? 0
        if (priB !== priA) return priB - priA
        if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0)
        return new Date(a.added) - new Date(b.added)
      }),
  [canvass, todayStr])

  const [selected, setSelected] = useState(() => new Set(triggerStop ? [triggerStop.id] : []))

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAll()  { setSelected(new Set(followUps.map(s => s.id))) }
  function clearAll()   { setSelected(new Set()) }

  function confirm() {
    if (!selected.size) return
    const today = new Date().toLocaleDateString()
    selected.forEach(id => {
      const stop = canvass.find(s => s.id === id)
      if (!stop) return
      dispatch({ type: 'UPDATE', stop: { ...stop, date: today } })
    })
    onClose(selected.size)
  }

  const selectedStops = followUps.filter(s => selected.has(s.id))
  const url = routeUrl(selectedStops)


  function daysAgo(stop) {
    const d = Math.floor((new Date() - new Date(stop.added)) / 86400000)
    if (d === 0) return 'Today'
    if (d === 1) return '1 day ago'
    return `${d} days ago`
  }

  return (
    <Modal onClose={() => onClose(0)}>
      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text)', marginBottom: '4px' }}>Build Today's Run</div>
      <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '14px' }}>
        Select follow-up stops to add to today's canvass. They'll appear in the Today tab and Route tab.
      </div>

      {/* Selection controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center' }}>
        <Button size="sm" onClick={selectAll}>Select all</Button>
        <Button size="sm" onClick={clearAll}>Clear</Button>
        <span style={{ fontSize: '12px', color: 'var(--text2)', marginLeft: 'auto' }}>
          {selected.size} of {followUps.length} selected
        </span>
      </div>

      {/* Stop list */}
      {followUps.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text2)' }}>
          No follow-up stops yet.
        </div>
      ) : (
        <div style={{ maxHeight: '320px', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: '14px' }}>
          {followUps.map(s => (
            <div key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 12px', borderBottom: '0.5px solid var(--border)',
                cursor: 'pointer', fontSize: '13px',
                background: selected.has(s.id) ? 'var(--bg2)' : 'transparent',
              }}
              onClick={() => toggle(s.id)}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)}
                style={{ width: '15px', height: '15px', accentColor: 'var(--accent)', flexShrink: 0 }}
                onClick={e => e.stopPropagation()} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.addr || 'No address'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 500, color: PRIORITY_COLOR[s.priority] || 'var(--text3)' }}>
                  {PRIORITY_EMOJI[s.priority]} {s.priority} {s.score || ''}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{daysAgo(s)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="primary" onClick={confirm} style={{ flex: 1, minWidth: '140px' }}
          disabled={!selected.size}>
          Add {selected.size || ''} stop{selected.size !== 1 ? 's' : ''} to Today
        </Button>
        {url && selected.size > 0 && (
          <a href={url} target="_blank" rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '0 12px', height: '36px', fontSize: '13px', fontWeight: 500,
              background: 'var(--bg2)', color: 'var(--text)', borderRadius: 'var(--radius)',
              border: '0.5px solid var(--border)', textDecoration: 'none',
            }}>
            Preview route ↗
          </a>
        )}
        <Button onClick={() => onClose(0)} style={{ marginLeft: 'auto' }}>Cancel</Button>
      </div>
    </Modal>
  )
}
