import { useState, useMemo } from 'react'
import { useDatabase, useDatabaseDispatch, useCanvass, useCanvassDispatch } from '../../data/store.jsx'
import { useFlashMessage } from '../../hooks/useFlashMessage.js'
import EmptyState from '../../components/EmptyState.jsx'
import Button from '../../components/Button.jsx'

export default function ZonesPanel({ onBrowseZone }) {
  const db         = useDatabase()
  const dbDispatch = useDatabaseDispatch()
  const canvass    = useCanvass()
  const cDispatch  = useCanvassDispatch()
  const { msg, flash } = useFlashMessage()
  const [areaFilter, setAreaFilter] = useState('all')

  const recordById = useMemo(() => new Map(db.dbRecords.map(r => [r.id, r])), [db.dbRecords])
  const areas = useMemo(() => [...new Set(db.dbRecords.map(r => r.ar).filter(Boolean))].sort(), [db.dbRecords])

  const visibleClusters = useMemo(() => {
    if (areaFilter === 'all') return db.dbClusters
    return db.dbClusters.filter(c =>
      (c.mb || []).some(id => { const r = recordById.get(id); return r && r.ar === areaFilter })
    )
  }, [db.dbClusters, recordById, areaFilter])

  const workedMap = useMemo(() => {
    const m = {}
    db.dbRecords.forEach(r => {
      if (!m[r.zo]) m[r.zo] = { total: 0, worked: 0 }
      m[r.zo].total++
      if (r.st !== 'unworked' && r.st !== 'in_canvass') m[r.zo].worked++
    })
    return m
  }, [db.dbRecords])

  function renameZone(c) {
    const newName = prompt('Rename zone:', c.nm)
    if (newName && newName.trim()) {
      dbDispatch({ type: 'RENAME_ZONE', oldName: c.nm, newName: newName.trim() })
      // Also rename the cluster nm
      const updated = db.dbClusters.map(cl => cl.id === c.id ? { ...cl, nm: newName.trim() } : cl)
      dbDispatch({ type: 'SET_CLUSTERS', dbClusters: updated })
    }
  }

  function loadZone(c) {
    const existingNames = new Set(canvass.map(s => s.name.toLowerCase()))
    const stops = []
    const dbUpdates = [];
    (c.mb || []).forEach(id => {
      const r = recordById.get(id); if (!r) return
      if (existingNames.has((r.n || '').toLowerCase())) return
      stops.push({
        id: 'canvass_' + r.id, name: r.n, addr: r.a, phone: r.ph,
        notes: r.cn ? (r.ct ? r.cn + ' (' + r.ct + ')' : r.cn) : '',
        website: r.web, menu: r.mn, email: r.em,
        openTime: '', closeTime: '',
        status: 'Not visited yet',
        date: new Date().toLocaleDateString(),
        added: new Date().toISOString(),
        fromDb: r.id, score: r.sc, priority: r.pr,
      })
      dbUpdates.push(id)
    })
    if (!stops.length) { flash('All zone stops are already in canvass.', 'err'); return }
    cDispatch({ type: 'ADD_MANY', stops })
    dbDispatch({ type: 'UPDATE_RECORD_STATUS_MANY', ids: dbUpdates, fields: { st: 'in_canvass' } })
    flash(`${stops.length} stops from "${c.nm}" loaded to canvass.`, 'ok')
  }

  function assignZone(c) {
    const day = prompt('Assign this zone to which day? (Monday/Tuesday/Wednesday/Thursday/Friday)')
    if (!day) return
    dbDispatch({ type: 'ASSIGN_DAY', ids: c.mb, day })
    flash(`Zone "${c.nm}" assigned to ${day}.`, 'ok')
  }

  if (!db.dbClusters.length) {
    return <EmptyState>No zones yet — import Outscraper data to generate zones automatically.</EmptyState>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <p style={{ fontSize: '13px', color: 'var(--text2)', flex: 1 }}>Auto-named zones based on ZIP + proximity. Rename any zone by clicking Rename.</p>
        <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} style={{ height: '30px', fontSize: '12px', minWidth: '140px' }}>
          <option value="all">All areas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {msg && <div style={{ fontSize: '12px', marginBottom: '8px', color: msg.type === 'ok' ? 'var(--green-text)' : 'var(--red-text)' }}>{msg.text}</div>}

      {visibleClusters.length === 0
        ? <EmptyState>No zones for this area.</EmptyState>
        : visibleClusters.map(c => {
          const w   = workedMap[c.id] || { total: c.cnt, worked: 0 }
          const pct = w.total ? Math.round(w.worked / w.total * 100) : 0
          const clusterAreas = [...new Set((c.mb || []).map(id => { const r = recordById.get(id); return r?.ar || '' }).filter(Boolean))].join(', ')
          return (
            <div key={c.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '13px 15px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>{c.nm}</div>
                    <Button size="sm" style={{ height: '22px', fontSize: '11px', padding: '0 7px' }} onClick={() => renameZone(c)}>Rename</Button>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                    {c.cnt} stops · {c.hot} hot · ZIP {c.zi}{clusterAreas ? ' · ' + clusterAreas : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{pct}% worked</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{w.worked}/{w.total}</div>
                </div>
              </div>
              <div style={{ marginTop: '8px', background: 'var(--bg3)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: pct + '%', background: 'var(--green-text)', borderRadius: '4px', transition: 'width .3s' }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                <Button size="sm" onClick={() => onBrowseZone(c.id)}>Browse stops ↗</Button>
                <Button size="sm" variant="primary" onClick={() => loadZone(c)}>Load to canvass</Button>
                <Button size="sm" onClick={() => assignZone(c)}>Assign to day</Button>
              </div>
            </div>
          )
        })
      }
    </div>
  )
}
